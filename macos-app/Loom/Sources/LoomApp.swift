import SwiftUI
import AppKit
import UniformTypeIdentifiers

private let showDebugHUDDefaultsKey = "loom.showDebugHUD.v2"

@main
struct LoomApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

    /// Experimental clean-mode toggle. When the user defaults flag
    /// `loom.minimal.enabled` is true we render the new minimal Loom
    /// (page-only, no webview, no overlay machinery). Lets us iterate
    /// on the new architecture without inheriting any legacy chrome.
    /// Default ON for now — flip in `defaults write com.yinyiping.loom
    /// loom.minimal.enabled 0` to fall back to the legacy ContentView.
    private var minimalModeEnabled: Bool {
        let raw = UserDefaults.standard.object(forKey: "loom.minimal.enabled") as? Bool
        return raw ?? true
    }

    var body: some Scene {
        Window("Loom", id: MainWindow.id) {
            Group {
                if minimalModeEnabled {
                    LoomMinimalRootView()
                        .environmentObject(delegate.server)
                } else {
                    ContentView()
                        .environmentObject(delegate.server)
                        .background(WindowOpener())
                }
            }
            .frame(minWidth: 960, minHeight: 640)
        }
        .defaultSize(width: 1400, height: 900)
        // macOS 15+ is the product floor. Do not let system state
        // restoration reopen Loom into the "all windows closed" state:
        // clicking the app icon should always present the room.
        .restorationBehavior(.disabled)
        .defaultLaunchBehavior(.presented)
        // `.unifiedCompact` collapses the titlebar+toolbar into one
        // thin band. `.unified(showsTitle: true)` produces two visual
        // bands — title on top, empty toolbar strip below — which the
        // user kept flagging as dead space because we don't put
        // anything in the toolbar. Compact gives macOS-native chrome
        // density without looking barren.
        .windowToolbarStyle(.unifiedCompact)

        Settings {
            TabView {
                AppearanceSettingsView()
                    .tabItem { Label("Appearance", systemImage: "paintbrush") }
                AIProviderSettingsView()
                    .environmentObject(delegate.server)
                    .tabItem { Label("AI", systemImage: "sparkles") }
                DataSettingsView()
                    .tabItem { Label("Data", systemImage: "externaldrive") }
                CaptureSettingsView()
                    .tabItem { Label("Capture", systemImage: "tray.and.arrow.down") }
            }
        }

        Window("Keyboard Shortcuts", id: KeyboardHelpWindow.id) {
            KeyboardHelpView()
                .paperChrome()
        }
        .windowResizability(.contentSize)
        .defaultSize(width: 460, height: 540)

        Window("Set up captures", id: CaptureHelpWindow.id) {
            CaptureHelpView()
                .paperChrome()
        }
        .windowResizability(.contentSize)
        .defaultSize(width: 560, height: 540)

        Window("About Loom", id: AboutWindow.id) {
            AboutView()
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .defaultPosition(.center)
        .defaultSize(width: 420, height: 540)

        Window("Shuttle", id: ShuttleWindow.id) {
            ShuttleView()
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .defaultPosition(.center)
        .defaultSize(width: 592, height: 472) // card 560×440 + 16pt shadow padding on each side
        .windowToolbarStyle(.unifiedCompact)

        Window("Ask AI", id: AskAIWindow.id) {
            AskAIView()
                .paperChrome()
        }
        .defaultSize(width: 560, height: 520)
        .windowToolbarStyle(.unifiedCompact)

        Window("Reconstructions", id: ReconstructionsWindow.id) {
            ReconstructionsView()
                .paperChrome()
        }
        .defaultSize(width: 800, height: 520)
        .windowToolbarStyle(.unified)

        Window("Ingestion", id: IngestionWindow.id) {
            IngestionView()
                .paperChrome()
        }
        .defaultSize(width: 560, height: 540)
        .windowToolbarStyle(.unifiedCompact)

        Window("Rehearsal", id: RehearsalWindow.id) {
            RehearsalView()
                .paperChrome()
        }
        .defaultSize(width: 620, height: 560)
        .windowToolbarStyle(.unifiedCompact)

        Window("Examiner", id: ExaminerWindow.id) {
            ExaminerView()
                .paperChrome()
        }
        .defaultSize(width: 620, height: 540)
        .windowToolbarStyle(.unifiedCompact)

        // Evening ritual — literary session-close surface. Opens via
        // App menu "Set Down the Shuttle…" (delegates through
        // `EveningMenuItem`). Hidden title bar, content-sized, centered.
        Window("Evening", id: EveningWindow.id) {
            EveningView()
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .defaultPosition(.center)
        .defaultSize(width: 640, height: 540)

        .commands {
            CommandGroup(after: .textEditing) {
                Button("Learn") { NotificationCenter.default.post(name: .loomLearn, object: nil) }
                    .keyboardShortcut("e", modifiers: .command)
                AskAIMenuItem()
                AskAboutFileMenuItem()
                HoldQuestionMenuItem()
                AddSoanCardMenuItem()
                ConnectSoanCardsMenuItem()
                WeavePanelsMenuItem()
                RehearsalMenuItem()
                ExaminerMenuItem()
                ReconstructionsMenuItem()
                IngestionMenuItem()
                ShuttleMenuItem()
                Button("Review") { NotificationCenter.default.post(name: .loomReview, object: nil) }
                    .keyboardShortcut("/", modifiers: .command)
                Button("Reload") { NotificationCenter.default.post(name: .loomReload, object: nil) }
                    .keyboardShortcut("r", modifiers: .command)
                Button("Open in Browser") { NotificationCenter.default.post(name: .loomOpenInBrowser, object: nil) }
                    .keyboardShortcut("o", modifiers: [.command, .shift])
            }
            CommandGroup(after: .toolbar) {
                Button("Back") { NotificationCenter.default.post(name: .loomGoBack, object: nil) }
                    .keyboardShortcut("[", modifiers: .command)
                Button("Forward") { NotificationCenter.default.post(name: .loomGoForward, object: nil) }
                    .keyboardShortcut("]", modifiers: .command)
            }
            // Workspace ⌘1-⌘5 switcher — mirrors the top-level
            // Workspaces list (Home, Desk, Coworks, Patterns, Weaves).
            // Sources + LLM Wiki now live under Desk as content
            // sections, not peer workspaces.
            // wins over minimalism here; the sidebar design is worth
            // keeping AND upgrading.
            CommandGroup(after: .sidebar) {
                Divider()
                WorkspaceShortcutsCommands()
                Divider()
            }
            // Standard Mac View menu zoom triplet — ⌘+ / ⌘- / ⌘0. Every
            // professional Mac app has these; bumps the webview's page
            // zoom so users with smaller displays / older eyes can scale.
            CommandGroup(after: .sidebar) {
                Button("Zoom In") {
                    NotificationCenter.default.post(name: .loomZoomIn, object: nil)
                }
                .keyboardShortcut("+", modifiers: .command)
                Button("Zoom Out") {
                    NotificationCenter.default.post(name: .loomZoomOut, object: nil)
                }
                .keyboardShortcut("-", modifiers: .command)
                Button("Actual Size") {
                    NotificationCenter.default.post(name: .loomZoomReset, object: nil)
                }
                .keyboardShortcut("0", modifiers: .command)
                Divider()
                Button("Reload Sources") {
                    NotificationCenter.default.post(name: .loomRescanLibrary, object: nil)
                }
                .keyboardShortcut("r", modifiers: [.command, .shift, .option])
            }
            CommandGroup(replacing: .appInfo) {
                AboutMenuItem()
                Divider()
                EveningMenuItem()
            }
            CommandGroup(replacing: .help) {
                KeyboardShortcutsMenuItem()
                CaptureHelpMenuItem()
            }
            #if DEBUG
            CommandGroup(after: .help) {
                Button("Toggle Debug HUD") {
                    let next = !UserDefaults.standard.bool(forKey: showDebugHUDDefaultsKey)
                    UserDefaults.standard.set(next, forKey: showDebugHUDDefaultsKey)
                }
                // ⌘⌥D — ⌘⇧D is reserved for "Add a Sōan Card…" in
                // every build, including DEBUG, so the shortcut doesn't
                // shift meaning between profiles.
                .keyboardShortcut("d", modifiers: [.command, .option])
            }
            #endif
            CommandGroup(replacing: .newItem) {
                NewTopicMenuItem()
            }
            // File menu · Export / Import — flat-file JSON dump of the
            // user's pursuits, traces, Sōan cards + edges, weaves. Round
            // trips between installs and doubles as a backup format.
            CommandGroup(after: .saveItem) {
                Divider()
                Button("Export Loom…") {
                    LoomExport.exportToFile()
                }
                Button("Import Loom…") {
                    LoomExport.importFromFile()
                }
            }
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    let server = DevServer()
    private var fallbackMainWindow: NSWindow?
    private var launchConfigured = false
    private var captureSpaceRestoreBehavior: NSWindow.CollectionBehavior?
    private var captureSpaceRestoreToken: UUID?

    override init() {
        super.init()
        NSLog("[Loom] AppDelegate init")
        DispatchQueue.main.async { [weak self] in
            Task { @MainActor in
                self?.configureLaunchIfNeeded()
                self?.ensureMainWindowVisible()
                self?.scheduleMainWindowRepair()
            }
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        Task { @MainActor in
            NSLog("[Loom] applicationDidFinishLaunching")
            configureLaunchIfNeeded()
            ensureMainWindowVisible()
            scheduleMainWindowRepair()
        }
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        Task { @MainActor in
            NSLog("[Loom] applicationDidBecomeActive visibleWindows=%d", existingMainWindow(includeHidden: false) == nil ? 0 : 1)
            configureLaunchIfNeeded()
            if existingMainWindow(includeHidden: false) == nil {
                ensureMainWindowVisible()
            }
        }
    }

    @MainActor
    private func configureLaunchIfNeeded() {
        guard !launchConfigured else { return }
        launchConfigured = true
        NSWindow.allowsAutomaticWindowTabbing = false
        NSApp.setActivationPolicy(.regular)
        UserDefaults.standard.set(false, forKey: showDebugHUDDefaultsKey)
        // Phase A3 — register the `loom://` URL handler. Bookmarklet
        // navigates the browser to `loom://capture?payload=…` which
        // bounces back to the app via this AppleEvent. We re-post as
        // a Notification so the active root view can mount the
        // CaptureSheet without the AppDelegate knowing SwiftUI state.
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleGetURLEvent(_:withReplyEvent:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
        // Restore the security-scoped bookmark for the user's content
        // folder (if any) before ContentView's URL scheme handler
        // initializes — otherwise under sandbox it can't read user files.
        SecurityScopedFolderStore.restoreAtLaunch(
            fallbackPath: LoomRuntimePaths.resolveContentRoot()
        )
        // Only spawn the Next.js dev server when the user explicitly
        // opted into dev mode. Default launches use the static bundle
        // (`loom://bundle/*`) — no server needed, no stale `.next/`
        // cache to leak divergent renders into the webview.
        if ProcessInfo.processInfo.environment["LOOM_USE_DEV_SERVER"] == "1" {
            server.start()
        } else {
            // ContentView.detailColumn switches on `server.status`: only
            // `.ready` actually mounts the WKWebView. Without a dev
            // server we'd sit on the loading shimmer forever, because
            // nothing would flip the state. Mark it ready synchronously
            // — the static scheme handler is always-on, there's no
            // boot latency to wait for.
            server.markReadyForStaticBundle()
        }
    }

    @MainActor
    private func scheduleMainWindowRepair() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            Task { @MainActor in
                self?.ensureMainWindowVisible()
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            Task { @MainActor in
                self?.ensureMainWindowVisible()
            }
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            Task { @MainActor in
                sender.activate(ignoringOtherApps: true)
                ensureMainWindowVisible()
                NotificationCenter.default.post(name: .loomOpenMainWindow, object: nil)
            }
        }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        server.stop()
    }

    /// AppleEvent handler for the `loom://` URL scheme. Routes the
    /// `loom://capture?payload=<json>` shape (Phase A3) to the
    /// `.loomCaptureFromURL` notification; other paths fall through
    /// (the existing in-webview scheme handler covers `loom://content`,
    /// `loom://anchor`, etc.).
    @objc func handleGetURLEvent(_ event: NSAppleEventDescriptor, withReplyEvent reply: NSAppleEventDescriptor) {
        guard
            let urlString = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue,
            let url = URL(string: urlString),
            url.scheme == "loom"
        else { return }
        // External capture entry point. Internal `loom://content/…` /
        // `loom://anchor?…` URLs are handled by `LoomURLSchemeHandler`
        // inside the webview; only `loom://capture` arrives here from
        // outside the app.
        if url.host == "capture" {
            Task { @MainActor in
                handleCaptureURL(url)
            }
        }
    }

    @MainActor
    private func handleCaptureURL(_ url: URL) {
        // URL-scheme handler activation is user-initiated (they
        // clicked L in the browser), so cross-space + cross-app
        // activation is legitimate. Use the deprecated
        // `activate(ignoringOtherApps:)` form anyway — it's still
        // the only API that reliably switches macOS Spaces when
        // Loom is fullscreen on a different Space than the
        // browser. Without it, the CaptureSheet pops up on Loom's
        // Space invisibly while the user stays on the browser.
        NSApp.activate(ignoringOtherApps: true)
        ensureMainWindowVisible()

        // Bring main window forward + force it onto the active
        // Space. `collectionBehavior += .canJoinAllSpaces`
        // temporarily lets the window appear on the user's
        // current Space; we revert after the activate so the
        // window doesn't permanently ride along.
        if let window = NSApp.windows.first(where: { $0.canBecomeKey && !$0.isMiniaturized }) {
            if captureSpaceRestoreBehavior == nil {
                var originalBehavior = window.collectionBehavior
                originalBehavior.remove(.canJoinAllSpaces)
                captureSpaceRestoreBehavior = originalBehavior
            }
            let token = UUID()
            captureSpaceRestoreToken = token
            window.collectionBehavior.insert(.canJoinAllSpaces)
            window.makeKeyAndOrderFront(nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self, weak window] in
                Task { @MainActor in
                    guard let self, self.captureSpaceRestoreToken == token else { return }
                    if let originalBehavior = self.captureSpaceRestoreBehavior {
                        window?.collectionBehavior = originalBehavior
                    }
                    self.captureSpaceRestoreBehavior = nil
                    self.captureSpaceRestoreToken = nil
                }
            }
        }
        NotificationCenter.default.post(
            name: .loomCaptureFromURL,
            object: nil,
            userInfo: ["url": url]
        )
    }

    /// SwiftUI's `Window(...).defaultLaunchBehavior(.presented)` is the
    /// desired primary path, but in local installed builds macOS can
    /// still start the process with zero scene windows after prior
    /// close/restore state. Keep a narrow AppKit fallback so clicking
    /// Loom, reopening from Dock, or receiving `loom://capture` never
    /// leaves the user with a running app and no room.
    @MainActor
    private func ensureMainWindowVisible() {
        NSLog("[Loom] ensureMainWindowVisible windows=%d", NSApp.windows.count)
        if let window = existingMainWindow(includeHidden: false) {
            NSLog("[Loom] ensureMainWindowVisible using existing window=%d", window.windowNumber)
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        if let fallbackMainWindow {
            NSLog("[Loom] ensureMainWindowVisible reusing fallback window=%d", fallbackMainWindow.windowNumber)
            fallbackMainWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let rootView: AnyView
        let minimalModeEnabled = (UserDefaults.standard.object(forKey: "loom.minimal.enabled") as? Bool) ?? true
        if minimalModeEnabled {
            rootView = AnyView(LoomMinimalRootView().environmentObject(server))
        } else {
            rootView = AnyView(
                ContentView()
                    .environmentObject(server)
                    .background(WindowOpener())
            )
        }

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1400, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.identifier = NSUserInterfaceItemIdentifier(MainWindow.id)
        window.title = "Loom"
        window.center()
        window.titlebarAppearsTransparent = true
        window.toolbarStyle = .unifiedCompact
        window.isRestorable = false
        window.contentView = NSHostingView(rootView: rootView)
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        fallbackMainWindow = window
        NSLog("[Loom] ensureMainWindowVisible created fallback window=%d", window.windowNumber)
    }

    @MainActor
    private func existingMainWindow(includeHidden: Bool) -> NSWindow? {
        NSApp.windows.first { window in
            let isMainWindow = window.identifier?.rawValue == MainWindow.id || window.title == "Loom"
            guard isMainWindow, window.canBecomeKey, !window.isMiniaturized else { return false }
            return includeHidden || window.isVisible
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        // A Mac document-like app should not become a terminated app
        // just because the main room was closed or restored as closed.
        // Reopen events below bring the main room back explicitly.
        false
    }
}

/// Replaces File > New without losing SwiftUI's `openWindow` bridge.
/// If the app is reopened from Dock/Finder with no visible window, the
/// AppDelegate posts `.loomOpenMainWindow` and this command-scoped view
/// owns the actual scene open.
struct NewTopicMenuItem: View {
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Button("New Topic") {
            openMainWindow()
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .loomNewTopic, object: nil)
            }
        }
        .keyboardShortcut("n", modifiers: .command)
        .onReceive(NotificationCenter.default.publisher(for: .loomOpenMainWindow)) { _ in
            openMainWindow()
        }
    }

    private func openMainWindow() {
        openWindow(id: MainWindow.id)
        NSApp.activate(ignoringOtherApps: true)
    }
}

/// App-menu item that opens the native About window, replacing the
/// default auto-generated panel.
struct AboutMenuItem: View {
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        Button("About Loom") {
            openWindow(id: AboutWindow.id)
        }
    }
}

/// ⌘⇧E opens the native Ask AI window — Phase 4 ChatFocus first slice.
/// Streams from the user's configured provider, no webview hop.
///
/// Posts `.loomOpenAskAI` instead of calling `openWindow` directly so
/// ContentView's Coordinator can first capture any webview selection and
/// stash it into `AskAIContext.shared.pendingPrompt` before the window
/// opens. Coordinator forwards to `.loomOpenAskAIWindow`, which the
/// `WindowOpener` helper inside the main scene turns into an actual
/// `openWindow(id:)` call.
struct AskAIMenuItem: View {
    var body: some View {
        Button("Ask AI") {
            NotificationCenter.default.post(name: .loomOpenAskAI, object: nil)
        }
        .keyboardShortcut("e", modifiers: [.command, .shift])
    }
}

/// ⌘⇧O · "Ask about a File…" — NSOpenPanel → read text → seed
/// AskAIContext as passage → open AskAI window. For situations where the
/// file isn't already open in the webview (e.g. drafts outside the
/// content root). Reuses the existing passage infra end-to-end.
struct AskAboutFileMenuItem: View {
    var body: some View {
        Button("Ask About a File…") {
            pickFile()
        }
        // No shortcut — ⌘⇧O is taken by Open-in-Browser; this stays
        // menu-only so ⌘⇧E (selection → Ask AI) remains the flagship
        // shortcut. Users who need a file asked-about discover via menu.
    }

    private func pickFile() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Ask About"
        panel.title = "Pick a file to ask AI about"
        // Markdown has no first-party UTType case; whitelist by extension.
        var types: [UTType] = [.plainText, .text, .utf8PlainText, .html]
        if let md = UTType(filenameExtension: "md") { types.append(md) }
        if let mdx = UTType(filenameExtension: "mdx") { types.append(mdx) }
        panel.allowedContentTypes = types
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let maxBytes = 200_000
        guard let data = try? Data(contentsOf: url) else { return }
        guard data.count <= maxBytes, let text = String(data: data, encoding: .utf8) else {
            NSSound.beep()
            return
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        Task { @MainActor in
            AskAIContext.shared.pendingSelection = trimmed
            AskAIContext.shared.pendingSourceTitle = url.lastPathComponent
            AskAIContext.shared.pendingSourceURL = url.absoluteString
            NotificationCenter.default.post(name: .loomOpenAskAIWindow, object: nil)
        }
    }
}

/// App-menu "Set Down the Shuttle…" — opens the literary Evening ritual
/// surface. Phrased like the surface's own CTA ("Set down the shuttle")
/// so the menu item reads as what it is rather than an abstract noun.
/// No keyboard shortcut (ritual surfaces shouldn't collide with ⌘-layer
/// muscle memory); discoverable via menu only.
struct EveningMenuItem: View {
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        Button("Set Down the Shuttle…") {
            openWindow(id: EveningWindow.id)
        }
    }
}

enum EveningWindow {
    static let id = "com.loom.window.evening"
}

/// ⌘⇧P — "Hold a Question…". Mints a top-level `LoomPursuit` via a
/// sheet dialog. Pursuits are the mind-room's primary object; the
/// shortcut lives on the Edit-menu group so it sits alongside the other
/// Loom-native capture shortcuts (⌘E, ⌘⇧E, ⌘⇧R). Posts
/// `.loomShowHoldQuestionDialog`; ContentView owns the `.sheet` binding.
struct HoldQuestionMenuItem: View {
    var body: some View {
        Button("Hold a Question…") {
            NotificationCenter.default.post(name: .loomShowHoldQuestionDialog, object: nil)
        }
        .keyboardShortcut("p", modifiers: [.command, .shift])
    }
}

/// ⌘⇧D — "Add a Sōan Card…". Mints a `LoomSoanCard` at a random-ish
/// position on the thinking-draft table via a sheet dialog. Sibling of
/// `HoldQuestionMenuItem` on the Edit menu; kind + body + optional
/// source are chosen in the sheet. Posts `.loomShowAddSoanCardDialog`;
/// ContentView owns the `.sheet` binding.
struct AddSoanCardMenuItem: View {
    var body: some View {
        Button("Add a Sōan Card…") {
            NotificationCenter.default.post(name: .loomShowAddSoanCardDialog, object: nil)
        }
        .keyboardShortcut("d", modifiers: [.command, .shift])
    }
}

/// ⌘⇧L — "Connect Sōan Cards…". Mints a `LoomSoanEdge` between two
/// existing cards via a sheet dialog. Sibling of `AddSoanCardMenuItem`
/// on the Edit menu; the sheet lists every card and lets the learner
/// pick `from` / `to` / relation kind. Posts
/// `.loomShowConnectSoanCardsDialog`; ContentView owns the `.sheet`
/// binding.
struct ConnectSoanCardsMenuItem: View {
    var body: some View {
        Button("Connect Sōan Cards…") {
            NotificationCenter.default.post(name: .loomShowConnectSoanCardsDialog, object: nil)
        }
        .keyboardShortcut("l", modifiers: [.command, .shift])
    }
}

/// ⌘⇧W — "Weave Two Panels…". Mints a `LoomWeave` — an explicit,
/// directed relation (supports / contradicts / elaborates / echoes)
/// between two crystallized panels. Sibling of `ConnectSoanCardsMenuItem`
/// on the Edit menu; the sheet lists qualifying reading traces and lets
/// the learner pick `from` / `to` / kind / rationale. Posts
/// `.loomShowWeavePanelsDialog`; ContentView owns the `.sheet` binding.
struct WeavePanelsMenuItem: View {
    var body: some View {
        Button("Weave Two Panels…") {
            NotificationCenter.default.post(name: .loomShowWeavePanelsDialog, object: nil)
        }
        .keyboardShortcut("w", modifiers: [.command, .shift])
    }
}

/// ⌘⇧X — opens Inspector to Examiner tab. Single-window consolidation.
struct ExaminerMenuItem: View {
    var body: some View {
        Button("Examiner") {
            NotificationCenter.default.post(
                name: .loomShowInspectorTab,
                object: nil,
                userInfo: ["tab": "examiner"]
            )
        }
        .keyboardShortcut("x", modifiers: [.command, .shift])
    }
}

/// ⌘⇧R — opens the Inspector panel to the Rehearsal tab instead of a
/// separate window. Single-window consolidation. Coordinator still
/// seeds `RehearsalContext.pendingTopic` from webview title before
/// surfacing the panel.
struct RehearsalMenuItem: View {
    var body: some View {
        Button("Rehearsal") {
            NotificationCenter.default.post(name: .loomOpenRehearsal, object: nil)
        }
        .keyboardShortcut("r", modifiers: [.command, .shift])
    }
}

/// ⌘⇧I — opens Inspector to Ingestion tab.
struct IngestionMenuItem: View {
    var body: some View {
        Button("Ingestion") {
            NotificationCenter.default.post(
                name: .loomShowInspectorTab,
                object: nil,
                userInfo: ["tab": "ingestion"]
            )
        }
        .keyboardShortcut("i", modifiers: [.command, .shift])
    }
}

/// Menu-only — opens Inspector to Reconstructions tab.
struct ReconstructionsMenuItem: View {
    var body: some View {
        Button("Reconstructions") {
            NotificationCenter.default.post(
                name: .loomShowInspectorTab,
                object: nil,
                userInfo: ["tab": "reconstructions"]
            )
        }
    }
}

/// ⌘K opens the native Shuttle palette. Replaces the web-side Shuttle
/// which used to be triggered via the `loomSearch` notification — the
/// palette is the primary quick-navigation surface so going native here
/// is a meaningful Phase 4 piece.
struct ShuttleMenuItem: View {
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        Button("Shuttle") {
            openWindow(id: ShuttleWindow.id)
        }
        .keyboardShortcut("k", modifiers: .command)
    }
}

enum MainWindow {
    static let id = "com.loom.window.main"
}

/// Invisible helper that lives inside the main Window scene so it can use
/// `@Environment(\.openWindow)`. Listens to `loomOpen*` notifications
/// (posted from NavigationBridgeHandler) and opens the corresponding
/// SwiftUI Window scene. This is how web components like HomeClient.tsx
/// ask the shell to show native surfaces without touching AppKit directly.
/// Applies the Vellum-paper chrome stack to a secondary window —
/// `.containerBackground` paints the window bg; `.toolbarBackground`
/// tints the toolbar material; `.visible` forces it to render (default
/// `.automatic` leaves it glass-transparent). Pulled into a single
/// modifier so the 6 Window scenes don't have to repeat the stack.
extension View {
    @ViewBuilder
    func loomWindowBackground(_ color: Color) -> some View {
        if #available(macOS 15.0, *) {
            self.containerBackground(color, for: .window)
        } else {
            self.background(color)
        }
    }

    func paperChrome() -> some View {
        self
            .loomWindowBackground(LoomTokens.paper)
            .toolbarBackground(LoomTokens.paper, for: .windowToolbar)
            .toolbarBackground(.visible, for: .windowToolbar)
    }
}

