import SafariServices
import os.log

// MARK: Safari Web Extension native handler
//
// Apple requires every Safari Web Extension to ship with a Swift
// principal class conforming to NSExtensionRequestHandling. For Loom's
// v1 extension, we don't actually use native messaging — the JS-side
// content script triggers `loom://capture?payload=...` directly, which
// macOS routes back to Loom.app via the URL scheme handler in
// `LoomApp.swift::handleGetURLEvent(_:withReplyEvent:)`. The Loom-app
// already knows what to do with that.
//
// This handler exists because the Safari runtime requires it. We just
// log incoming messages and reply empty. If we ever upgrade to native
// messaging (large payloads / streaming / two-way comms), this is
// where the routing logic would live.

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let profile: UUID?
        if #available(macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = nil
        }
        let message: Any? = {
            if #available(macOS 11.0, *) {
                return request?.userInfo?[SFExtensionMessageKey]
            }
            return request?.userInfo?["message"]
        }()
        os_log(.default, "Loom extension received message from JS context (profile: %@): %@",
               String(describing: profile), String(describing: message))
        let response = NSExtensionItem()
        if #available(macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: ["echo": message ?? "<nil>"]]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
