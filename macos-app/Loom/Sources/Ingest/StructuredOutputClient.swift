import Foundation

// MARK: - StructuredOutputClient
//
// Plan §3.5 — the AI-call shape for typed extractors. Every typed
// extractor declares a JSON Schema up front and asks the provider for a
// JSON payload that matches it. Provider-specific implementations
// enforce structure via whatever native mechanism the provider offers:
//
//   • OpenAI          `response_format: { type: "json_schema", ... }`
//   • Anthropic       tool-use with `input_schema` + forced tool call
//   • Ollama          `format: "json"` (Ollama 0.5+) / JSON-only instruction fallback
//   • CustomEndpoint  delegates to OpenAI-compatible path, JSON-only fallback otherwise
//   • CLI runtimes    JSON-only instruction + one-retry parse (CLIs don't support schemas)
//
// Return value is raw JSON bytes; parsing into the extractor's `Schema`
// is the caller's responsibility (a plain `JSONDecoder().decode(...)`).
//
// **One-retry contract (fallback paths):** When a provider can't enforce
// the schema natively, we append a strong "return JSON only" rule to
// the prompt. If the first response fails to parse, we retry ONCE with
// an explicit correction ("your last response wasn't valid JSON — try
// again"). No infinite loops.

/// Opaque JSON Schema payload. Stored as the dictionary shape the
/// underlying providers expect (Draft-07-ish with `type` / `properties`
/// / `required`). We pass it through verbatim rather than building a
/// typed model — the schema vocabulary is provider-specific in its
/// edges (OpenAI requires `additionalProperties: false` at every object
/// level for `strict: true`; Anthropic is looser) and a thin wrapper
/// lets each adapter layer on what it needs.
struct JSONSchema {
    /// Human-readable name, required by OpenAI's `json_schema` mode and
    /// Anthropic's tool-use. Example: `"SyllabusSchema"`.
    let name: String
    /// One-line description, surfaced in Anthropic's tool-use UI and
    /// occasionally used by OpenAI for instruction-following.
    let description: String
    /// The schema body itself (`{"type":"object","properties":{...},"required":[...]}`).
    let body: [String: Any]

    init(name: String, description: String, body: [String: Any]) {
        self.name = name
        self.description = description
        self.body = body
    }
}

/// Options surfaced across every structured-output adapter. Individual
/// providers pick the fields relevant to them — e.g. CLI runtimes
/// ignore `maxTokens`, Ollama ignores `apiKey`, etc.
struct StructuredOutputOptions {
    var maxTokens: Int = 4096
    var timeout: TimeInterval = 180
    var temperature: Double = 0.0   // deterministic extraction by default
    var apiKey: String? = nil

    init() {}
}

/// Abstract AI adapter that sends `prompt` + `schema` and returns raw
/// JSON bytes matching the schema. Implementations enforce structure
/// via provider-specific mechanisms (see file header).
protocol StructuredOutputClient {
    static func send(
        prompt: String,
        schema: JSONSchema,
        options: StructuredOutputOptions
    ) async throws -> Data
}

/// Shared failure surface. Each provider still has its own failure
/// enum (reused from the non-structured client where possible); this
/// one covers the cases specific to schema-constrained calls.
enum StructuredOutputError: Error, LocalizedError {
    case missingKey(provider: String)
    case providerFailure(provider: String, underlying: Error)
    case invalidResponse(provider: String, detail: String)
    case jsonParseFailed(provider: String, raw: String, attempts: Int)

    var errorDescription: String? {
        switch self {
        case .missingKey(let provider):
            return "\(provider) API key not set. Add it in Settings (⌘,)."
        case .providerFailure(let provider, let underlying):
            return "\(provider) structured-output request failed: \(underlying.localizedDescription)"
        case .invalidResponse(let provider, let detail):
            return "\(provider) returned an unexpected response shape: \(detail.prefix(200))"
        case .jsonParseFailed(let provider, let raw, let attempts):
            return "\(provider) returned invalid JSON after \(attempts) attempt(s): \(raw.prefix(200))"
        }
    }
}

