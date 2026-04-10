import SwiftUI
import WebKit

final class WebDebugState: ObservableObject {
    @Published var currentURL: String = ""
    @Published var pageTitle: String = ""
    @Published var isLoading: Bool = false
    @Published var lastError: String = ""
    @Published var consoleMessage: String = ""
}

struct ContentView: View {
    @EnvironmentObject var server: DevServer
    @StateObject private var webState = WebDebugState()

    private var windowTitle: String {
        let url = server.serverURL.absoluteString
        switch server.status {
        case .ready:
            return "Loom - \(url)"
        case .starting, .idle:
            return "Loom - Connecting \(url)"
        case .failed:
            return "Loom - Failed \(url)"
        }
    }

    var body: some View {
        ZStack {
            switch server.status {
            case .ready:
                LoomWebView(url: server.serverURL, debugState: webState)
                    .ignoresSafeArea()
                    .transition(.opacity)
            case .starting, .idle:
                StartingView(serverURL: server.serverURL)
            case .failed(let msg):
                VStack(spacing: 12) {
                    Text("Could not connect")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.secondary)
                    Text("Target: \(server.serverURL.absoluteString)")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.secondary)
                    Text(msg)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.tertiary)
                    Button("Retry") { server.start() }
                        .buttonStyle(.bordered)
                }
            }

            #if DEBUG
            VStack {
                HStack {
                    Spacer()
                    DevHUD(status: server.status, url: server.serverURL, webState: webState)
                }
                Spacer()
            }
            .padding(.top, 14)
            .padding(.trailing, 16)
            #endif
        }
        .animation(.easeInOut(duration: 0.3), value: server.status)
        .background(WindowConfigurator(title: windowTitle))
    }
}

struct DevHUD: View {
    let status: DevServer.Status
    let url: URL
    @ObservedObject var webState: WebDebugState

    private var statusLabel: String {
        switch status {
        case .ready: return "ready"
        case .starting, .idle: return "connecting"
        case .failed: return "failed"
        }
    }

    private var statusColor: Color {
        switch status {
        case .ready: return .green
        case .starting, .idle: return .orange
        case .failed: return .red
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Label {
                    Text("\(statusLabel) · \(url.absoluteString)")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                } icon: {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)
                }

                Button("Reload") {
                    NotificationCenter.default.post(name: .loomReload, object: nil)
                }
                .buttonStyle(.borderless)
                .font(.system(size: 11, weight: .medium))

                Button("Browser") {
                    NotificationCenter.default.post(name: .loomOpenInBrowser, object: nil)
                }
                .buttonStyle(.borderless)
                .font(.system(size: 11, weight: .medium))
            }

