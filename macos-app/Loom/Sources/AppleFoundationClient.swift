import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Thin wrapper around Apple's on-device `FoundationModels` framework
/// (macOS 26+, Apple Intelligence-enabled hardware). No API key, no
/// network, no installation — just works on supported Macs.
///
/// Falls back with a clear `notAvailable` error on unsupported
/// hardware or older OS versions so the existing AI-disabled banner
/// flow handles it cleanly.
/// Dig the actual generated text out of whatever Apple's API hands
/// back. `respond(to:)` returns a struct whose `.content` holds the
/// text; the streaming variant yields `Snapshot` structs with the
/// same shape. Both have shown up across betas; reflection lets us
/// handle them without forcing a specific concrete type at compile
/// time (which has churned between OS versions).
private func extractContent<T>(from value: T) -> String {
    if let s = value as? String { return s }
    let mirror = Mirror(reflecting: value)
    for child in mirror.children {
        guard let label = child.label else { continue }
        if label == "content" || label == "text" || label == "rawContent" {
            if let s = child.value as? String { return s }
            // Recurse — content might itself be a structured type.
            let inner = extractContent(from: child.value)
            if !inner.isEmpty { return inner }
        }
    }
    // Last resort: stringify, but at least strip the type wrapper
    // if the description is shaped like `TypeName(field: "…")`.
    let raw = String(describing: value)
    if let openParen = raw.firstIndex(of: "("), raw.last == ")" {
        let inside = raw[raw.index(after: openParen)..<raw.index(before: raw.endIndex)]
        if let q1 = inside.firstIndex(of: "\""), let q2 = inside[inside.index(after: q1)...].firstIndex(of: "\"") {
            return String(inside[inside.index(after: q1)..<q2])
        }
        return String(inside)
    }
    return raw
}

enum AppleFoundationClient {
    enum Failure: LocalizedError {
        case notAvailable(String)
        case generationFailed(String)

        var errorDescription: String? {
            switch self {
            case .notAvailable(let msg):
                return "Apple Intelligence is not available: \(msg). Switch to an HTTPS provider in Settings, or enable Apple Intelligence in System Settings."
            case .generationFailed(let msg):
                return "Apple Intelligence couldn't respond: \(msg)"
            }
        }
    }

    struct Options {
        /// Streaming chunk callback. nil = non-streaming.
        var onChunk: ((String) -> Void)? = nil
    }

    /// Send a prompt and await the full response. When `options.onChunk`
    /// is non-nil, partial responses are delivered as they're
    /// generated (snapshot-based — Apple's API hands back growing
    /// strings, we diff to emit only the new portion per call).
    static func send(prompt: String, options: Options = Options()) async throws -> String {
        #if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            // Probe model availability — `SystemLanguageModel.default`
            // exposes `.availability` so we can refuse cleanly when
            // Apple Intelligence isn't enabled or supported.
            let availability = SystemLanguageModel.default.availability
            switch availability {
            case .available:
                break
            case .unavailable(let reason):
                throw Failure.notAvailable(String(describing: reason))
            @unknown default:
                throw Failure.notAvailable("unknown availability state")
            }

            let session = LanguageModelSession()
            do {
                if let onChunk = options.onChunk {
                    var lastEmitted = ""
                    let stream = session.streamResponse(to: prompt)
                    for try await snapshot in stream {
                        // Apple's stream yields a snapshot struct; the
                        // generated text lives on `.content`. Earlier
                        // we used `String(describing:)` which dumped
                        // the whole struct ("Snapshot(content: ..., rawContent: ...)")
                        // into the chat. Extract the actual content.
                        let snapshotString = extractContent(from: snapshot)
                        // Snapshots are cumulative — emit just the
                        // delta so callers can treat onChunk like a
                        // regular SSE token feed.
                        if snapshotString.hasPrefix(lastEmitted) {
                            let delta = String(snapshotString.dropFirst(lastEmitted.count))
                            if !delta.isEmpty { onChunk(delta) }
                        } else {
                            onChunk(snapshotString)
                        }
                        lastEmitted = snapshotString
                    }
                    return lastEmitted
                } else {
                    let response = try await session.respond(to: prompt)
                    return extractContent(from: response.content)
                }
            } catch {
                throw Failure.generationFailed(error.localizedDescription)
            }
        } else {
            throw Failure.notAvailable("requires macOS 26 or later")
        }
        #else
        throw Failure.notAvailable("FoundationModels framework not available in this build")
        #endif
    }
}
