import SwiftUI
import WebKit

// Phase C M1 / Path B — minimal WKWebView host for the in-Loom capture
// renderer at `/loom-render/capture`. Mirrors enough of LoomWebView's
// configuration to load `loom://` URLs (bundle + content + native) but
// drops AI / migration / source-library / embed bridges since the
// capture renderer doesn't need them.
//
// Why a separate webview struct: the main LoomWebView carries forced-
// theme state, URL persistence to UserDefaults, debug overlay wiring,
// and ~10 message handlers. A capture reader needs none of that —
// just "load a static-export route + resolve loom:// URLs".

/// Forwards capture-delete requests from the magazine webview to
/// `CapturesIndex.delete`, then triggers a webview reload so the
/// list reflects the file change.
final class CaptureDeleteBridge: NSObject, WKScriptMessageHandler {
    static let name = "loomCaptureDelete"
    weak var webView: WKWebView?

    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        guard let rootIDStr = body["rootID"] as? String,
              let rootID = UUID(uuidString: rootIDStr),
              let subPath = body["subPath"] as? String,
              let title = body["title"] as? String else {
            return
        }
        let eyebrow = body["eyebrow"] as? String ?? ""
        // Reconstruct fileURL from rootID + subPath. The subPath
        // includes the `sub/` prefix (mirror of CapturesIndex
        // bookkeeping), so we need to drop it for LoomFileStore.
        let cleanSub: String = {
            if subPath.hasPrefix("sub/") { return String(subPath.dropFirst(4)) }
            return subPath
        }()
        let fileURL = LoomFileStore.loomMDURL(for: rootID, subPath: cleanSub)
        let entry = CaptureEntry(
            id: UUID(),
            rootID: rootID,
            rootLabel: "",
            kind: .other,
            subPath: subPath,
            domain: "",
            title: title,
            eyebrow: eyebrow,
            snippet: "",
            timestamp: nil,
            fileURL: fileURL
        )
        do {
            try CapturesIndex.delete(entry)
            DispatchQueue.main.async { [weak self] in
                self?.webView?.evaluateJavaScript("location.reload()", completionHandler: nil)
            }
        } catch {
            print("[Loom] capture delete failed:", error.localizedDescription)
            DispatchQueue.main.async {
                let alert = NSAlert()
                alert.messageText = "Could not delete capture"
                alert.informativeText = error.localizedDescription
                alert.alertStyle = .warning
                alert.addButton(withTitle: "OK")
                alert.runModal()
            }
        }
    }
}

struct CaptureWebView: NSViewRepresentable {
    let url: URL
    var themeMode: String = "auto"

    final class Coordinator: NSObject, WKUIDelegate {
        let deleteBridge = CaptureDeleteBridge()
        weak var webView: WKWebView?
        private var captureSavedObserver: NSObjectProtocol?
        private var scrollWheelMonitor: Any?

        // Auto-reload-on-notification removed entirely. The previous
        // implementation listened to `.loomRefreshActivePage` and called
        // `webView.reload()` — but the captures landing's own React
        // observers (sticky pivot bar IntersectionObserver, reading
        // progress effects, etc.) interact with the reload in ways that
        // caused continuous refresh + scroll lockout. User can ⌘R or
        // hit the toolbar refresh button explicitly when needed; the
        // captures list also auto-refetches on mount via useEffect, so
        // navigating away + back picks up new captures.

        override init() {
            super.init()
        }

        deinit {
            if let captureSavedObserver {
                NotificationCenter.default.removeObserver(captureSavedObserver)
            }
            if let scrollWheelMonitor {
                NSEvent.removeMonitor(scrollWheelMonitor)
            }
        }

        func attachCaptureSavedObserver(to webView: WKWebView) {
            guard captureSavedObserver == nil else { return }
            captureSavedObserver = NotificationCenter.default.addObserver(
                forName: .loomCaptureSaved,
                object: nil,
                queue: .main
            ) { [weak self, weak webView] _ in
                guard let activeWebView = self?.webView ?? webView else { return }
                activeWebView.evaluateJavaScript(
                    "window.dispatchEvent(new Event('loom:capture-saved'))",
                    completionHandler: nil
                )
            }
        }

        func attachScrollWheelMonitor(to webView: WKWebView) {
            guard scrollWheelMonitor == nil else { return }
            scrollWheelMonitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak webView] event in
                guard let webView else { return event }
                guard let window = webView.window, event.window === window else { return event }
                guard let current = webView.url, CaptureWebView.isCaptureDetailPath(current.path) else { return event }
                guard event.modifierFlags.intersection([.command, .control]).isEmpty else { return event }
                let point = webView.convert(event.locationInWindow, from: nil)
                guard webView.bounds.contains(point) else { return event }
                guard abs(event.scrollingDeltaY) >= abs(event.scrollingDeltaX),
                      abs(event.scrollingDeltaY) > 0 else {
                    return event
                }
                guard let scrollView = CaptureWebView.firstScrollView(in: webView) else { return event }