struct WindowOpener: View {
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .onReceive(NotificationCenter.default.publisher(for: .loomOpenShuttle)) { _ in
                openWindow(id: ShuttleWindow.id)
            }
            .onReceive(NotificationCenter.default.publisher(for: .loomOpenAbout)) { _ in
                openWindow(id: AboutWindow.id)
            }
            .onReceive(NotificationCenter.default.publisher(for: .loomOpenKeyboardHelp)) { _ in
                openWindow(id: KeyboardHelpWindow.id)
            }
            .onReceive(NotificationCenter.default.publisher(for: .loomOpenAskAIWindow)) { _ in
                openWindow(id: AskAIWindow.id)
            }
            .onReceive(NotificationCenter.default.publisher(for: .loomIngestFileDropped)) { _ in
                openWindow(id: IngestionWindow.id)
            }
            .onReceive(NotificationCenter.default.publisher(for: .loomOpenRehearsalWindow)) { _ in
                openWindow(id: RehearsalWindow.id)
            }
            .onReceive(NotificationCenter.default.publisher(for: .loomOpenEveningWindow)) { _ in
                openWindow(id: EveningWindow.id)
            }
            // Shuttle action rows route Export / Import through the
            // notification bus so the palette dismisses cleanly before
            // the save/open panel shows.
            .onReceive(NotificationCenter.default.publisher(for: .loomExport)) { _ in
                LoomExport.exportToFile()
            }
            .onReceive(NotificationCenter.default.publisher(for: .loomImport)) { _ in
                LoomExport.importFromFile()
            }
    }
}