// MARK: - Dispatch helper
//
// Picks the structured-output client matching the user's currently
// configured provider. Typed extractors call this rather than a
// specific client so "change provider → every extractor follows"
// Just Works.

enum StructuredOutputDispatch {
    /// Send `prompt` + `schema` to whichever client matches the
    /// currently-selected `AIProviderKind`. Throws `IngestError.aiDisabled`
    /// when the user has AI turned off.
    static func sendForCurrentProvider(
        prompt: String,
        schema: JSONSchema,
        options: StructuredOutputOptions = StructuredOutputOptions()
    ) async throws -> Data {
        switch AIProviderKind.current {
        case .anthropic:
            return try await AnthropicStructuredClient.send(prompt: prompt, schema: schema, options: options)
        case .openai:
            return try await OpenAIStructuredClient.send(prompt: prompt, schema: schema, options: options)
        case .ollama:
            return try await OllamaStructuredClient.send(prompt: prompt, schema: schema, options: options)
        case .customEndpoint:
            return try await CustomEndpointStructuredClient.send(prompt: prompt, schema: schema, options: options)
        case .claudeCli:
            return try await CLIRuntimeStructuredClient.send(
                prompt: prompt,
                schema: schema,
                flavor: .claude,
                options: options
            )
        case .codexCli:
            return try await CLIRuntimeStructuredClient.send(
                prompt: prompt,
                schema: schema,
                flavor: .codex,
                options: options
            )
        case .disabled:
            throw IngestError.aiDisabled
        }
    }
}

// MARK: - Shared utilities

enum StructuredOutputSupport {
    /// Strip common wrappers and parse JSON from a model's text reply.
    /// Handles ```json fences, leading/trailing prose, and the classic
    /// "Here is the JSON:\n{...}" preamble. Returns the decoded bytes
    /// as `Data` if it parses, or `nil` otherwise so the caller can
    /// retry.
    static func extractJSONBytes(from text: String) -> Data? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // Try as-is first — the happy path for native structured output.
        if let data = trimmed.data(using: .utf8),
           (try? JSONSerialization.jsonObject(with: data)) != nil {
            return data
        }
        // Strip ```json ... ``` fences.
        let fenced = stripCodeFences(trimmed)
        if fenced != trimmed, let data = fenced.data(using: .utf8),
           (try? JSONSerialization.jsonObject(with: data)) != nil {
            return data
        }
        // Last resort: find the first "{" and the matching last "}".
        if let start = fenced.firstIndex(of: "{"), let end = fenced.lastIndex(of: "}") {
            let slice = String(fenced[start...end])
            if let data = slice.data(using: .utf8),
               (try? JSONSerialization.jsonObject(with: data)) != nil {
                return data
            }
        }
        return nil
    }

    /// Remove triple-backtick fences (optionally with `json` tag) if the
    /// string begins/ends with them. No-op otherwise.
    static func stripCodeFences(_ s: String) -> String {
        var out = s
        if out.hasPrefix("```json") {
            out = String(out.dropFirst("```json".count))
        } else if out.hasPrefix("```") {
            out = String(out.dropFirst(3))
        }
        if out.hasSuffix("```") {
            out = String(out.dropLast(3))
        }
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Append a "return JSON only" instruction to `prompt`. Used by
    /// adapters that can't enforce a schema natively (CLI runtimes,
    /// older Ollama versions). We include the schema inline so the
    /// model has the shape in front of it.
    static func appendJSONOnlyInstruction(to prompt: String, schema: JSONSchema) -> String {
        let schemaString: String
        if let data = try? JSONSerialization.data(withJSONObject: schema.body, options: [.prettyPrinted]),
           let text = String(data: data, encoding: .utf8) {
            schemaString = text
        } else {
            schemaString = "{}"
        }
        return """
        \(prompt)

        Return ONLY valid JSON matching this schema — no prose, no code fences, no commentary before or after. The first character of your response must be `{` and the last must be `}`.

        Schema (\(schema.name)):
        \(schemaString)
        """
    }
}

