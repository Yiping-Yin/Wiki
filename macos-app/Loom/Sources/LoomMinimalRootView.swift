import SwiftUI
import AppKit

/// Experimental "minimal Loom" root view. A clean rebuild of the main
/// window without the previous multi-surface webview navigation.
///
/// The premise: Loom = source index + writing work surface. The sidebar
/// keeps routing minimal; the main pane opens the source index by default
/// and native source views for imported files.
///
/// Activated via UserDefaults `loom.minimal.enabled`. Defaults to ON for
/// dogfooding; flip OFF to return to the legacy ContentView. Once
/// minimal mode is solid we'll drop the legacy view + this flag.
struct LoomMinimalRootView: View {
    enum DetailSurface: Equatable {
        case library
        case folderHome(URL)   // loom://content/<root-id>(/sub-path)
        case sourceFile(URL)   // loom://content/<root-id>/<file>
        case captures          // Phase A3 follow-up: browse all captures
        case webCaptureSetup   // Phase A3 follow-up: bookmarklet display + copy
    }

    @State private var roots: [ContentRoot] = []
    @State private var selection: DetailSurface = .library
    @AppStorage("theme") private var theme: String = "auto"
    @State private var themeClock: Date = Date()
    @State private var isCreatingPage: Bool = false
    @State private var pageDraft: String = ""
    @FocusState private var pageFieldFocused: Bool
    @State private var renamingRootID: UUID? = nil
    @State private var renameDraft: String = ""
    @FocusState private var renameFieldFocused: Bool
    /// Browser-style navigation history. Every navigation pushes the
    /// previous selection here so `goBack()` can pop it.
    @State private var history: [DetailSurface] = []
    /// Forward stack — populated when goBack pops history. Cleared on
    /// any fresh navigation (standard browser semantics).
    @State private var forwardStack: [DetailSurface] = []

    /// Phase A1 quick-capture: when non-nil, the CaptureSheet renders.
    /// Set by ⌘⇧L. nil = closed. Wraps a `CapturePayload`.
    @State private var capturePayload: CapturePayload? = nil
    /// Toast surface for capture-saved feedback.
    @State private var captureToast: String? = nil
    /// Last successfully-saved capture URL — used by the toast's
    /// "Reveal" affordance so the user can verify what landed where
    /// without leaving Loom flow.
    @State private var lastCaptureURL: URL? = nil
    /// Bumped after a capture save or manual refresh. CapturesView uses
    /// this as a URL token so an already-mounted capture detail webview
    /// is forced back to the landing list and refetches native data.
    @State private var capturesRefreshToken: Int = 0

    /// Sidebar Vellum chrome — collapse the FOLDERS section when the
    /// list grows past 5 entries so the chrome doesn't push TOOLS off
    /// the visible region. Defaults to collapsed once the threshold is
    /// crossed; toggling is local to this view (not persisted — the
    /// sidebar is throw-away chrome state, not data).
    @State private var foldersExpanded: Bool = false
    /// Hover state for sidebar rows — keyed by a stable string id so
    /// each row's bronze-hint background can light up on cursor enter.
    /// Pages / Captures / Web Capture / + Page / + Folder use literal
    /// keys; folder rows use their UUID string.
    @State private var hoveredSidebarRow: String? = nil
    /// Folders-section caret-collapse state — per docs/loom.md §IV.B
    /// (interaction-grammar addendum 2026-05-12): group header MAY be
    /// collapsible. Defaults open. Distinct from `foldersExpanded`
    /// which is the threshold-overflow control (show-first-5 vs all).
    @State private var foldersSectionExpanded: Bool = true
    /// Sidebar keyboard focus — per §IV.A, ↑/↓ arrow navigation is
    /// enabled when the sidebar holds focus.
    @FocusState private var sidebarFocused: Bool
    /// Detail pane opacity — per §IV.C: on selection change the new
    /// content fades 0.6 → 1.0 over ≤150ms (settle-fade, not
    /// mechanism-calling). Set by `fadeInDetail()` on every navigate/
    /// goBack/goForward path.
    @State private var detailOpacity: Double = 1.0

    private var resolvedColorScheme: ColorScheme {
        SidebarThemeResolution.resolvedColorScheme(theme: theme, now: themeClock)
    }

    private var usesNightPalette: Bool {
        SidebarThemeResolution.usesNightPalette(colorScheme: resolvedColorScheme)
    }

    private var webThemeMode: String {
        usesNightPalette ? "dark" : "light"
    }

