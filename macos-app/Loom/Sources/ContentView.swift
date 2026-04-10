import SwiftUI
import WebKit

final class WebDebugState: ObservableObject {
    @Published var currentURL: String = ""
    @Published var pageTitle: String = ""
    @Published var isLoading: Bool = false
    @Published var lastError: String = ""
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

            VStack {
                HStack {
                    Spacer()
                    DevHUD(status: server.status, url: server.serverURL, webState: webState)
                }
                Spacer()
            }
            .padding(.top, 14)
            .padding(.trailing, 16)
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

            if !webState.currentURL.isEmpty || !webState.pageTitle.isEmpty || webState.isLoading || !webState.lastError.isEmpty {
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
            // Match the system background so notch area blends
            window.backgroundColor = NSColor.windowBackgroundColor
            window.title = title
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
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
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

        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        context.coordinator.fallbackURL = url
        loadIfNeeded(nsView, coordinator: context.coordinator)
        context.coordinator.syncState(from: nsView)
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        weak var webView: WKWebView?
        var lastRequestedURL: URL?
        var fallbackURL: URL?
        let debugState: WebDebugState

        init(debugState: WebDebugState) {
            self.debugState = debugState
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        func syncState(from webView: WKWebView) {
            DispatchQueue.main.async {
                self.debugState.currentURL = webView.url?.absoluteString ?? ""
                self.debugState.pageTitle = webView.title ?? ""
                self.debugState.isLoading = webView.isLoading
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            lastRequestedURL = webView.url
            syncState(from: webView)
            DispatchQueue.main.async {
                self.debugState.lastError = ""
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            syncState(from: webView)
        }

        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            syncState(from: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            DispatchQueue.main.async {
                self.debugState.lastError = error.localizedDescription
                self.syncState(from: webView)
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            DispatchQueue.main.async {
                self.debugState.lastError = error.localizedDescription
                self.syncState(from: webView)
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
            webView?.reload()
        }

        @objc func openInBrowser() {
            guard let url = webView?.url ?? fallbackURL else { return }
            NSWorkspace.shared.open(url)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if let url = navigationAction.request.url,
               url.scheme?.hasPrefix("http") == true,
               let host = url.host,
               host != "localhost",
               host != "127.0.0.1",
               host != "::1" {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
