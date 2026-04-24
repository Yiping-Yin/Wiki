import Foundation

/// HTTPS client for OpenAI's chat completions API. Second provider in the
/// `AIProviderKind` roadmap after Anthropic. Keeps the same shape as
/// `AnthropicClient.send(...)` so the two are interchangeable from the
/// bridge's point of view — a follow-up tick will wrap both behind an
/// `AIProvider` protocol.
///
/// Credential source: `KeychainAccount.openAIAPIKey`. Falls through to
/// `OPENAI_API_KEY` env var + explicit `options.apiKey` so tests can pass
/// a fake key without touching Keychain.
enum OpenAIClient {
    private static let defaultModel = "gpt-5"
    private static let defaultMaxTokens = 4096
    private static let apiURL = URL(string: "https://api.openai.com/v1/chat/completions")!

    struct Options {
        var model: String = OpenAIClient.defaultModel
        var maxTokens: Int = OpenAIClient.defaultMaxTokens
        var timeout: TimeInterval = 180
        var onChunk: ((String) -> Void)? = nil
        var apiKey: String? = nil

        init() {}
    }

    enum Failure: Error, LocalizedError, Equatable {
        case missingKey
        case http(status: Int, body: String, recoverable: Bool)
        case network(String)
        case cancelled
        case decoding(String)

        var errorDescription: String? {
            switch self {
            case .missingKey:
                return "OpenAI API key not set. Add it in Settings (⌘,)."
            case .http(let status, let body, _):
                return "OpenAI API \(status): \(body.prefix(400))"
            case .network(let message):
                return "OpenAI network error: \(message)"
            case .cancelled:
                return "OpenAI request cancelled."
            case .decoding(let message):
                return "OpenAI response decoding error: \(message)"
            }
        }

        var recoverable: Bool {
            switch self {
            case .http(_, _, let recoverable): return recoverable
            case .network, .cancelled: return true
            case .missingKey, .decoding: return false
            }
        }
    }

    static func send(
        prompt: String,
        options: Options = Options(),
        session: URLSession = .shared,
        keychain: KeychainBackend = SystemKeychainBackend()
    ) async throws -> String {
        guard let apiKey = resolveAPIKey(options: options, keychain: keychain) else {
            throw Failure.missingKey
        }

        let streaming = options.onChunk != nil
        let body: [String: Any] = [
            "model": options.model,
            "max_tokens": options.maxTokens,
            "stream": streaming,
            "messages": [
                ["role": "user", "content": prompt],
            ],
        ]

        var request = URLRequest(url: apiURL, timeoutInterval: options.timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        if streaming {
            return try await streamResponse(request, session: session, onChunk: options.onChunk!)
        }
        return try await oneShotResponse(request, session: session)
    }

    // MARK: Non-streaming

    private static func oneShotResponse(
        _ request: URLRequest,
        session: URLSession
    ) async throws -> String {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw Failure.cancelled
        } catch {
            throw Failure.network(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw Failure.network("missing http response")
        }
        if !(200..<300).contains(http.statusCode) {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw Failure.http(
                status: http.statusCode,
                body: body,
                recoverable: http.statusCode == 429 || http.statusCode >= 500
            )
        }
        return try extractText(from: data)
    }

    // MARK: Streaming SSE

    private static func streamResponse(
        _ request: URLRequest,
        session: URLSession,
        onChunk: @escaping (String) -> Void
    ) async throws -> String {
        let (bytes, response): (URLSession.AsyncBytes, URLResponse)
        do {
            (bytes, response) = try await session.bytes(for: request)
        } catch is CancellationError {
            throw Failure.cancelled
        } catch {
            throw Failure.network(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw Failure.network("missing http response")
        }
        if !(200..<300).contains(http.statusCode) {
            var data = Data()
            for try await byte in bytes { data.append(byte) }
            let body = String(data: data, encoding: .utf8) ?? ""
            throw Failure.http(
                status: http.statusCode,
                body: body,
                recoverable: http.statusCode == 429 || http.statusCode >= 500
            )
        }

        var accumulated: String = ""
        for try await line in bytes.lines {
            guard line.hasPrefix("data:") else { continue }
            let json = String(line.dropFirst("data:".count)).trimmingCharacters(in: .whitespaces)
            if json.isEmpty || json == "[DONE]" { continue }
            guard let delta = extractDeltaText(fromDataLine: json) else { continue }
            accumulated += delta
            onChunk(delta)
        }
        return accumulated
    }

    // MARK: Response decoding

    private static func extractText(from data: Data) throws -> String {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw Failure.decoding("response not JSON object")
        }
        guard let choices = object["choices"] as? [[String: Any]], let first = choices.first else {
            return ""
        }
        // Newer Responses-style; fall back to Chat style.
        if let message = first["message"] as? [String: Any],
           let content = message["content"] as? String {
            return content
        }
        return ""
    }

    /// Internal for testability — parses one `data:` line's JSON and
    /// extracts the incremental text delta. Accepts both the "choices
    /// [].delta.content" shape (Chat API) and simple text.
    static func extractDeltaText(fromDataLine json: String) -> String? {
        guard !json.isEmpty, json != "[DONE]",
              let payload = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any] else {
            return nil
        }
        guard let choices = object["choices"] as? [[String: Any]], let first = choices.first else {
            return nil
        }
        if let delta = first["delta"] as? [String: Any],
           let content = delta["content"] as? String {
            return content
        }
        return nil
    }

    // MARK: Key resolution

    private static func resolveAPIKey(
        options: Options,
        keychain: KeychainBackend
    ) -> String? {
        if let explicit = options.apiKey?.trimmingCharacters(in: .whitespacesAndNewlines),
           !explicit.isEmpty { return explicit }
        if let envKey = ProcessInfo.processInfo.environment["OPENAI_API_KEY"]?
            .trimmingCharacters(in: .whitespacesAndNewlines), !envKey.isEmpty {
            return envKey
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
