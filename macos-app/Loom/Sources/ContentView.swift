import SwiftUI
import WebKit

private let lastLocalPathDefaultsKey = "loom.lastLocalPath"

final class WebDebugState: ObservableObject {
    @Published var currentURL: String = ""
    /// URL of the last committed navigation. Updated only on
    /// `didCommit` / `didFinish` — NOT on `didStartProvisionalNavigation`.
    /// Used by the sidebar's currentHref so active-link state doesn't
    /// flip mid-press during provisional navigation (which was eating
    /// first clicks on Weaves / Reference). The chrome no longer reads
    /// any URL state — see ContentView.chromeColorScheme.
    @Published var committedURL: String = ""
    @Published var pageTitle: String = ""
    @Published var isLoading: Bool = false
    @Published var lastError: String = ""
    @Published var consoleMessage: String = ""
    @Published var recoveryMessage: String = ""
    /// Flips true after the webview's first successful navigation finish.
    /// Drives the launch-flash mask: StartingView stays on top of the
    /// webview until the first paint is done, then crossfades out.
    @Published var didFirstLoad: Bool = false
    /// Mirror of `WKWebView.canGoBack` / `.canGoForward` so toolbar
    /// buttons disable when the history stack is empty — standard Mac
    /// feel that webview-wrapper apps often skip.
    @Published var canGoBack: Bool = false
    @Published var canGoForward: Bool = false
}

struct ContentView: View {
    @EnvironmentObject var server: DevServer
    @StateObject private var webState = WebDebugState()
    @AppStorage("theme") private var theme: String = "auto"
    @AppStorage("loom.showDebugHUD.v2") private var showDebugHUD = false
    // Central handle to open the Settings scene. The legacy
    // `showSettingsWindow:` selector is unreliable on macOS 14+, so
    // every surface (sidebar CTA, failed-view button, AppKit
    // NavigationBridge) funnels through `.loomOpenSettings` and we
    // invoke `openSettings()` here from the root SwiftUI view.
    @Environment(\.openSettings) private var openSettings

    private var windowTitle: String {
        switch server.status {
        case .ready:
            let title = webState.pageTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            // Folder name already surfaces in the sidebar's Library
            // section header, so no need to append it here and end up
            // with "Coworks · Loom — INFS 3822" double-branded titles.
            return title.isEmpty ? "Loom" : title
        case .starting, .idle:
            return "Loom"
        case .failed:
            return "Loom · Offline"
        }
    }

    @State private var firstRunSheetVisible = false
    /// Presentation state for the "Hold a Question…" sheet (⌘⇧P or the
    /// matching Shuttle command). Observes `.loomShowHoldQuestionDialog`
    /// on the detail column so the sheet appears over the current main
    /// content regardless of which surface is foregrounded.
    @State private var holdQuestionSheetVisible = false
    /// Presentation state for the "Add a Sōan Card…" sheet (⌘⇧D or the
    /// matching Shuttle command). Same dispatch pattern as the hold-
    /// question sheet — observer on the detail column, notification
    /// broadcast from LoomApp / ShuttleView.
    @State private var addSoanCardSheetVisible = false
    /// Presentation state for the "Connect Sōan Cards…" sheet (⌘⇧L or
    /// the matching Shuttle command). Pairs with `AddSoanCardSheet` —
    /// add mints cards, connect mints the edges that relate them.
    @State private var connectSoanCardsSheetVisible = false
    /// Presentation state for the "Weave Two Panels…" sheet (⌘⇧W or
    /// the matching Shuttle command). Mints a `LoomWeave` — an
    /// explicit directed relation (supports / contradicts /
    /// elaborates / echoes) between two panels. Same dispatch pattern
    /// as the sibling sheets.
    @State private var weavePanelsSheetVisible = false
    // Bumped when the user re-picks the content folder in the first-run
    // wizard or Settings → Data. Used as a `.id()` on LoomWebView so the
    // NSViewRepresentable rebuilds with the freshly-activated host root
    // without requiring an app relaunch.
    @State private var webviewEpoch: Int = 0
    /// Drives the app-wide auto theme. Auto means Loom's day/night
    /// rhythm, not the current macOS appearance: day is paper, night is
    /// night, everywhere.
    @State private var themeClock: Date = Date()

    /// Source-file viewer state. When non-nil, the detail column shows
    /// a native `SourceFileView` (PDFKit / QuickLook) instead of the
    /// webview. Set by `.loomOpenSourceFile` notification (sidebar PDF
    /// click). Cleared when user clicks the back chevron in the viewer.
    @State private var activeSourceFileURL: URL? = nil

    /// Folder-home viewer state. When non-nil, the detail column shows
    /// a native `LoomFolderHomeView` (Loom.md + file listing) instead of
    /// the webview. Set by `.loomShowFolderHome` notification when the
    /// user clicks a root or sub-folder name in the sidebar. Mutually
    /// exclusive with `activeSourceFileURL`.
    @State private var activeFolderHomeURL: URL? = nil

    /// True when the user clicked sidebar's "Sources" entry — main
    /// pane shows `LoomLibraryView` (a list of all roots/pages).
    /// Mutually exclusive with source-file / folder-home overlays.
    @State private var showLibrary: Bool = false

    /// AI bar state. Open/closed, conversation history, current draft,
    /// in-flight flag. History persists across opens within the session
    /// — collapsing the bar keeps the conversation alive so re-opening
    /// continues the thread.
    @State private var aiBarOpen: Bool = false
    @State private var aiMessages: [LoomAIMessage] = []
    @State private var aiDraft: String = ""
    @State private var aiThinking: Bool = false

    // Native-sidebar visibility. M1 "source-sacred" default — sidebar
    // starts hidden so the doc fills the room on launch, matching the
    // reference design. Users reveal with the standard ⌃⌘S toggle, and
    // the choice persists via @AppStorage. Existing users who already
    // toggled have their preference stored and keep it.
    @AppStorage("loom.sidebar.visibility") private var sidebarVisibilityRaw: String = "detailOnly"
    @State private var columnVisibility: NavigationSplitViewVisibility = .detailOnly

    /// Single-slot main content. Sidebar clicks + ⌘⇧R/⌘⇧I/⌘⇧X switch
    /// this, which REPLACES the webview in the detail column rather
    /// than adding a right-side inspector panel. Arc / Xcode pattern:
    /// one content area, sidebar drives what's in it. Back to webview
    /// happens naturally when the learner clicks a doc in the sidebar
    /// (sets surface = .web + loads URL in one go).
    enum MainSurface: String, Equatable {
        case web
        case rehearsal
        case examiner
        case ingestion
        case reconstructions
    }
    @State private var activeSurface: MainSurface = .web

    /// Force the web-rendered Sidebar.tsx permanently hidden — the native
    /// sidebar is now the only sidebar. Runs on every `.onAppear` and on
    /// `.loomContentRootChanged` so newly-loaded webview instances see
    /// the hidden state before first paint.
    private static let webSidebarDefaultsKey = "wiki:sidebar:mode"
    private func forceHideWebSidebar() {
        UserDefaults.standard.set("hidden", forKey: Self.webSidebarDefaultsKey)
        NotificationCenter.default.post(
            name: .loomSetWebSidebarMode,
            object: nil,
            userInfo: ["mode": "hidden"]
        )
    }

    private func refreshFirstRunSheetVisibility() {
        let shouldPrompt = AIProviderKind.firstRunShouldPrompt
        if firstRunSheetVisible != shouldPrompt {
            firstRunSheetVisible = shouldPrompt
        }
    }

    private var firstRunSheetBinding: Binding<Bool> {
        Binding(
            get: { firstRunSheetVisible && AIProviderKind.firstRunShouldPrompt },
            set: { firstRunSheetVisible = $0 }
        )
    }

    /// Map legacy inspector-tab string names to the new `MainSurface`
    /// values. Lets old menu/notification callers still drive the
    /// switcher without re-plumbing every post site.
    static func surface(from name: String) -> MainSurface? {
        switch name {
        case "rehearsal":       return .rehearsal
        case "examiner":        return .examiner
        case "ingestion":       return .ingestion
        case "reconstructions": return .reconstructions
        case "web":             return .web
        default:                return nil
        }
    }

    /// Chrome background color — single source of truth, follows the
    /// resolved app theme (system or manual override). NO route-level
    /// overrides. Per user 2026-04-25: "白天的时候,所有页面都是浅色主题,
    /// 晚上都是深色主题。不搞特殊。" Day = paper everywhere, night = night
    /// everywhere. The previous per-route forcedNightChromePaths machinery
    /// (which flipped chrome on /weaves, /sources, /knowledge, etc.) was
    /// the root cause of sidebar flicker AND first-click eating on
    /// Weaves/Reference (the colorScheme env churn invalidated mid-press
    /// Buttons). Killed.
    private var chromeBackground: Color {
        usesDarkChrome ? LoomTokens.night : LoomTokens.paper
    }

    private var usesDarkChrome: Bool {
        sidebarColorScheme == .dark
    }

    private var chromeColorScheme: ColorScheme {
        sidebarColorScheme
    }

    private var sidebarColorScheme: ColorScheme {
        SidebarThemeResolution.resolvedColorScheme(
            theme: theme,
            systemIsDark: NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua,
            now: themeClock
        )
    }