// MARK: - AnthropicStructuredClient
//
// Strategy: declare a single tool whose `input_schema` is the target
// schema, then force the model to call it via `tool_choice`. Anthropic
// emits the structured payload as `input` on the returned `tool_use`
// block, which decodes without any post-hoc stripping.

enum AnthropicStructuredClient: StructuredOutputClient {
    private static let defaultModel = "claude-sonnet-4-6"
    private static let apiURL = URL(string: "https://api.anthropic.com/v1/messages")!
    private static let apiVersion = "2023-06-01"

    static func send(
        prompt: String,
        schema: JSONSchema,
        options: StructuredOutputOptions
    ) async throws -> Data {
        try await send(
            prompt: prompt,
            schema: schema,
            options: options,
            session: .shared,
            keychain: SystemKeychainBackend()
        )
    }

    /// Overload used by tests to inject session + keychain.
    static func send(
        prompt: String,
        schema: JSONSchema,
        options: StructuredOutputOptions,
        session: URLSession,
        keychain: KeychainBackend
    ) async throws -> Data {
        guard let apiKey = resolveAPIKey(explicit: options.apiKey, keychain: keychain) else {
            throw StructuredOutputError.missingKey(provider: "Anthropic")
        }

        let toolName = schema.name
        let body: [String: Any] = [
            "model": defaultModel,
            "max_tokens": options.maxTokens,
            "temperature": options.temperature,
            "messages": [
                ["role": "user", "content": prompt],
            ],
            "tools": [[
                "name": toolName,
                "description": schema.description,
                "input_schema": schema.body,
            ]],
            "tool_choice": [
                "type": "tool",
                "name": toolName,
            ],
        ]

        var request = URLRequest(url: apiURL, timeoutInterval: options.timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(apiVersion, forHTTPHeaderField: "anthropic-version")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw StructuredOutputError.providerFailure(provider: "Anthropic", underlying: error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw StructuredOutputError.invalidResponse(provider: "Anthropic", detail: "missing http response")
        }
        if !(200..<300).contains(http.statusCode) {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw StructuredOutputError.invalidResponse(
                provider: "Anthropic",
                detail: "HTTP \(http.statusCode): \(text)"
            )
        }

        return try extractToolInput(from: data)
    }

    /// Dig the `tool_use.input` dict out of an Anthropic Messages
    /// response and re-serialize it to JSON bytes.
    private static func extractToolInput(from data: Data) throws -> Data {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = object["content"] as? [[String: Any]] else {
            throw StructuredOutputError.invalidResponse(provider: "Anthropic", detail: "content missing")
        }
        for block in content {
            if (block["type"] as? String) == "tool_use",
               let input = block["input"] as? [String: Any] {
                return try JSONSerialization.data(withJSONObject: input)
            }
        }
        throw StructuredOutputError.invalidResponse(
            provider: "Anthropic",
            detail: "no tool_use block in response"
        )
    }

    private static func resolveAPIKey(
        explicit: String?,
        keychain: KeychainBackend
    ) -> String? {
        if let explicit = explicit?.trimmingCharacters(in: .whitespacesAndNewlines),
           !explicit.isEmpty { return explicit }
        if let env = ProcessInfo.processInfo.environment["ANTHROPIC_API_KEY"]?
            .trimmingCharacters(in: .whitespacesAndNewlines), !env.isEmpty {
            return env
        }
        if let stored = KeychainStore.readString(
            account: KeychainAccount.anthropicAPIKey,
            backend: keychain
        )?.trimmingCharacters(in: .whitespacesAndNewlines), !stored.isEmpty {
            return stored
        }
        return nil
    }
}

// MARK: - OpenAIStructuredClient
//
// Strategy: `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }`
// with the user-message prompt. OpenAI returns the JSON string in
// `choices[0].message.content`; we parse it through. `strict: true`
// requires every object to declare `additionalProperties: false` — we
// don't enforce that here; callers construct schemas that conform.

enum OpenAIStructuredClient: StructuredOutputClient {
    private static let defaultModel = "gpt-5"
    private static let apiURL = URL(string: "https://api.openai.com/v1/chat/completions")!

