import Foundation

/// Swift port of `lib/anthropic-http.ts` — makes HTTPS calls to Anthropic's
/// Messages API without going through the Next.js server or a shell-out to
/// the `claude` CLI. Phase 3 of the architecture inversion; eventually all
/// AI surfaces call this directly instead of POST-ing to `/api/chat`.
///
/// Credential source: the user's ANTHROPIC_API_KEY in macOS Keychain under
/// `KeychainAccount.anthropicAPIKey`. When the key is missing, calls fail
/// with `.missingKey` rather than a generic network error.
enum AnthropicClient {
    private static let defaultModel = "claude-sonnet-4-6"
    private static let defaultMaxTokens = 4096
    private static let apiURL = URL(string: "https://api.anthropic.com/v1/messages")!
    private static let apiVersion = "2023-06-01"

    struct Options {
        var model: String = AnthropicClient.defaultModel
        var maxTokens: Int = AnthropicClient.defaultMaxTokens
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
                return "Anthropic API key not set. Add it in Settings (⌘,)."
            case .http(let status, let body, _):
                return "Anthropic API \(status): \(body.prefix(400))"
            case .network(let message):
                return "Anthropic network error: \(message)"
            case .cancelled:
                return "Anthropic request cancelled."
            case .decoding(let message):
                return "Anthropic response decoding error: \(message)"
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

    /// Send a prompt to Anthropic's Messages API. When `options.onChunk` is
    /// set, streams via SSE and invokes the callback for every text delta.
    /// Returns the full concatenated text on completion.
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
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(apiVersion, forHTTPHeaderField: "anthropic-version")
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

        var eventBuffer: String = ""
        var accumulated: String = ""
        for try await line in bytes.lines {
            if line.isEmpty {
                if let delta = extractDeltaText(eventBuffer: eventBuffer) {
                    accumulated += delta
                    onChunk(delta)
                }
                eventBuffer = ""
            } else {
                if !eventBuffer.isEmpty { eventBuffer += "\n" }
                eventBuffer += line
            }
        }
        if let delta = extractDeltaText(eventBuffer: eventBuffer) {
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
        guard let content = object["content"] as? [[String: Any]] else { return "" }
        var out = ""
        for block in content {
            if (block["type"] as? String) == "text",
               let text = block["text"] as? String {
                out += text
            }
        }
        return out
    }

    /// Internal for testability — extracts a text delta from one SSE event
    /// block (multiple `event:` / `data:` lines joined by newlines).
    static func extractDeltaText(eventBuffer: String) -> String? {
        let dataLine = eventBuffer
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .first(where: { $0.hasPrefix("data:") })
        guard let dataLine else { return nil }
        let json = String(dataLine.dropFirst("data:".count)).trimmingCharacters(in: .whitespaces)
        guard !json.isEmpty, json != "[DONE]" else { return nil }
        guard let payload = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any] else {
            return nil
        }
        guard (object["type"] as? String) == "content_block_delta",
              let delta = object["delta"] as? [String: Any],
              (delta["type"] as? String) == "text_delta" else {
            return nil
        }
        return delta["text"] as? String
    }

    // MARK: Key resolution

    private static func resolveAPIKey(
        options: Options,
        keychain: KeychainBackend
    ) -> String? {
        if let explicit = options.apiKey?.trimmingCharacters(in: .whitespacesAndNewlines),
           !explicit.isEmpty { return explicit }
        if let envKey = ProcessInfo.processInfo.environment["ANTHROPIC_API_KEY"]?
            .trimmingCharacters(in: .whitespacesAndNewlines), !envKey.isEmpty {
            return envKey
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