    var body: some View {
        NavigationSplitView {
            sidebar
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 360)
                .toolbarBackground(.hidden, for: .windowToolbar)
                .background(LoomTokens.dsPaper)
                .ignoresSafeArea(.container, edges: .top)
        } detail: {
            detail
                .opacity(detailOpacity)
                .background(LoomTokens.dsPaper)
                // Detail pane respects the safe-area / toolbar inset so
                // SwiftUI subviews (CapturesView, Pages, etc.) lay out
                // naturally below the toolbar pills without manual
                // padding hacks. Sidebar handles its own seam fix.
                .background(
                    SwipeNavigation(
                        onBack: { goBack() },
                        onForward: { goForward() }
                    )
                )
                .toolbar {
                    ToolbarItem(placement: .navigation) {
                        Button {
                            goBack()
                        } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: DSType.caption.size, weight: .medium))
                                .foregroundStyle(history.isEmpty ? LoomTokens.dsInk3 : LoomTokens.dsInk1)
                        }
                        .disabled(history.isEmpty)
                        .help("Back · ⌘[")
                    }
                    ToolbarItem(placement: .navigation) {
                        Button {
                            goForward()
                        } label: {
                            Image(systemName: "chevron.right")
                                .font(.system(size: DSType.caption.size, weight: .medium))
                                .foregroundStyle(forwardStack.isEmpty ? LoomTokens.dsInk3 : LoomTokens.dsInk1)
                        }
                        .disabled(forwardStack.isEmpty)
                        .help("Forward · ⌘]")
                    }
                    ToolbarItem(placement: .navigation) {
                        Button {
                            refreshActive()
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: DSType.caption.size, weight: .medium))
                                .foregroundStyle(LoomTokens.dsInk1)
                        }
                        .help("Refresh · ⌘R")
                    }
                    // Centered serif wordmark — replaces the sans-
                    // uppercase "LOOM" eyebrow that used to live in
                    // the sidebar header. Putting it in `.principal`
                    // unifies the toolbar visually with the detail
                    // pane so the sidebar/detail seam reads as one
                    // window, not two stacked cards.
                    ToolbarItem(placement: .principal) {
                        detailTitleLabel
                    }
                    // Capture button — always visible. Replaces the
                    // hidden ⌘⇧L hotkey per user feedback 2026-04-27;
                    // captures should be accessible without memorized
                    // shortcuts. Opens the same CaptureSheet flow.
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            startQuickCapture()
                        } label: {
                            Label("Capture", systemImage: "tray.and.arrow.down")
                                .font(.system(size: DSType.caption.size, weight: .medium))
                                .foregroundStyle(LoomTokens.dsInk1)
                        }
                        .help("Capture a quick note · routes to the active surface or Inbox")
                    }
                    // Note + Ask AI — paired action group in the
                    // titlebar, only when viewing a source file.
                    // Single ToolbarItem with an HStack keeps them
                    // visually grouped (no separator between them)
                    // and helps the type-checker.
                    ToolbarItem(placement: .primaryAction) {
                        sourceFileToolbarActions
                    }
                }
        }
        // Window-wide paper backdrop. Fills any gap that the sidebar
        // / detail panes don't cover (notably the fullscreen safe-area
        // seam between the menu-bar reveal area and the sidebar pane,
        // which the user kept flagging as "two stacked cards" on
        // Tahoe).
        .background(LoomTokens.dsPaper.ignoresSafeArea())
        .environment(\.colorScheme, resolvedColorScheme)
        .preferredColorScheme(resolvedColorScheme)
        // NSWindow-level chrome: transparent titlebar + fullSizeContentView
        // so the window content extends UNDER the titlebar / safe area
        // and there's no system-rendered seam between the toolbar pills
        // and the sidebar pane. Same configuration ContentView uses
        // for the webview path; minimal mode wasn't getting it before
        // so the sidebar always read as a separate inset card.
        .background(WindowConfigurator(title: "Loom", isNight: usesNightPalette))
        .background(
            // Hidden ⌘[ / ⌘] / ⌘R shortcuts for back / forward / refresh.
            // Quick Capture intentionally has NO hotkey — direct
            // toolbar button is the only path (user feedback 2026-04-27:
            // 不要有快捷键，应该用更直接的方式).
            ZStack {
                Button("Back") { goBack() }
                    .keyboardShortcut("[", modifiers: .command)
                Button("Forward") { goForward() }
                    .keyboardShortcut("]", modifiers: .command)
                Button("Refresh") { refreshActive() }
                    .keyboardShortcut("r", modifiers: .command)
            }
            .opacity(0)
            .frame(width: 0, height: 0)
        )
        .sheet(isPresented: Binding<Bool>(
            get: { capturePayload != nil },
            set: { if !$0 { capturePayload = nil } }
        )) {
            CaptureSheet(payload: $capturePayload, onSaved: handleCaptureSaved)
        }
        .overlay(alignment: .bottom) {
            if let msg = captureToast {
                HStack(spacing: DSSpace.sm.value + 2) {
                    Text(msg)
                        .font(.system(size: 12, design: .serif))
                        .foregroundStyle(LoomTokens.dsInk1)
                    if let url = lastCaptureURL {
                        Button {
                            NSWorkspace.shared.activateFileViewerSelecting([url])
                        } label: {
                            Label("Reveal", systemImage: "magnifyingglass")
                                .font(.system(size: DSType.eyebrow.size, design: .serif))
                                .labelStyle(.titleAndIcon)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(LoomTokens.dsThread)
                        Button {
                            NSWorkspace.shared.open(url)
                        } label: {
                            Label("Open", systemImage: "doc.text")
                                .font(.system(size: DSType.eyebrow.size, design: .serif))
                                .labelStyle(.titleAndIcon)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(LoomTokens.dsThread)
                    }
                }
                .padding(.horizontal, DSSpace.md.value - 2)
                .padding(.vertical, DSSpace.sm.value - 1)
                .background(.ultraThinMaterial, in: Capsule())
                .padding(.bottom, DSSpace.lg.value)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        // Auto-refresh on `didBecomeActiveNotification` was reverted —
        // it was firing too often during interaction and causing
        // visible re-render churn. Manual ⌘R / toolbar ↻ only for now.
        .onAppear { reload() }
        .onReceive(NotificationCenter.default.publisher(for: .loomContentRootsChanged)) { _ in
            reload()
        }
        .onReceive(Timer.publish(every: 300, on: .main, in: .common).autoconnect()) { now in
            themeClock = now
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomShowFolderHome)) { note in
            if let url = note.userInfo?["url"] as? URL {
                navigate(.folderHome(url))
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomCaptureFromURL)) { note in
            // Phase A3 — bookmarklet -> `loom://capture?payload=…` ->
            // AppDelegate -> here. Decode, resolve a `web` anchor,
            // open the sheet with the extracted markdown.
            guard let url = note.userInfo?["url"] as? URL,
                  let payload = CaptureWebPayload.from(url: url) else {
                captureToast = "Couldn't decode capture payload."
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { captureToast = nil }
                return
            }
            guard payload.hasSubstantiveCaptureContent else {
                captureToast = "Capture payload was empty. Re-capture from the page."
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { captureToast = nil }
                return
            }
            startWebCapture(payload)
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomShowLibrary)) { _ in
            navigate(.library)
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomOpenSourceFile)) { note in
            if let url = note.userInfo?["url"] as? URL {
                navigate(.sourceFile(url))
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomJumpToPDFAnchor)) { note in
            handleAnchorJump(note)
        }
    }

    /// `loom://anchor?src=<source-loomURL>&page=N&rect=x,y,w,h&text=...`
    /// — fired when the user clicks a "📍 Jump to passage" link inside
    /// a saved note. Navigate to the source PDF, then post the
    /// page+rect to PDFViewHolder once the new view has had a chance
    /// to mount and load.
    private func handleAnchorJump(_ note: Notification) {
        guard let url = note.userInfo?["url"] as? URL,
              let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let items = comps.queryItems else { return }
        guard let pageStr = items.first(where: { $0.name == "page" })?.value,
              let pageIdx = Int(pageStr),
              let rectStr = items.first(where: { $0.name == "rect" })?.value else { return }
        let parts = rectStr.split(separator: ",").compactMap { Double($0) }
        guard parts.count == 4 else { return }
        let rect = CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3])

        // Prefer the modern `src=<full loom URL>` form; fall back to
        // legacy `doc=<filename>` by searching active roots for a
        // matching basename. Notes saved before the schema change
        // still resolve.
        let srcURL: URL? = {
            if let s = items.first(where: { $0.name == "src" })?.value,
               let u = URL(string: s) {
                return u
            }
            guard let docName = items.first(where: { $0.name == "doc" })?.value,
                  let resolved = Self.resolveDocByName(docName) else { return nil }
            return resolved
        }()
        guard let srcURL = srcURL else { return }

        navigate(.sourceFile(srcURL))
        // PDFView needs a moment to mount + load before it can scroll
        // to a destination. 0.4s matches the typical mount + parse
        // window for a multi-MB PDF; smaller files are no worse off.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            NotificationCenter.default.post(
                name: .loomApplyPDFAnchor,
                object: nil,
                userInfo: ["page": pageIdx, "rect": NSValue(rect: rect)]
            )
        }
    }

    /// Walk every active root looking for a file whose last path
    /// component matches `name` (case-insensitive). Returns a
    /// `loom://content/<root-id>/<rel-path>` URL for the first hit so
    /// `SourceFileView.resolve()` can open it.
    private static func resolveDocByName(_ name: String) -> URL? {
        let target = name.lowercased()
        let fm = FileManager.default
        for (rootID, rootURL) in ContentRootStore.allActiveURLs {
            let enumerator = fm.enumerator(
                at: rootURL,
                includingPropertiesForKeys: [.isRegularFileKey],
                options: [.skipsHiddenFiles]
            )
            while let item = enumerator?.nextObject() as? URL {
                if item.lastPathComponent.lowercased() == target {
                    let rootPath = rootURL.standardizedFileURL.path
                    let itemPath = item.standardizedFileURL.path
                    guard itemPath.hasPrefix(rootPath + "/") else { continue }
                    let rel = String(itemPath.dropFirst(rootPath.count + 1))
                    let encoded = rel
                        .split(separator: "/")
                        .map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
                        .joined(separator: "/")
                    return URL(string: "loom://content/\(rootID.uuidString.lowercased())/\(encoded)")
                }
            }
        }
        return nil
    }

    /// Always go through this when changing pane selection. Pushes the
    /// current surface onto history so the back button can return to
    /// it. Skips the push when the new selection is identical to avoid
    /// duplicate entries from re-clicks.
    private func navigate(_ next: DetailSurface) {
        guard next != selection else { return }
        history.append(selection)
        forwardStack.removeAll()
        selection = next
        fadeInDetail()
    }

    /// §IV.C settle-fade: brief 0.6 → 1.0 fade on the detail pane
    /// when its content swaps. Quiet, ≤150ms, easeOut — explicitly
    /// the "settle" half of the Visual Grammar §8 dichotomy, NOT
    /// the "showcase the mechanism" half.
    private func fadeInDetail() {
        detailOpacity = 0.6
        withAnimation(.easeOut(duration: 0.15)) {
            detailOpacity = 1.0
        }
    }

    // MARK: - §IV.A keyboard navigation helpers
    //
    // Per docs/loom.md §IV.A: list-shaped surfaces MUST support keyboard
    // ↑/↓ navigation with auto-scroll into viewport. The sidebar is one
    // such surface. We model the sidebar's navigable rows as an ordered
    // sequence:
    //   __pages → __captures → __webcapture → folder rows (visible
    //   ones only — overflowed ones beyond the foldersExpanded threshold
    //   and the entire section when foldersSectionExpanded is false are
    //   excluded).

    private var orderedNavigableRowIDs: [String] {
        var ids: [String] = ["__pages", "__captures", "__webcapture"]
        guard foldersSectionExpanded else { return ids }
        let topLevels = topLevelRoots
        let threshold = 5
        let needsCollapse = topLevels.count > threshold
        let visible: [ContentRoot] = (needsCollapse && !foldersExpanded)
            ? Array(topLevels.prefix(threshold))
            : topLevels
        for root in visible {
            ids.append("__root_\(root.id.uuidString)")
            for entry in descendants(of: root.id) {
                ids.append("__root_\(entry.root.id.uuidString)")
            }
        }
        return ids
    }

    /// Resolve current `selection` to a sidebar row ID, or nil if the
    /// selection has no navigable-row peer (e.g. `.sourceFile` is opened
    /// from a folderHome view, not directly from the sidebar).
    private func currentNavigableRowID() -> String? {
        switch selection {
        case .library: return "__pages"
        case .captures: return "__captures"
        case .webCaptureSetup: return "__webcapture"
        case .folderHome(let url):
            let s = url.absoluteString
            let prefix = "loom://content/"
            guard s.hasPrefix(prefix) else { return nil }
            let rest = String(s.dropFirst(prefix.count))
            let uuid = rest.split(separator: "/", maxSplits: 1).first.map(String.init) ?? rest
            return "__root_\(uuid)"
        case .sourceFile: return nil
        }
    }

    private func moveSidebarSelection(by delta: Int) {
        let ids = orderedNavigableRowIDs
        guard !ids.isEmpty else { return }
        let currentID = currentNavigableRowID()
        let currentIdx = ids.firstIndex(of: currentID ?? "") ?? 0
        let newIdx = max(0, min(ids.count - 1, currentIdx + delta))
        guard newIdx != currentIdx else { return }
        activateSidebarRow(byID: ids[newIdx])
    }

    private func activateSidebarRow(byID id: String) {
        switch id {
        case "__pages":
            navigate(.library)
        case "__captures":
            navigate(.captures)
        case "__webcapture":
            navigate(.webCaptureSetup)
        default:
            guard id.hasPrefix("__root_") else { return }
            let uuid = String(id.dropFirst("__root_".count))
            // UUIDs are stored as uppercase in the rowID (matches
            // ContentRoot.id.uuidString default). The loom://content
            // URL elsewhere lowercases; preserve that contract.
            let urlString = "loom://content/\(uuid.lowercased())"
            if let url = URL(string: urlString) {
                navigate(.folderHome(url))
            }
        }
    }

    private func goBack() {
        guard let previous = history.popLast() else { return }
        forwardStack.append(selection)
        selection = previous
        fadeInDetail()
    }

    private func goForward() {
        guard let next = forwardStack.popLast() else { return }
        history.append(selection)
        selection = next
        fadeInDetail()
    }

    /// Trigger a refresh: reload the sidebar's content roots (so newly
    /// added folders or removed ones surface) and ping the active page
    /// to re-scan its source folder. Cheap; safe to call repeatedly.
    private func refreshActive() {
        reload()
        if selection == .captures {
            capturesRefreshToken += 1
        }
        NotificationCenter.default.post(name: .loomRefreshActivePage, object: nil)
    }

    /// Single Note button in the titlebar (when viewing a source
    /// file). Ask AI is summoned from INSIDE the Note popover via
    /// its escape hatch — one primitive in the toolbar, two paths
    /// inside the popover. Honors the "one menu item per intent"
    /// decision (LOOM_RULES.md §8 single capture primitive).
    // MARK: - Capture (Phase A1)

    /// ⌘⇧L entry point. Resolves the best anchor list for whatever
    /// surface is currently active (folder home, source file, library
    /// fallback) and opens the CaptureSheet with an empty freeform body.
    private func startQuickCapture() {
        let anchors: [CaptureAnchor]
        switch selection {
        case .folderHome(let url):
            anchors = CaptureAnchorResolver.resolveForFolderHome(loomURL: url)
        case .sourceFile(let url):
            anchors = CaptureAnchorResolver.resolveForSourceFile(loomURL: url, selection: nil)
        case .library, .captures, .webCaptureSetup:
            anchors = CaptureAnchorResolver.resolveDefault()
        }
        guard let primary = anchors.first else {
            captureToast = "Open a folder first to enable Quick Capture."
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { captureToast = nil }
            return
        }
        capturePayload = CapturePayload.makeQuickCapture(anchor: primary, available: anchors)
    }

    private func startWebCapture(_ payload: CaptureWebPayload) {
        let anchors = CaptureAnchorResolver.resolveForWebCapture(
            payload,
            preferredRootID: preferredWebCaptureRootID()
        )
        guard let primary = anchors.first else {
            captureToast = "Open a folder in Loom first to enable web capture."
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { captureToast = nil }
            return
        }
        capturePayload = CapturePayload.makeFromWebPayload(payload, anchor: primary, available: anchors)
    }

    private func handleCaptureSaved(_ url: URL) {
        lastCaptureURL = url
        let loc = url.deletingLastPathComponent().lastPathComponent
        captureToast = "Captured to \(loc)"
        // Auto-navigate to Captures + refresh — saves the user the
        // "where did it land" tap dance after every capture. Both
        // happen on next runloop so the CaptureSheet dismiss
        // animation has a frame to start.
        DispatchQueue.main.async {
            capturesRefreshToken += 1
            navigate(.captures)
            NotificationCenter.default.post(name: .loomCaptureSaved, object: nil)
            NotificationCenter.default.post(name: .loomRefreshActivePage, object: nil)
        }
        // Slightly longer dwell so the user has time to click Reveal /
        // Open before the toast fades.
        DispatchQueue.main.asyncAfter(deadline: .now() + 4.5) {
            withAnimation { captureToast = nil; lastCaptureURL = nil }
        }
    }

    private func preferredWebCaptureRootID() -> UUID? {
        switch selection {
        case .folderHome(let url), .sourceFile(let url):
            return Self.rootID(from: url)
        case .library, .captures, .webCaptureSetup:
            return nil
        }
    }

    @ViewBuilder
    private var sourceFileToolbarActions: some View {
        if case .sourceFile = selection {
            // Paste from clipboard — visible button replaces the
            // hidden ⌘⇧V hotkey. Hands the clipboard to the existing
            // `startCaptureFromClipboard` flow inside SourceFileView
            // via notification (so SourceFileView still owns the PDF
            // selection it needs for the passage anchor).
            Button {
                NotificationCenter.default.post(name: .loomTriggerCaptureFromClipboard, object: nil)
            } label: {
                Label("Paste", systemImage: "doc.on.clipboard")
                    .font(.system(size: DSType.caption.size, weight: .medium))
                    .foregroundStyle(LoomTokens.dsInk1)
            }
            .help("Paste · capture from clipboard, anchors to current selection")
            Button {
                NotificationCenter.default.post(name: .loomTriggerNote, object: nil)
            } label: {
                Label("Note", systemImage: "note.text")
                    .font(.system(size: DSType.caption.size, weight: .medium))
                    .foregroundStyle(LoomTokens.dsInk1)
            }
            .help("Note · write a thought, save the quote, or summon AI")
        } else {
            EmptyView()
        }
    }

    /// Centered serif wordmark for the detail toolbar's `.principal`
    /// slot. Matches the chrome typography used by the legacy main
    /// `ContentView` (system 13 semibold) so switching between
    /// `loom.minimal.enabled` modes doesn't visually re-skin the app.
    /// Wordmark stays "Loom" (mixed case, not LOOM) — Vellum favors
    /// proper-case serif over uppercase-and-tracking dashboard chrome.
    @ViewBuilder
    private var detailTitleLabel: some View {
        Text("Loom")
            .font(.system(size: DSType.caption.size, weight: .semibold, design: .serif))
            .foregroundStyle(LoomTokens.dsInk1)
    }

    // MARK: - Sidebar

    @ViewBuilder
    private var sidebar: some View {
        ScrollViewReader { proxy in
            ScrollView {
                // Sidebar starts directly with content — the brand mark
                // lives in the detail toolbar's principal slot now (see
                // `detailTitleLabel`). The previous sans-uppercase "LOOM"
                // eyebrow doubled the wordmark and clashed with the Vellum
                // serif chrome; on Tahoe its placement also created a
                // visible seam between the sidebar pane and detail pane.
                //
                // Vertical rhythm: 4pt base. Row height ~28pt. Section
                // gaps 18pt (eyebrow padding-top 12 + padding-bottom 4 +
                // breathing 2). Eyebrows are smallcaps serif at ink3.
                LazyVStack(alignment: .leading, spacing: 0) {
                    sectionEyebrow("Workspaces", topPadding: DSSpace.xs.value)
                    pagesRow
                    capturesRow
                    webCaptureSetupRow

                    // 18pt section gap = DSSpace.md (16) + breathing 2pt.
                    // §IV.B caret-collapse: the Folders eyebrow is the
                    // only one of the three that varies in length, so it
                    // becomes the clickable group header. Workspaces /
                    // Tools stay static (fixed-shape sections). Count
                    // badge intentionally absent per §IV.B MUST NOT.
                    // (Supersedes the simpler eyebrow-with-no-count fix
                    // from PR #26, which lives in main as squashed history.)
                    foldersHeader()
                    if foldersSectionExpanded {
                        folderList
                    }

                    sectionEyebrow("Tools", topPadding: DSSpace.md.value + 2)
                    creationRow
                        .padding(.bottom, DSSpace.md.value - 4)
                }
                .padding(.horizontal, DSSpace.sm.value)
                .padding(.bottom, DSSpace.md.value - 4)
            }
            // §IV.A keyboard navigation: when the sidebar holds focus,
            // ↑/↓ moves selection through the visible navigable rows.
            // .focusable() makes the ScrollView a focus target; the
            // .onKeyPress handlers fire on arrow keys at that scope.
            .focusable()
            .focused($sidebarFocused)
            .onKeyPress(.upArrow) {
                moveSidebarSelection(by: -1)
                return .handled
            }
            .onKeyPress(.downArrow) {
                moveSidebarSelection(by: 1)
                return .handled
            }
            // Auto-scroll the newly-selected row into view (§IV.A:
            // "焦点移出 viewport 时自动 scroll 该 item 入视").
            .onChange(of: selection) { _, _ in
                guard let id = currentNavigableRowID() else { return }
                withAnimation(.easeOut(duration: DSMotion.normal.duration)) {
                    proxy.scrollTo(id, anchor: .center)
                }
            }
        }
    }

    /// Clickable group header for the Folders section. Per §IV.B:
    /// caret rotates 90° on toggle, body uses max-height (here: SwiftUI
    /// implicit animation on the `if` containing folderList in the
    /// caller). Visually parallels `sectionEyebrow` so the typographic
    /// rhythm is consistent — only the leading caret + Button wrap
    /// distinguish it.
    @ViewBuilder
    private func foldersHeader() -> some View {
        Button {
            withAnimation(.easeOut(duration: DSMotion.normal.duration)) {
                foldersSectionExpanded.toggle()
            }
        } label: {
            HStack(spacing: DSSpace.xs.value) {
                Image(systemName: "chevron.right")
                    .font(.system(size: DSType.eyebrow.size))
                    .rotationEffect(.degrees(foldersSectionExpanded ? 90 : 0))
                    .foregroundStyle(LoomTokens.dsInk3)
                Text("Folders")
                    .font(.custom("EB Garamond", size: DSType.eyebrow.size).weight(.medium).smallCaps())
                    .tracking(DSType.eyebrow.tracking)
                    .foregroundStyle(LoomTokens.dsInk3)
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
            .padding(.top, DSSpace.md.value + 2)
            .padding(.bottom, DSSpace.xs.value)
            .padding(.horizontal, DSSpace.sm.value)
        }
        .buttonStyle(.plain)
    }

    /// Smallcaps serif section eyebrow. Mirrors `DSType.eyebrow` (11pt
    /// serif, 0.16em tracking → ~1.76pt at 11pt) but kept as an
    /// `EB Garamond` custom font + `.smallCaps()` so the bundled-font
    /// path renders crisp small-caps glyphs rather than synthetic
    /// scaling. Section gap = topPadding (default 12pt above, 4pt
    /// below) to match the compact sidebar rhythm used by
    /// `globals.css .t-caption2`.
    @ViewBuilder
    private func sectionEyebrow(_ title: String, topPadding: CGFloat = DSSpace.md.value - 4) -> some View {
        Text(title)
            .font(.custom("EB Garamond", size: DSType.eyebrow.size).weight(.medium).smallCaps())
            .tracking(DSType.eyebrow.tracking)
            .foregroundStyle(LoomTokens.dsInk3)
            .padding(.top, topPadding)
            .padding(.bottom, DSSpace.xs.value)
            .padding(.horizontal, DSSpace.sm.value)
    }

    /// Render the folders list with optional collapse: when more than
    /// 5 top-level folders exist, only the first 5 show until the user
    /// taps "Show all". Sub-page descendants always render under their
    /// parent (the cap is on the top-level count alone). When zero
    /// top-level folders exist we render an italic muted prompt instead
    /// of an awkward empty rect — gives `Folders · 0` something to sit
    /// above and reinforces the next action.
    @ViewBuilder
    private var folderList: some View {
        let topLevels = topLevelRoots
        let threshold = 5
        let needsCollapse = topLevels.count > threshold
        let visible: [ContentRoot] = (needsCollapse && !foldersExpanded)
            ? Array(topLevels.prefix(threshold))
            : topLevels

        if topLevels.isEmpty {
            HStack(spacing: 0) {
                Text("Add a folder to begin.")
                    .font(.system(size: DSType.caption.size, design: .serif))
                    .italic()
                    .foregroundStyle(LoomTokens.dsInk3)
                Spacer(minLength: 0)
            }
            .padding(.vertical, DSSpace.xs.value + 2)
            .padding(.horizontal, DSSpace.sm.value)
        }

        ForEach(visible, id: \.id) { root in
            rootRow(root, indent: 0)
            ForEach(descendants(of: root.id), id: \.root.id) { entry in
                rootRow(entry.root, indent: entry.depth)
            }
        }

        if needsCollapse {
            let hidden = topLevels.count - threshold
            let toggleID = "__folders_toggle"
            let isHovered = hoveredSidebarRow == toggleID
            Button {
                withAnimation(.easeOut(duration: DSMotion.normal.duration)) {
                    foldersExpanded.toggle()
                }
            } label: {
                HStack(spacing: DSSpace.sm.value - 2) {
                    Image(systemName: foldersExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: DSType.caption.size))
                        .frame(width: 18)
                        .foregroundStyle(isHovered ? LoomTokens.dsThread : LoomTokens.dsInk3)
                    Text(foldersExpanded ? "Show fewer" : "Show all (\(hidden) more)")
                        .font(.system(size: DSType.caption.size, design: .serif))
                        .foregroundStyle(isHovered ? LoomTokens.dsThread : LoomTokens.dsInk3)
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
                .padding(.vertical, DSSpace.xs.value)
                .padding(.horizontal, DSSpace.sm.value)
            }
            .buttonStyle(.plain)
            .onHover { hovering in
                hoveredSidebarRow = hovering ? toggleID : nil
            }
            .background(rowChrome(rowID: toggleID, isSelected: false))
        }
    }

    /// Bronze hover + active chrome recipe shared by every sidebar row.
    /// Default = clear. Hover = `dsThread.opacity(0.06)` + 2pt bronze
    /// left border. Active = `dsThread.opacity(0.18)` + 2.5pt bronze
    /// left border. Returned as a transparent overlay so the row label
    /// stays the source-of-truth for size/alignment.
    ///
    /// Bar width 2.5 (was 3) keeps the active bar feeling tactile
    /// without stealing label real estate; matches the bronze pin
    /// thickness used by the canonical paper recipe.
    @ViewBuilder
    private func rowChrome(rowID: String, isSelected: Bool) -> some View {
        let isHovered = hoveredSidebarRow == rowID
        let borderWidth: CGFloat = isSelected ? 2.5 : (isHovered ? 2 : 0)
        let fill: Color = {
            if isSelected { return LoomTokens.dsThread.opacity(0.18) }
            if isHovered { return LoomTokens.dsThread.opacity(0.06) }
            return Color.clear
        }()
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: DSRadius.sm.value)
                .fill(fill)
            if borderWidth > 0 {
                Rectangle()
                    .fill(LoomTokens.dsThread)
                    .frame(width: borderWidth)
                    .clipShape(RoundedRectangle(cornerRadius: 1))
            }
        }
        .animation(.easeOut(duration: DSMotion.fast.duration), value: isHovered)
    }

    /// One row shape so the three workspace entries + folders + toggle
    /// share alignment, padding, and chrome. Caller supplies the icon
    /// name + label + selected/hover state + tap.
    @ViewBuilder
    private func sidebarButton(
        rowID: String,
        icon: String,
        title: String,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: DSSpace.sm.value - 2) {
                Image(systemName: icon)
                    .font(.system(size: DSType.caption.size))
                    .frame(width: 18)
                    .foregroundStyle(isSelected ? LoomTokens.dsInk1 : LoomTokens.dsInk3)
                Text(title)
                    .font(.system(size: DSType.caption.size, design: .serif))
                    .foregroundStyle(isSelected ? LoomTokens.dsThread : LoomTokens.dsInk1)
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
            .padding(.vertical, DSSpace.xs.value + 2)
            .padding(.horizontal, DSSpace.sm.value)
            .frame(minHeight: 28)
            .background(rowChrome(rowID: rowID, isSelected: isSelected))
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            hoveredSidebarRow = hovering ? rowID : nil
        }
        // §IV.A scroll-into-view target: anchored ID lets the parent
        // ScrollViewReader proxy.scrollTo(id) find this row.
        .id(rowID)
    }

    @ViewBuilder
    private var pagesRow: some View {
        sidebarButton(
            rowID: "__pages",
            icon: "folder",
            title: "Sources",
            isSelected: selection == .library,
            action: { navigate(.library) }
        )
    }

    /// Phase A3 follow-up — sidebar entries for the captures browser
    /// + bookmarklet setup. They sit beside Sources because they're
    /// cross-cutting (not tied to one ContentRoot).
    @ViewBuilder
    private var capturesRow: some View {
        sidebarButton(
            rowID: "__captures",
            icon: "tray.full",
            title: "Captures",
            isSelected: selection == .captures,
            action: { navigate(.captures) }
        )
    }

    @ViewBuilder
    private var webCaptureSetupRow: some View {
        sidebarButton(
            rowID: "__webcapture",
            icon: "globe",
            title: "Web Capture",
            isSelected: selection == .webCaptureSetup,
            action: { navigate(.webCaptureSetup) }
        )
    }

    /// Top-level roots — roots with no parent. Sub-pages (parentID
    /// non-nil) are rendered nested under their parent via
    /// `descendants(of:)` so the sidebar reflects the page hierarchy.
    private var topLevelRoots: [ContentRoot] {
        roots.filter { $0.parentID == nil }
    }

    /// Depth-first traversal of a root's children. Returns each
    /// descendant paired with its nesting depth (1 = direct child)
    /// so the sidebar can apply progressive indentation.
    private func descendants(of parentID: UUID, depth: Int = 1) -> [(root: ContentRoot, depth: Int)] {
        let direct = roots
            .filter { $0.parentID == parentID }
            .sorted { $0.addedAt < $1.addedAt }
        var out: [(root: ContentRoot, depth: Int)] = []
        for child in direct {
            out.append((child, depth))
            out.append(contentsOf: descendants(of: child.id, depth: depth + 1))
        }
        return out
    }

    @ViewBuilder
    private func rootRow(_ root: ContentRoot, indent: Int = 0) -> some View {
        let urlString = "loom://content/\(root.id.uuidString.lowercased())"
        let target = URL(string: urlString)
        let isSelected: Bool = {
            if case let .folderHome(url) = selection {
                return url.absoluteString.hasPrefix(urlString)
            }
            return false
        }()
        let isRenaming = renamingRootID == root.id
        let rowID = "__root_\(root.id.uuidString)"
        let icon = root.externalFolderBookmark == nil ? "doc.text" : "folder"
        Group {
            if isRenaming {
                HStack(spacing: DSSpace.sm.value - 2) {
                    Image(systemName: icon)
                        .font(.system(size: DSType.caption.size))
                        .frame(width: 18)
                        .foregroundStyle(LoomTokens.dsInk3)
                    TextField("Name", text: $renameDraft)
                        .textFieldStyle(.plain)
                        .font(.system(size: DSType.caption.size, design: .serif))
                        .focused($renameFieldFocused)
                        .onSubmit { commitRename() }
                        .onExitCommand { cancelRename() }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, DSSpace.xs.value + 2)
                .padding(.horizontal, DSSpace.sm.value)
                .frame(minHeight: 28)
                .padding(.leading, CGFloat(indent) * DSSpace.md.value)
            } else {
                Button {
                    if let target = target {
                        navigate(.folderHome(target))
                    }
                } label: {
                    HStack(spacing: DSSpace.sm.value - 2) {
                        Image(systemName: icon)
                            .font(.system(size: DSType.caption.size))
                            .frame(width: 18)
                            .foregroundStyle(isSelected ? LoomTokens.dsInk1 : LoomTokens.dsInk3)
                        Text(root.displayName)
                            .font(.system(size: DSType.caption.size, design: .serif))
                            .foregroundStyle(isSelected ? LoomTokens.dsThread : LoomTokens.dsInk1)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                    .padding(.vertical, DSSpace.xs.value + 2)
                    .padding(.horizontal, DSSpace.sm.value)
                    .padding(.leading, CGFloat(indent) * DSSpace.md.value)
                    .frame(minHeight: 28)
                    .background(rowChrome(rowID: rowID, isSelected: isSelected))
                }
                .buttonStyle(.plain)
                .onHover { hovering in
                    hoveredSidebarRow = hovering ? rowID : nil
                }
                // §IV.A scroll-into-view target.
                .id(rowID)
            }
        }
        .contextMenu {
            Button { startRename(root) } label: {
                Label("Rename", systemImage: "pencil")
            }
            Button(role: .destructive) {
                ContentRootStore.remove(id: root.id)
                if isSelected { navigate(.library) }
            } label: {
                Label("Remove", systemImage: "trash")
            }
        }
    }

    @ViewBuilder
    private var creationRow: some View {
        if isCreatingPage {
            HStack(spacing: DSSpace.sm.value - 2) {
                Image(systemName: "doc.text")
                    .font(.system(size: DSType.caption.size))
                    .frame(width: 18)
                    .foregroundStyle(LoomTokens.dsInk3)
                TextField("Page name", text: $pageDraft)
                    .textFieldStyle(.plain)
                    .font(.system(size: DSType.caption.size, design: .serif))
                    .focused($pageFieldFocused)
                    .onSubmit { commitNewPage() }
                Button(action: commitNewPage) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(LoomTokens.dsThread)
                }
                .buttonStyle(.plain)
                .disabled(pageDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button(action: cancelNewPage) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(LoomTokens.dsInk3)
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, DSSpace.xs.value + 2)
            .padding(.horizontal, DSSpace.sm.value)
            .frame(minHeight: 28)
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    pageFieldFocused = true
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                creationButton(
                    rowID: "__new_page",
                    title: "Page",
                    icon: "plus",
                    action: startNewPage
                )
                creationButton(
                    rowID: "__new_folder",
                    title: "Folder",
                    icon: "plus",
                    action: pickFolder
                )
            }
        }
    }

    @ViewBuilder
    private func creationButton(
        rowID: String,
        title: String,
        icon: String,
        action: @escaping () -> Void
    ) -> some View {
        let isHovered = hoveredSidebarRow == rowID
        Button(action: action) {
            HStack(spacing: DSSpace.sm.value - 2) {
                Image(systemName: icon)
                    .font(.system(size: DSType.caption.size))
                    .frame(width: 18)
                    .foregroundStyle(isHovered ? LoomTokens.dsThread : LoomTokens.dsInk3)
                Text(title)
                    .font(.system(size: DSType.caption.size, design: .serif))
                    .foregroundStyle(isHovered ? LoomTokens.dsInk1 : LoomTokens.dsInk2)
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
            .padding(.vertical, DSSpace.xs.value + 2)
            .padding(.horizontal, DSSpace.sm.value)
            .frame(minHeight: 28)
            .background(rowChrome(rowID: rowID, isSelected: false))
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            hoveredSidebarRow = hovering ? rowID : nil
        }
    }

    // MARK: - Detail pane

    @ViewBuilder
    private var detail: some View {
        switch selection {
        case .library:
            LoomLibraryView()
        case .folderHome(let url):
            folderHome(for: url)
        case .sourceFile(let url):
            SourceFileView(loomURL: url) {
                goBack()
            }
        case .captures:
            CapturesView(refreshToken: capturesRefreshToken, themeMode: webThemeMode)
        case .webCaptureSetup:
            WebCaptureSetupView()
        }
    }

    @ViewBuilder
    private func folderHome(for loomURL: URL) -> some View {
        if let resolved = Self.resolveFolderHome(loomURL) {
            LoomFolderHomeView(
                rootID: resolved.rootID,
                externalFolderURL: resolved.externalFolder,
                displayName: resolved.displayName
            )
            .id(loomURL)
        } else {
            VStack(spacing: DSSpace.sm.value - 2) {
                Text("Couldn't open this page.")
                    .font(.system(size: DSType.caption.size, design: .serif))
                    .foregroundStyle(LoomTokens.dsInk1)
                Text(loomURL.absoluteString)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(LoomTokens.dsInk2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private struct ResolvedFolderHome {
        let externalFolder: URL?
        let displayName: String?
        let rootID: UUID?
    }

    private static func rootID(from loomURL: URL) -> UUID? {
        guard loomURL.scheme == "loom", loomURL.host == "content" else { return nil }
        let segs = loomURL.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")).split(separator: "/")
        guard let first = segs.first else { return nil }
        return UUID(uuidString: String(first))
    }

    private static func resolveFolderHome(_ loomURL: URL) -> ResolvedFolderHome? {
        guard let rootID = rootID(from: loomURL) else { return nil }
        let segs = loomURL.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")).split(separator: "/").map(String.init)
        let rest = segs.dropFirst().joined(separator: "/")
        let stored = ContentRootStore.loadAll().first { $0.id == rootID }
        let external = ContentRootStore.activeURL(for: rootID)
        let externalSubfolder: URL? = {
            guard let external = external else { return nil }
            if rest.isEmpty { return external }
            return external.appendingPathComponent(rest).standardizedFileURL
        }()
        let label: String? = {
            if rest.isEmpty { return stored?.displayName }
            return externalSubfolder?.lastPathComponent
        }()
        return ResolvedFolderHome(externalFolder: externalSubfolder, displayName: label, rootID: rootID)
    }

    // MARK: - Actions

    private func reload() {
        roots = ContentRootStore.loadAll()
    }

    private func startNewPage() {
        pageDraft = ""
        isCreatingPage = true
    }

    private func cancelNewPage() {
        isCreatingPage = false
        pageDraft = ""
    }

    private func commitNewPage() {
        let trimmed = pageDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { cancelNewPage(); return }
        guard let added = ContentRootStore.addPage(displayName: trimmed) else {
            cancelNewPage(); return
        }
        let mdURL = LoomFileStore.loomMDURL(for: added.id)
        try? "# \(trimmed)\n".write(to: mdURL, atomically: true, encoding: .utf8)
        cancelNewPage()
        if let target = URL(string: "loom://content/\(added.id.uuidString.lowercased())") {
            navigate(.folderHome(target))
        }
    }

    private func startRename(_ root: ContentRoot) {
        renamingRootID = root.id
        renameDraft = root.displayName
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            renameFieldFocused = true
        }
    }

    private func cancelRename() {
        renamingRootID = nil
        renameDraft = ""
    }

    private func commitRename() {
        guard let id = renamingRootID,
              let current = roots.first(where: { $0.id == id }) else {
            cancelRename(); return
        }
        let trimmed = renameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != current.displayName else {
            cancelRename(); return
        }
        var updated = current
        updated.displayName = trimmed
        ContentRootStore.update(updated)
        cancelRename()
    }

    private func pickFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose Folder"
        panel.title = "Add a folder as a page"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        guard let added = ContentRootStore.addFolder(url: url) else { return }
        if let target = URL(string: "loom://content/\(added.id.uuidString.lowercased())") {
            navigate(.folderHome(target))
        }
    }
}

/// Bridges native macOS two-finger horizontal trackpad swipes into
/// SwiftUI back/forward callbacks. Listens via a local NSEvent monitor
/// so the gesture works no matter which subview the cursor sits over,
/// and uses `NSEvent.trackSwipeEvent` so the swipe feels native (the
/// rubber-banding/threshold matches Safari/Finder behavior).
///
/// Convention (matches Safari + Finder with natural scrolling):
///   • swipe right (fingers move right, scrollingDeltaX > 0)  → back
///   • swipe left  (fingers move left,  scrollingDeltaX < 0)  → forward
struct SwipeNavigation: NSViewRepresentable {
    let onBack: () -> Void
    let onForward: () -> Void

    func makeNSView(context: Context) -> NSView {
        context.coordinator.attach(onBack: onBack, onForward: onForward)
        return NSView()
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        context.coordinator.onBack = onBack
        context.coordinator.onForward = onForward
    }

    static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
        coordinator.detach()
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var monitor: Any?
        var onBack: (() -> Void)?
        var onForward: (() -> Void)?
        private var tracking = false

        func attach(onBack: @escaping () -> Void, onForward: @escaping () -> Void) {
            self.onBack = onBack
            self.onForward = onForward
            // Local monitor sees scroll events before any view processes
            // them. We always return the event so normal scrolling is
            // unaffected — only `.began` events with a clearly horizontal
            // bias spawn a swipe-tracking session.
            self.monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
                self?.handle(event)
                return event
            }
        }

        func detach() {
            if let monitor = monitor {
                NSEvent.removeMonitor(monitor)
                self.monitor = nil
            }
        }

        private func handle(_ event: NSEvent) {
            guard !tracking,
                  event.phase == .began,
                  event.hasPreciseScrollingDeltas,
                  event.scrollingDeltaX != 0,
                  abs(event.scrollingDeltaX) > abs(event.scrollingDeltaY) * 2 else {
                return
            }
            let goingBack = event.scrollingDeltaX > 0
            tracking = true
            var fired = false
            event.trackSwipeEvent(
                options: .clampGestureAmount,
                dampenAmountThresholdMin: -1,
                max: 1
            ) { [weak self] gestureAmount, _, isComplete, _ in
                if isComplete {
                    if !fired, abs(gestureAmount) > 0.4 {
                        fired = true
                        DispatchQueue.main.async {
                            if goingBack {
                                self?.onBack?()
                            } else {
                                self?.onForward?()
                            }
                        }
                    }
                    self?.tracking = false
                }
            }
        }
    }
}