    private var webThemeMode: String {
        chromeColorScheme == .dark ? "dark" : "light"
    }


    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            KnowledgeSidebarView(webState: webState)
                // Tightened from 200/240/360 → 180/208/300 on 2026-04-23
                // after user flagged the sidebar as visually wide. 208 is
                // the Finder / System Settings native default; prose
                // reads as the window's center of gravity instead of
                // sharing it with the nav column.
                .navigationSplitViewColumnWidth(min: 180, ideal: 208, max: 300)
                // Scoped colorScheme — pinned to the SYSTEM-following
                // sidebar scheme, NOT the route-aware chromeColorScheme.
                //
                // Why pinned (2026-04-25): when this flipped on every
                // committed nav into /weaves, SwiftUI invalidated the
                // entire sidebar subtree at commit time. A user's first
                // click on the Weaves link landed on a Button that was
                // mid-rerender; the click was eaten and a second click
                // was required to actually navigate. Decoupling the
                // sidebar's colorScheme from chrome keeps the sidebar
                // tree stable through navigation; the chrome (toolbar +
                // window background) still flips via the toolbar
                // modifiers below.
                .environment(\.colorScheme, sidebarColorScheme)
        } detail: {
            surfaceContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .toolbar {
                    // Populate the .unifiedCompact titlebar with the
                    // two pieces of chrome a mature Mac app expects:
                    // navigate-back and navigate-forward. The bindings
                    // mirror ⌘[ / ⌘] in the View menu. Without these,
                    // the titlebar strip read as dead space — just
                    // traffic lights and a blank band — which the user
                    // flagged as unprofessional on 2026-04-22 night.
                    ToolbarItemGroup(placement: .navigation) {
                        Button {
                            NotificationCenter.default.post(name: .loomGoBack, object: nil)
                        } label: {
                            Image(systemName: "chevron.backward")
                        }
                        .help("Back · ⌘[")
                        Button {
                            NotificationCenter.default.post(name: .loomGoForward, object: nil)
                        } label: {
                            Image(systemName: "chevron.forward")
                        }
                        .help("Forward · ⌘]")
                    }
                    // Title rendered as a SwiftUI ToolbarItem so it
                    // inherits `.toolbarColorScheme` — candle on night
                    // chrome, ink on paper. NSWindow's own title
                    // (which would otherwise render here) is hidden
                    // via WindowConfigurator because macOS 26 doesn't
                    // repaint that text when appearance flips.
                    ToolbarItem(placement: .principal) {
                        Text(windowTitle)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.primary)
                    }
                }
        }
        .onAppear {
            columnVisibility = sidebarVisibilityRaw == "detailOnly" ? .detailOnly : .doubleColumn
            // Native is the only sidebar now — kill the web one
            // unconditionally so a bad prior value doesn't leave both
            // rendering at once.
            forceHideWebSidebar()
        }
        .onChange(of: columnVisibility) { _, new in
            sidebarVisibilityRaw = (new == .detailOnly) ? "detailOnly" : "doubleColumn"
            // Mirror the native-sidebar column state into the web view
            // so the two don't render simultaneously. Native visible →
            // web sidebar hidden. Native hidden → restore "pinned" so
            // the legacy web Sidebar.tsx (used on routes that still
            // render it) can re-show if the user prefers that path.
            let mode = (new == .detailOnly) ? "pinned" : "hidden"
            UserDefaults.standard.set(mode, forKey: Self.webSidebarDefaultsKey)
            NotificationCenter.default.post(
                name: .loomSetWebSidebarMode,
                object: nil,
                userInfo: ["mode": mode]
            )
        }
        .onReceive(Timer.publish(every: 300, on: .main, in: .common).autoconnect()) { now in
            themeClock = now
        }
        // Dynamic chrome tint — paper on most surfaces, night on
        // Weaves / Constellation / Branching / Palimpsest / Evening.
        // Reacts to `webState.currentURL` so switching pages re-tints
        // the titlebar + toolbar strip live.
        .loomWindowBackground(chromeBackground)
        .toolbarBackground(chromeBackground, for: .windowToolbar)
        .toolbarBackground(.visible, for: .windowToolbar)
        // Flip the toolbar's foreground scheme to match the chrome
        // brightness so the sidebar toggle, ⟨ / ⟩ chevrons, and the
        // "Loom" breadcrumb render in the readable contrast — ink on
        // paper (light), candle on night (dark). Scoped to just the
        // toolbar region; the sidebar + rest of the SwiftUI tree
        // keeps the system color scheme so paper surfaces don't
        // accidentally stay dark when leaving Weaves (the
        // `.preferredColorScheme(.dark/nil)` experiment was sticky
        // across transitions on macOS 26 — user observed "everything
        // went dark" after visiting Weaves once).
        .toolbarColorScheme(usesDarkChrome ? .dark : .light, for: .windowToolbar)
    }

    /// Switch over the active surface. Webview stays mounted (hidden
    /// behind the Action surfaces) so navigating back to web keeps its
    /// scroll position + history. Native views re-render per switch.
    @ViewBuilder
    private var surfaceContent: some View {
        ZStack {
            // Webview is always in the tree; `opacity` hides it so its
            // WKWebView process doesn't get torn down every switch.
            detailColumn
                .opacity(activeSurface == .web ? 1 : 0)
                .allowsHitTesting(activeSurface == .web)
            Group {
                switch activeSurface {
                case .web:
                    EmptyView()
                case .rehearsal:
                    RehearsalView()
                case .examiner:
                    ExaminerView()
                case .ingestion:
                    IngestionView()
                case .reconstructions:
                    ReconstructionsView()
                }
            }
            .transition(.opacity)
        }
        // Shutter pattern (memory: feedback_shutter_pattern.md) —
        // surface crossfades on sidebar Action clicks instead of
        // snap-swapping. Duration matches the StartingView fade
        // (0.35s easeOut) so the two interactions feel coherent.
        .animation(.easeOut(duration: 0.35), value: activeSurface)
    }

    /// Handle a click on a `loom://anchor?...` link inside a rendered
    /// note. Resolves the doc by name within the current root, opens
    /// the source viewer, and asks the PDFViewHolder to scroll to the
    /// saved page+rect once the view has mounted.
    private func handleAnchorJump(_ note: Notification) {
        guard let anchorURL = note.userInfo?["url"] as? URL,
              let components = URLComponents(url: anchorURL, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else { return }
        let docName = queryItems.first(where: { $0.name == "doc" })?.value ?? ""
        let pageStr = queryItems.first(where: { $0.name == "page" })?.value ?? "0"
        let rectStr = queryItems.first(where: { $0.name == "rect" })?.value ?? ""
        guard let rootURL = currentAnchorRootURL() else { return }
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(at: rootURL, includingPropertiesForKeys: nil) else { return }
        var match: URL? = nil
        for case let url as URL in enumerator {
            if url.lastPathComponent == docName { match = url; break }
        }
        guard let docURL = match else { return }
        guard let rootID = ContentRootStore.allActiveURLs.first(where: { $0.value == rootURL })?.key else { return }
        let rootPath = rootURL.standardizedFileURL.path
        let docPath = docURL.standardizedFileURL.path
        guard docPath.hasPrefix(rootPath + "/") else { return }
        let relative = String(docPath.dropFirst(rootPath.count + 1))
        let encoded = relative
            .split(separator: "/")
            .map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
            .joined(separator: "/")
        guard let target = URL(string: "loom://content/\(rootID.uuidString.lowercased())/\(encoded)") else { return }
        activeSourceFileURL = target
        activeFolderHomeURL = nil
        let pageIndex = Int(pageStr) ?? 0
        let rectFields = rectStr.split(separator: ",").compactMap { Double($0) }
        guard rectFields.count == 4 else { return }
        let rect = CGRect(x: rectFields[0], y: rectFields[1], width: rectFields[2], height: rectFields[3])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            NotificationCenter.default.post(
                name: .loomApplyPDFAnchor,
                object: nil,
                userInfo: ["page": pageIndex, "rect": NSValue(rect: rect)]
            )
        }
    }

    /// Returns true when a `loom://content/<uuid>/...` URL still points
    /// at a root that's currently active. Lets us preserve folder-home
    /// / source-file overlays across additive content-root changes
    /// (add a sibling root) while still clearing them on destructive
    /// changes (remove the root that the overlay referenced).
    static func urlPointsToActiveRoot(_ url: URL) -> Bool {
        guard url.scheme == LoomURLSchemeHandler.scheme, url.host == "content" else { return false }
        let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let firstSeg = path.split(separator: "/").first else { return false }
        guard let id = UUID(uuidString: String(firstSeg)) else { return false }
        return ContentRootStore.allActiveURLs[id] != nil
    }

    private func currentAnchorRootURL() -> URL? {
        if let folderHome = activeFolderHomeURL,
           let info = Self.resolveFolderHomeURL(folderHome),
           let id = info.rootID {
            return ContentRootStore.activeURL(for: id)
        }
        return ContentRootStore.allActiveURLs.values.first
    }

    /// Build a snapshot of the user's current location for the AI bar's
    /// breadcrumb display and (Phase B4) ancestor-Loom.md context
    /// injection. Source files override folder home, which overrides
    /// the webview's URL.
    private var currentAIContext: LoomAIContext {
        if let url = activeSourceFileURL {
            return resolveContext(for: url)
        }
        if let url = activeFolderHomeURL {
            return resolveContext(for: url)
        }
        return LoomAIContext(breadcrumb: "Loom", contentURL: nil, resolvedFileURL: nil)
    }

    private func resolveContext(for loomURL: URL) -> LoomAIContext {
        let hostRoots = LoomRuntimePaths.resolveHostRoots()
        let resolved = LoomURLSchemeHandler.resolve(loomURL, hostRoots: hostRoots, contentRoots: ContentRootStore.allActiveURLs)
        // Build breadcrumb from path segments, plus root display name when
        // the URL identifies a multi-root entry.
        let path = loomURL.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let segments = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        var crumbs: [String] = []
        if let firstSeg = segments.first, let rootID = UUID(uuidString: firstSeg),
           let storedRoot = ContentRootStore.loadAll().first(where: { $0.id == rootID }) {
            crumbs.append(storedRoot.displayName)
            for seg in segments.dropFirst() {
                crumbs.append(seg.removingPercentEncoding ?? seg)
            }
        } else {
            for seg in segments {
                crumbs.append(seg.removingPercentEncoding ?? seg)
            }
        }
        let breadcrumb = crumbs.isEmpty ? "Loom" : crumbs.joined(separator: " › ")
        return LoomAIContext(breadcrumb: breadcrumb, contentURL: loomURL, resolvedFileURL: resolved)
    }

    /// Resolve the Loom.md target file for the current context. Folder
    /// home → that folder's Loom.md (mirrored under the file store).
    /// Source file → that file's parent folder's Loom.md (mirrored).
    /// Falls back to the first active root's Loom.md (file store).
    ///
    /// Source Fidelity rule (2026-04-27): never returns a URL inside
    /// the user's external folder. All AI-generated Loom.md writes go
    /// through `LoomFileStore`, keyed by `<rootID>/sub/<rel-path>`.
    /// The user's picked folder stays untouched.
    private func loomMDTarget(for context: LoomAIContext) -> URL? {
        if let resolved = context.resolvedFileURL {
            let folder = resolved.hasDirectoryPath ? resolved : resolved.deletingLastPathComponent()
            if let mapped = Self.fileStoreMDPath(forExternalFolder: folder) {
                return mapped
            }
        }
        if let firstID = ContentRootStore.allActiveURLs.keys.first {
            return LoomFileStore.loomMDURL(for: firstID)
        }
        return nil
    }

    /// Map an external folder URL back to its sandbox-stored Loom.md
    /// equivalent. Walks active roots to find the one containing the
    /// given folder, computes the relative sub-path, and routes through
    /// `LoomFileStore.loomMDURL(for:subPath:)`. Returns nil when no
    /// registered root contains the folder.
    private static func fileStoreMDPath(forExternalFolder folder: URL) -> URL? {
        let folderPath = folder.standardizedFileURL.path
        for (rootID, rootURL) in ContentRootStore.allActiveURLs {
            let rootPath = rootURL.standardizedFileURL.path
            if folderPath == rootPath {
                return LoomFileStore.loomMDURL(for: rootID)
            }
            if folderPath.hasPrefix(rootPath + "/") {
                let rel = String(folderPath.dropFirst(rootPath.count + 1))
                return LoomFileStore.loomMDURL(for: rootID, subPath: rel)
            }
        }
        return nil
    }

    /// Append an AI message to the target Loom.md's `## Notes` section
    /// as a timestamped entry. Creates the file + heading as needed.
    private func saveAIMessageAsNote(_ msg: LoomAIMessage) {
        let context = currentAIContext
        guard let target = loomMDTarget(for: context) else { return }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        let timestamp = formatter.string(from: Date())
        let entry = "### AI — \(timestamp)\n\(msg.content)\n"
        do {
            let existing = (try? String(contentsOf: target, encoding: .utf8)) ?? ""
            let updated = Self.appendNote(entry: entry, to: existing)
            try updated.write(to: target, atomically: true, encoding: .utf8)
        } catch {
            aiMessages.append(LoomAIMessage(role: .ai, content: "[error] couldn't save note: \(error.localizedDescription)"))
        }
    }

    /// Replace the description portion (everything before `## Notes`)
    /// of the target Loom.md with the AI message content. Preserves
    /// existing notes. Creates the file when missing.
    private func saveAIMessageAsDescription(_ msg: LoomAIMessage) {
        let context = currentAIContext
        guard let target = loomMDTarget(for: context) else { return }
        do {
            let existing = (try? String(contentsOf: target, encoding: .utf8)) ?? ""
            let split = LoomFolderHomeView.splitDescriptionAndNotes(existing)
            let combined = LoomFolderHomeView.rebuildMarkdown(description: msg.content, notes: split.notes)
            try combined.write(to: target, atomically: true, encoding: .utf8)
        } catch {
            aiMessages.append(LoomAIMessage(role: .ai, content: "[error] couldn't save description: \(error.localizedDescription)"))
        }
    }

    private static func appendNote(entry: String, to source: String) -> String {
        let needsLeadingNewline = !source.isEmpty && !source.hasSuffix("\n")
        var working = source + (needsLeadingNewline ? "\n" : "")
        if !source.contains("## Notes") {
            if !working.isEmpty && !working.hasSuffix("\n\n") {
                working += working.hasSuffix("\n") ? "\n" : "\n\n"
            }
            working += "## Notes\n\n"
        } else if !working.hasSuffix("\n\n") {
            working += working.hasSuffix("\n") ? "\n" : "\n\n"
        }
        working += entry
        return working
    }

    /// Send the current draft to the active AI provider with system
    /// prompt = ancestor Loom.md context (Phase B4). The response is
    /// appended to the chat; user explicitly chooses to save it via
    /// Save-as-note / Save-as-description buttons (Phase B3 — user is
    /// the classifier, no intent guessing).
    private func dispatchAIQuery() {
        let trimmed = aiDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !aiThinking else { return }
        aiMessages.append(LoomAIMessage(role: .user, content: trimmed))
        aiDraft = ""
        aiThinking = true
        let context = currentAIContext
        let prompt = trimmed
        Task {
            do {
                let systemPrompt = Self.buildSystemPrompt(context: context)
                let response = try await LoomAI.send(prompt: prompt, systemPrompt: systemPrompt)
                await MainActor.run {
                    aiMessages.append(LoomAIMessage(role: .ai, content: response))
                    aiThinking = false
                }
            } catch {
                await MainActor.run {
                    aiMessages.append(LoomAIMessage(role: .ai, content: "[error] \(error.localizedDescription)"))
                    aiThinking = false
                }
            }
        }
    }

    /// Compose the system prompt by walking up the current location's
    /// path and concatenating each ancestor folder's Loom.md description
    /// (the part before `## Notes`). Phase B4 deepens this; Phase B1+B2
    /// uses the most local description plus the breadcrumb.
    private static func buildSystemPrompt(context: LoomAIContext) -> String {
        var lines: [String] = []
        lines.append("You are an AI study assistant inside Loom, a learning tool.")
        lines.append("The user is working in: \(context.breadcrumb).")
        if let descriptions = ancestorDescriptions(for: context), !descriptions.isEmpty {
            lines.append("")
            lines.append("Context from the user's own folder descriptions:")
            for entry in descriptions {
                lines.append("• [\(entry.label)] \(entry.text)")
            }
        }
        lines.append("")
        lines.append("Treat the user's input as the primary task. When asked to write or restructure content, output markdown only, no commentary.")
        return lines.joined(separator: "\n")
    }

    private struct AncestorDescription {
        let label: String
        let text: String
    }

    private static func ancestorDescriptions(for context: LoomAIContext) -> [AncestorDescription]? {
        guard let resolved = context.resolvedFileURL else { return nil }
        // Walk up from `resolved` to its containing root.
        let allRoots = ContentRootStore.allActiveURLs
        guard let containingRoot = allRoots.first(where: { _, rootURL in
            let rp = rootURL.standardizedFileURL.path
            let fp = resolved.standardizedFileURL.path
            return fp == rp || fp.hasPrefix(rp + "/")
        }) else { return nil }
        let rootURL = containingRoot.value
        var collected: [AncestorDescription] = []
        // Build the ancestor chain from root → ... → containing folder
        var ancestors: [URL] = [rootURL]
        let resolvedDir = resolved.hasDirectoryPath ? resolved : resolved.deletingLastPathComponent()
        let rootPath = rootURL.standardizedFileURL.path
        let resolvedPath = resolvedDir.standardizedFileURL.path
        if resolvedPath.hasPrefix(rootPath + "/") {
            let relative = String(resolvedPath.dropFirst(rootPath.count + 1))
            var cumulative = rootURL
            for segment in relative.split(separator: "/") {
                cumulative = cumulative.appendingPathComponent(String(segment))
                ancestors.append(cumulative)
            }
        }
        let storedRoots = ContentRootStore.loadAll()
        let rootID = containingRoot.key
        for url in ancestors {
            // Read order (Source Fidelity, 2026-04-27): prefer the
            // sandbox-stored Loom.md (where new writes land); fall back
            // to a legacy external Loom.md for ancestors that still
            // hold pre-refactor user content. Never WRITE either side
            // here — this is a read-only AI-context walk.
            let urlPath = url.standardizedFileURL.path
            let storeURL: URL = {
                if urlPath == rootPath {
                    return LoomFileStore.loomMDURL(for: rootID)
                }
                let rel = urlPath.hasPrefix(rootPath + "/")
                    ? String(urlPath.dropFirst(rootPath.count + 1))
                    : ""
                return LoomFileStore.loomMDURL(for: rootID, subPath: rel)
            }()
            let externalURL = url.appendingPathComponent("Loom.md")
            let raw: String? = (try? String(contentsOf: storeURL, encoding: .utf8))
                ?? (try? String(contentsOf: externalURL, encoding: .utf8))
            guard let raw = raw else { continue }
            let descPart = LoomFolderHomeView.splitDescriptionAndNotes(raw).description
            guard !descPart.isEmpty else { continue }
            let label: String
            if url.standardizedFileURL.path == rootURL.standardizedFileURL.path,
               let storedRoot = storedRoots.first(where: { $0.id == containingRoot.key }) {
                label = storedRoot.displayName
            } else {
                label = url.lastPathComponent
            }
            collected.append(AncestorDescription(label: label, text: descPart))
        }
        return collected
    }

    /// Handler for files dropped onto the main window. Stashes the URLs
    /// in `IngestionContext` and pokes the ingestion sheet to consume.
    /// Extracted from the body to keep the SwiftUI compiler happy.
    private func handleDroppedFileURLs(_ providers: [NSItemProvider]) -> Bool {
        var urls: [URL] = []
        let group = DispatchGroup()
        for provider in providers {
            group.enter()
            _ = provider.loadObject(ofClass: URL.self) { url, _ in
                if let url = url { urls.append(url) }
                group.leave()
            }
        }
        group.notify(queue: .main) {
            guard !urls.isEmpty else { return }
            IngestionContext.shared.pendingFileURLs = urls
            NotificationCenter.default.post(name: .loomIngestFileDropped, object: nil)
        }
        return true
    }

    /// One of three mutually-exclusive native overlays on top of the
    /// webview: source file viewer, library overview, or folder home.
    /// Extracted from the detail-column body so the type-checker has a
    /// fighting chance against the rest of the long ContentView body.
    @ViewBuilder
    private var mainPaneOverlay: some View {
        if let activeURL = activeSourceFileURL {
            SourceFileView(loomURL: activeURL) {
                activeSourceFileURL = nil
            }
            .ignoresSafeArea()
            .transition(.opacity)
        } else if showLibrary {
            LoomLibraryView()
                .ignoresSafeArea()
                .transition(.opacity)
        } else if let folderURL = activeFolderHomeURL {
            folderHomeOverlay(for: folderURL)
                .ignoresSafeArea()
                .transition(.opacity)
        }
    }

    /// Resolve a `loom://content/<root-id?>/<path?>` URL to a
    /// (folderURL, displayName, rootID) triple for the folder-home
    /// overlay. Falls back gracefully when the URL is malformed or the
    /// referenced root has been removed.
    @ViewBuilder
    private func folderHomeOverlay(for loomURL: URL) -> some View {
        let resolved = Self.resolveFolderHomeURL(loomURL)
        if let resolved {
            LoomFolderHomeView(
                rootID: resolved.rootID,
                externalFolderURL: resolved.externalFolder,
                displayName: resolved.displayName
            )
        } else {
            VStack(spacing: 6) {
                Text("Couldn't open this folder.")
                    .font(.system(size: 13))
                Text(loomURL.absoluteString)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(NSColor.windowBackgroundColor))
        }
    }

    private struct ResolvedFolderHome {
        /// Sub-folder under the external root if the URL drilled into
        /// one, else the external root itself, else nil for pure pages.
        let externalFolder: URL?
        let displayName: String?
        let rootID: UUID?
    }

    private static func resolveFolderHomeURL(_ loomURL: URL) -> ResolvedFolderHome? {
        guard loomURL.scheme == LoomURLSchemeHandler.scheme,
              loomURL.host == "content" else { return nil }
        let relative = loomURL.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let segments = relative.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        // Multi-root: <uuid>/<rest>. uuid identifies the page; rest
        // (when present) drills into the page's external folder.
        if let firstSeg = segments.first, let rootID = UUID(uuidString: firstSeg) {
            let rest = segments.dropFirst().joined(separator: "/")
            let storedRoot = ContentRootStore.loadAll().first { $0.id == rootID }
            // External folder may not exist (pure `+ Page` root) — that's fine.
            let externalRoot = ContentRootStore.activeURL(for: rootID)
            let externalSubfolder: URL? = {
                guard let externalRoot = externalRoot else { return nil }
                if rest.isEmpty { return externalRoot }
                return externalRoot.appendingPathComponent(rest).standardizedFileURL
            }()
            let displayName: String? = {
                if rest.isEmpty { return storedRoot?.displayName }
                return externalSubfolder?.lastPathComponent
            }()
            return ResolvedFolderHome(
                externalFolder: externalSubfolder,
                displayName: displayName,
                rootID: rootID
            )
        }
        // Legacy single-root fallback (URL without UUID prefix): use
        // first active root verbatim. Rare path; modern code always
        // emits UUID-prefixed URLs.
        guard let firstRootURL = ContentRootStore.allActiveURLs.values.first else { return nil }
        let folder = relative.isEmpty
            ? firstRootURL
            : firstRootURL.appendingPathComponent(relative).standardizedFileURL
        return ResolvedFolderHome(
            externalFolder: folder,
            displayName: folder.lastPathComponent,
            rootID: nil
        )
    }

    @ViewBuilder
    private var detailColumn: some View {
        ZStack {
            switch server.status {
            case .ready:
                ZStack {
                    LoomWebView(url: server.webviewURL, debugState: webState, forcedTheme: webThemeMode)
                        .id(webviewEpoch)
                        .ignoresSafeArea()
                    // Source-file viewer overlays the webview when the user
                    // clicks a PDF (or other source file) in the sidebar.
                    // Sits on top so we never re-route the webview itself —
                    // the webview keeps whatever route it was on (Home /
                    // Sources / Desk) underneath.
                    mainPaneOverlay

                    // AI bar trailing overlay — bronze strip when closed,
                    // 380pt panel when open. Sized to its content and
                    // pinned to the trailing edge via .frame alignment so
                    // the rest of the detail column stays click-through
                    // (SourceFileView's PDFKit, folder-home buttons,
                    // webview navigation are all underneath and must
                    // remain hit-testable).
                    LoomAIBar(
                        isOpen: $aiBarOpen,
                        context: currentAIContext,
                        messages: $aiMessages,
                        draft: $aiDraft,
                        isThinking: $aiThinking,
                        onSend: dispatchAIQuery,
                        onSaveAsNote: saveAIMessageAsNote,
                        onSaveAsDescription: saveAIMessageAsDescription
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                    .allowsHitTesting(true)
                    // Keep the warp-shimmer on top until the webview reports
                    // its first `didFinish`. Without this mask the webview
                    // flashes white (Chromium default bg) for ~200–400ms
                    // before CSS variables from globals.css paint — jarring
                    // against the dark launch shimmer.
                    if !webState.didFirstLoad {
                        StartingView()
                            .ignoresSafeArea()
                            .transition(.opacity)
                    }
                }
                .animation(.easeOut(duration: 0.35), value: webState.didFirstLoad)
                .transition(.opacity)
            case .starting, .idle:
                StartingView()
            case .failed(let msg):
                FailedView(
                    message: msg,
                    targetURL: server.webviewURL,
                    onRetry: { server.start() }
                )
            }

            #if DEBUG
            if showDebugHUD {
                VStack {
                    HStack {
                        Spacer()
                        DevHUD(status: server.status, url: server.webviewURL, webState: webState, isVisible: $showDebugHUD)
                    }
                    Spacer()
                }
                .padding(.top, 14)
                .padding(.trailing, 16)
            }
            #endif
        }
        .animation(.easeInOut(duration: 0.3), value: server.status)
        .background(WindowConfigurator(title: windowTitle, isNight: usesDarkChrome))
        .onAppear {
            showDebugHUD = false
            refreshFirstRunSheetVisibility()
        }
        .onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)) { _ in
            refreshFirstRunSheetVisibility()
        }
        .sheet(isPresented: firstRunSheetBinding) {
            FirstRunProviderSheet(isPresented: $firstRunSheetVisible)
        }
        .sheet(isPresented: $holdQuestionSheetVisible) {
            HoldQuestionSheet(isPresented: $holdQuestionSheetVisible)
        }
        .sheet(isPresented: $addSoanCardSheetVisible) {
            AddSoanCardSheet(isPresented: $addSoanCardSheetVisible)
        }
        .sheet(isPresented: $connectSoanCardsSheetVisible) {
            ConnectSoanCardsSheet(isPresented: $connectSoanCardsSheetVisible)
        }
        .sheet(isPresented: $weavePanelsSheetVisible) {
            WeavePanelsSheet(isPresented: $weavePanelsSheetVisible)
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomShowHoldQuestionDialog)) { _ in
            holdQuestionSheetVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomShowAddSoanCardDialog)) { _ in
            addSoanCardSheetVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomShowConnectSoanCardsDialog)) { _ in
            connectSoanCardsSheetVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomShowWeavePanelsDialog)) { _ in
            weavePanelsSheetVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomContentRootChanged)) { _ in
            webState.didFirstLoad = false
            webviewEpoch &+= 1
            forceHideWebSidebar()
            activeSourceFileURL = nil
            activeFolderHomeURL = nil
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomContentRootsChanged)) { _ in
            // Multi-root list changed (add / remove / rename). Force
            // webview rebuild so its scheme handler picks up the new
            // contentRoots map. Clear overlays ONLY when the active
            // root they referenced is gone (removed). Adding a sibling
            // root shouldn't drop the user out of their current page.
            webState.didFirstLoad = false
            webviewEpoch &+= 1
            forceHideWebSidebar()
            if let url = activeSourceFileURL, !Self.urlPointsToActiveRoot(url) {
                activeSourceFileURL = nil
            }
            if let url = activeFolderHomeURL, !Self.urlPointsToActiveRoot(url) {
                activeFolderHomeURL = nil
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomOpenSourceFile)) { note in
            if let url = note.userInfo?["url"] as? URL {
                activeSourceFileURL = url
                activeFolderHomeURL = nil
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomShowFolderHome)) { note in
            if let url = note.userInfo?["url"] as? URL {
                activeFolderHomeURL = url
                activeSourceFileURL = nil
                showLibrary = false
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomShowLibrary)) { _ in
            showLibrary = true
            activeSourceFileURL = nil
            activeFolderHomeURL = nil
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomJumpToPDFAnchor)) { note in
            handleAnchorJump(note)
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomShowInspectorTab)) { note in
            // Legacy "inspector tab" notification — treat the tab name
            // as the surface to switch to. Single-slot model: replace
            // content instead of opening a side panel.
            if let raw = note.userInfo?["tab"] as? String,
               let surface = Self.surface(from: raw) {
                activeSurface = surface
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomOpenRehearsalWindow)) { _ in
            activeSurface = .rehearsal
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomOpenSettings)) { _ in
            openSettings()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomShuttleNavigate)) { note in
            // Any sidebar / Shuttle doc navigation returns to the
            // webview surface automatically. CRITICAL: also clear any
            // PDF / folder-home overlay — otherwise the overlay keeps
            // painting on top of the freshly-navigated webview, and
            // every subsequent click lands on the phantom layer.
            // (User's "click has no effect" symptom from PDF flow.)
            // EXCEPTION: if the navigation target is a content URL
            // (loom://content/...) the overlay handlers will set the
            // appropriate URL — let them; just reset surface to .web.
            activeSurface = .web
            let path = (note.userInfo?["path"] as? String) ?? ""
            if !path.hasPrefix("loom://content/") {
                activeSourceFileURL = nil
                activeFolderHomeURL = nil
            }
        }
        // Drop-anywhere ingestion: files dropped onto the main window
        // stash into IngestionContext and open the native Ingestion
        // window, which auto-consumes on appear. Plain text only (the
        // underlying runner enforces the 200KB + UTF-8 filter).
        .onDrop(of: [.fileURL], isTargeted: nil, perform: handleDroppedFileURLs)
        // No `.toolbar { }` — every former toolbar action has a keyboard
        // shortcut (⌘[ / ⌘] / ⌘R / ⌘K) or is reachable via sidebar.
        // Mac-native chrome is the window title bar only; Arc / Xcode /
        // Mail pattern. Former duplication + visual clutter gone.
    }
}