    static func send(
        prompt: String,
        schema: JSONSchema,
        options: StructuredOutputOptions
    ) async throws -> Data {
        try await send(
            prompt: prompt,
            schema: schema,
            options: options,
            session: .shared,
            keychain: SystemKeychainBackend()
        )
    }

    static func send(
        prompt: String,
        schema: JSONSchema,
        options: StructuredOutputOptions,
        session: URLSession,
        keychain: KeychainBackend
    ) async throws -> Data {
        guard let apiKey = resolveAPIKey(explicit: options.apiKey, keychain: keychain) else {
            throw StructuredOutputError.missingKey(provider: "OpenAI")
        }

        let body: [String: Any] = [
            "model": defaultModel,
            "max_tokens": options.maxTokens,
            "temperature": options.temperature,
            "response_format": [
                "type": "json_schema",
                "json_schema": [
                    "name": schema.name,
                    "description": schema.description,
                    "schema": schema.body,
                    "strict": true,
                ],
            ],
            "messages": [
                ["role": "user", "content": prompt],
            ],
        ]

        var request = URLRequest(url: apiURL, timeoutInterval: options.timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw StructuredOutputError.providerFailure(provider: "OpenAI", underlying: error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw StructuredOutputError.invalidResponse(provider: "OpenAI", detail: "missing http response")
        }
        if !(200..<300).contains(http.statusCode) {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw StructuredOutputError.invalidResponse(
                provider: "OpenAI",
                detail: "HTTP \(http.statusCode): \(text)"
            )
        }

        return try extractContent(from: data)
    }

    private static func extractContent(from data: Data) throws -> Data {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = object["choices"] as? [[String: Any]],
              let first = choices.first,
              let message = first["message"] as? [String: Any],
              let content = message["content"] as? String else {
            throw StructuredOutputError.invalidResponse(provider: "OpenAI", detail: "content missing")
        }
        guard let bytes = StructuredOutputSupport.extractJSONBytes(from: content) else {
            throw StructuredOutputError.jsonParseFailed(
                provider: "OpenAI",
                raw: content,
                attempts: 1
            )
        }
        return bytes
    }

    private static func resolveAPIKey(
        explicit: String?,
        keychain: KeychainBackend
    ) -> String? {
        if let explicit = explicit?.trimmingCharacters(in: .whitespacesAndNewlines),
           !explicit.isEmpty { return explicit }
        if let env = ProcessInfo.processInfo.environment["OPENAI_API_KEY"]?
            .trimmingCharacters(in: .whitespacesAndNewlines), !env.isEmpty {
            return env
        }
        if let stored = KeychainStore.readString(
            account: KeychainAccount.openAIAPIKey,
            backend: keychain
        )?.trimmingCharacters(in: .whitespacesAndNewlines), !stored.isEmpty {
            return stored
        }
        return nil
    }
}

// MARK: - OllamaStructuredClient
//
// Strategy: Ollama 0.5+ supports `format: "json"` which guarantees the
// response parses as JSON (no schema enforcement; still the caller's
// job to check shape). For older Ollama we fall back to a JSON-only
// instruction appended to the prompt and one retry.
//
// We set `format: "json"` unconditionally — older servers ignore
// unknown fields, and the fallback instruction carries the schema
// inline regardless so the shape is communicated either way.

enum OllamaStructuredClient: StructuredOutputClient {
    static func send(
        prompt: String,
        schema: JSONSchema,
        options: StructuredOutputOptions
    ) async throws -> Data {
        try await send(
            prompt: prompt,
            schema: schema,
            options: options,
            session: .shared,
            defaults: .standard
        )
    }