/// Help-menu item that opens the Capture setup window (CaptureHelpView).
/// Per docs/loom.md §VII.bis the instructional content for setting up
/// captures lives in this help window, not a sidebar surface.
struct CaptureHelpMenuItem: View {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismissWindow) private var dismissWindow
    var body: some View {
        Button("Set Up Captures…") {
            let existing = NSApp.windows.first {
                $0.identifier?.rawValue == CaptureHelpWindow.id && $0.isVisible
            }
            if existing != nil {
                dismissWindow(id: CaptureHelpWindow.id)
            } else {
                openWindow(id: CaptureHelpWindow.id)
            }
        }
    }
}

/// Help-menu item that opens the native Keyboard Shortcuts window. Wrapped
/// in its own view so it can use `@Environment(\.openWindow)` — only
/// available inside a `Scene.commands` body via a SwiftUI view.
struct KeyboardShortcutsMenuItem: View {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismissWindow) private var dismissWindow
    var body: some View {
        Button("Keyboard Shortcuts") {
            // KeyboardHelpView's own label reads "⌘⇧? toggle · Esc
            // close", so the shortcut has to actually toggle. Before
            // this (2026-04-23) it only opened — pressing ⌘⇧? a
            // second time no-op'd because SwiftUI dedups openWindow
            // on an already-present identifier. Now we check NSApp
            // for the window and dismiss if it's already visible.
            let existing = NSApp.windows.first {
                $0.identifier?.rawValue == KeyboardHelpWindow.id && $0.isVisible
            }
            if existing != nil {
                dismissWindow(id: KeyboardHelpWindow.id)
            } else {
                openWindow(id: KeyboardHelpWindow.id)
            }
        }
        .keyboardShortcut("?", modifiers: [.command, .shift])
    }
}