/// Minimal literary sheet for minting a `LoomPursuit`. Triggered via
/// ⌘⇧P / Edit-menu "Hold a Question…" / Shuttle. Three fields — the
/// question itself, its attentional weight, and a pair of Cancel/Hold
/// buttons. The saved pursuit lands in SwiftData and wakes
/// `PursuitsClient`, which re-fetches the native pursuit projection on
/// the next render pass without a reload.
struct HoldQuestionSheet: View {
    @Binding var isPresented: Bool
    @State private var question: String = ""
    @State private var weight: String = "secondary"

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Hold a Question")
                .font(.custom("Cormorant Garamond", size: 22).italic())

            TextField("What question is your mind holding?", text: $question, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(3...6)
                .font(.custom("EB Garamond", size: 14))

            Picker("Weight", selection: $weight) {
                Text("Primary (close to the body)").tag("primary")
                Text("Secondary (in middle distance)").tag("secondary")
                Text("Tertiary (at the horizon)").tag("tertiary")
            }

            HStack {
                Spacer()
                Button("Cancel") { isPresented = false }
                Button("Hold") {
                    let trimmed = question.trimmingCharacters(in: .whitespaces)
                    _ = try? LoomPursuitWriter.createPursuit(question: trimmed, weight: weight)
                    isPresented = false
                }
                .disabled(question.trimmingCharacters(in: .whitespaces).isEmpty)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 480)
        .background(LoomTokens.paper)
    }
}