            if !webState.currentURL.isEmpty || !webState.pageTitle.isEmpty || webState.isLoading || !webState.lastError.isEmpty || !webState.consoleMessage.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    if !webState.currentURL.isEmpty {
                        Text("webview: \(webState.currentURL)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                    if !webState.pageTitle.isEmpty {
                        Text("title: \(webState.pageTitle)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Text("loading: \(webState.isLoading ? "yes" : "no")")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.secondary)
                    if !webState.lastError.isEmpty {
                        Text("error: \(webState.lastError)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.red)
                            .lineLimit(2)
                    }
                    if !webState.consoleMessage.isEmpty {
                        Text("js: \(webState.consoleMessage)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.orange)
                            .lineLimit(3)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(
            Capsule()
                .stroke(Color.primary.opacity(0.08), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.06), radius: 8, y: 3)
    }
}

/// Makes the title bar transparent and blends with content — handles notch/刘海 on MacBook Pro.
struct WindowConfigurator: NSViewRepresentable {
    let title: String

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .visible
            window.styleMask.insert(.fullSizeContentView)
            window.isMovableByWindowBackground = true
            window.backgroundColor = NSColor.windowBackgroundColor
            window.title = title
            // Remember window size and position across launches
            window.setFrameAutosaveName("LoomMainWindow")
        }
        return view
    }
    func updateNSView(_ nsView: NSView, context: Context) {
        nsView.window?.title = title
    }
}

/// Minimal loading state — 8 warp lines with shimmer, matching HomeLoom.
/// No text, no spinner, no "loading..." — §1/§21.
struct StartingView: View {
    let serverURL: URL
    @State private var phase: CGFloat = 0

    var body: some View {
        VStack(spacing: 16) {
            Canvas { context, size in
                let warps = 8
                let pad: CGFloat = size.width * 0.3
                let gap = (size.width - pad * 2) / CGFloat(warps - 1)
                let cy = size.height / 2

                for i in 0..<warps {
                    let x = pad + CGFloat(i) * gap
                    let t = phase + CGFloat(i) * 0.4
                    let brightness = 0.15 + 0.12 * sin(t)

                    var path = Path()
                    path.move(to: CGPoint(x: x, y: cy - 50))
                    path.addLine(to: CGPoint(x: x, y: cy + 50))

                    context.stroke(
                        path,
                        with: .color(.primary.opacity(brightness)),
                        lineWidth: 0.8
                    )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Text("Connecting to \(serverURL.absoluteString)")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
                .padding(.bottom, 24)
        }
        .onAppear {
            withAnimation(.linear(duration: 4).repeatForever(autoreverses: false)) {
                phase = .pi * 2
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
    }
}

struct LoomWebView: NSViewRepresentable {
    let url: URL
    @ObservedObject var debugState: WebDebugState

    func makeCoordinator() -> Coordinator { Coordinator(debugState: debugState) }

    private func isLoopbackHost(_ host: String?) -> Bool {
        guard let host else { return false }
        switch host.lowercased() {
        case "localhost", "127.0.0.1", "::1", "0.0.0.0":
            return true
        default:
            return false
        }
    }

    private func desiredURL(for webView: WKWebView) -> URL {
        if let currentURL = webView.url,
            currentURL.scheme?.hasPrefix("http") == true,
            isLoopbackHost(currentURL.host) {
            var components = URLComponents(url: currentURL, resolvingAgainstBaseURL: false)
            components?.scheme = url.scheme
            components?.host = url.host
            components?.port = url.port
            return components?.url ?? url
        }
        return url
    }

    private func loadIfNeeded(_ webView: WKWebView, coordinator: Coordinator) {
        let targetURL = desiredURL(for: webView)
        if webView.url?.absoluteString == targetURL.absoluteString { return }
        if coordinator.lastRequestedURL?.absoluteString == targetURL.absoluteString { return }
        coordinator.lastRequestedURL = targetURL
        webView.load(URLRequest(url: targetURL))
    }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.websiteDataStore = .default()
        #if DEBUG
        let userContentController = WKUserContentController()
        let debugScript = """
        (() => {
          window.__loomAppShell = true;
          const post = (kind, payload) => {
            try {
              window.webkit?.messageHandlers?.loomDebug?.postMessage({ kind, payload: String(payload ?? '') });
            } catch {}
          };
          const stringify = (value) => {
            try { return typeof value === 'string' ? value : JSON.stringify(value); }
            catch { return String(value); }
          };
          const oldError = console.error.bind(console);
          console.error = (...args) => {
            post('console.error', args.map(stringify).join(' '));
            oldError(...args);
          };
          const oldWarn = console.warn.bind(console);
          console.warn = (...args) => {
            post('console.warn', args.map(stringify).join(' '));
            oldWarn(...args);
          };
          window.addEventListener('error', (event) => {
            post('window.error', event.message || event.error || 'unknown error');
          });
          window.addEventListener('unhandledrejection', (event) => {
            post('unhandledrejection', stringify(event.reason));
          });
        })();
        """
        userContentController.addUserScript(
            WKUserScript(source: debugScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        userContentController.add(context.coordinator, name: "loomDebug")
        config.userContentController = userContentController
        #endif

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        context.coordinator.fallbackURL = url
        // drawsBackground stays true — let the web app control its own colors
        webView.allowsMagnification = true

        loadIfNeeded(webView, coordinator: context.coordinator)
        context.coordinator.syncState(from: webView)
        context.coordinator.webView = webView

        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.triggerSearch),
            name: .loomSearch,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.triggerReview),
            name: .loomReview,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.triggerReload),
            name: .loomReload,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.openInBrowser),
            name: .loomOpenInBrowser,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.goBack),
            name: .loomGoBack,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.goForward),
            name: .loomGoForward,
            object: nil
        )

        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.newTopic),
            name: .loomNewTopic,
            object: nil
        )