    static func send(
        prompt: String,
        schema: JSONSchema,
        options: StructuredOutputOptions,
        session: URLSession,
        defaults: UserDefaults
    ) async throws -> Data {
        let hostString = OllamaClient.resolveHost(defaults: defaults)
        guard let hostURL = URL(string: hostString) else {
            throw StructuredOutputError.invalidResponse(
                provider: "Ollama",
                detail: "invalid host \(hostString)"
            )
        }
        let model = OllamaClient.resolveModel(defaults: defaults)
        guard !model.isEmpty else {
            throw StructuredOutputError.invalidResponse(
                provider: "Ollama",
                detail: "no model configured"
            )
        }

        let promptWithInstruction = StructuredOutputSupport.appendJSONOnlyInstruction(to: prompt, schema: schema)

        if let bytes = try await attempt(
            host: hostURL,
            model: model,
            prompt: promptWithInstruction,
            options: options,
            session: session
        ) {
            return bytes
        }

        // One retry with a correction preamble.
        let correctedPrompt = """
        Your previous response was not valid JSON. Return ONLY a JSON object matching the schema — no prose, no code fences.

        \(promptWithInstruction)
        """
        if let bytes = try await attempt(
            host: hostURL,
            model: model,
            prompt: correctedPrompt,
            options: options,
            session: session
        ) {
            return bytes
        }

        throw StructuredOutputError.jsonParseFailed(provider: "Ollama", raw: "", attempts: 2)
    }

    private static func attempt(
        host: URL,
        model: String,
        prompt: String,
        options: StructuredOutputOptions,
        session: URLSession
    ) async throws -> Data? {
        let endpoint = host.appendingPathComponent("api/chat")
        let body: [String: Any] = [
            "model": model,
            "stream": false,
            "format": "json",
            "options": [
                "temperature": options.temperature,
            ],
            "messages": [
                ["role": "user", "content": prompt],
            ],
        ]

        var request = URLRequest(url: endpoint, timeoutInterval: options.timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw StructuredOutputError.providerFailure(provider: "Ollama", underlying: error)
        }

        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw StructuredOutputError.invalidResponse(
                provider: "Ollama",
                detail: "HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1): \(text)"
            )
        }

        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let message = object["message"] as? [String: Any],
              let content = message["content"] as? String else {
            return nil
        }
        return StructuredOutputSupport.extractJSONBytes(from: content)
    }
}

// MARK: - CustomEndpointStructuredClient
//
// Strategy: most "custom" endpoints users wire up are OpenAI-compatible
// shims (LM Studio, vLLM, Groq, Together, OpenRouter, …). We send the
// same `response_format: json_schema` payload OpenAI accepts. If the
// endpoint rejects it (some proxies strip unknown fields, some LM
// servers don't implement strict mode), we retry ONCE with a
// JSON-only instruction and no `response_format` field.

enum CustomEndpointStructuredClient: StructuredOutputClient {
    static func send(
        prompt: String,
        schema: JSONSchema,
        options: StructuredOutputOptions
    ) async throws -> Data {
        try await send(
            prompt: prompt,
            schema: schema,
            options: options,
            session: .shared,
            keychain: SystemKeychainBackend(),
            defaults: .standard
        )
    }