/// Sheet for adding a card to the Sōan thinking-draft table. Opened via
/// ⌘⇧D / Edit-menu "Add a Sōan Card…" / Shuttle. Three fields — kind
/// (thesis / instance / counter / question / fog / weft / sketch), body,
/// and an optional "Book · section" source. On save, mints a
/// `LoomSoanCard` at a random position inside a 600×400 spread so cards
/// don't stack when the learner adds a few in a row; the web surface
/// picks up the mirrored row immediately via `.loomSoanChanged`.
struct AddSoanCardSheet: View {
    @Binding var isPresented: Bool
    @State private var kind: String = "thesis"
    // `cardBody` rather than `body` — the latter collides with the
    // SwiftUI `View.body` computed-property requirement on this struct.
    @State private var cardBody: String = ""
    @State private var source: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Add a Card to Sōan")
                .font(.custom("Cormorant Garamond", size: 22).italic())

            Picker("Kind", selection: $kind) {
                Text("Thesis").tag("thesis")
                Text("Instance").tag("instance")
                Text("Counter").tag("counter")
                Text("Question").tag("question")
                Text("Fog (half-formed)").tag("fog")
                Text("Weft (echo)").tag("weft")
                Text("Sketch").tag("sketch")
            }

            TextField("Body — what is this card holding?", text: $cardBody, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(3...8)
                .font(.custom("EB Garamond", size: 14))

            TextField("Source (optional) — 'Book · section'", text: $source)
                .textFieldStyle(.roundedBorder)
                .font(.custom("EB Garamond", size: 13))

            HStack {
                Spacer()
                Button("Cancel") { isPresented = false }
                Button("Add") {
                    // Random-ish position inside the initial viewport so
                    // the second card doesn't stack on the first. The
                    // 40pt floor keeps cards off the canvas header; 600×400
                    // matches the typical sheet's first-screen area.
                    let x = 40 + Double.random(in: 0..<600)
                    let y = 40 + Double.random(in: 0..<400)
                    let trimmedBody = cardBody.trimmingCharacters(in: .whitespaces)
                    let trimmedSource = source.trimmingCharacters(in: .whitespaces)
                    _ = try? LoomSoanWriter.createCard(
                        kind: kind,
                        body: trimmedBody,
                        x: x,
                        y: y,
                        source: trimmedSource
                    )
                    isPresented = false
                }
                .disabled(cardBody.trimmingCharacters(in: .whitespaces).isEmpty)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 520)
        .background(LoomTokens.paper)
    }
}

/// Sheet for creating a relation between two existing Sōan cards. Opened
/// via ⌘⇧L / Edit-menu "Connect Sōan Cards…" / Shuttle. Loads the full
/// card list on appear, lets the learner pick a `from` + `to` + relation
/// kind (support = solid bronze, echo = dashed muted), then mints a
/// `LoomSoanEdge` via `LoomSoanWriter.createEdge`. The coordinator
/// picks up `.loomSoanChanged` and wakes SoanClient so it re-fetches the
/// SVG overlay projection without a reload.
struct ConnectSoanCardsSheet: View {
    @Binding var isPresented: Bool
    @State private var fromCardId: String = ""
    @State private var toCardId: String = ""
    @State private var kind: String = "support"
    @State private var cards: [(id: String, label: String)] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Connect Two Cards")
                .font(.custom("Cormorant Garamond", size: 22).italic())

            if cards.count < 2 {
                Text("Sōan needs at least two cards before you can connect them. Add a card with ⌘⇧D first.")
                    .font(.custom("EB Garamond", size: 13))
                    .foregroundStyle(LoomTokens.muted)
            } else {
                Picker("From", selection: $fromCardId) {
                    Text("(choose a card)").tag("")
                    ForEach(cards, id: \.id) { c in
                        Text(c.label).tag(c.id)
                    }
                }

                Picker("To", selection: $toCardId) {
                    Text("(choose a card)").tag("")
                    ForEach(cards, id: \.id) { c in
                        Text(c.label).tag(c.id)
                    }
                }

                Picker("Relation", selection: $kind) {
                    Text("support (solid bronze)").tag("support")
                    Text("echo (dashed muted)").tag("echo")
                }
            }

            HStack {
                Spacer()
                Button("Cancel") { isPresented = false }
                Button("Connect") {
                    _ = try? LoomSoanWriter.createEdge(fromCardId: fromCardId, toCardId: toCardId, kind: kind)
                    isPresented = false
                }
                .disabled(cards.count < 2 || fromCardId.isEmpty || toCardId.isEmpty || fromCardId == toCardId)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 480)
        .background(LoomTokens.paper)
        .onAppear {
            let all = (try? LoomSoanWriter.allCards()) ?? []
            cards = all.map { c in
                let snippet = c.body.prefix(40)
                let label = c.title.isEmpty ? "\(c.kind) · \(snippet)" : "\(c.kind) · \(c.title)"
                return (c.id, label)
            }
        }
    }
}

/// Sheet for weaving two panels together — an explicit, directed
/// relation the learner asserts between crystallized pieces of their
/// understanding. Opened via ⌘⇧W / Edit-menu "Weave Two Panels…" /
/// Shuttle. Loads qualifying reading-kind traces on appear as the
/// panel list, lets the learner pick a `from` + `to` + kind
/// (supports / contradicts / elaborates / echoes) + optional
/// rationale, then mints a `LoomWeave` via
/// `LoomWeaveWriter.createWeave`. The coordinator picks up
/// `.loomWeaveChanged` and wakes `WeavesClient` so it re-fetches the
/// constellation projection without a reload.
struct WeavePanelsSheet: View {
    @Binding var isPresented: Bool
    @State private var fromPanelId: String = ""
    @State private var toPanelId: String = ""
    @State private var kind: String = "supports"
    @State private var rationale: String = ""
    @State private var panels: [(id: String, title: String)] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Weave Two Panels")
                .font(.custom("Cormorant Garamond", size: 22).italic())

            if panels.count < 2 {
                Text("Weaving needs at least two panels. Crystallize a couple of readings first — a panel is a reading trace that has grown at least one thought or summary.")
                    .font(.custom("EB Garamond", size: 13))
                    .foregroundStyle(LoomTokens.muted)
            } else {
                Picker("From", selection: $fromPanelId) {
                    Text("(choose a panel)").tag("")
                    ForEach(panels, id: \.id) { p in
                        Text(p.title).tag(p.id)
                    }
                }

                Picker("To", selection: $toPanelId) {
                    Text("(choose a panel)").tag("")
                    ForEach(panels, id: \.id) { p in
                        Text(p.title).tag(p.id)
                    }
                }

                Picker("Relation", selection: $kind) {
                    Text("supports").tag("supports")
                    Text("contradicts").tag("contradicts")
                    Text("elaborates").tag("elaborates")
                    Text("echoes").tag("echoes")
                }

                TextField("Rationale (optional)", text: $rationale, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(2...5)
                    .font(.custom("EB Garamond", size: 13))
            }

            HStack {
                Spacer()
                Button("Cancel") { isPresented = false }
                Button("Weave") {
                    let trimmed = rationale.trimmingCharacters(in: .whitespaces)
                    _ = try? LoomWeaveWriter.createWeave(
                        fromPanelId: fromPanelId,
                        toPanelId: toPanelId,
                        kind: kind,
                        rationale: trimmed
                    )
                    isPresented = false
                }
                .disabled(panels.count < 2 || fromPanelId.isEmpty || toPanelId.isEmpty || fromPanelId == toPanelId)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 520)
        .background(LoomTokens.paper)
        .onAppear {
            // Load panel list from SwiftData traces. Only reading-kind
            // traces with a non-empty source title qualify — matches the
            // mirror's `buildPanelsPayload` gate well enough for picker
            // purposes. Cap at 100 so the dropdown stays sane.
            let traces = (try? LoomTraceWriter.allTraces()) ?? []
            panels = traces
                .filter { $0.kind == "reading" }
                .compactMap { t -> (String, String)? in
                    guard let title = t.sourceTitle, !title.isEmpty else { return nil }
                    return (t.id, title)
                }
                .prefix(100)
                .map { ($0.0, $0.1) }
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

/// Makes the title bar transparent and lets the web surface occupy the full content view.
struct WindowConfigurator: NSViewRepresentable {
    let title: String
    let isNight: Bool

    private func configure(_ window: NSWindow) {
        window.tabbingMode = .disallowed
        if window.tabGroup?.isTabBarVisible == true {
            window.toggleTabBar(nil)
        }
        window.appearance = NSAppearance(named: isNight ? .darkAqua : .aqua)
        window.titlebarAppearsTransparent = true
        // Hide the NSWindow-rendered title entirely. macOS draws
        // that text using a mechanism that doesn't follow our
        // `.toolbarColorScheme`/`containerBackground` stack on
        // macOS 26 — we saw "Loom" stay dark on night chrome even
        // with window.appearance = .darkAqua set. The title is
        // re-rendered as a SwiftUI ToolbarItem(.principal) so it
        // inherits the toolbar's color scheme cleanly.
        window.titleVisibility = .hidden
        window.styleMask.insert(.fullSizeContentView)
        window.isMovableByWindowBackground = true
        window.backgroundColor = NSColor.windowBackgroundColor
        window.title = "Loom"  // keep the system window title stable; page title stays in the toolbar
        // Remember window size and position across launches
        window.setFrameAutosaveName("LoomMainWindow")
    }

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            configure(window)
        }
        return view
    }
    func updateNSView(_ nsView: NSView, context: Context) {
        guard let window = nsView.window else { return }
        configure(window)
    }
}

/// Minimal loading state — 8 warp lines with shimmer, matching HomeLoom.
/// No text, no spinner, no "loading..." — §1/§21.
struct StartingView: View {
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
        }
        .onAppear {
            withAnimation(.linear(duration: 4).repeatForever(autoreverses: false)) {
                phase = .pi * 2
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // LoomTokens.paper (dynamic) instead of `.background` (system
        // windowBackgroundColor). Without this the shimmer sat on a
        // slightly cooler system cream/gray than the webview's paper
        // tone, so the crossfade from shimmer → first-paint flashed
        // the seam by ~1 hex step. Matching both sides eliminates it.
        .background(LoomTokens.paper)
    }
}

/// Polished failure screen. Replaces the raw "Could not connect" + monospace
/// error block with warmer copy + actionable buttons; the raw details stay
/// available behind a disclosure so a curious user (or a support session)
/// can still see them.
struct FailedView: View {
    let message: String
    let targetURL: URL
    let onRetry: () -> Void
    @State private var detailsExpanded: Bool = false
    // See KnowledgeSidebarView for why this replaces the old selector.
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 38, weight: .light))
                .foregroundStyle(LoomTokens.muted)

            VStack(spacing: 6) {
                // Cormorant italic display title — identity chrome, same
                // treatment as Frontispiece / KeyboardHelp / AskAI.
                Text("Loom couldn't load")
                    .font(LoomTokens.display(size: 22, italic: true))
                    .foregroundStyle(LoomTokens.ink)
                Text("Try again, or open Settings to pick your study folder.")
                    .font(LoomTokens.serif(size: 13, italic: true))
                    .foregroundStyle(LoomTokens.ink2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                Button("Try Again") { onRetry() }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                    .tint(LoomTokens.thread)
                Button("Open Settings") {
                    openSettings()
                }
                .buttonStyle(.bordered)
                .tint(LoomTokens.thread)
            }
            .padding(.top, 2)

            DisclosureGroup("Details", isExpanded: $detailsExpanded) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(targetURL.absoluteString)
                        .font(LoomTokens.mono(size: 10))
                        .foregroundStyle(LoomTokens.muted)
                    ScrollView {
                        Text(message)
                            .font(LoomTokens.mono(size: 10))
                            .foregroundStyle(LoomTokens.muted)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 140)
                }
                .padding(.top, 4)
            }
            .font(LoomTokens.serif(size: 11, italic: true))
            .foregroundStyle(LoomTokens.muted)
            .frame(maxWidth: 420)
            .padding(.top, 6)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(LoomTokens.paper)
    }
}

struct LoomWebView: NSViewRepresentable {
    let url: URL
    let debugState: WebDebugState
    let forcedTheme: String

    func makeCoordinator() -> Coordinator { Coordinator(debugState: debugState) }

    static func themeSyncScript(mode: String) -> String {
        let escaped = mode
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        // Palette literals derived from `LoomTokens.ds*Hex*` so the JS
        // injection stays in lockstep with the Swift-side canonical
        // tokens. Editing the hex requires editing it in LoomTokens
        // only — never re-edit this string by hand.
        return """
        (() => {
          try {
            const mode = '\(escaped)';
            const root = document.documentElement;
            const palette = mode === 'dark'
              ? {
                  bg: '\(LoomTokens.dsPaperDeepHexDark)',
                  fg: '\(LoomTokens.dsInk1HexDark)',
                  fgSecondary: '\(LoomTokens.dsInk2HexDark)',
                  muted: '\(LoomTokens.dsMutedHexDark)',
                  accent: '\(LoomTokens.dsThreadHex)',
                  accentText: '\(LoomTokens.dsThreadTextHexDark)',
                  paperDeep: '#1A1815',
                  paper: '#221E18',
                  paperUp: '#2B2620',
                  paperCard: '#332E27',
                  ink1: '#E8E0CE',
                  ink2: '#B9AE93',
                  ink3: '#8F8571',
                  hair: 'rgba(232, 224, 206, 0.10)',
                  hairFaint: 'rgba(232, 224, 206, 0.05)',
                  thread: '\(LoomTokens.dsThreadHex)',
                  threadMuted: 'rgba(196, 164, 104, 0.55)'
                }
              : {
                  bg: '\(LoomTokens.dsPaperDeepHexLight)',
                  fg: '\(LoomTokens.dsInk1HexLight)',
                  fgSecondary: '\(LoomTokens.dsInk2HexLight)',
                  muted: '\(LoomTokens.dsMutedHexLight)',
                  accent: '\(LoomTokens.dsThreadHex)',
                  accentText: '\(LoomTokens.dsThreadTextHexLight)',
                  paperDeep: '#F4F0E4',
                  paper: '#F4F0E4',
                  paperUp: '#FAF7EC',
                  paperCard: '#EADFC9',
                  ink1: '#2A2520',
                  ink2: '#4A4339',
                  ink3: '#8A8373',
                  hair: 'rgba(26, 23, 18, 0.08)',
                  hairFaint: 'rgba(26, 23, 18, 0.04)',
                  thread: '\(LoomTokens.dsThreadTextHexLight)',
                  threadMuted: 'rgba(122, 94, 46, 0.55)'
                };
            const apply = () => {
              try { localStorage.setItem('wiki:theme', mode); } catch (_) {}
              root.dataset.loomTheme = mode;
              root.classList.toggle('dark', mode === 'dark');
              root.classList.toggle('light', mode === 'light');
              root.style.colorScheme = mode;
              root.style.setProperty('--bg', palette.bg);
              root.style.setProperty('--fg', palette.fg);
              root.style.setProperty('--fg-secondary', palette.fgSecondary);
              root.style.setProperty('--muted', palette.muted);
              root.style.setProperty('--accent', palette.accent);
              root.style.setProperty('--accent-text', palette.accentText);
              root.style.setProperty('--paper-deep', palette.paperDeep);
              root.style.setProperty('--paper', palette.paper);
              root.style.setProperty('--paper-up', palette.paperUp);
              root.style.setProperty('--paper-card', palette.paperCard);
              root.style.setProperty('--ink-1', palette.ink1);
              root.style.setProperty('--ink-2', palette.ink2);
              root.style.setProperty('--ink-3', palette.ink3);
              root.style.setProperty('--hair', palette.hair);
              root.style.setProperty('--hair-faint', palette.hairFaint);
              root.style.setProperty('--thread', palette.thread);
              root.style.setProperty('--thread-muted', palette.threadMuted);
            };
            apply();
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', apply, { once: true });
            }
            requestAnimationFrame(apply);
            setTimeout(apply, 80);
            setTimeout(apply, 240);
          } catch (_) {}
        })();
        """
    }

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
            let routedRelative = Coordinator.flatDocPathIfNeeded(storedRelative)
            let storedComponents = URLComponents(string: routedRelative)
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            components?.path = storedComponents?.path ?? routedRelative
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

