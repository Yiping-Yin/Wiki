import Foundation

/// HTTPS/HTTP client for a local Ollama instance. Talks to Ollama's
/// native `/api/chat` endpoint (NDJSON streaming) rather than the
/// OpenAI-compatible `/v1/chat/completions` shim — the native path ships
/// in every Ollama release and provides cleaner stream termination + the
/// companion `/api/tags` endpoint for model discovery.
///
/// Config:
///   - `loom.ai.ollama.host`  defaults to http://127.0.0.1:11434
///   - `loom.ai.ollama.model` defaults to `""`; user must pick one
///
/// No API key — local endpoint, no auth.
enum OllamaClient {
    static let hostDefaultsKey = "loom.ai.ollama.host"
    static let modelDefaultsKey = "loom.ai.ollama.model"
    static let defaultHost = "http://127.0.0.1:11434"

    struct Options {
        var host: String = ""
        var model: String = ""
        var timeout: TimeInterval = 180
        var onChunk: ((String) -> Void)? = nil

        init() {}
    }

    enum Failure: Error, LocalizedError, Equatable {
        case missingModel
        case invalidHost(String)
        case http(status: Int, body: String, recoverable: Bool)
        case network(String)
        case cancelled
        case decoding(String)

        var errorDescription: String? {
            switch self {
            case .missingModel:
                return "Ollama model not set. Pick one in Settings (⌘,)."
            case .invalidHost(let host):
                return "Ollama host is invalid: \(host)"
            case .http(let status, let body, _):
                return "Ollama \(status): \(body.prefix(400))"
            case .network(let message):
                return "Ollama network error: \(message) — is Ollama running at the configured host?"
            case .cancelled:
                return "Ollama request cancelled."
            case .decoding(let message):
                return "Ollama response decoding error: \(message)"
            }
        }

        var recoverable: Bool {
            switch self {
            case .http(_, _, let recoverable): return recoverable
            case .network, .cancelled: return true
            case .missingModel, .invalidHost, .decoding: return false
            }
        }
    }

    static func send(
        prompt: String,
        options: Options = Options(),
        session: URLSession = .shared,
        defaults: UserDefaults = .standard
    ) async throws -> String {
        let hostString = !options.host.isEmpty ? options.host : resolveHost(defaults: defaults)
        guard let hostURL = URL(string: hostString) else { throw Failure.invalidHost(hostString) }

        let model = options.model.isEmpty ? resolveModel(defaults: defaults) : options.model
        guard !model.isEmpty else { throw Failure.missingModel }

        let endpoint = hostURL.appendingPathComponent("api/chat")
        let streaming = options.onChunk != nil
        let body: [String: Any] = [
            "model": model,
            "stream": streaming,
            "messages": [
                ["role": "user", "content": prompt],
            ],
        ]

        var request = URLRequest(url: endpoint, timeoutInterval: options.timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        if streaming {
            return try await streamResponse(request, session: session, onChunk: options.onChunk!)
        }
        return try await oneShotResponse(request, session: session)
    }

    // MARK: resolution helpers

    static func resolveHost(defaults: UserDefaults = .standard) -> String {
        let stored = defaults.string(forKey: hostDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return stored.isEmpty ? defaultHost : stored
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

    // MARK: Streaming NDJSON (one JSON object per line)

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
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            guard let delta = Self.extractDeltaText(fromLine: trimmed) else { continue }
            accumulated += delta
            onChunk(delta)
        }
        return accumulated
    }

    // MARK: Response decoding

    /// Ollama one-shot `/api/chat` returns `{"message":{"role":"...","content":"..."},"done":true,...}`.
    private static func extractText(from data: Data) throws -> String {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw Failure.decoding("response not JSON object")
        }
        if let message = object["message"] as? [String: Any],
           let content = message["content"] as? String {
            return content
        }
        return ""
    }

    /// Internal for testability — Ollama streaming emits NDJSON; each line
    /// is `{"message":{"content":"..."}, "done":false}` until `done:true`.
    static func extractDeltaText(fromLine json: String) -> String? {
        guard let payload = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
              let message = object["message"] as? [String: Any],
              let content = message["content"] as? String else {
            return nil
        }
        return content.isEmpty ? nil : content
    }
}