    static func send(
        prompt: String,
        schema: JSONSchema,
        options: StructuredOutputOptions,
        session: URLSession,
        keychain: KeychainBackend,
        defaults: UserDefaults
    ) async throws -> Data {
        guard let url = CustomEndpointClient.resolveBaseURL(defaults: defaults) else {
            throw StructuredOutputError.invalidResponse(
                provider: "CustomEndpoint",
                detail: "no base URL configured"
            )
        }
        let model = CustomEndpointClient.resolveModel(defaults: defaults)
        guard !model.isEmpty else {
            throw StructuredOutputError.invalidResponse(
                provider: "CustomEndpoint",
                detail: "no model configured"
            )
        }
        let apiKey = options.apiKey?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? KeychainStore.readString(account: KeychainAccount.customEndpointAPIKey, backend: keychain)?
                .trimmingCharacters(in: .whitespacesAndNewlines)

        // First attempt: OpenAI-style response_format.
        let strictBody: [String: Any] = [
            "model": model,
            "max_tokens": options.maxTokens,
            "temperature": options.temperature,
            "response_format": [
                "type": "json_schema",
                "json_schema": [
                    "name": schema.name,
                    "description": schema.description,
                    "schema": schema.body,
                    "strict": true,
                ],
            ],
            "messages": [
                ["role": "user", "content": prompt],
            ],
        ]
        if let bytes = try await postAndParse(
            url: url,
            body: strictBody,
            apiKey: apiKey,
            options: options,
            session: session
        ) {
            return bytes
        }

        // Fallback: JSON-only instruction, no response_format.
        let promptWithInstruction = StructuredOutputSupport.appendJSONOnlyInstruction(to: prompt, schema: schema)
        let looseBody: [String: Any] = [
            "model": model,
            "max_tokens": options.maxTokens,
            "temperature": options.temperature,
            "messages": [
                ["role": "user", "content": promptWithInstruction],
            ],
        ]
        if let bytes = try await postAndParse(
            url: url,
            body: looseBody,
            apiKey: apiKey,
            options: options,
            session: session
        ) {
            return bytes
        }

        throw StructuredOutputError.jsonParseFailed(provider: "CustomEndpoint", raw: "", attempts: 2)
    }

    private static func postAndParse(
        url: URL,
        body: [String: Any],
        apiKey: String?,
        options: StructuredOutputOptions,
        session: URLSession
    ) async throws -> Data? {
        var request = URLRequest(url: url, timeoutInterval: options.timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        if let apiKey, !apiKey.isEmpty {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "authorization")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw StructuredOutputError.providerFailure(provider: "CustomEndpoint", underlying: error)
        }

        // Non-2xx: treat as retry-worthy rather than hard error, since
        // some proxies 400 on unknown fields. Let the outer fallback
        // handle the retry.
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            return nil
        }

        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = object["choices"] as? [[String: Any]],
              let first = choices.first,
              let message = first["message"] as? [String: Any],
              let content = message["content"] as? String else {
            return nil
        }
        return StructuredOutputSupport.extractJSONBytes(from: content)
    }
}

// MARK: - CLIRuntimeStructuredClient
//
// Strategy: the `claude` / `codex` CLIs don't accept a schema parameter
// — they're plain text in / text out. We append the JSON-only
// instruction to the prompt and re-use `CLIRuntimeClient.send` for the
// actual spawn. One retry on parse failure with a correction preamble.
//
enum CLIRuntimeStructuredClient {
    static func send(
        prompt: String,
        schema: JSONSchema,
        flavor: CLIRuntimeClient.Flavor,
        options: StructuredOutputOptions
    ) async throws -> Data {
        let base = StructuredOutputSupport.appendJSONOnlyInstruction(to: prompt, schema: schema)

        var cliOpts = CLIRuntimeClient.Options()
        cliOpts.flavor = flavor
        cliOpts.timeout = options.timeout

        let first: String
        do {
            first = try await CLIRuntimeClient.send(prompt: base, options: cliOpts)
        } catch {
            throw StructuredOutputError.providerFailure(provider: "CLI", underlying: error)
        }
        if let bytes = StructuredOutputSupport.extractJSONBytes(from: first) {
            return bytes
        }

        let corrected = """
        Your previous response was not valid JSON. Return ONLY a JSON object matching the schema — no prose, no code fences.

        \(base)
        """
        let retry: String
        do {
            retry = try await CLIRuntimeClient.send(prompt: corrected, options: cliOpts)
        } catch {
            throw StructuredOutputError.providerFailure(provider: "CLI", underlying: error)
        }
        if let bytes = StructuredOutputSupport.extractJSONBytes(from: retry) {
            return bytes
        }
        throw StructuredOutputError.jsonParseFailed(provider: "CLI", raw: retry, attempts: 2)
    }
}