        // Phase 1 of architecture inversion: register the `loom://` scheme
        // handler on every webview. Hosts supported:
        //   loom://content/<root-id>/<path> → user's picked study folder (multi-root)
        //   loom://content/<path>           → legacy single-root fallback
        //   loom://bundle/<path>            → app Resources (pre-rendered MDX)
        // Traffic still flows through localhost:3001 for now; registering the
        // handler means progressive migration is a per-surface load-URL change.
        var hostRoots: [String: URL] = [:]
        // Multi-root content URLs: handler resolves loom://content/<uuid>/...
        // by looking up the uuid in this map. Legacy URLs without a uuid
        // still resolve via hostRoots["content"] (whichever root sorts first).
        let contentRoots = ContentRootStore.allActiveURLs
        if let firstRootURL = contentRoots.values.first {
            hostRoots["content"] = firstRootURL
        } else if let contentRootPath = LoomRuntimePaths.resolveContentRoot() {
            hostRoots["content"] = URL(fileURLWithPath: contentRootPath)
        }
        // `bundle` host serves the pre-rendered Next.js static export.
        // Preference order:
        //   1. $LOOM_STATIC_EXPORT — explicit override (repo dev)
        //   2. LoomProject/.next-export/ — detected dev layout next to app
        //   3. Bundle.main.resourceURL — production app bundle
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
            context.coordinator.loomSchemeHandler = handler
        }

        // userContentController is always attached now — the folder-picker
        // bridge used by the onboarding flow needs it in Release builds too.
        let userContentController = WKUserContentController()
        userContentController.add(context.coordinator, name: "loomChooseFolder")

        // Phase 3 of architecture inversion: expose Swift-side AI calls to
        // the webview. `window.webkit.messageHandlers.loomAI.postMessage(...)`
        // returns a Promise resolved with the AI text. Once every fetch(
        // '/api/chat') call migrates, the Next.js chat route gets deleted.
        let aiBridge = AIBridgeHandler()
        userContentController.addScriptMessageHandler(
            aiBridge,
            contentWorld: .page,
            name: AIBridgeHandler.name
        )
        context.coordinator.aiBridge = aiBridge

        // Streaming companion. Web code calls `loomAIStream.postMessage(...)`
        // and receives deltas via `window.__loomAI.onChunk(...)` (set up by
        // lib/ai-stream-bridge.ts at module load time). Used by ChatFocus.
        let aiStreamBridge = AIStreamBridgeHandler()
        userContentController.add(aiStreamBridge, name: AIStreamBridgeHandler.name)
        context.coordinator.aiStreamBridge = aiStreamBridge

        // Phase 2 of architecture inversion: IDB → SwiftData one-way
        // migration. Web posts its IDB export here; Swift populates the
        // SwiftData store. Runs once per install (status in UserDefaults).
        let migrationBridge = MigrationBridgeHandler()
        userContentController.add(migrationBridge, name: MigrationBridgeHandler.name)
        context.coordinator.migrationBridge = migrationBridge

        // Phase 4: small-action navigation bridge. Web components that used
        // to open the deleted in-webview SettingsPanel now post through
        // here to show the native Settings scene, About window, etc.
        let navBridge = NavigationBridgeHandler()
        userContentController.add(navBridge, name: NavigationBridgeHandler.name)
        context.coordinator.navBridge = navBridge

        // Source-library shelf mutations. Browser/dev mode uses
        // `/api/source-library/*`; static native mode has no API server,
        // so `/sources` posts create/rename/delete/re-shelve actions here.
        let sourceLibraryBridge = SourceLibraryBridgeHandler()
        userContentController.addScriptMessageHandler(
            sourceLibraryBridge,
            contentWorld: .page,
            name: SourceLibraryBridgeHandler.name
        )
        context.coordinator.sourceLibraryBridge = sourceLibraryBridge

        // Phase 5: native NLEmbedding replaces /api/embed's Ollama dep.
        // `window.webkit.messageHandlers.loomEmbed.postMessage({text})`
        // resolves with `{ vector, dims, model }`.
        let embedBridge = EmbeddingBridgeHandler()
        userContentController.addScriptMessageHandler(
            embedBridge,
            contentWorld: .page,
            name: EmbeddingBridgeHandler.name
        )
        context.coordinator.embedBridge = embedBridge

        // Phase 7.1: schema-corrections writes. Mirrors the source-library
        // bridge pattern — the static native shell has no Next.js API
        // server so the Course Context strip posts corrections through
        // this reply bridge instead of `POST /api/schema-corrections`.
        let schemaCorrectionsBridge = LoomSchemaCorrectionsBridgeHandler()
        userContentController.addScriptMessageHandler(
            schemaCorrectionsBridge,
            contentWorld: .page,
            name: LoomSchemaCorrectionsBridgeHandler.name
        )
        context.coordinator.schemaCorrectionsBridge = schemaCorrectionsBridge

        // Phase 7.2: per-pursuit hide writes. Same idiom as the schema-
        // corrections bridge — the static native shell has no Next.js
        // API server so the Pursuits room posts hide / restore through
        // this reply bridge instead of `POST /api/pursuit-hide`.
        let pursuitHideBridge = LoomPursuitHideBridgeHandler()
        userContentController.addScriptMessageHandler(
            pursuitHideBridge,
            contentWorld: .page,
            name: LoomPursuitHideBridgeHandler.name
        )
        context.coordinator.pursuitHideBridge = pursuitHideBridge

        // Phase 7.3: extractor-anchor dismissal writes. Same idiom —
        // reading-page provisional anchors post `dismiss` through this
        // reply bridge instead of `POST /api/extractor-anchors-dismissed`.
        // Confirmation flows do NOT route here (they write to IndexedDB
        // via the existing capture path); only dismissal lands on disk.
        let extractorAnchorsBridge = LoomExtractorAnchorsBridgeHandler()
        userContentController.addScriptMessageHandler(
            extractorAnchorsBridge,
            contentWorld: .page,
            name: LoomExtractorAnchorsBridgeHandler.name
        )
        context.coordinator.extractorAnchorsBridge = extractorAnchorsBridge

        #if DEBUG
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
        #endif

        // Native shell owns the sidebar now — suppress the web Sidebar
        // component at mount by setting a flag at document-start. Also
        // write `wiki:sidebar:mode = "hidden"` into localStorage as a
        // belt-and-suspenders fallback for any old code paths still
        // reading the mode.
        let suppressWebSidebarScript = """
        (() => {
          try {
            window.__loomSuppressWebSidebar = true;
            localStorage.setItem('wiki:sidebar:mode', 'hidden');
          } catch (_) {}
        })();
        """
        userContentController.addUserScript(
            WKUserScript(
                source: suppressWebSidebarScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        userContentController.addUserScript(
            WKUserScript(
                source: Self.themeSyncScript(mode: forcedTheme),
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        if let initialMirrorScript = LoomWebView.Coordinator.initialMirrorBootstrapScript() {
            userContentController.addUserScript(
                WKUserScript(
                    source: initialMirrorScript,
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                )
            )
        }

        // Vellum tokens — mirror of loom-tokens.jsx V object. Exposes
        // `--loom-paper`, `--loom-ink`, `--loom-thread`, `--loom-serif`,
        // etc. on `:root` so every web surface can migrate to the shared
        // palette one selector at a time. Web-side components can adopt
        // the tokens progressively; nothing breaks if a component still
        // uses its old colors — they simply live alongside the new ones.
        userContentController.addUserScript(
            WKUserScript(
                source: LoomTokens.cssInjectionScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        config.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        context.coordinator.fallbackURL = url
        // Transparent background — the SwiftUI parent paints Vellum
        // paper/night behind the webview, so between page unload and
        // the next page's first paint the user sees warm paper, not
        // a white Chromium flash. Fixes the Atlas-click flicker
        // reported 2026-04-22 night.
        webView.setValue(false, forKey: "drawsBackground")
        LoomWebViewInteractionPolicy.apply(to: webView)

        loadIfNeeded(webView, coordinator: context.coordinator)
        context.coordinator.syncState(from: webView)
        context.coordinator.webView = webView

        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.triggerLearn),
            name: .loomLearn,
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
            selector: #selector(Coordinator.wipeWebStorage),
            name: .loomWipeWebStorage,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.handleShuttleNavigate(_:)),
            name: .loomShuttleNavigate,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.handleSetWebSidebarMode(_:)),
            name: .loomSetWebSidebarMode,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.handleOpenAskAI),
            name: .loomOpenAskAI,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.handleOpenRehearsal),
            name: .loomOpenRehearsal,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.zoomIn),
            name: .loomZoomIn,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.zoomOut),
            name: .loomZoomOut,
            object: nil
        )
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.zoomReset),
            name: .loomZoomReset,
            object: nil
        )
        // Any native-side trace mutation wakes web panel surfaces so they
        // re-fetch the authoritative `loom://native/panels...` projection
        // without a page reload.
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.handleTraceChanged),
            name: .loomTraceChanged,
            object: nil
        )
        // Pursuit mutations — LoomPursuitWriter posts .loomPursuitChanged
        // after every create / update. Wake web surfaces so they re-fetch
        // `loom://native/pursuits...`.
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.handlePursuitChanged),
            name: .loomPursuitChanged,
            object: nil
        )
        // Sōan mutations — LoomSoanWriter posts .loomSoanChanged after
        // every card / edge mutation. Fire `loom-soan-updated` so the web
        // surface re-fetches `loom://native/soan.json`.
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.handleSoanChanged),
            name: .loomSoanChanged,
            object: nil
        )
        // Weave mutations — LoomWeaveWriter posts .loomWeaveChanged
        // after every create / updateRationale / delete. Fire
        // `loom-weaves-updated` so WeavesClient can overlay explicit
        // weaves on top of the docId-derived edges it already draws.
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.handleWeaveChanged),
            name: .loomWeaveChanged,
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
        context.coordinator.applyTheme(forcedTheme, to: nsView)
    }

    static func dismantleNSView(_ nsView: WKWebView, coordinator: Coordinator) {
        coordinator.cleanup()
        for recognizer in nsView.gestureRecognizers where recognizer is NSMagnificationGestureRecognizer {
            nsView.removeGestureRecognizer(recognizer)
        }
        nsView.stopLoading()
        nsView.navigationDelegate = nil
        nsView.configuration.userContentController.removeScriptMessageHandler(forName: "loomChooseFolder")
        #if DEBUG
        nsView.configuration.userContentController.removeScriptMessageHandler(forName: "loomDebug")
        #endif
    }

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler, NSGestureRecognizerDelegate {
        weak var webView: WKWebView?
        var loomSchemeHandler: LoomURLSchemeHandler?
        var aiBridge: AIBridgeHandler?
        var aiStreamBridge: AIStreamBridgeHandler?
        var migrationBridge: MigrationBridgeHandler?
        var navBridge: NavigationBridgeHandler?
        var sourceLibraryBridge: SourceLibraryBridgeHandler?
        var embedBridge: EmbeddingBridgeHandler?
        var schemaCorrectionsBridge: LoomSchemaCorrectionsBridgeHandler?
        var pursuitHideBridge: LoomPursuitHideBridgeHandler?
        var extractorAnchorsBridge: LoomExtractorAnchorsBridgeHandler?
        var lastRequestedURL: URL?
        var fallbackURL: URL?
        let debugState: WebDebugState
        private var blankPageWorkItem: DispatchWorkItem?
        private var isInReviewMode = false
        private var fallbackCheckGeneration = 0
        private var lastChunkRecoveryAt: Date?
        private var lastProcessTerminationRecoveryAt: Date?
        private var lastRuntimeRecoveryAt: Date?
        private var appliedTheme: String?

        init(debugState: WebDebugState) {
            self.debugState = debugState
        }

        func applyTheme(_ mode: String, to webView: WKWebView) {
            guard appliedTheme != mode else { return }
            appliedTheme = mode
            webView.evaluateJavaScript(LoomWebView.themeSyncScript(mode: mode), completionHandler: nil)
        }

        private func revealFirstPaintIfNeeded(in webView: WKWebView, reason: String) {
            guard !debugState.didFirstLoad else { return }
            debugState.didFirstLoad = true
            NSLog("[Loom] first paint revealed: %@", reason)
            purgeLegacyMirrorStorageInWebview()
        }

        private func scheduleFirstPaintFallback(for webView: WKWebView) {
            let generation = fallbackCheckGeneration
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.85) { [weak self, weak webView] in
                guard let self = self, let webView = webView else { return }
                guard self.fallbackCheckGeneration == generation else { return }
                guard !self.debugState.didFirstLoad else { return }

                webView.evaluateJavaScript("""
                    (() => {
                      const root = document.querySelector('main') || document.body;
                      const text = (root?.innerText || '').replace(/\\s+/g, ' ').trim();
                      return { readyState: document.readyState, textLength: text.length };
                    })()
                """) { result, _ in
                    guard self.fallbackCheckGeneration == generation else { return }
                    guard !self.debugState.didFirstLoad else { return }
                    guard let info = result as? [String: Any] else { return }
                    let readyState = info["readyState"] as? String ?? ""
                    let textLength = info["textLength"] as? Int ?? 0
                    if readyState != "loading" || textLength > 0 {
                        self.revealFirstPaintIfNeeded(in: webView, reason: "didCommit fallback")
                    }
                }
            }
        }

        /// Reduce a webview URL to the canonical search-index `href` shape
        /// (e.g. `loom://bundle/wiki/foo.html` → `/wiki/foo`). Returns nil
        /// for non-doc URLs (home, settings, /_next, API, etc.) so the
        /// Recent list stays meaningful.
        static func normalizedDocHref(from url: URL) -> String? {
            if url.path == "/doc.html" || url.path == "/doc" {
                guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                      let href = components.queryItems?.first(where: { $0.name == "href" })?.value,
                      href.hasPrefix("/wiki/") || href.hasPrefix("/knowledge/") || href.hasPrefix("/uploads/")
                else { return nil }
                return href
            }
            var path = url.path
            if path.hasSuffix(".html") { path.removeLast(5) }
            else if path.hasSuffix(".mdx") { path.removeLast(4) }
            if path.isEmpty || path == "/index" || path == "/" { return nil }
            // Only track the two top-level doc roots the search index covers.
            guard path.hasPrefix("/wiki/") || path.hasPrefix("/knowledge/") || path.hasPrefix("/uploads/") else { return nil }
            return path
        }

        static func flatDocPathIfNeeded(_ relative: String) -> String {
            guard var relativeComponents = URLComponents(string: relative) else {
                return relative
            }
            let path = relativeComponents.path

            if path.hasPrefix("/uploads/") {
                var components = URLComponents()
                components.path = "/doc"
                components.queryItems = [URLQueryItem(name: "href", value: relative)]
                return components.string ?? "/doc"
            }

            if path.hasPrefix("/knowledge/") {
                let parts = path.split(separator: "/").map(String.init)
                if parts.count == 2 {
                    var components = URLComponents()
                    components.path = "/collection"
                    components.queryItems = [URLQueryItem(name: "slug", value: parts[1])]
                    return components.string ?? "/collection"
                }
                if parts.count >= 3 {
                    if parts[2] == "cowork" {
                        var components = URLComponents()
                        components.path = "/collection"
                        components.queryItems = [URLQueryItem(name: "slug", value: parts[1])]
                        return components.string ?? "/collection"
                    }
                    var components = URLComponents()
                    components.path = "/doc"
                    components.queryItems = [URLQueryItem(name: "href", value: relative)]
                    return components.string ?? "/doc"
                }
            }

            if path.hasPrefix("/panel/"), path.count > "/panel/".count {
                let id = String(path.dropFirst("/panel/".count))
                relativeComponents.path = "/panel"
                var items = (relativeComponents.queryItems ?? []).filter { $0.name != "panelId" }
                items.insert(URLQueryItem(name: "panelId", value: id), at: 0)
                relativeComponents.queryItems = items
                return relativeComponents.string ?? "/panel"
            }

            if path.hasPrefix("/pursuit/"), path.count > "/pursuit/".count {
                let id = String(path.dropFirst("/pursuit/".count))
                relativeComponents.path = "/pursuit"
                var items = (relativeComponents.queryItems ?? []).filter { $0.name != "pursuitId" }
                items.insert(URLQueryItem(name: "pursuitId", value: id), at: 0)
                relativeComponents.queryItems = items
                return relativeComponents.string ?? "/pursuit"
            }

            return relative
        }

        static func bundleURL(for relative: String) -> URL? {
            let routed = flatDocPathIfNeeded(relative)
            guard let routedComponents = URLComponents(string: routed) else { return nil }
            var bundleComponents = URLComponents()
            bundleComponents.scheme = LoomURLSchemeHandler.scheme
            bundleComponents.host = "bundle"
            bundleComponents.path = routedComponents.path == "/" ? "/index.html" : "\(routedComponents.path).html"
            bundleComponents.queryItems = routedComponents.queryItems
            bundleComponents.fragment = routedComponents.fragment
            return bundleComponents.url
        }

        static let recentHrefsKey = "loom.sidebar.recentHrefs"
        static let recentRecordsKey = "loom.sidebar.recentRecords.v2"
        static let recentHrefsMax = 10

        /// Legacy browser-preview fallback key, shared with
        /// `lib/loom-panel-records.ts`. Native mode uses
        /// `loom://native/panels.json` instead.
        static let panelsStorageKey = "loom.panels.v1"

        /// Legacy browser-preview fallback key, shared with
        /// `lib/loom-pursuit-records.ts`. Native mode uses
        /// `loom://native/pursuits.json` instead.
        static let pursuitsStorageKey = "loom.pursuits.v1"

        /// Legacy browser-preview fallback key, shared with
        /// `lib/loom-soan-records.ts`. Native mode uses
        /// `loom://native/soan.json` instead.
        static let soanStorageKey = "loom.soan.v1"

        /// Legacy browser-preview fallback key, shared with
        /// `lib/loom-weave-records.ts`. Native mode uses
        /// `loom://native/weaves.json` instead.
        static let weavesStorageKey = "loom.weaves.v1"
        static let legacyMirrorStorageKeys = [
            recentRecordsKey,
            panelsStorageKey,
            pursuitsStorageKey,
            soanStorageKey,
            weavesStorageKey,
        ]

        /// Earth-tone palette that matches PatternsClient's `PALETTE` map.
        /// Kept as an ordered array so we can index deterministically from a
        /// source-URL hash. Do NOT reorder — every existing tile would
        /// silently change color next launch. Append-only.
        ///
        /// Token-sync note (Design System v1.0, 2026-04-28): these values
        /// LOOK like duplicates of `LoomTokens.thread/rose/sage/indigo/
        /// umber/plum/ochre`, and the first slot `#9E7C3E` was historically
        /// the legacy `thread` bronze (retired in v1.0 to `#C4A468`). They
        /// are deliberately NOT pointed at canonical tokens because:
        /// (1) the index→hex mapping is part of persisted tile identity —
        /// re-pointing slot 0 to the new bronze would silently re-color
        /// every existing tile, breaking the "do not reorder" invariant;
        /// (2) PatternsClient's web-side `PALETTE` mirrors this exact
        /// ordered list and must not drift. Treat this as historical data,
        /// not a theme palette. New panel-coloring features should consume
        /// `LoomTokens.dsThread` directly.
        static let panelPalette: [String] = [
            "#9E7C3E", "#8F4646", "#5C6E4E", "#3A477A",
            "#5C3F2A", "#5E3D5C", "#A8783E",
        ]

        /// MRU update for the Recent section. Writes the full record
        /// `{href, title, at}` — solves the case where the bundle
        /// search-index doesn't know a user-picked doc's title. The
        /// legacy href-only key is kept for one cycle for migration.
        static func updateRecentHrefs(adding href: String, title: String? = nil) {
            var records = readRecentRecords()
            records.removeAll { $0.href == href }
            records.insert(RecentDocRecord(
                href: href,
                title: title?.isEmpty == false ? title : nil,
                at: Date().timeIntervalSince1970 * 1000
            ), at: 0)
            if records.count > recentHrefsMax {
                records = Array(records.prefix(recentHrefsMax))
            }
            writeRecentRecords(records)
            // Keep the legacy href-only array in sync so older readers
            // (if any still lurk) continue to work during the transition.
            UserDefaults.standard.set(records.map(\.href), forKey: recentHrefsKey)
            NotificationCenter.default.post(name: .loomRecentsChanged, object: nil)
        }

        /// Notify web surfaces that native Recent records changed. The
        /// web layer fetches the authoritative payload through
        /// `loom://native/recents.json`; this hook only invalidates stale
        /// browser-era storage and wakes subscribers.
        func mirrorRecentsToWebview() {
            dispatchNativeProjectionChanged(
                storageKey: Self.recentRecordsKey,
                eventName: "loom-recents-updated"
            )
        }

        /// Notify web surfaces that native `LoomTrace` panel rows changed.
        /// The payload itself is served on `loom://native/panels.json` and
        /// `loom://native/panel/<id>.json`; this path only wakes clients.
        ///
        /// Qualifies a trace as a panel when:
        ///   - `kind == "reading"`, AND
        ///   - the trace has at least one `"thought"` event (Crystallize /
        ///     Interlace-anchor shape), or a non-empty `currentSummary`.
        ///
        func mirrorPanelsToWebview() {
            dispatchNativeProjectionChanged(
                storageKey: Coordinator.panelsStorageKey,
                eventName: "loom-panels-updated"
            )
        }

        /// Notify web surfaces that native `LoomPursuit` rows changed.
        /// Shape exposed by `loom://native/pursuits.json` matches
        /// the `Pursuit` type in `app/pursuit-model.ts`:
        /// `{ id, question, weight, season, sources: int, panels: int,
        ///    at: updatedAt }`.
        func mirrorPursuitsToWebview() {
            dispatchNativeProjectionChanged(
                storageKey: Coordinator.pursuitsStorageKey,
                eventName: "loom-pursuits-updated"
            )
        }

        /// Notify web surfaces that native `LoomSoanCard` + `LoomSoanEdge`
        /// rows changed. The payload is exposed at `loom://native/soan.json`
        /// as `{ cards: [...], edges: [...] }`
        /// with the card fields matching `SoanClient`'s `Card` type
        /// (note: `width`/`height` are projected as `w`/`h` to match the
        /// web contract).
        func mirrorSoanToWebview() {
            dispatchNativeProjectionChanged(
                storageKey: Coordinator.soanStorageKey,
                eventName: "loom-soan-updated"
            )
        }

        /// Pure helper — produces the Sōan payload exposed to the web layer.
        /// Shape: `{ cards: [{id, kind, title, body, source, x, y, w, h}],
        /// edges: [{id, from, to, kind}] }`. Dangling edges (endpoints
        /// that no longer resolve to a live card) are filtered out so the
        /// web side never has to deal with nulls.
        @MainActor
        static func buildSoanPayload() -> [String: Any] {
            let cards: [LoomSoanCard]
            let edges: [LoomSoanEdge]
            do {
                cards = try LoomSoanWriter.allCards()
                edges = try LoomSoanWriter.allEdges()
            } catch {
                NSLog("[Loom] mirrorSoanToWebview: fetch failed: \(error)")
                return ["cards": [], "edges": []]
            }
            let validIds = Set(cards.map(\.id))
            var cardOut: [[String: Any]] = []
            for card in cards {
                var entry: [String: Any] = [
                    "id": card.id,
                    "kind": card.kind,
                    "body": card.body,
                    "x": card.x,
                    "y": card.y,
                    "w": card.width,
                    "h": card.height,
                ]
                if !card.title.isEmpty { entry["title"] = card.title }
                if !card.source.isEmpty { entry["source"] = card.source }
                cardOut.append(entry)
            }
            var edgeOut: [[String: Any]] = []
            for edge in edges {
                guard validIds.contains(edge.fromCardId),
                      validIds.contains(edge.toCardId) else { continue }
                edgeOut.append([
                    "id": edge.id,
                    "from": edge.fromCardId,
                    "to": edge.toCardId,
                    "kind": edge.kind,
                ])
            }
            return ["cards": cardOut, "edges": edgeOut]
        }

        /// Notify web surfaces that native `LoomWeave` rows changed. The
        /// authoritative payload is served at `loom://native/weaves.json`
        /// as `[{id, from, to, kind, rationale, at}]`.
        func mirrorWeavesToWebview() {
            dispatchNativeProjectionChanged(
                storageKey: Coordinator.weavesStorageKey,
                eventName: "loom-weaves-updated"
            )
        }

        func dispatchNativeProjectionChanged(storageKey: String, eventName: String) {
            guard let webView else { return }
            let escapedKey = storageKey
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            let escapedEvent = eventName
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            let js = """
            try {
              try { localStorage.removeItem('\(escapedKey)'); } catch(_) {}
              window.dispatchEvent(new CustomEvent('\(escapedEvent)'));
            } catch(_) {}
            """
            DispatchQueue.main.async {
                webView.evaluateJavaScript(js)
            }
        }

        /// Native mode no longer treats the old `localStorage` mirror keys
        /// as meaningful state. Purge them on first paint so historical
        /// browser/dev leftovers do not flash stale data before the web
        /// surfaces fetch direct native projections.
        func purgeLegacyMirrorStorageInWebview() {
            guard let webView else { return }
            let keys = Self.legacyMirrorStorageKeys
                .map { "'\($0)'" }
                .joined(separator: ", ")
            let js = """
            try {
              for (const key of [\(keys)]) {
                try { localStorage.removeItem(key); } catch(_) {}
              }
            } catch(_) {}
            """
            DispatchQueue.main.async {
                webView.evaluateJavaScript(js)
            }
        }

        /// Pure helper — produces the weaves payload exposed to the web
        /// layer. Shape: `[{id, from, to, kind, rationale, at}]`
        /// where `at` is the weave's `updatedAt` (so the web side can
        /// sort by recency if it wants). Empty rationales are still
        /// emitted as empty strings so the web contract is uniform.
        @MainActor
        static func buildWeavesPayload() -> [[String: Any]] {
            let weaves: [LoomWeave]
            do {
                weaves = try LoomWeaveWriter.allWeaves()
            } catch {
                NSLog("[Loom] mirrorWeavesToWebview: allWeaves failed: \(error)")
                return []
            }
            var out: [[String: Any]] = []
            for weave in weaves {
                out.append([
                    "id": weave.id,
                    "from": weave.fromPanelId,
                    "to": weave.toPanelId,
                    "kind": weave.kind,
                    "rationale": weave.rationale,
                    "at": weave.updatedAt,
                ])
            }
            return out
        }

        /// Pure helper — produces the pursuits payload mirrored into the
        /// web layer. Sibling of `buildPanelsPayload`, extracted for the
        /// same reasons: unit-testability + co-located shape docs.
        @MainActor
        static func buildPursuitsPayload() -> [[String: Any]] {
            let pursuits: [LoomPursuit]
            let traces: [LoomTrace]
            do {
                pursuits = try LoomPursuitWriter.allPursuits()
                traces = try LoomTraceWriter.allTraces()
            } catch {
                NSLog("[Loom] mirrorPursuitsToWebview: allPursuits failed: \(error)")
                return []
            }
            var sourceItemsByDocId: [String: [String: Any]] = [:]
            var panelItemsById: [String: [String: Any]] = [:]
            for trace in traces {
                if let docId = trace.sourceDocId, !docId.isEmpty {
                    if sourceItemsByDocId[docId] == nil {
                        sourceItemsByDocId[docId] = [
                            "docId": docId,
                            "href": trace.sourceHref ?? "",
                            "title": (trace.sourceTitle?.isEmpty == false ? trace.sourceTitle! : docId),
                        ]
                    }
                }
                guard trace.kind == "reading" else { continue }
                if panelItemsById[trace.id] == nil {
                    panelItemsById[trace.id] = [
                        "id": trace.id,
                        "title": (trace.sourceTitle?.isEmpty == false ? trace.sourceTitle! : "Untitled"),
                    ]
                }
            }

            // Phase 7.2: layer per-pursuit hide state + spawn metadata
            // onto the projection. `hidden` is a quiet boolean flag —
            // the web side filters by it (or surfaces hidden behind a
            // disclosure). `spawn` carries the "from syllabus" eyebrow
            // body so user-spawned vs. auto-spawned can be distinguished
            // without changing the LoomPursuit schema (deliverable D).
            let hiddenIds = PursuitHideStore.readAll()
            let spawnEntriesById = PursuitSpawnMetaStore.readAllEntriesById()

            var out: [[String: Any]] = []
            for pursuit in pursuits {
                let sourceItems = pursuit.decodedSourceDocIds.map { docId in
                    sourceItemsByDocId[docId] ?? [
                        "docId": docId,
                        "href": "",
                        "title": docId,
                    ]
                }
                let panelItems = pursuit.decodedPanelIds.map { panelId in
                    panelItemsById[panelId] ?? [
                        "id": panelId,
                        "title": panelId,
                    ]
                }
                let sourceCount = sourceItems.count
                let panelCount = panelItems.count
                var entry: [String: Any] = [
                    "id": pursuit.id,
                    "question": pursuit.question,
                    "weight": pursuit.weight,
                    "season": pursuit.season,
                    "sources": sourceCount,
                    "panels": panelCount,
                    "sourceItems": sourceItems,
                    "panelItems": panelItems,
                    "at": pursuit.updatedAt,
                    "hidden": hiddenIds.contains(pursuit.id),
                ]
                if let spawn = spawnEntriesById[pursuit.id] {
                    entry["spawn"] = [
                        "extractorId": spawn.extractorId,
                        "fieldPath": spawn.fieldPath,
                        "sourceDocId": pursuit.decodedSourceDocIds.first ?? "",
                        "sourceTraceId": spawn.sourceTraceId,
                        "sourceTitle": spawn.sourceTitle,
                        "body": spawn.body,
                        "at": spawn.at,
                    ] as [String: Any]
                }
                out.append(entry)
            }
            return out
        }

        /// Single-pursuit helper for native detail fetches
        /// (`loom://native/pursuit/<id>.json`). Reuses the canonical
        /// mirrored payload shape so the detail page does not grow a
        /// second object contract.
        @MainActor
        static func buildPursuitPayload(id: String) -> [String: Any]? {
            buildPursuitsPayload().first {
                ($0["id"] as? String) == id
            }
        }

        /// Pure helper — produces the panel payload array mirrored into the
        /// web layer. Extracted out of `mirrorPanelsToWebview` so it can be
        /// unit-tested without a live webview, and so the shape stays
        /// co-located with the documentation describing what each field
        /// means.
        @MainActor
        static func buildPanelsPayload() -> [[String: Any]] {
            let traces: [LoomTrace]
            do {
                traces = try LoomTraceWriter.allTraces()
            } catch {
                NSLog("[Loom] mirrorPanelsToWebview: allTraces failed: \(error)")
                return []
            }
            let monthFormatter = DateFormatter()
            monthFormatter.dateFormat = "MMM"
            monthFormatter.locale = Locale(identifier: "en_US")

            var out: [[String: Any]] = []
            for trace in traces {
                guard trace.kind == "reading" else { continue }
                let events = deserializeEvents(trace.eventsJSON)

                // Collect (text, at) pairs for each thought event so the
                // webview can render the Palimpsest stack — newest on top,
                // older layers fading behind. `at` falls back to the
                // trace's createdAt when the event didn't record one.
                //
                // We additionally walk the log for `revision` events, which
                // ARE the true "draft beneath the draft" — each revision
                // captures the prior text at the moment it was overwritten,
                // paired with the newText that replaced it. Palimpsest
                // prefers revisions over thoughts when both are present
                // (see `PalimpsestClient`); we expose both so the client
                // keeps backward compat.
                var thoughtPairs: [(text: String, at: Double)] = []
                var revisionPairs: [(priorText: String, newText: String, at: Double)] = []
                for event in events {
                    let kind = event["kind"] as? String ?? ""
                    let at: Double = {
                        if let atNum = event["at"] as? Double { return atNum }
                        if let atInt = event["at"] as? Int { return Double(atInt) }
                        if let atNS = event["at"] as? NSNumber { return atNS.doubleValue }
                        return trace.createdAt
                    }()
                    if kind == "thought" || kind == "thought-anchor" {
                        let text: String
                        if let t = event["text"] as? String, !t.isEmpty { text = t }
                        else if let s = event["summary"] as? String, !s.isEmpty { text = s }
                        else if let c = event["content"] as? String, !c.isEmpty { text = c }
                        else { continue }
                        thoughtPairs.append((text: text, at: at))
                    } else if kind == "revision" {
                        let priorText = event["priorText"] as? String ?? ""
                        let newText = event["newText"] as? String ?? ""
                        // Keep even when one side is empty — an empty prior
                        // still marks a meaningful event ("went from blank
                        // to this"), which the client may choose to render.
                        guard !priorText.isEmpty || !newText.isEmpty else { continue }
                        revisionPairs.append((priorText: priorText, newText: newText, at: at))
                    }
                }
                // Ascending by timestamp — Palimpsest wants oldest first so
                // it can pop the final element as the top layer.
                thoughtPairs.sort { $0.at < $1.at }
                revisionPairs.sort { $0.at < $1.at }
                let thoughtTexts: [String] = thoughtPairs.map { $0.text }
                let thoughtEvents: [[String: Any]] = thoughtPairs.map {
                    ["text": $0.text, "at": $0.at]
                }
                let revisions: [[String: Any]] = revisionPairs.map {
                    ["priorText": $0.priorText, "newText": $0.newText, "at": $0.at]
                }
                let hasThought = !thoughtTexts.isEmpty
                let hasSummary = !trace.currentSummary.isEmpty
                guard hasThought || hasSummary else { continue }

                let title = (trace.sourceTitle?.isEmpty == false ? trace.sourceTitle! : "Untitled")

                // Unique source docIds across thought events. We record
                // `sourceDocId` in the trace itself as well — count it as one
                // source so the sub line ("3 sources · mar") has something
                // meaningful when events don't carry their own per-source
                // attribution.
                var sourceSet = Set<String>()
                if let docId = trace.sourceDocId, !docId.isEmpty { sourceSet.insert(docId) }
                for event in events {
                    if let docId = event["sourceDocId"] as? String, !docId.isEmpty {
                        sourceSet.insert(docId)
                    } else if let href = event["sourceHref"] as? String, !href.isEmpty {
                        sourceSet.insert(href)
                    }
                }
                let sourceCount = sourceSet.count
                let thoughtCount = thoughtTexts.count

                // Prefer "{N sources}" when we actually have multiple
                // distinct docs; fall back to "{N thoughts}" so a single-
                // source trace with three anchors still has a counting sub.
                let countLabel: String
                if sourceCount >= 2 {
                    countLabel = "\(sourceCount) sources"
                } else if thoughtCount > 0 {
                    countLabel = thoughtCount == 1 ? "1 thought" : "\(thoughtCount) thoughts"
                } else {
                    countLabel = "1 source"
                }
                let date = Date(timeIntervalSince1970: trace.createdAt / 1000)
                let monthText = monthFormatter.string(from: date).lowercased()
                let sub = "\(countLabel) · \(monthText)"

                // Deterministic color: hash the `sourceDocId` (falling back
                // to `sourceHref`, then to the trace id) so a given doc
                // always lands on the same swatch. Same algorithm both on
                // first render and after a reload.
                let colorSeed = trace.sourceDocId ?? trace.sourceHref ?? trace.id
                let color = Self.deterministicPanelColor(for: colorSeed)

                // The panel body on PanelDetailClient. Use the
                // materialized summary when present; otherwise fall back to
                // joining the thought texts as paragraphs. PanelDetailClient
                // splits on "\n\n" so we emit that delimiter.
                let bodyText = trace.currentSummary.isEmpty
                    ? thoughtTexts.joined(separator: "\n\n")
                    : trace.currentSummary

                var entry: [String: Any] = [
                    "id": trace.id,
                    "title": title,
                    "sub": sub,
                    "color": color,
                    "at": trace.createdAt,
                    "body": bodyText,
                    "thoughts": thoughtTexts,
                    "thoughtEvents": thoughtEvents,
                    "revisions": revisions,
                ]
                if let docId = trace.sourceDocId, !docId.isEmpty {
                    entry["docId"] = docId
                }
                out.append(entry)
            }
            return out
        }

        /// Single-panel helper for native detail fetches
        /// (`loom://native/panel/<id>.json`). Reuses the same payload row
        /// `PatternsClient` / `PanelDetailClient` already understand.
        @MainActor
        static func buildPanelPayload(id: String) -> [String: Any]? {
            buildPanelsPayload().first {
                let panelId = $0["id"] as? String
                let docId = $0["docId"] as? String
                return panelId == id || docId == id
            }
        }

        private static func deserializeEvents(_ eventsJSON: String) -> [[String: Any]] {
            guard let data = eventsJSON.data(using: .utf8),
                  let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                return []
            }
            return arr
        }

        /// djb2-style stable hash folded into the palette index. Swift's
        /// String.hashValue is randomized per launch, which would repaint
        /// every tile on every app open — unacceptable for the "same doc =
        /// same color" promise.
        private static func deterministicPanelColor(for seed: String) -> String {
            var hash: UInt64 = 5381
            for byte in seed.utf8 {
                hash = hash &* 33 &+ UInt64(byte)
            }
            let idx = Int(hash % UInt64(panelPalette.count))
            return panelPalette[idx]
        }

        @MainActor
        static func buildRecentRecordsPayload() -> [[String: Any]] {
            readRecentRecords().map { record in
                var entry: [String: Any] = [
                    "href": record.href,
                    "at": record.at,
                ]
                entry["title"] = record.title ?? ""
                return entry
            }
        }

        @MainActor
        static func initialMirrorBootstrapScript() -> String? {
            let purgeKeys = legacyMirrorStorageKeys
                .map { "'\($0)'" }
                .joined(separator: ", ")

            return """
            (() => {
              try {
                try { delete window.__loomNativeStore; } catch (_) { window.__loomNativeStore = undefined; }
                for (const key of [\(purgeKeys)]) {
                  try { localStorage.removeItem(key); } catch (_) {}
                }
              } catch (_) {}
            })();
            """
        }

        static func readRecentRecords() -> [RecentDocRecord] {
            if let data = UserDefaults.standard.data(forKey: recentRecordsKey),
               let decoded = try? JSONDecoder().decode([RecentDocRecord].self, from: data) {
                return decoded
            }
            // Migrate from legacy href-only store on first read.
            guard let legacy = UserDefaults.standard.stringArray(forKey: recentHrefsKey) else {
                return []
            }
            return legacy.map { RecentDocRecord(href: $0, title: nil, at: 0) }
        }

        private static func writeRecentRecords(_ records: [RecentDocRecord]) {
            guard let data = try? JSONEncoder().encode(records) else { return }
            UserDefaults.standard.set(data, forKey: recentRecordsKey)
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

                    // Only apply fallback for a TRULY blank page — the first
                    // ~5 chars of visible text. The HomeClient empty state
                    // legitimately shows "Open a source" (13 chars) before the
                    // user has onboarded any content, and that should NOT
                    // redirect to /about. Only intervene if the page rendered
                    // effectively nothing.
                    if path == "/", textLength < 5, webView.canGoBack == false {
                        guard let base = self.fallbackURL else { return }
                        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
                        components?.path = "/about"
                        components?.query = nil
                        components?.fragment = nil
                        if let target = components?.url {
                            self.lastRequestedURL = target
                            webView.load(URLRequest(url: target))
                            DispatchQueue.main.async {
                                self.debugState.consoleMessage = "root fallback: loaded /about because home rendered effectively empty"
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
                let canBack = webView.canGoBack
                let canForward = webView.canGoForward
                if self.debugState.canGoBack != canBack {
                    self.debugState.canGoBack = canBack
                }
                if self.debugState.canGoForward != canForward {
                    self.debugState.canGoForward = canForward
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
            // Feed the native sidebar's Recent section. Normalizes the
            // webview URL to the search-index `href` shape and keeps a
            // short MRU list in UserDefaults. Snapshots the current
            // page title so user-picked docs not in the bundle index
            // still surface with a readable name.
            if let url = webView.url, let href = Self.normalizedDocHref(from: url) {
                let title = webView.title?.trimmingCharacters(in: .whitespacesAndNewlines)
                Self.updateRecentHrefs(adding: href, title: title?.isEmpty == true ? nil : title)
                // Wake the webview so HomeClient.tsx's Recent section
                // re-fetches the native recents projection without waiting
                // for a page reload.
                mirrorRecentsToWebview()
            }
            // Phase 2: trigger IDB → SwiftData migration on first webview
            // load post-upgrade. Idempotent — the handler flips state to
            // .done after a successful import and short-circuits on empty.
            if let bridge = migrationBridge, bridge.currentStatus == .pending {
                webView.evaluateJavaScript(
                    "window.__loomMigration && window.__loomMigration.request()"
                )
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                webView.evaluateJavaScript("""
                    (() => {
                      try {
                        const handlers = window.webkit?.messageHandlers;
                        return JSON.stringify({
                          href: location.href,
                          hasWebkit: !!window.webkit,
                          hasHandlers: !!handlers,
                          handlerKeys: handlers ? Reflect.ownKeys(handlers).map(String) : [],
                        });
                      } catch (error) {
                        return JSON.stringify({ href: location.href, error: String(error) });
                      }
                    })()
                """) { result, error in
                    if let error {
                        NSLog("[Loom] native handler probe failed: %@", error.localizedDescription)
                    } else if let payload = result as? String {
                        NSLog("[Loom] native handler probe: %@", payload)
                    }
                }
            }
            updateDebugState(from: webView, errorMessage: "")
            // didFinish is the second commit point — re-promote to
            // committedURL in case the URL changed via redirect between
            // didCommit and didFinish.
            let committed = webView.url?.absoluteString ?? ""
            if debugState.committedURL != committed {
                debugState.committedURL = committed
            }
            if !debugState.didFirstLoad {
                revealFirstPaintIfNeeded(in: webView, reason: "didFinish")
            }
            if debugState.consoleMessage != "" {
                debugState.consoleMessage = ""
            }
            if debugState.recoveryMessage != "" {
                debugState.recoveryMessage = ""
            }
            // Only run root fallback check on first load of "/" (no back history).
            // Avoid running on every navigation — it causes false runtime-error
            // detection that redirects unrelated pages to /about.
            if let url = webView.url, url.path == "/" || url.path.isEmpty, !webView.canGoBack {
                scheduleRootFallbackCheck(for: webView)
            }
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
            // Promote currentURL to committedURL — used by chrome
            // predicates that need a stable cross-transition signal.
            let committed = webView.url?.absoluteString ?? ""
            if debugState.committedURL != committed {
                debugState.committedURL = committed
            }
            scheduleFirstPaintFallback(for: webView)
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
            switch message.name {
            case "loomChooseFolder":
                handleChooseFolder()
                return
            case "loomDebug":
                break
            default:
                return
            }
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

        /// Present NSOpenPanel on the main thread, return the chosen path to
        /// the onboarding page via evaluateJavaScript. Cancellation is also
        /// reported so the UI can reset its state without timing out.
        private func handleChooseFolder() {
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                let panel = NSOpenPanel()
                panel.canChooseDirectories = true
                panel.canChooseFiles = false
                panel.allowsMultipleSelection = false
                panel.prompt = "Choose Folder"
                panel.title = "Select your study folder"
                panel.message = "Loom will read files in this folder. Nothing is uploaded."
                let keyWindow = NSApp.keyWindow ?? self.webView?.window
                let finish: (URL?) -> Void = { chosenURL in
                    guard let webView = self.webView else { return }
                    if let url = chosenURL {
                        // Persist a security-scoped bookmark so the sandbox flip
                        // (task #25) has nothing left to do for this folder.
                        // Harmless under the current non-sandboxed build.
                        SecurityScopedFolderStore.save(url)
                        let path = url.path
                        let escaped = path
                            .replacingOccurrences(of: "\\", with: "\\\\")
                            .replacingOccurrences(of: "'", with: "\\'")
                        let js = "window.loomOnboarding && window.loomOnboarding.receiveFolder('\(escaped)');"
                        webView.evaluateJavaScript(js, completionHandler: nil)
                    } else {
                        let js = "window.loomOnboarding && window.loomOnboarding.receiveFolderError('cancelled');"
                        webView.evaluateJavaScript(js, completionHandler: nil)
                    }
                }
                if let window = keyWindow {
                    panel.beginSheetModal(for: window) { response in
                        finish(response == .OK ? panel.url : nil)
                    }
                } else {
                    let response = panel.runModal()
                    finish(response == .OK ? panel.url : nil)
                }
            }
        }

        /// ⌘E · Engage. Selection → passage chat. No selection → rehearsal.
        @objc func triggerLearn() {
            webView?.evaluateJavaScript(LoomCommandScripts.learnSelectionScript())
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

        // The shell owns pinch for Review mode; WKWebView page zoom is disabled.
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

        /// View-menu zoom trio. `pageZoom` is the right knob — scales text
        /// and layout together, saved per-webview for the session. We clamp
        /// to [0.5, 2.5] so accidental zoom-out/in doesn't nuke the layout.
        @objc func zoomIn() {
            guard let webView else { return }
            webView.pageZoom = min(webView.pageZoom + 0.1, 2.5)
        }
        @objc func zoomOut() {
            guard let webView else { return }
            webView.pageZoom = max(webView.pageZoom - 0.1, 0.5)
        }
        @objc func zoomReset() {
            webView?.pageZoom = 1.0
        }

        /// Fires on `.loomTraceChanged` — LoomTraceWriter posts this after
        /// every create / append / updateSummary. The webview only gets an
        /// invalidation event; it then fetches `loom://native/panels...`.
        @objc func handleTraceChanged() {
            mirrorPanelsToWebview()
        }

        /// Fires on `.loomPursuitChanged` — LoomPursuitWriter posts this
        /// after every create / update / delete. The webview only gets an
        /// invalidation event; it then fetches `loom://native/pursuits...`.
        @objc func handlePursuitChanged() {
            mirrorPursuitsToWebview()
        }

        /// Fires on `.loomSoanChanged` — LoomSoanWriter posts this after
        /// every card / edge mutation. The webview then re-fetches
        /// `loom://native/soan.json`.
        @objc func handleSoanChanged() {
            mirrorSoanToWebview()
        }

        /// Fires on `.loomWeaveChanged` — LoomWeaveWriter posts this
        /// after every create / updateRationale / delete. The webview then
        /// re-fetches `loom://native/weaves.json`.
        @objc func handleWeaveChanged() {
            mirrorWeavesToWebview()
        }

        /// Sidebar / Shuttle palette navigation → load the selected path
        /// in the existing webview. Mirrors `DevServer.webviewURL`: static
        /// bundle by default, `http://localhost:3001` only when the user
        /// explicitly opted into dev mode via `LOOM_USE_DEV_SERVER=1`.
        /// Before 2026-04-22 this defaulted to localhost, which silently
        /// stranded every sidebar click once the dev server stopped
        /// spawning by default.
        @objc func handleShuttleNavigate(_ notification: Notification) {
            guard let path = notification.userInfo?["path"] as? String,
                  let webView else { return }
            // Disk-scan sidebar emits `loom://content/<encoded path>` hrefs
            // for source files. Route them through the native source-file
            // surface (PDFKit / QuickLook) by posting `.loomOpenSourceFile`
            // — the main content area swaps to a SwiftUI viewer with the
            // sidebar still visible. Webview chrome is bypassed entirely
            // for source files. See `feedback_loom_view_not_ingest`.
            if path.hasPrefix("loom://content/"), let url = URL(string: path) {
                NotificationCenter.default.post(
                    name: .loomOpenSourceFile,
                    object: nil,
                    userInfo: ["url": url]
                )
                return
            }
            let useDevServer = ProcessInfo.processInfo.environment["LOOM_USE_DEV_SERVER"] == "1"
            let target: URL
            if useDevServer {
                let base = URL(string: "http://localhost:3001")!
                let routed = Coordinator.flatDocPathIfNeeded(path)
                guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false),
                      let routedComponents = URLComponents(string: routed) else { return }
                components.path = routedComponents.path
                components.queryItems = routedComponents.queryItems
                components.fragment = routedComponents.fragment
                target = components.url ?? base
            } else {
                target = Coordinator.bundleURL(for: path) ?? URL(string: "loom://bundle/index.html")!
            }
            webView.load(URLRequest(url: target))
        }

        /// Keep the web-rendered Sidebar.tsx in sync with the native
        /// NavigationSplitView state. Writes the new mode to the same
        /// `wiki:sidebar:mode` localStorage key the web reads at mount,
        /// then dispatches a custom event the web component listens for
        /// so the swap is live (no reload). Native-visible ⇒ "hidden"
        /// on the web; native-hidden ⇒ whatever the user's pre-native
        /// web mode was (see ContentView.syncWebSidebar stash logic).
        /// ⌘⇧R lands here before the Rehearsal window opens so we can
        /// seed its topic field with whatever doc the learner is reading.
        /// If the webview is on a content page, the doc title becomes the
        /// pre-fill — mirrors the web `<RehearseThisButton>` convention.
        @objc func handleOpenRehearsal() {
            if let title = webView?.title, !title.isEmpty, title != "Loom" {
                Task { @MainActor in
                    RehearsalContext.shared.pendingTopic = title
                    NotificationCenter.default.post(name: .loomOpenRehearsalWindow, object: nil)
                }
            } else {
                NotificationCenter.default.post(name: .loomOpenRehearsalWindow, object: nil)
            }
        }

        /// Edit-menu "Ask AI" (⌘⇧E) lands here first so we can capture any
        /// webview text selection and seed the native AskAI window with it.
        /// Selection capture is async (JS round-trip); we open the window
        /// regardless so an empty selection just shows a blank prompt.
        @objc func handleOpenAskAI() {
            let open: () -> Void = {
                NotificationCenter.default.post(name: .loomOpenAskAIWindow, object: nil)
            }
            guard let webView else {
                open()
                return
            }
            let sourceTitle = webView.title
            let sourceURL = webView.url?.absoluteString
            webView.evaluateJavaScript("window.getSelection()?.toString() || ''") { result, _ in
                Task { @MainActor in
                    if let text = result as? String {
                        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !trimmed.isEmpty {
                            AskAIContext.shared.pendingSelection = trimmed
                            AskAIContext.shared.pendingSourceTitle = sourceTitle?.isEmpty == false ? sourceTitle : nil
                            AskAIContext.shared.pendingSourceURL = sourceURL
                        }
                    }
                    open()
                }
            }
        }

        @objc func handleSetWebSidebarMode(_ notification: Notification) {
            guard let mode = notification.userInfo?["mode"] as? String,
                  let webView else { return }
            let escaped = mode
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            let js = """
            (function() {
              try {
                if ('\(escaped)' === '') {
                  localStorage.removeItem('wiki:sidebar:mode');
                } else {
                  localStorage.setItem('wiki:sidebar:mode', '\(escaped)');
                }
                window.dispatchEvent(new CustomEvent('loom-sidebar-mode-change', { detail: '\(escaped)' }));
              } catch (_) {}
            })();
            """
            webView.evaluateJavaScript(js, completionHandler: nil)
        }

        /// DataSettingsView wipe action · clears `wiki:*` localStorage +
        /// the IndexedDB traces DB, then reloads. Called when the user
        /// confirms the destructive reset in Settings > Data.
        @objc func wipeWebStorage() {
            guard let webView else { return }
            let js = """
                (async () => {
                    try {
                        for (const k of Object.keys(localStorage)) {
                            if (k.startsWith('wiki:') || k.startsWith('wiki.') || k.startsWith('loom:')) {
                                localStorage.removeItem(k);
                            }
                        }
                    } catch {}
                    try {
                        if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
                            const dbs = await indexedDB.databases();
                            for (const db of dbs) {
                                if (db?.name) indexedDB.deleteDatabase(db.name);
                            }
                        } else if (typeof indexedDB !== 'undefined') {
                            indexedDB.deleteDatabase('loom');
                        }
                    } catch {}
                    window.location.reload();
                })();
            """
            webView.evaluateJavaScript(js, completionHandler: nil)
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
                // Throttle: don't redirect to /about — just stop retrying.
                // Jumping to /about on repeated errors caused a bug where
                // navigating to any page would bounce back to /about.
                DispatchQueue.main.async {
                    self.debugState.recoveryMessage = "skipped runtime recovery (throttled)"
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
               url.scheme?.lowercased() == LoomURLSchemeHandler.scheme,
               url.host == "bundle" {
                let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
                var relative = url.path
                if relative.hasSuffix(".html") { relative.removeLast(5) }
                else if relative.hasSuffix(".mdx") { relative.removeLast(4) }
                if relative.isEmpty { relative = "/" }
                if let query = components?.percentEncodedQuery, !query.isEmpty {
                    relative += "?\(query)"
                }
                if let fragment = components?.percentEncodedFragment, !fragment.isEmpty {
                    relative += "#\(fragment)"
                }
                let routed = Self.flatDocPathIfNeeded(relative)
                if routed != relative, let target = Self.bundleURL(for: relative) {
                    lastRequestedURL = target
                    webView.load(URLRequest(url: target))
                    decisionHandler(.cancel)
                    return
                }
            }

            if let url = navigationAction.request.url,
               let scheme = url.scheme?.lowercased(),
               scheme != "http",
               scheme != "https",
               scheme != "about",
               scheme != "file",
               scheme != "data",
               scheme != "blob",
               scheme != "javascript",
               scheme != LoomURLSchemeHandler.scheme {
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
