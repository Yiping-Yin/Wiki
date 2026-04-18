import WebKit

enum LoomWebViewInteractionPolicy {
    static func apply(to webView: WKWebView) {
        // Trackpad pinch is reserved for Loom's review gesture. Letting
        // WKWebView keep its built-in page magnification leaves the page in a
        // partially zoomed state, which makes the whole app feel out of proportion.
        webView.allowsMagnification = false
        webView.magnification = 1.0
    }
}
