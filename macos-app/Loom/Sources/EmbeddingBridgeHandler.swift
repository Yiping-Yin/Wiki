import Foundation
import WebKit

/// Reply-based bridge exposing `EmbeddingClient.embed(_:)` to the webview.
/// Phase 5 — replaces the `/api/embed` route that previously shelled out
/// to Ollama. JS calls:
///
///   `window.webkit.messageHandlers.loomEmbed.postMessage({ text })`
///     → resolves with `{ vector, dims, model }` JSON payload
///
/// Under-length / decoder failures surface as a string error argument to
/// the reply, matching the pattern `AIBridgeHandler` already uses.
@MainActor
final class EmbeddingBridgeHandler: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "loomEmbed"

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let payload = message.body as? [String: Any],
              let text = payload["text"] as? String else {
            replyHandler(nil, "missing text")
            return
        }
        do {
            let result = try EmbeddingClient.embed(text)
            let dict: [String: Any] = [
                "vector": result.vector,
                "dims": result.dims,
                "model": result.model,
            ]
            replyHandler(dict, nil)
        } catch let failure as EmbeddingClient.Failure {
            replyHandler(nil, failure.errorDescription ?? "\(failure)")
        } catch {
            replyHandler(nil, error.localizedDescription)
        }
    }
}
