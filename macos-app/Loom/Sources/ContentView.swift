import SwiftUI
import WebKit

private let lastLocalPathDefaultsKey = "loom.lastLocalPath"

final class WebDebugState: ObservableObject {
    @Published var currentURL: String = ""
    @Published var pageTitle: String = ""
    @Published var isLoading: Bool = false
    @Published var lastError: String = ""
    @Published var consoleMessage: String = ""
    @Published var recoveryMessage: String = ""
}

struct ContentView: View {
    @EnvironmentObject var server: DevServer
    @StateObject private var webState = WebDebugState()
    @AppStorage("loom.showDebugHUD.v2") private var showDebugHUD = false

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
                    ScrollView {
                        Text(msg)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.tertiary)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxWidth: 700, maxHeight: 220)
                    Button("Retry") { server.start() }
                        .buttonStyle(.bordered)
                }
                .padding(16)
            }

            #if DEBUG
            if showDebugHUD {
                VStack {
                    HStack {
                        Spacer()
                        DevHUD(status: server.status, url: server.serverURL, webState: webState, isVisible: $showDebugHUD)
                    }
                    Spacer()
                }
                .padding(.top, 14)
                .padding(.trailing, 16)
            }
            #endif
        }
        .animation(.easeInOut(duration: 0.3), value: server.status)
        .background(WindowConfigurator(title: windowTitle))
        .onAppear {
            showDebugHUD = false
        }
    }
}

struct DevHUD: View {
    let status: DevServer.Status
    let url: URL
    @ObservedObject var webState: WebDebugState
    @Binding var isVisible: Bool

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