extension Notification.Name {
    /// Phase A3 — `loom://capture?payload=<json>` arrived via the URL
    /// scheme handler. UserInfo carries `["url": URL]`. Subscribed by
    /// `LoomMinimalRootView` to mount the CaptureSheet.
    static let loomCaptureFromURL = Notification.Name("loomCaptureFromURL")
    /// Posted by the toolbar's "Paste" button on a source-file surface.
    /// `SourceFileView` listens and runs `startCaptureFromClipboard()`
    /// (it owns the PDF selection state needed for the passage anchor).
    /// Replaces the previous hidden ⌘⇧V hotkey per user feedback that
    /// captures should use direct, visible affordances.
    static let loomTriggerCaptureFromClipboard = Notification.Name("loomTriggerCaptureFromClipboard")
    /// Posted after `CaptureWriter.save` completes. CaptureWebView bridges it
    /// into the captures landing as `window` event `loom:capture-saved` so
    /// the list can refetch without forcing a full WKWebView reload.
    static let loomCaptureSaved = Notification.Name("loomCaptureSaved")
    static let loomReview = Notification.Name("loomReview")
    static let loomReload = Notification.Name("loomReload")
    static let loomOpenInBrowser = Notification.Name("loomOpenInBrowser")
    static let loomGoBack = Notification.Name("loomGoBack")
    static let loomGoForward = Notification.Name("loomGoForward")
    static let loomOpenMainWindow = Notification.Name("loomOpenMainWindow")
    static let loomNewTopic = Notification.Name("loomNewTopic")
    static let loomLearn = Notification.Name("loomLearn")
    static let loomZoomIn = Notification.Name("loomZoomIn")
    static let loomZoomOut = Notification.Name("loomZoomOut")
    static let loomZoomReset = Notification.Name("loomZoomReset")
    /// Legacy tab-switch notification kept for menu-item compatibility.
    /// ContentView maps the `"tab"` userInfo string to the matching
    /// `MainSurface` and swaps the detail column content in place.
    static let loomShowInspectorTab = Notification.Name("loomShowInspectorTab")
    /// Posted by the Edit-menu "Ask AI" item / ⌘⇧E shortcut. Coordinator
    /// intercepts, captures any webview selection into AskAIContext, then
    /// reposts as `.loomOpenAskAIWindow` for the main window's WindowOpener.
    static let loomOpenAskAI = Notification.Name("loomOpenAskAI")
    /// Posted by Coordinator once selection capture completes. The main
    /// window's `WindowOpener` owns `@Environment(\.openWindow)` and
    /// handles the actual scene open.
    static let loomOpenAskAIWindow = Notification.Name("loomOpenAskAIWindow")
    /// Posted by the Edit-menu "Rehearsal" item / ⌘⇧R shortcut so
    /// Coordinator can seed RehearsalContext with the webview's
    /// currently-open doc title before the window opens.
    static let loomOpenRehearsal = Notification.Name("loomOpenRehearsal")
    /// Posted by Coordinator after doc capture; WindowOpener opens the
    /// actual Rehearsal window scene.
    static let loomOpenRehearsalWindow = Notification.Name("loomOpenRehearsalWindow")
    /// Posted by the "Hold a Question…" menu item (⌘⇧P) and the
    /// matching Shuttle command. ContentView observes and flips a
    /// local @State binding to present the HoldQuestionSheet.
    static let loomShowHoldQuestionDialog = Notification.Name("loomShowHoldQuestionDialog")
    /// Posted by the "Add a Sōan Card…" menu item (⌘⇧D) and the
    /// matching Shuttle command. ContentView observes and flips a
    /// local @State binding to present the AddSoanCardSheet.
    static let loomShowAddSoanCardDialog = Notification.Name("loomShowAddSoanCardDialog")
    /// Posted by the "Connect Sōan Cards…" menu item (⌘⇧L) and the
    /// matching Shuttle command. ContentView observes and flips a
    /// local @State binding to present the ConnectSoanCardsSheet.
    static let loomShowConnectSoanCardsDialog = Notification.Name("loomShowConnectSoanCardsDialog")
    /// Posted by the "Weave Two Panels…" menu item (⌘⇧W) and the
    /// matching Shuttle command. ContentView observes and flips a
    /// local @State binding to present the WeavePanelsSheet.
    static let loomShowWeavePanelsDialog = Notification.Name("loomShowWeavePanelsDialog")
    /// Posted by the Shuttle's "Export Loom" / "Import Loom" action
    /// rows. WindowOpener handles these by invoking LoomExport directly
    /// — no web surface to hop through.
    static let loomExport = Notification.Name("loomExport")
    static let loomImport = Notification.Name("loomImport")
}

/// Keyboard shortcuts for the sidebar's Workspaces section. Each button
/// binds to the corresponding href via `.loomShuttleNavigate` so the
/// webview loads the target in-place. Mirrors `KnowledgeSidebarView`'s
/// `workspaces` array — keep them in sync.
struct WorkspaceShortcutsCommands: View {
    var body: some View {
        Group {
            Button("Home") {
                postNav("/")
            }
            .keyboardShortcut("1", modifiers: .command)
            Button("Desk") {
                postNav("/desk")
            }
            .keyboardShortcut("2", modifiers: .command)
            Button("Coworks") {
                postNav("/coworks")
            }
            .keyboardShortcut("3", modifiers: .command)
            Button("Patterns") {
                postNav("/patterns")
            }
            .keyboardShortcut("4", modifiers: .command)
            Button("Weaves") {
                postNav("/weaves")
            }
            .keyboardShortcut("5", modifiers: .command)
        }
    }

    private func postNav(_ path: String) {
        NotificationCenter.default.post(
            name: .loomShuttleNavigate,
            object: nil,
            userInfo: ["path": path]
        )
    }
}
