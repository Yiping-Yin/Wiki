import Foundation
import WebKit

/// Phase 7.2 · Write bridge for per-pursuit hide / restore.
///
/// Mirrors `LoomSchemaCorrectionsBridgeHandler` exactly — the shipped
/// Loom app has no Next.js API server, so the sidecar write path
/// (`POST /api/pursuit-hide`) has no listener in native mode. This
/// bridge accepts the same payload shape the web API route accepts
/// and writes it directly to disk via `PursuitHideStore.hide` /
/// `PursuitHideStore.restore`. In dev / browser mode the web API
/// route is used directly and this bridge is never invoked
/// (`isNativeMode()` gates the client choice).
///
/// JS:
///   `window.webkit.messageHandlers.loomPursuitHide.postMessage({
///      action: "hide",
///      pursuitId: "<uuid>",
///      sourceDocId: "ingested:Course Overview_FINS3640.pdf"
///    })`
///     -> `{ hiddenPursuitIds: ["<uuid>", ...] }`
///
///   action: "restore" inverts the operation; payload shape is
///   otherwise identical.
@MainActor
final class LoomPursuitHideBridgeHandler: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "loomPursuitHide"

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
            case "hide":
                let (pursuitId, sourceDocId) = try requireIds(payload)
                let next = try PursuitHideStore.hide(
                    pursuitId: pursuitId,
                    sourceDocId: sourceDocId
                )
                // Notify the webview-mirror coordinator so the
                // Pursuits room re-fetches and re-filters.
                NotificationCenter.default.post(
                    name: .loomPursuitChanged,
                    object: nil,
                    userInfo: ["pursuitId": pursuitId, "op": "hide"]
                )
                replyHandler(["hiddenPursuitIds": next], nil)

            case "restore":
                let (pursuitId, sourceDocId) = try requireIds(payload)
                let next = try PursuitHideStore.restore(
                    pursuitId: pursuitId,
                    sourceDocId: sourceDocId
                )
                NotificationCenter.default.post(
                    name: .loomPursuitChanged,
                    object: nil,
                    userInfo: ["pursuitId": pursuitId, "op": "restore"]
                )
                replyHandler(["hiddenPursuitIds": next], nil)

            case "read":
                let sourceDocId = (payload["sourceDocId"] as? String) ?? ""
                if sourceDocId.isEmpty {
                    let all = Array(PursuitHideStore.readAll())
                    replyHandler(["hiddenPursuitIds": all], nil)
                } else {
                    let next = PursuitHideStore.read(sourceDocId: sourceDocId)
                    replyHandler(["hiddenPursuitIds": next], nil)
                }

            default:
                throw NSError(
                    domain: "LoomPursuitHide",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "unknown action: \(action)"]
                )
            }
        } catch {
            replyHandler(nil, error.localizedDescription)
        }
    }

    private func requireIds(_ payload: [String: Any]) throws -> (String, String) {
        guard let pursuitId = payload["pursuitId"] as? String, !pursuitId.isEmpty else {
            throw NSError(
                domain: "LoomPursuitHide",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "pursuitId required"]
            )
        }
        guard let sourceDocId = payload["sourceDocId"] as? String, !sourceDocId.isEmpty else {
            throw NSError(
                domain: "LoomPursuitHide",
                code: 4,
                userInfo: [NSLocalizedDescriptionKey: "sourceDocId required"]
            )
        }
        return (pursuitId, sourceDocId)
    }
}