                Button {
                    isVisible = false
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            if !webState.currentURL.isEmpty || !webState.pageTitle.isEmpty || webState.isLoading || !webState.lastError.isEmpty || !webState.consoleMessage.isEmpty || !webState.recoveryMessage.isEmpty {
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
                    if !webState.recoveryMessage.isEmpty {
                        Text("recovery: \(webState.recoveryMessage)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.blue)
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
    let debugState: WebDebugState

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
            ["http", "https"].contains(currentURL.scheme?.lowercased() ?? ""),
            isLoopbackHost(currentURL.host) {
            var components = URLComponents(url: currentURL, resolvingAgainstBaseURL: false)
            components?.scheme = url.scheme
            components?.host = url.host
            components?.port = url.port
            return components?.url ?? url
        }
        if let storedRelative = UserDefaults.standard.string(forKey: lastLocalPathDefaultsKey),
           storedRelative.hasPrefix("/"),
           storedRelative != "/" {
            let storedComponents = URLComponents(string: storedRelative)
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            components?.path = storedComponents?.path ?? storedRelative
            components?.query = storedComponents?.query
            components?.fragment = storedComponents?.fragment
            return components?.url ?? url
        }
        return url
    }

    private func loadIfNeeded(_ webView: WKWebView, coordinator: Coordinator) {
        let targetURL = desiredURL(for: webView)
        if webView.url?.absoluteString == targetURL.absoluteString { return }
        if coordinator.lastRequestedURL?.absoluteString == targetURL.absoluteString { return }
        coordinator.lastRequestedURL = targetURL
        let request = URLRequest(url: targetURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        webView.load(request)
    }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        #if DEBUG
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        #endif
        config.applicationNameForUserAgent = "LoomAppShell"
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
          const shouldReload = (message) => /Loading chunk|ChunkLoadError/i.test(String(message || ''));
          const reportChunkError = (message) => {
            post('chunk.error', message || 'chunk load error');
          };
          window.addEventListener('error', (event) => {
            if (shouldReload(event.message)) reportChunkError(event.message);
          });
          window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason;
            const message = typeof reason === 'string' ? reason : (reason && reason.message) || '';
            if (shouldReload(message)) reportChunkError(message);
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
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.quickSticky),
            name: .loomQuickSticky,
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
        for recognizer in nsView.gestureRecognizers where recognizer is NSMagnificationGestureRecognizer {
            nsView.removeGestureRecognizer(recognizer)
        }
        nsView.stopLoading()
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
        private var fallbackCheckGeneration = 0
        private var lastChunkRecoveryAt: Date?
        private var lastProcessTerminationRecoveryAt: Date?
        private var lastRuntimeRecoveryAt: Date?

        init(debugState: WebDebugState) {
            self.debugState = debugState
        }

        private func normalizedLocalRelativeLocation(for url: URL) -> String {
            guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
                return url.path
            }
            if var items = components.queryItems {
                items.removeAll { $0.name == "__loom_recover" }
                components.queryItems = items.isEmpty ? nil : items
            }
            let path = components.percentEncodedPath.isEmpty ? "/" : components.percentEncodedPath
            var relative = path
            if let query = components.percentEncodedQuery, !query.isEmpty {
                relative += "?\(query)"
            }
            if let fragment = components.percentEncodedFragment, !fragment.isEmpty {
                relative += "#\(fragment)"
            }
            return relative
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
            fallbackCheckGeneration += 1
            webView = nil
            NotificationCenter.default.removeObserver(self)
        }

        private func scheduleRootFallbackCheck(for webView: WKWebView) {
            blankPageWorkItem?.cancel()
            fallbackCheckGeneration += 1
            let generation = fallbackCheckGeneration
            let work = DispatchWorkItem { [weak self, weak webView] in
                guard let self = self, let webView = webView else { return }
                webView.evaluateJavaScript("""
                    (() => {
                      const path = location.pathname;
                      const root = document.querySelector('main') || document.body;
                      const text = (root?.innerText || '').replace(/\\s+/g, ' ').trim();
                      return { path, textLength: text.length, title: document.title || '', text };
                    })()
                """) { result, _ in
                    guard self.fallbackCheckGeneration == generation else { return }
                    guard let info = result as? [String: Any] else { return }
                    let path = info["path"] as? String ?? ""
                    let textLength = info["textLength"] as? Int ?? 0
                    let text = (info["text"] as? String ?? "").lowercased()

                    let hasRuntimeErrorMarker = text.contains("application error")
                        || text.contains("something went wrong")
                        || text.contains("a client-side exception has occurred")
                    if hasRuntimeErrorMarker {
                        self.recoverFromRuntimeError("Detected Next runtime error screen")
                        return
                    }

                    // Only apply fallback for an obviously blank initial root render.
                    if path == "/", textLength < 24, webView.canGoBack == false {
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
            if let url = webView.url,
               ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
               let host = url.host,
               isLocalHost(host),
               !url.path.hasPrefix("/api"),
               !url.path.hasPrefix("/_next"),
               !url.path.isEmpty {
                let relative = normalizedLocalRelativeLocation(for: url)
                if relative != "/" {
                    UserDefaults.standard.set(relative, forKey: lastLocalPathDefaultsKey)
                }
            }
            updateDebugState(from: webView, errorMessage: "")
            if debugState.consoleMessage != "" {
                debugState.consoleMessage = ""
            }
            if debugState.recoveryMessage != "" {
                debugState.recoveryMessage = ""
            }
            scheduleRootFallbackCheck(for: webView)
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            blankPageWorkItem?.cancel()
            fallbackCheckGeneration += 1
            isInReviewMode = false
            if debugState.consoleMessage != "" {
                debugState.consoleMessage = ""
            }
            if debugState.recoveryMessage != "" {
                debugState.recoveryMessage = ""
            }
            if debugState.lastError != "" {
                debugState.lastError = ""
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
            isInReviewMode = false
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
            isInReviewMode = false
            if isCancelled || isPolicyInterrupt {
                lastRequestedURL = nil
                syncState(from: webView)
                return
            }
            lastRequestedURL = nil
            updateDebugState(from: webView, errorMessage: error.localizedDescription)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            let now = Date()
            if let lastRecovery = lastProcessTerminationRecoveryAt,
               now.timeIntervalSince(lastRecovery) < 2 {
                updateDebugState(from: webView, errorMessage: "Web content process terminated repeatedly")
                DispatchQueue.main.async {
                    self.debugState.recoveryMessage = "skipped repeated process recovery"
                }
                return
            }
            lastProcessTerminationRecoveryAt = now
            updateDebugState(from: webView, errorMessage: "Web content process terminated, reloading")
            DispatchQueue.main.async {
                self.debugState.recoveryMessage = "reloading after web content process termination"
            }
            if webView.url != nil {
                webView.reloadFromOrigin()
            } else if let fallbackURL {
                lastRequestedURL = nil
                let request = URLRequest(url: fallbackURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
                webView.load(request)
            }
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "loomDebug" else { return }
            guard let body = message.body as? [String: Any] else { return }
            let kind = body["kind"] as? String ?? "message"
            let payload = body["payload"] as? String ?? ""
            if kind == "chunk.error" {
                DispatchQueue.main.async {
                    self.debugState.consoleMessage = "chunk.error: \(payload)"
                }
                recoverFromChunkError(payload)
                return
            }
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
            guard let webView else { return }
            isInReviewMode.toggle()
            webView.evaluateJavaScript("""
                window.dispatchEvent(new KeyboardEvent('keydown', {key: '/', metaKey: true}));
            """)
        }

        @objc func triggerReload() {
            guard let webView else { return }
            if debugState.lastError != "" {
                debugState.lastError = ""
            }
            if webView.url != nil {
                webView.reloadFromOrigin()
            } else if let fallbackURL {
                lastRequestedURL = nil
                let request = URLRequest(url: fallbackURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
                webView.load(request)
            } else {
                webView.reloadFromOrigin()
            }
            syncState(from: webView)
        }

        @objc func openInBrowser() {
            let current = webView?.url
            let target: URL?
            if let current, ["http", "https"].contains(current.scheme?.lowercased() ?? "") {
                target = current
            } else if let fallbackURL, ["http", "https"].contains(fallbackURL.scheme?.lowercased() ?? "") {
                target = fallbackURL
            } else {
                target = nil
            }
            guard let target else { return }
            NSWorkspace.shared.open(target)
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
            guard let webView else { return }
            // Threshold: significant pinch-out (spread) → enter Review
            // Significant pinch-in (squeeze) → exit Review
            if gesture.magnification > 0.4 && !isInReviewMode {
                isInReviewMode = true
                webView.evaluateJavaScript("""
                    window.dispatchEvent(new KeyboardEvent('keydown', {key: '/', metaKey: true}));
                """)
                // Reset WKWebView zoom to 1x so it doesn't actually zoom
                webView.magnification = 1.0
            } else if gesture.magnification < -0.3 && isInReviewMode {
                isInReviewMode = false
                webView.evaluateJavaScript("""
                    window.dispatchEvent(new KeyboardEvent('keydown', {key: '/', metaKey: true}));
                """)
                webView.magnification = 1.0
            }
        }

        @objc func newTopic() {
            isInReviewMode = false
            webView?.evaluateJavaScript("""
                window.dispatchEvent(new CustomEvent('loom:new-topic'));
            """)
        }

        @objc func quickSticky() {
            webView?.evaluateJavaScript("""
                window.dispatchEvent(new CustomEvent('loom:quick-sticky'));
            """)
        }

        private func recoverFromChunkError(_ message: String) {
            guard let webView else { return }
            let now = Date()
            if let lastChunkRecoveryAt, now.timeIntervalSince(lastChunkRecoveryAt) < 4 {
                DispatchQueue.main.async {
                    self.debugState.recoveryMessage = "skipped chunk recovery (throttled)"
                }
                return
            }
            lastChunkRecoveryAt = now

            let store = webView.configuration.websiteDataStore
            let cacheTypes: Set<String> = [
                WKWebsiteDataTypeMemoryCache,
                WKWebsiteDataTypeDiskCache,
                WKWebsiteDataTypeOfflineWebApplicationCache,
                WKWebsiteDataTypeSessionStorage,
                WKWebsiteDataTypeLocalStorage,
            ]

            let loadTarget = { [weak self, weak webView] in
                guard let self, let webView else { return }
                let baseURL = webView.url ?? self.fallbackURL
                guard var components = baseURL.flatMap({ URLComponents(url: $0, resolvingAgainstBaseURL: false) }) else { return }
                var items = components.queryItems ?? []
                items.removeAll { $0.name == "__loom_recover" }
                items.append(URLQueryItem(name: "__loom_recover", value: String(Int(now.timeIntervalSince1970))))
                components.queryItems = items
                guard let target = components.url else { return }
                self.lastRequestedURL = nil
                let request = URLRequest(url: target, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
                webView.load(request)
                self.updateDebugState(from: webView, errorMessage: "Recovered from chunk error")
                DispatchQueue.main.async {
                    self.debugState.consoleMessage = "chunk recovery: \(message)"
                    self.debugState.recoveryMessage = "reloaded from origin after chunk error"
                }
            }

            store.fetchDataRecords(ofTypes: cacheTypes) { records in
                store.removeData(ofTypes: cacheTypes, for: records) {
                    DispatchQueue.main.async(execute: loadTarget)
                }
            }
        }

        private func recoverFromRuntimeError(_ message: String) {
            guard let webView else { return }
            let now = Date()
            if let lastRuntimeRecoveryAt, now.timeIntervalSince(lastRuntimeRecoveryAt) < 5 {
                guard let base = fallbackURL else {
                    DispatchQueue.main.async {
                        self.debugState.recoveryMessage = "skipped runtime recovery (throttled)"
                    }
                    return
                }
                var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
                components?.path = "/about"
                components?.query = nil
                components?.fragment = nil
                guard let target = components?.url else { return }
                lastRequestedURL = nil
                let request = URLRequest(url: target, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
                webView.load(request)
                DispatchQueue.main.async {
                    self.debugState.recoveryMessage = "fallback to /about after repeated runtime errors"
                }
                return
            }
            lastRuntimeRecoveryAt = now
            lastRequestedURL = nil
            DispatchQueue.main.async {
                self.debugState.consoleMessage = "runtime recovery: \(message)"
                self.debugState.recoveryMessage = "reloading from origin after runtime error screen"
            }
            webView.reloadFromOrigin()
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if let url = navigationAction.request.url,
               let scheme = url.scheme?.lowercased(),
               scheme != "http",
               scheme != "https",
               scheme != "about",
               scheme != "file",
               scheme != "data",
               scheme != "blob",
               scheme != "javascript" {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            if let url = navigationAction.request.url,
               ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                if navigationAction.targetFrame == nil {
                    if isLocalHost(url.host) {
                        lastRequestedURL = navigationAction.request.url ?? url
                        webView.load(navigationAction.request)
                    } else {
                        NSWorkspace.shared.open(url)
                    }
                    decisionHandler(.cancel)
                    return
                }

                if navigationAction.targetFrame?.isMainFrame != false,
                   !isLocalHost(url.host) {
                    NSWorkspace.shared.open(url)
                    decisionHandler(.cancel)
                    return
                }
            }
            decisionHandler(.allow)
        }
    }
}
