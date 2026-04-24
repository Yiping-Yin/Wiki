import Foundation

/// HTTPS client for any OpenAI-compatible endpoint (LM Studio, Groq,
/// Together, OpenRouter, vLLM, self-hosted, proxied). Same wire protocol
/// as `OpenAIClient` — just parameterized URL + model + optional key.
///
/// Config source: UserDefaults keys
///   - `loom.ai.customEndpoint.url`    (String)
///   - `loom.ai.customEndpoint.model`  (String)
/// Keychain:
///   - `KeychainAccount.customEndpointAPIKey`
///
/// Falls through to `options.baseURL` / `options.model` / `options.apiKey`
/// so tests can inject values without touching global state.
enum CustomEndpointClient {
    static let baseURLDefaultsKey = "loom.ai.customEndpoint.url"
    static let modelDefaultsKey = "loom.ai.customEndpoint.model"

    struct Options {
        var baseURL: URL?
        var model: String = ""
        var maxTokens: Int = 4096
        var timeout: TimeInterval = 180
        var onChunk: ((String) -> Void)? = nil
        var apiKey: String? = nil

        init() {}
    }

    enum Failure: Error, LocalizedError, Equatable {
        case missingEndpoint
        case missingModel
        case http(status: Int, body: String, recoverable: Bool)
        case network(String)
        case cancelled
        case decoding(String)

        var errorDescription: String? {
            switch self {
            case .missingEndpoint:
                return "Custom endpoint URL not set. Configure it in Settings (⌘,)."
            case .missingModel:
                return "Custom endpoint model not set. Configure it in Settings (⌘,)."
            case .http(let status, let body, _):
                return "Custom endpoint \(status): \(body.prefix(400))"
            case .network(let message):
                return "Custom endpoint network error: \(message)"
            case .cancelled:
                return "Custom endpoint request cancelled."
            case .decoding(let message):
                return "Custom endpoint decoding error: \(message)"
            }
        }

        var recoverable: Bool {
            switch self {
            case .http(_, _, let recoverable): return recoverable
            case .network, .cancelled: return true
            case .missingEndpoint, .missingModel, .decoding: return false
            }
        }
    }

    static func send(
        prompt: String,
        options: Options = Options(),
        session: URLSession = .shared,
        keychain: KeychainBackend = SystemKeychainBackend(),
        defaults: UserDefaults = .standard
    ) async throws -> String {
        let resolvedURL = options.baseURL ?? resolveBaseURL(defaults: defaults)
        guard let url = resolvedURL else { throw Failure.missingEndpoint }

        let resolvedModel = options.model.isEmpty ? resolveModel(defaults: defaults) : options.model
        guard !resolvedModel.isEmpty else { throw Failure.missingModel }

        // API key is optional for custom endpoints (some local providers
        // don't require auth).
        let apiKey = options.apiKey?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? KeychainStore.readString(account: KeychainAccount.customEndpointAPIKey, backend: keychain)?
                .trimmingCharacters(in: .whitespacesAndNewlines)

        let streaming = options.onChunk != nil
        let body: [String: Any] = [
            "model": resolvedModel,
            "max_tokens": options.maxTokens,
            "stream": streaming,
            "messages": [
                ["role": "user", "content": prompt],
            ],
        ]

        var request = URLRequest(url: url, timeoutInterval: options.timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        if let apiKey, !apiKey.isEmpty {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "authorization")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        if streaming {
            return try await streamResponse(request, session: session, onChunk: options.onChunk!)
        }
        return try await oneShotResponse(request, session: session)
    }

    // MARK: resolution helpers

    static func resolveBaseURL(defaults: UserDefaults = .standard) -> URL? {
        guard let raw = defaults.string(forKey: baseURLDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
        return URL(string: raw)
    }

    static func resolveModel(defaults: UserDefaults = .standard) -> String {
        defaults.string(forKey: modelDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
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
            // Custom endpoints speak OpenAI shape; reuse its extractor.
            guard let delta = OpenAIClient.extractDeltaText(fromDataLine: json) else { continue }
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
        if let message = first["message"] as? [String: Any],
           let content = message["content"] as? String {
            return content
        }
        return ""
    }
}