        // Enable swipe back/forward gesture
        webView.allowsBackForwardNavigationGestures = true

        // Pinch gesture → toggle Review mode
        // Pinch-out (spread fingers) = "zoom out to see the whole fabric" = enter Review
        // Pinch-in (pinch fingers) = "zoom back to the loom" = exit Review
        let pinch = NSMagnificationGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handlePinch(_:)))
        pinch.delegate = context.coordinator
        webView.addGestureRecognizer(pinch)

        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        context.coordinator.fallbackURL = url
        loadIfNeeded(nsView, coordinator: context.coordinator)
        context.coordinator.syncState(from: nsView)
    }

    static func dismantleNSView(_ nsView: WKWebView, coordinator: Coordinator) {
        coordinator.cleanup()
        nsView.navigationDelegate = nil
        #if DEBUG
        nsView.configuration.userContentController.removeScriptMessageHandler(forName: "loomDebug")
        #endif
    }

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler, NSGestureRecognizerDelegate {
        weak var webView: WKWebView?
        var lastRequestedURL: URL?
        var fallbackURL: URL?
        let debugState: WebDebugState
        private var blankPageWorkItem: DispatchWorkItem?
        private var isInReviewMode = false

        init(debugState: WebDebugState) {
            self.debugState = debugState
        }

        private func isLocalHost(_ host: String?) -> Bool {
            guard let host else { return false }
            switch host.lowercased() {
            case "localhost", "127.0.0.1", "::1", "0.0.0.0":
                return true
            default:
                return false
            }
        }

        deinit {
            blankPageWorkItem?.cancel()
            NotificationCenter.default.removeObserver(self)
        }

        func cleanup() {
            blankPageWorkItem?.cancel()
            blankPageWorkItem = nil
            webView = nil
            NotificationCenter.default.removeObserver(self)
        }

        private func scheduleRootFallbackCheck(for webView: WKWebView) {
            blankPageWorkItem?.cancel()
            let work = DispatchWorkItem { [weak self, weak webView] in
                guard let self = self, let webView = webView else { return }
                webView.evaluateJavaScript("""
                    (() => {
                      const path = location.pathname;
                      const main = document.querySelector('main');
                      const text = (main?.innerText || '').replace(/\\s+/g, ' ').trim();
                      return { path, textLength: text.length, title: document.title || '' };
                    })()
                """) { result, _ in
                    guard let info = result as? [String: Any] else { return }
                    let path = info["path"] as? String ?? ""
                    let textLength = info["textLength"] as? Int ?? 0
                    let title = (info["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                    // Only apply fallback for an obviously blank initial root render.
                    if path == "/", textLength < 24, title.isEmpty, webView.canGoBack == false {
                        guard let base = self.fallbackURL else { return }
                        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
                        components?.path = "/about"
                        components?.query = nil
                        components?.fragment = nil
                        if let target = components?.url {
                            self.lastRequestedURL = target
                            webView.load(URLRequest(url: target))
                            DispatchQueue.main.async {
                                self.debugState.consoleMessage = "root fallback: loaded /about because home rendered almost empty"
                            }
                        }
                    }
                }
            }
            blankPageWorkItem = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0, execute: work)
        }

        private func updateDebugState(from webView: WKWebView, errorMessage: String? = nil) {
            let apply = {
                let currentURL = webView.url?.absoluteString ?? ""
                let pageTitle = webView.title ?? ""
                let isLoading = webView.isLoading

                if self.debugState.currentURL != currentURL {
                    self.debugState.currentURL = currentURL
                }
                if self.debugState.pageTitle != pageTitle {
                    self.debugState.pageTitle = pageTitle
                }
                if self.debugState.isLoading != isLoading {
                    self.debugState.isLoading = isLoading
                }
                if let errorMessage {
                    if self.debugState.lastError != errorMessage {
                        self.debugState.lastError = errorMessage
                    }
                }
            }
            if Thread.isMainThread {
                apply()
            } else {
                DispatchQueue.main.async(execute: apply)
            }
        }

        func syncState(from webView: WKWebView) {
            updateDebugState(from: webView)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            lastRequestedURL = webView.url
            updateDebugState(from: webView, errorMessage: "")
            if debugState.consoleMessage != "" {
                debugState.consoleMessage = ""
            }
            #if DEBUG
            scheduleRootFallbackCheck(for: webView)
            #endif
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            blankPageWorkItem?.cancel()
            if debugState.consoleMessage != "" {
                debugState.consoleMessage = ""
            }
            syncState(from: webView)
        }

        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            syncState(from: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            let nsError = error as NSError
            let isCancelled = nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
            let isPolicyInterrupt = nsError.domain == WKErrorDomain && nsError.code == 102
            if isCancelled || isPolicyInterrupt {
                lastRequestedURL = nil
                syncState(from: webView)
                return
            }
            lastRequestedURL = nil
            updateDebugState(from: webView, errorMessage: error.localizedDescription)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            let nsError = error as NSError
            let isCancelled = nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
            let isPolicyInterrupt = nsError.domain == WKErrorDomain && nsError.code == 102
            if isCancelled || isPolicyInterrupt {
                lastRequestedURL = nil
                syncState(from: webView)
                return
            }
            lastRequestedURL = nil
            updateDebugState(from: webView, errorMessage: error.localizedDescription)
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "loomDebug" else { return }
            guard let body = message.body as? [String: Any] else { return }
            let kind = body["kind"] as? String ?? "message"
            let payload = body["payload"] as? String ?? ""
            let rawMessage = "\(kind): \(payload)"
            let clippedMessage = rawMessage.count > 800 ? String(rawMessage.prefix(800)) + "…" : rawMessage
            DispatchQueue.main.async {
                if self.debugState.consoleMessage != clippedMessage {
                    self.debugState.consoleMessage = clippedMessage
                }
            }
        }

        @objc func triggerSearch() {
            webView?.evaluateJavaScript("""
                window.dispatchEvent(new KeyboardEvent('keydown', {key: 'k', metaKey: true}));
            """)
        }

        @objc func triggerReview() {
            webView?.evaluateJavaScript("""
                window.dispatchEvent(new KeyboardEvent('keydown', {key: '/', metaKey: true}));
            """)
        }

        @objc func triggerReload() {
            guard let webView else { return }
            if webView.url != nil {
                webView.reload()
            } else if let fallbackURL {
                lastRequestedURL = nil
                webView.load(URLRequest(url: fallbackURL))
            } else {
                webView.reload()
            }
            syncState(from: webView)
        }

        @objc func openInBrowser() {
            guard let url = webView?.url ?? fallbackURL else { return }
            NSWorkspace.shared.open(url)
        }

        @objc func goBack() {
            guard let webView, webView.canGoBack else { return }
            webView.goBack()
            syncState(from: webView)
        }

        @objc func goForward() {
            guard let webView, webView.canGoForward else { return }
            webView.goForward()
            syncState(from: webView)
        }

        // Allow pinch gesture to coexist with WKWebView's built-in zoom
        func gestureRecognizer(_ gestureRecognizer: NSGestureRecognizer, shouldRecognizeSimultaneouslyWith other: NSGestureRecognizer) -> Bool {
            true
        }

        @objc func handlePinch(_ gesture: NSMagnificationGestureRecognizer) {
            guard gesture.state == .ended else { return }
            // Threshold: significant pinch-out (spread) → enter Review
            // Significant pinch-in (squeeze) → exit Review
            if gesture.magnification > 0.4 && !isInReviewMode {
                isInReviewMode = true
                webView?.evaluateJavaScript("""
                    window.dispatchEvent(new KeyboardEvent('keydown', {key: '/', metaKey: true}));
                """)
                // Reset WKWebView zoom to 1x so it doesn't actually zoom
                webView?.magnification = 1.0
            } else if gesture.magnification < -0.3 && isInReviewMode {
                isInReviewMode = false
                webView?.evaluateJavaScript("""
                    window.dispatchEvent(new KeyboardEvent('keydown', {key: '/', metaKey: true}));
                """)
                webView?.magnification = 1.0
            }
        }

        @objc func newTopic() {
            // Dispatch a custom event that the Sidebar's NewTopicButton listens for
            webView?.evaluateJavaScript("""
                window.dispatchEvent(new CustomEvent('loom:new-topic'));
            """)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if let url = navigationAction.request.url,
               navigationAction.targetFrame?.isMainFrame != false,
               url.scheme?.hasPrefix("http") == true,
               !isLocalHost(url.host) {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
