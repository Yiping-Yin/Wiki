import SwiftUI
import WebKit

struct ContentView: View {
    @EnvironmentObject var server: DevServer

    var body: some View {
        ZStack {
            switch server.status {
            case .ready:
                LoomWebView()
                    .ignoresSafeArea()
                    .transition(.opacity)
            case .starting, .idle:
                StartingView()
            case .failed(let msg):
                VStack(spacing: 12) {
                    Text("Could not connect")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.secondary)
                    Text(msg)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.tertiary)
                    Button("Retry") { server.start() }
                        .buttonStyle(.bordered)
                }
            }
        }
        .animation(.easeInOut(duration: 0.3), value: server.status)
        .background(WindowConfigurator())
    }
}

/// Makes the title bar transparent and blends with content — handles notch/刘海 on MacBook Pro.
struct WindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.styleMask.insert(.fullSizeContentView)
            window.isMovableByWindowBackground = true
            // Match the system background so notch area blends
            window.backgroundColor = NSColor.windowBackgroundColor
        }
        return view
    }
    func updateNSView(_ nsView: NSView, context: Context) {}
}

/// Minimal loading state — 8 warp lines with shimmer, matching HomeLoom.
/// No text, no spinner, no "loading..." — §1/§21.
struct StartingView: View {
    @State private var phase: CGFloat = 0

    var body: some View {
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
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        // drawsBackground stays true — let the web app control its own colors
        webView.allowsMagnification = true

        webView.load(URLRequest(url: URL(string: "http://localhost:3001")!))
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

        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    class Coordinator: NSObject, WKNavigationDelegate {
        weak var webView: WKWebView?

        deinit {
            NotificationCenter.default.removeObserver(self)
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

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if let url = navigationAction.request.url,
               url.host != "localhost" && url.scheme?.hasPrefix("http") == true {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
