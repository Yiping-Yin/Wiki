import Foundation
import WebKit

/// Phase 7.3 · Write bridge for extractor-anchor dismissals.
///
/// Mirrors `LoomSchemaCorrectionsBridgeHandler` (Phase 7.1) — the
/// shipped Loom app has no Next.js API server, so the dismissal
/// sidecar's web fallback (`POST /api/extractor-anchors-dismissed`)
/// is unreachable in native mode. JS calls this bridge instead, and
/// `ExtractorAnchorsDismissedStore.append` writes the sidecar to disk.
///
/// JS:
///   `window.webkit.messageHandlers.loomExtractorAnchors.postMessage({
///      action: "dismiss",
///      docId: "know/unsw-fins-3640__week-3-lecture",
///      fingerprint: "t_1234_abc::keyQuotes[2]"
///    })`
///     -> `{ dismissedFingerprints: [...] }`
@MainActor
final class LoomExtractorAnchorsBridgeHandler: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "loomExtractorAnchors"

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let payload = message.body as? [String: Any],
              let action = payload["action"] as? String else {
            replyHandler(nil, "missing action")
            return
        }

        do {
            switch action {
            case "dismiss":
                guard let docId = payload["docId"] as? String,
                      !docId.isEmpty else {
                    throw LoomExtractorAnchorsBridge.invalid("docId required")
                }
                guard let fingerprint = payload["fingerprint"] as? String,
                      !fingerprint.isEmpty else {
                    throw LoomExtractorAnchorsBridge.invalid("fingerprint required")
                }
                let next = try ExtractorAnchorsDismissedStore.append(
                    docId: docId,
                    fingerprint: fingerprint
                )
                replyHandler(["dismissedFingerprints": next], nil)

            case "read":
                guard let docId = payload["docId"] as? String,
                      !docId.isEmpty else {
                    throw LoomExtractorAnchorsBridge.invalid("docId required")
                }
                let dismissed = ExtractorAnchorsDismissedStore.read(docId: docId)
                replyHandler(
                    ["dismissedFingerprints": Array(dismissed).sorted()],
                    nil
                )

            default:
                throw LoomExtractorAnchorsBridge.invalid("unknown action: \(action)")
            }
        } catch {
            replyHandler(nil, error.localizedDescription)
        }
    }
}

/// Phase 7.3 · Read bridge for the reading-page provisional anchor
/// layer.
///
/// Exposes one native-JSON endpoint:
///
///   GET  loom://native/extractor-anchors-for-doc/<readingDocId>.json
///        Walks transcript / textbook ingestion traces whose filename
///        slug matches the reading page, returns the `keyQuotes` /
///        `keyTerms` projected as `ExtractorAnchorPayload` items.
///        Already-dismissed fingerprints are filtered out server-side
///        so the web layer only ever sees still-live provisionals.
///
/// Like `LoomSchemaBridge`, the URL-scheme handler does the routing
/// and response shaping; this enum just defines the payload builder.
enum LoomExtractorAnchorsBridge {

    /// Build the payload for
    /// `loom://native/extractor-anchors-for-doc/<readingDocId>.json`.
    /// Returns an empty list (NOT nil) when no transcript / textbook
    /// trace matches the doc — the URL scheme handler turns the empty
    /// list into a valid `{"anchors": []}` response so the web side
    /// distinguishes "no match" from "fetch failed". Returns `nil`
    /// only when the docId is malformed.
    @MainActor
    static func buildPayload(forReadingDocId readingDocId: String) -> [String: Any]? {
        guard !readingDocId.isEmpty else { return nil }
        let anchors = SchemaResolver.resolveExtractorAnchors(
            forReadingDocId: readingDocId
        )
        return [
            "docId": readingDocId,
            "anchors": anchors.map { $0.jsonDictionary() },
        ]
    }

    static func invalid(_ message: String) -> NSError {
        NSError(
            domain: "LoomExtractorAnchors",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}