                let before = scrollView.contentView.bounds.origin
                scrollView.scrollWheel(with: event)
                let after = scrollView.contentView.bounds.origin
                let moved = abs(after.x - before.x) > 0.5 || abs(after.y - before.y) > 0.5
                return moved ? nil : event
            }
        }

        // WKWebView silently no-ops `alert`/`confirm`/`prompt` unless
        // a uiDelegate is attached. Provide minimal implementations
        // so JS dialogs (used by inline delete confirm) actually run.
        func webView(_ webView: WKWebView,
                     runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping (Bool) -> Void) {
            let alert = NSAlert()
            alert.messageText = message
            alert.alertStyle = .warning
            alert.addButton(withTitle: "Delete")
            alert.addButton(withTitle: "Cancel")
            completionHandler(alert.runModal() == .alertFirstButtonReturn)
        }

        func webView(_ webView: WKWebView,
                     runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping () -> Void) {
            let alert = NSAlert()
            alert.messageText = message
            alert.runModal()
            completionHandler()
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    private static func isCaptureDetailPath(_ path: String) -> Bool {
        path.hasPrefix("/loom-render/capture/") ||
            path.hasPrefix("/loom-render/snapshot/")
    }

    private static func firstScrollView(in view: NSView) -> NSScrollView? {
        if let scrollView = view as? NSScrollView {
            return scrollView
        }
        for subview in view.subviews {
            if let found = firstScrollView(in: subview) {
                return found
            }
        }
        return nil
    }

    private static func configureNativeScrolling(for webView: WKWebView) {
        guard let scrollView = firstScrollView(in: webView) else { return }
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.verticalScrollElasticity = .allowed
    }

    private func shouldLoadTarget(_ target: URL, current: URL?) -> Bool {
        guard let current else { return true }
        if current.absoluteString == target.absoluteString { return false }

        // CaptureWebView is a small browser for the captures surface. Once a
        // row navigates from `/loom-render/captures/` to a capture detail
        // route (`/loom-render/capture/` reader or `/loom-render/snapshot/`
        // visual snapshot), ordinary SwiftUI updates (theme ticks, focus
        // changes, parent view diffs) must not force-load the original landing
        // URL again. That interruption was showing up as scroll lockout /
        // jump-back while reading long captures.
        if current.scheme == target.scheme,
           current.host == target.host,
           Self.isCaptureDetailPath(current.path),
           target.path.hasPrefix("/loom-render/captures/") {
            return false // preserve in-webview capture detail navigation
        }

        return true
    }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Note: previous attempts set `allowFileAccessFromFileURLs` /
        // `allowUniversalAccessFromFileURLs` via KVC on
        // WKPreferences, but those are private keys that crash on
        // recent macOS (NSUnknownKeyException → SIGTRAP). For custom
        // URL schemes registered via setURLSchemeHandler the origin
        // policy is governed by the CSP we send from the scheme
        // handler response, so KVC isn't needed anyway.

        // Resolve loom://bundle/ → static-export, loom://content/<id>/ →
        // user content roots, loom://native/* → JSON bridge. Same
        // resolution logic as the main LoomWebView, just without the
        // theme / state plumbing.
        var hostRoots: [String: URL] = [:]
        let contentRoots = ContentRootStore.allActiveURLs
        if let firstRootURL = contentRoots.values.first {
            hostRoots["content"] = firstRootURL
        }

        if let override = ProcessInfo.processInfo.environment["LOOM_STATIC_EXPORT"],
           FileManager.default.fileExists(atPath: override) {
            hostRoots["bundle"] = URL(fileURLWithPath: override)
        } else if let projectRoot = ProcessInfo.processInfo.environment["LOOM_PROJECT_ROOT"] {
            let exportPath = projectRoot + "/.next-export"
            if FileManager.default.fileExists(atPath: exportPath) {
                hostRoots["bundle"] = URL(fileURLWithPath: exportPath)
            }
        }
        if hostRoots["bundle"] == nil, let bundleResources = Bundle.main.resourceURL {
            let staged = bundleResources.appendingPathComponent("web")
            hostRoots["bundle"] = FileManager.default.fileExists(atPath: staged.path)
                ? staged
                : bundleResources
        }
        hostRoots["derived"] = URL(fileURLWithPath: LoomRuntimePaths.derivedDataRoot())
        hostRoots["user-data"] = URL(fileURLWithPath: LoomRuntimePaths.userDataRoot())

        if !hostRoots.isEmpty || !contentRoots.isEmpty {
            let handler = LoomURLSchemeHandler(hostRoots: hostRoots, contentRoots: contentRoots)
            config.setURLSchemeHandler(handler, forURLScheme: LoomURLSchemeHandler.scheme)
        }

        // Capture-delete bridge — webview row trash button posts here.
        let userContentController = WKUserContentController()
        userContentController.addUserScript(WKUserScript(
            source: LoomWebView.themeSyncScript(mode: themeMode),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        ))
        userContentController.add(context.coordinator.deleteBridge, name: CaptureDeleteBridge.name)
        config.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: config)
        // Trackpad two-finger swipe right → back, swipe left → forward.
        // Without this, after clicking a capture row the user has no
        // way to return to the magazine landing without leaving Loom.
        webView.allowsBackForwardNavigationGestures = true
        webView.underPageBackgroundColor = .clear
        Self.configureNativeScrolling(for: webView)
        DispatchQueue.main.async {
            Self.configureNativeScrolling(for: webView)
        }
        webView.uiDelegate = context.coordinator
        context.coordinator.webView = webView
        context.coordinator.deleteBridge.webView = webView
        context.coordinator.attachCaptureSavedObserver(to: webView)
        // 2026-05-02 BISECT: temporarily skip the native scroll-wheel monitor.
        // It calls NSScrollView.scrollWheel directly (manual scroll), then
        // consumes the event. Combined with WKWebView's own internal scroll
        // handling and JS-level scroll listeners, this can produce a tug-of-
        // war between two scroll layers — observed as scrollY oscillating
        // 200-1700px back and forth with no apparent JS-side cause. Disable
        // and re-test; if scroll stabilizes, this monitor is the culprit and
        // its "wheel rescue" intent needs a non-double-scroll redesign.
        // context.coordinator.attachScrollWheelMonitor(to: webView)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        webView.evaluateJavaScript(LoomWebView.themeSyncScript(mode: themeMode), completionHandler: nil)
        if shouldLoadTarget(url, current: webView.url) {
            webView.load(URLRequest(url: url))
        }
    }
}
