import SwiftUI

/// Native left-column navigator — the **only** sidebar in Loom post-2026-04-22.
///
/// Replaces the web-side `components/Sidebar.tsx` entirely. Rendered as the
/// sidebar column of `NavigationSplitView` in ContentView. Four sections:
///
///   1. **Workspaces** — top-level navigation: Home / Desk / Coworks /
///      Patterns / Weaves. Keyboard shortcuts ⌘1–⌘5.
///   2. **Actions** — mode surfaces: Rehearsal / Examiner / Ingestion /
///      Reconstructions. Keyboard shortcuts ⌘⇧R / ⌘⇧X / ⌘⇧I.
///   3. **Recent** — most recently-visited docs, UserDefaults MRU list.
///   4. **More** — reload / folder / help utilities.
///
/// Desk owns the content domains:
///   - **Sources** — user-owned material categories, read from
///     `loom://derived/knowledge/.cache/manifest/knowledge-nav.json`.
///   - **Reference / LLM Wiki** — bundled curriculum from the bundle index,
///     shown as secondary read-only reference rather than the primary shelf.
/// Active-state coloring uses the system accent (which is the Vellum bronze
/// once `LoomTokens` tints AppKit — see `LoomTokens.swift`). Icons are
/// SF Symbols so they automatically carry the system's warm tone.
///
/// Search is a plain TextField at the top, NOT `.searchable(placement: .sidebar)` —
/// that modifier has a macOS 14 bug where it wedges with `NavigationSplitView`
/// and the sidebar won't collapse on ⌃⌘S / toggle button.
struct KnowledgeSidebarView: View {
    @ObservedObject var webState: WebDebugState
    @Environment(\.colorScheme) private var colorScheme
    // `NSApp.sendAction(showSettingsWindow:…)` is the macOS 13 selector;
    // on macOS 14+ the Settings scene is opened via the SwiftUI
    // environment action, which is the only reliable path under
    // Darwin 25+. Captured once at the struct level so every caller
    // in this view uses it. Observed by the user on 2026-04-23
    // when the sidebar "Pick one in Settings → Data" row didn't
    // respond — the old selector silently no-oped on the new OS.
    @Environment(\.openSettings) private var openSettings
    @State private var bundleCategories: [Category] = []
    @State private var userCategories: [UserCategory] = []
    @State private var query: String = ""
    @State private var recentRecords: [RecentDocRecord] = []
    @State private var reloadFeedback: LibraryReloadFeedback = .idle
    /// Persisted set of category IDs the user has manually expanded.
    /// Current-doc and active-query auto-expands are still computed, but a
    /// source collection should not reveal 100+ files just because it appears
    /// in the sidebar for the first time.
    @AppStorage("loom.sidebar.expandedCategories.v2") private var expandedCategoriesJSON: String = "[]"
    @State private var expandedIDs: Set<String> = []

    /// New-page inline rename field state. The sidebar has a "+ Page"
    /// affordance that swaps to a TextField when activated; the user
    /// types a name and Enter creates the page. Keeps the flow inline
    /// (no modal) per the directness principle.
    @State private var isCreatingNewPage: Bool = false
    @State private var newPageName: String = ""
    @FocusState private var newPageFieldFocused: Bool

    /// User's chosen sort mode for the source categories list (Name /
    /// Date Modified / Date Created). Picker lives on the Sources
    /// section header. Default = Name (Finder-style natural order).
    @AppStorage("loom.sidebar.sortMode") private var sortModeRaw: String = SidebarSortMode.name.rawValue
    private var sortMode: SidebarSortMode {
        SidebarSortMode(rawValue: sortModeRaw) ?? .name
    }

    enum CategoryKind: Sendable {
        /// `/wiki/*` — Loom's bundled curriculum (LLM101n, etc.).
        case wiki
        /// `/knowledge/*` — user's own uploaded source material.
        case library
    }

    // MARK: - Workspaces + Actions (restored & Vellum-upgraded)

    /// Top-level nav targets. ⌘1-⌘5 shortcuts in the View menu mirror these.
    struct WorkspaceLink: Identifiable, Sendable {
        let id: String
        let label: String
        let icon: String
        let shortcut: String
        let href: String
    }

    /// Static workspace list. Relations points at Weaves (the constellation
    /// graph) since "relations" and "weaves" are the same noun in Loom's
    /// vocabulary — keep the familiar label, wire it to the real surface.
    static let workspaces: [WorkspaceLink] = [
        .init(id: "home",     label: "Home",     icon: "house",                shortcut: "⌘1", href: "/"),
        .init(id: "desk",     label: "Desk",     icon: "sun.max",              shortcut: "⌘2", href: "/desk"),
        .init(id: "coworks",  label: "Coworks",  icon: "person.2",             shortcut: "⌘3", href: "/coworks"),
        .init(id: "patterns", label: "Patterns", icon: "square.grid.2x2",      shortcut: "⌘4", href: "/patterns"),
        .init(id: "weaves",   label: "Weaves",   icon: "arrow.triangle.branch",shortcut: "⌘5", href: "/weaves"),
    ]

    /// Mode-surface entries. `surfaceName` matches `MainSurface.surface(from:)`
    /// in ContentView so clicking posts `.loomShowInspectorTab` and the main
    /// content area swaps to the native view (Rehearsal / Examiner / etc.).
    struct ActionLink: Identifiable, Sendable {
        let id: String
        let label: String
        let icon: String
        let shortcut: String?
        let surfaceName: String
    }

    static let actions: [ActionLink] = [
        .init(id: "rehearsal",       label: "Rehearsal",       icon: "pencil.and.outline",          shortcut: "⌘⇧R", surfaceName: "rehearsal"),
        .init(id: "examiner",        label: "Examiner",        icon: "questionmark.bubble",         shortcut: "⌘⇧X", surfaceName: "examiner"),
        .init(id: "ingestion",       label: "Ingestion",       icon: "square.and.arrow.down",       shortcut: "⌘⇧I", surfaceName: "ingestion"),
        .init(id: "reconstructions", label: "Reconstructions", icon: "arrow.triangle.2.circlepath", shortcut: nil,   surfaceName: "reconstructions"),
    ]

    struct Category: Identifiable, Sendable {
        let id: String
        let label: String
        let kind: CategoryKind
        let docs: [Doc]
    }

    struct UserCategory: Identifiable, Hashable, Sendable {
        let slug: String
        let label: String
        let count: Int
        /// When non-nil, these docs are used directly (disk-scan fallback)
        /// instead of querying the bundle search-index. Each doc's `href`
        /// is a `loom://content/...` URL that the scheme handler serves
        /// straight from the user's content root — PDFs render natively
        /// in WKWebView, no ingestion required.
        let directDocs: [Doc]?
        /// Filesystem timestamps for the underlying directory (when this
        /// category is disk-scanned). Used by the sidebar sort selector
        /// to offer Name / Modified / Created orderings without re-scanning.
        let createdAt: Date?
        let modifiedAt: Date?
        var id: String { slug }
        var href: String { "/knowledge/\(slug)" }

        init(
            slug: String,
            label: String,
            count: Int,
            directDocs: [Doc]? = nil,
            createdAt: Date? = nil,
            modifiedAt: Date? = nil
        ) {
            self.slug = slug
            self.label = label
            self.count = count
            self.directDocs = directDocs
            self.createdAt = createdAt
            self.modifiedAt = modifiedAt
        }
    }

    /// Sidebar sort mode for the user's content-root categories.
    /// Persisted via `@AppStorage("loom.sidebar.sortMode")`. Manifest-
    /// backed (ingested) categories don't carry FS timestamps, so the
    /// non-name modes degrade to name sort gracefully.
    enum SidebarSortMode: String, CaseIterable, Identifiable {
        case name
        case modified
        case created

        var id: String { rawValue }
        var label: String {
            switch self {
            case .name: return "Name"
            case .modified: return "Date Modified"
            case .created: return "Date Created"
            }
        }
        var symbol: String {
            switch self {
            case .name: return "textformat"
            case .modified: return "clock.arrow.circlepath"
            case .created: return "calendar"
            }
        }
    }

    /// Pure sort helpers for the sidebar's category / folder / doc lists.
    /// All modes fall back to natural-name sort when timestamps are
    /// missing (e.g. manifest-backed categories that pre-date the disk
    /// scan), so the UI stays stable in mixed cases.
    enum SidebarSorting {
        static func sort(categories: [UserCategory], mode: SidebarSortMode) -> [UserCategory] {
            switch mode {
            case .name:
                return categories.sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
            case .modified:
                return categories.sorted { compareDate(lhs: $0.modifiedAt, rhs: $1.modifiedAt, lhsName: $0.label, rhsName: $1.label) }
            case .created:
                return categories.sorted { compareDate(lhs: $0.createdAt, rhs: $1.createdAt, lhsName: $0.label, rhsName: $1.label) }
            }
        }
        static func sort(folders: [SourceFolderNode], mode: SidebarSortMode) -> [SourceFolderNode] {
            switch mode {
            case .name:
                return folders.sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
            case .modified:
                return folders.sorted { compareDate(lhs: $0.modifiedAt, rhs: $1.modifiedAt, lhsName: $0.label, rhsName: $1.label) }
            case .created:
                return folders.sorted { compareDate(lhs: $0.createdAt, rhs: $1.createdAt, lhsName: $0.label, rhsName: $1.label) }
            }
        }
        static func sort(docs: [Doc], mode: SidebarSortMode) -> [Doc] {
            switch mode {
            case .name:
                return docs.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
            case .modified:
                return docs.sorted { compareDate(lhs: $0.modifiedAt, rhs: $1.modifiedAt, lhsName: $0.title, rhsName: $1.title) }
            case .created:
                return docs.sorted { compareDate(lhs: $0.createdAt, rhs: $1.createdAt, lhsName: $0.title, rhsName: $1.title) }
            }
        }
        /// Newer dates come first. Missing dates rank below all dated
        /// entries; ties break on natural-name sort so the list is
        /// deterministic.
        private static func compareDate(lhs: Date?, rhs: Date?, lhsName: String, rhsName: String) -> Bool {
            switch (lhs, rhs) {
            case let (l?, r?):
                if l != r { return l > r }
                return lhsName.localizedStandardCompare(rhsName) == .orderedAscending
            case (nil, nil):
                return lhsName.localizedStandardCompare(rhsName) == .orderedAscending
            case (_?, nil):
                return true
            case (nil, _?):
                return false
            }
        }
    }

    struct Doc: Identifiable, Hashable, Sendable {
        let id: String
        let title: String
        let href: String
        let subcategory: String?
        let sourcePath: String?
        let createdAt: Date?
        let modifiedAt: Date?

        init(
            id: String,
            title: String,
            href: String,
            subcategory: String? = nil,
            sourcePath: String? = nil,
            createdAt: Date? = nil,
            modifiedAt: Date? = nil
        ) {
            self.id = id
            self.title = title
            self.href = href
            self.subcategory = subcategory
            self.sourcePath = sourcePath
            self.createdAt = createdAt
            self.modifiedAt = modifiedAt
        }
    }

    struct SourceFolderNode: Identifiable, Hashable {
        let id: String
        let label: String
        let path: String
        let children: [SourceFolderNode]
        let docs: [Doc]
        /// Latest modification timestamp across this folder's descendants.
        /// Used by the sidebar sort selector for "Date Modified" mode.
        let modifiedAt: Date?
        /// Earliest creation timestamp across this folder's descendants
        /// (so a folder created when its first file was created sorts as
        /// "older" than a folder full of recent additions).
        let createdAt: Date?

        var totalCount: Int {
            docs.count + children.reduce(0) { $0 + $1.totalCount }
        }

        func contains(href: String?) -> Bool {
            guard let href else { return false }
            if docs.contains(where: { $0.href == href }) { return true }
            return children.contains { $0.contains(href: href) }
        }
    }

    struct SourceFolderTreeRow: View {
        let node: SourceFolderNode
        let currentHref: String?
        let queryActive: Bool
        let primaryText: Color
        let secondaryText: Color
        let tertiaryText: Color
        let navigate: (String) -> Void
        let setExpanded: (String, Bool) -> Void
        @Binding var expandedIDs: Set<String>
        let sortMode: SidebarSortMode

        private var forceOpen: Bool {
            queryActive || node.contains(href: currentHref)
        }

        private var isOpen: Bool {
            forceOpen || expandedIDs.contains(node.id)
        }

        private var sortedChildren: [SourceFolderNode] {
            SidebarSorting.sort(folders: node.children, mode: sortMode)
        }
        private var sortedDocs: [Doc] {
            SidebarSorting.sort(docs: node.docs, mode: sortMode)
        }

        var body: some View {
            DisclosureGroup(isExpanded: Binding(
                get: { isOpen },
                set: { newValue in
                    guard !forceOpen else { return }
                    setExpanded(node.id, newValue)
                }
            )) {
                ForEach(sortedChildren) { child in
                    SourceFolderTreeRow(
                        node: child,
                        currentHref: currentHref,
                        queryActive: queryActive,
                        primaryText: primaryText,
                        secondaryText: secondaryText,
                        tertiaryText: tertiaryText,
                        navigate: navigate,
                        setExpanded: setExpanded,
                        expandedIDs: $expandedIDs,
                        sortMode: sortMode
                    )
                    .padding(.leading, 8)
                }
                ForEach(sortedDocs) { doc in
                    let isCurrent = doc.href == currentHref
                    Button {
                        navigate(doc.href)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "doc.text")
                                .font(.system(size: 9))
                                .foregroundStyle(isCurrent ? LoomTokens.thread : tertiaryText)
                                .frame(width: 12, alignment: .center)
                            Text(doc.title)
                                .font(.system(size: 11, weight: isCurrent ? .semibold : .regular))
                                .foregroundStyle(isCurrent ? LoomTokens.thread : primaryText)
                                .lineLimit(1)
                                .truncationMode(.tail)
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 2)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.leading, 8)
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: isOpen ? "folder.fill" : "folder")
                        .font(.system(size: 10))
                        .foregroundStyle(node.contains(href: currentHref) ? LoomTokens.thread : secondaryText)
                        .frame(width: 13, alignment: .center)
                    Text(node.label)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(node.contains(href: currentHref) ? LoomTokens.thread : primaryText)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 0)
                    Text("\(node.totalCount)")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(tertiaryText)
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    guard !forceOpen else { return }
                    setExpanded(node.id, !expandedIDs.contains(node.id))
                }
            }
            .tint(secondaryText)
        }
    }

    final class SourceFolderBuilder {
        let label: String
        let path: String
        var children: [String: SourceFolderBuilder] = [:]
        var docs: [Doc] = []

        init(label: String, path: String) {
            self.label = label
            self.path = path
        }

        func node(idPrefix: String) -> SourceFolderNode {
            let childNodes = children.values
                .map { $0.node(idPrefix: idPrefix) }
                .sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
            let sortedDocs = docs.sorted {
                $0.title.localizedStandardCompare($1.title) == .orderedAscending
            }
            // Folder mtime = latest mtime across the descendants we know about.
            // Mirrors how Finder reports folder "Date Modified" — useful for the
            // user-controlled sort selector.
            let allModified = sortedDocs.compactMap { $0.modifiedAt } + childNodes.compactMap { $0.modifiedAt }
            let allCreated = sortedDocs.compactMap { $0.createdAt } + childNodes.compactMap { $0.createdAt }
            return SourceFolderNode(
                id: "\(idPrefix):\(path.isEmpty ? "_root" : path)",
                label: label,
                path: path,
                children: childNodes,
                docs: sortedDocs,
                modifiedAt: allModified.max(),
                createdAt: allCreated.min()
            )
        }
    }

    private var wikiCategories: [Category] { bundleCategories.filter { $0.kind == .wiki } }
    private var filteredWikiCategories: [Category] { filteredBundleCategories.filter { $0.kind == .wiki } }

    private var sourceDocCount: Int {
        userCategories.reduce(0) { $0 + $1.count }
    }

    private var wikiDocCount: Int {
        wikiCategories.reduce(0) { $0 + $1.docs.count }
    }

    private var shouldShowDeskSourceDetails: Bool {
        // Multi-root: always show the user's folders + Add button. The
        // legacy gate on webview URL (/desk / /sources / /knowledge/…)
        // collapsed the list whenever the user clicked anything else,
        // which under the new "Sources is just our roots" model leaves
        // them staring at a closed disclosure with no way back in.
        !userCategories.isEmpty || !query.isEmpty || currentHref == "/desk" || isSourcesContentPath(currentHref)
    }

    private var shouldShowDeskReferenceDetails: Bool {
        !query.isEmpty || isWikiContentPath(currentHref)
    }

    private var usesNightSidebarPalette: Bool {
        SidebarThemeResolution.usesNightPalette(colorScheme: colorScheme)
    }

    private var sidebarPrimaryText: Color {
        usesNightSidebarPalette ? Color.white.opacity(0.92) : Color.primary
    }

    private var sidebarSecondaryText: Color {
        usesNightSidebarPalette ? Color.white.opacity(0.74) : Color.secondary
    }

    private var sidebarTertiaryText: Color {
        usesNightSidebarPalette ? Color.white.opacity(0.52) : LoomTokens.muted
    }

    private var sidebarShortcutText: Color {
        usesNightSidebarPalette ? Color.white.opacity(0.46) : Color.secondary.opacity(0.7)
    }

    private var sidebarSearchFill: Color {
        usesNightSidebarPalette ? Color.white.opacity(0.08) : Color.primary.opacity(0.05)
    }

    private var sidebarBackground: Color {
        usesNightSidebarPalette ? LoomTokens.night : LoomTokens.paper
    }

    /// Normalize the webview's current URL to the search-index `href` shape.
    private var currentHref: String? {
        // Use committedURL (not currentURL) so active-link state doesn't
        // flip during provisional navigation. With currentURL, clicking a
        // sidebar link re-renders the link's Button mid-press (because
        // its isActive recomputes the moment WKWebView starts the nav)
        // and the click gets eaten — user has to click twice to enter
        // /weaves or /llm-wiki. See ContentView.WebDebugState.committedURL.
        let stableURL = webState.committedURL.isEmpty ? webState.currentURL : webState.committedURL
        guard let url = URL(string: stableURL) else { return nil }
        var path = url.path
        if path.hasSuffix(".html") { path.removeLast(5) }
        else if path.hasSuffix(".mdx") { path.removeLast(4) }
        if path == "/index" || path.isEmpty { path = "/" }
        return path
    }

    private var filteredBundleCategories: [Category] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return bundleCategories }
        return bundleCategories.compactMap { cat in
            let hits = cat.docs.filter {
                $0.title.lowercased().contains(q) || cat.label.lowercased().contains(q)
            }
            guard !hits.isEmpty else { return nil }
            return Category(id: cat.id, label: cat.label, kind: cat.kind, docs: hits)
        }
    }

    private var filteredUserCategories: [UserCategory] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let base = q.isEmpty ? userCategories : userCategories.filter { $0.label.lowercased().contains(q) }
        return SidebarSorting.sort(categories: base, mode: sortMode)
    }

    /// Resolve recent records with a three-tier fallback: stored title
    /// at capture time (always populated post-v2) → bundle search-index
    /// lookup (for docs indexed at build time) → last-path-component of
    /// href (for anything we still don't know about).
    private var recentDocs: [Doc] {
        guard !recentRecords.isEmpty else { return [] }
        var byHref: [String: Doc] = [:]
        for cat in bundleCategories {
            for doc in cat.docs {
                byHref[doc.href] = doc
            }
        }
        return recentRecords.compactMap { rec in
            if let title = rec.title, !title.isEmpty {
                return Doc(id: rec.href, title: title, href: rec.href)
            }
            if let indexed = byHref[rec.href] {
                return indexed
            }
            // Last resort — show the tail of the URL so the row is at
            // least something rather than nothing.
            let fallback = rec.href
                .split(separator: "/")
                .last
                .map(String.init)?
                .replacingOccurrences(of: "-", with: " ")
            guard let fallback, !fallback.isEmpty else { return nil }
            return Doc(id: rec.href, title: fallback, href: rec.href)
        }
    }

    /// Hosted XCTest launches inject Loom.app before the test bundle has
    /// connected. Do not touch user-selected folders in that window; a stale
    /// security-scoped bookmark or external disk can make xcodebuild report
    /// "test runner hung before establishing connection."
    private static var isRunningInXCTestHost: Bool {
        let env = ProcessInfo.processInfo.environment
        return env["XCTestConfigurationFilePath"] != nil || env["XCTestBundlePath"] != nil
    }

    var body: some View {
        VStack(spacing: 0) {
            searchField
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            Divider()
            // ScrollView + LazyVStack instead of List + .sidebar.
            // macOS 15 SwiftUI kept silently dropping the first row of the
            // first Section and the whole second Section, and stripping
            // Image(systemName:) from icon+text rows rendered through a
            // Button. Plain stack with explicit hand-rolled section
            // headers side-steps every one of those sidebar-list quirks.
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4, pinnedViews: []) {
                    if query.isEmpty {
                        sectionHeader("Workspaces")
                        ForEach(Self.workspaces) { link in
                            workspaceRow(link)
                            if link.id == "desk" {
                                deskContentRows
                            }
                        }

                        sectionHeader("Actions")
                        ForEach(Self.actions) { link in
                            actionRow(link)
                        }
                    } else {
                        sectionHeader("Desk")
                        deskContentRows
                    }
                    if query.isEmpty && !recentDocs.isEmpty {
                        sectionHeader("Recent")
                        ForEach(recentDocs) { doc in
                            recentRow(doc)
                        }
                    }
                    if query.isEmpty {
                        sectionHeader("More")
                        moreRow(label: reloadFeedback.actionLabel, icon: "arrow.clockwise") {
                            NotificationCenter.default.post(name: .loomRescanLibrary, object: nil)
                        }
                        if let statusMessage = reloadFeedback.statusMessage {
                            moreStatusRow(statusMessage)
                        }
                        moreRow(label: "Choose source folder…", icon: "folder") {
                            openSettings()
                        }
                        moreRow(label: "About",          icon: "info.circle") {
                            NotificationCenter.default.post(name: .loomOpenAbout, object: nil)
                        }
                        moreRow(label: "Help",           icon: "questionmark.circle") {
                            NotificationCenter.default.post(name: .loomOpenKeyboardHelp, object: nil)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            }
        }
        .background(sidebarBackground.ignoresSafeArea())
        .task(priority: .userInitiated) {
            await loadBundleIndex()
            await loadUserNav()
        }
        .onAppear {
            loadRecents()
            loadExpandedCategories()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomRecentsChanged)) { _ in
            loadRecents()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomContentRootChanged)) { _ in
            // Route through reloadLibrary (not the silent loadUserNav) so a
            // freshly-picked folder without a knowledge-nav manifest surfaces
            // .missingManifest feedback instead of an empty sidebar.
            Task { await reloadLibrary() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomContentRootsChanged)) { _ in
            // Multi-root list changed (add / remove / rename).
            Task { await reloadLibrary() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomRescanLibrary)) { _ in
            Task {
                await reloadLibrary()
            }
        }
    }

    @ViewBuilder
    private var libraryEmptyState: some View {
        VStack(alignment: .leading, spacing: 6) {
            if SecurityScopedFolderStore.currentActiveURL == nil {
                Text("No folder picked yet.")
                    .font(.system(size: 11))
                    .foregroundStyle(sidebarSecondaryText)
                // Use Button here (not onTapGesture) — the outer
                // ScrollView+LazyVStack was absorbing taps that bubbled
                // up from nested containers like this VStack. Button
                // declares its own hit region explicitly and escapes
                // the scroll-view capture. Unlike the List-era rows,
                // Button here works correctly because we're no longer
                // inside `.listStyle(.sidebar)`.
                Button {
                    openSettings()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "folder.badge.plus")
                            .symbolRenderingMode(.monochrome)
                            .foregroundStyle(LoomTokens.thread)
                            .font(.system(size: 12))
                            .frame(width: 14, alignment: .center)
                        Text("Pick one in Settings → Data")
                            .font(.system(size: 11))
                            .foregroundStyle(LoomTokens.thread)
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 2)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Text("No source manifest yet.")
                    .font(.system(size: 11))
                    .foregroundStyle(sidebarSecondaryText)
                Text("Run `npm run ingest` from the folder's root, or drop files into Ingestion to build one.")
                    .font(.system(size: 10))
                    .foregroundStyle(sidebarTertiaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var deskContentRows: some View {
        HStack(spacing: 4) {
            deskContentRow(
                label: "Sources",
                detail: "your material",
                icon: "folder",
                count: sourceDocCount > 0 ? sourceDocCount : nil,
                destination: "/sources",
                isActive: isSourcesContentPath(currentHref),
                isPrimary: true
            )
            if shouldShowDeskSourceDetails && !userCategories.isEmpty {
                sortMenu
                    .padding(.trailing, 6)
            }
        }

        if shouldShowDeskSourceDetails {
            if !filteredUserCategories.isEmpty {
                ForEach(filteredUserCategories) { cat in
                    userCategoryRow(cat)
                        .padding(.leading, 28)
                }
                // Inline "Add another folder" so multi-root is
                // discoverable without diving into Settings. New users
                // who picked one course can immediately add a second.
                addFolderRow
                    .padding(.leading, 28)
            } else if query.isEmpty {
                libraryEmptyState
                    .padding(.leading, 28)
            }
        }

        deskContentRow(
            label: "Reference",
            detail: "LLM Wiki",
            icon: "books.vertical",
            count: wikiDocCount > 0 ? wikiDocCount : nil,
            destination: "/llm-wiki",
            isActive: isWikiContentPath(currentHref),
            isPrimary: false
        )

        if shouldShowDeskReferenceDetails && !filteredWikiCategories.isEmpty {
            ForEach(filteredWikiCategories) { category in
                categoryRow(category)
                    .padding(.leading, 28)
            }
        }
    }

    /// Inline `+ Page` and `+ Folder` row at the bottom of the sources
    /// list. `+ Page` creates a new blank page in the user's default
    /// Loom workspace (`~/Documents/Loom/<name>/Loom.md`); `+ Folder`
    /// pipes through NSOpenPanel for an existing local folder. Both
    /// produce the same kind of root entry — only the starting content
    /// differs. Stays inline so the user doesn't have to context-
    /// switch into Settings.
    @ViewBuilder
    private var addFolderRow: some View {
        if isCreatingNewPage {
            HStack(spacing: 6) {
                Image(systemName: "doc.text")
                    .font(.system(size: 10))
                    .foregroundStyle(sidebarTertiaryText)
                TextField("Page name", text: $newPageName)
                    .textFieldStyle(.plain)
                    .font(.system(size: 11))
                    .focused($newPageFieldFocused)
                    .onSubmit { commitNewPage() }
                Button(action: commitNewPage) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 9))
                }
                .buttonStyle(.plain)
                .foregroundStyle(sidebarTertiaryText)
                .disabled(newPageName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button(action: cancelNewPage) {
                    Image(systemName: "xmark")
                        .font(.system(size: 9))
                }
                .buttonStyle(.plain)
                .foregroundStyle(sidebarTertiaryText)
            }
            .padding(.vertical, 4)
            .onAppear {
                // Focus the field as soon as it appears so the user can
                // type immediately without an extra click.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    newPageFieldFocused = true
                }
            }
        } else {
            HStack(spacing: 12) {
                Button { startNewPage() } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.system(size: 9))
                        Text("Page")
                            .font(.system(size: 11))
                    }
                    .foregroundStyle(sidebarTertiaryText)
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("New blank page in your Loom workspace.")

                Button { pickAndAddFolder() } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.system(size: 9))
                        Text("Folder")
                            .font(.system(size: 11))
                    }
                    .foregroundStyle(sidebarTertiaryText)
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Pick a local folder. Files are auto-imported as the page's resources.")
            }
        }
    }

    private func startNewPage() {
        newPageName = ""
        isCreatingNewPage = true
    }

    private func cancelNewPage() {
        isCreatingNewPage = false
        newPageName = ""
    }

    /// Create a pure `+ Page` root (no external folder). The page's
    /// `Loom.md` lives in `LoomFileStore.loomMDURL(for: id)` — Loom-
    /// managed, never inside any user folder. Auto-jumps in so the
    /// user lands directly in edit mode (Step 4).
    private func commitNewPage() {
        let trimmed = newPageName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { cancelNewPage(); return }
        guard let added = ContentRootStore.addPage(displayName: trimmed) else {
            cancelNewPage(); return
        }
        // Seed the Loom.md with just `# <title>` so the page opens
        // already populated with its name; user can immediately
        // continue typing below.
        let mdURL = LoomFileStore.loomMDURL(for: added.id)
        try? "# \(trimmed)\n".write(to: mdURL, atomically: true, encoding: .utf8)
        cancelNewPage()
        if let target = URL(string: "loom://content/\(added.id.uuidString.lowercased())") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                NotificationCenter.default.post(
                    name: .loomShowFolderHome,
                    object: nil,
                    userInfo: ["url": target]
                )
            }
        }
    }

    /// NSOpenPanel wrapper that pipes the chosen folder into
    /// ContentRootStore + auto-navigates to the new folder's home so
    /// the user sees the result immediately. Without the navigate
    /// step, ContentView's loomContentRootsChanged listener clears
    /// the existing folder-home overlay, leaving the user staring at
    /// the webview instead of their new folder.
    private func pickAndAddFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose Folder"
        panel.title = "Add a study folder"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        guard let added = ContentRootStore.add(url: url) else { return }
        // Auto-jump to the new root's folder home.
        if let target = URL(string: "loom://content/\(added.id.uuidString.lowercased())") {
            // Delay slightly so the .loomContentRootsChanged handler
            // (which clears overlays) runs first, then we set the new
            // folder home.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                NotificationCenter.default.post(
                    name: .loomShowFolderHome,
                    object: nil,
                    userInfo: ["url": target]
                )
            }
        }
    }

    /// Sort selector for the user's source folder list. Pops a menu
    /// with Name / Date Modified / Date Created options. Persisted via
    /// `loom.sidebar.sortMode` AppStorage.
    @ViewBuilder
    private var sortMenu: some View {
        Menu {
            Picker("Sort", selection: Binding(
                get: { sortMode },
                set: { sortModeRaw = $0.rawValue }
            )) {
                ForEach(SidebarSortMode.allCases) { mode in
                    Label(mode.label, systemImage: mode.symbol).tag(mode)
                }
            }
        } label: {
            Image(systemName: "arrow.up.arrow.down")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(sidebarTertiaryText)
                .frame(width: 18, height: 18)
                .contentShape(Rectangle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .help("Sort sources")
    }

    private func deskContentRow(
        label: String,
        detail: String,
        icon: String,
        count: Int?,
        destination: String,
        isActive: Bool,
        isPrimary: Bool
    ) -> some View {
        let iconColor: Color = isActive || isPrimary ? LoomTokens.thread : sidebarSecondaryText
        let titleColor: Color = isActive ? LoomTokens.thread : (isPrimary ? sidebarPrimaryText : sidebarSecondaryText)
        let detailColor: Color = isActive ? LoomTokens.thread.opacity(0.82) : sidebarTertiaryText
        return Button {
            // Sources entry → show the library overview (a list of
            // every root/page) in the main pane. The user picks
            // which root to drill into from there. Replaces the old
            // behavior of jumping to the first root (felt arbitrary
            // and confusing with multiple roots) and the legacy
            // /sources web page (manifest-only, broken under multi-
            // root + disk-scan).
            if destination == "/sources" {
                NotificationCenter.default.post(name: .loomShowLibrary, object: nil)
                return
            }
            navigate(to: destination)
        } label: {
            HStack(spacing: 8) {
                Rectangle()
                    .fill(sidebarTertiaryText.opacity(0.32))
                    .frame(width: 1, height: 18)
                    .padding(.leading, 6)
                Image(systemName: icon)
                    .symbolRenderingMode(.monochrome)
                    .foregroundStyle(iconColor)
                    .font(.system(size: 11, weight: isPrimary ? .medium : .regular))
                    .frame(width: 15, alignment: .center)
                VStack(alignment: .leading, spacing: 1) {
                    Text(label)
                        .font(.system(size: 11, weight: isActive || isPrimary ? .semibold : .regular))
                        .foregroundStyle(titleColor)
                        .lineLimit(1)
                    Text(detail)
                        .font(.system(size: 9))
                        .foregroundStyle(detailColor)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if let count {
                    Text("\(count)")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(isActive ? LoomTokens.thread : sidebarTertiaryText)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 3)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var searchField: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 11))
                .foregroundStyle(sidebarTertiaryText)
            TextField("Filter", text: $query)
                .textFieldStyle(.plain)
                .font(.system(size: 12))
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(sidebarTertiaryText)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(sidebarSearchFill)
        )
    }

    /// User category drilldown — expand in place (Finder-style) rather
    /// than routing to a dynamic category-landing page. Docs inside are
    /// filtered from the bundle search-index by href prefix. Removes
    /// the 404 risk of navigating to a category URL that may not be
    /// prerendered at build time.
    @ViewBuilder
    private func userCategoryRow(_ cat: UserCategory) -> some View {
        let docs = docsForUserCategory(cat)
        let tree = sourceFolderTree(for: cat, docs: docs)
        let folders = tree.folders
        let looseDocs = tree.looseDocs
        let containsCurrent = docs.contains { $0.href == currentHref }
        let forceOpen = containsCurrent || !query.isEmpty
        let key = "user:\(cat.slug)"
        let userExpanded = expandedIDs.contains(key)
        if docs.isEmpty {
            // Empty category = either a pure `+ Page` root (no
            // external files) or a folder with no scanned content.
            // Route to the native folder-home overlay rather than the
            // legacy /collection web page (which says "not available").
            Button {
                if let homeURL = folderHomeURL(for: cat) {
                    NotificationCenter.default.post(
                        name: .loomShowFolderHome,
                        object: nil,
                        userInfo: ["url": homeURL]
                    )
                } else {
                    navigate(to: cat.href)
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "folder")
                        .font(.system(size: 10))
                        .foregroundStyle(sidebarTertiaryText)
                    Text(cat.label)
                        .font(.system(size: 12))
                        .foregroundStyle(sidebarPrimaryText)
                    Spacer(minLength: 0)
                    Text("\(cat.count)")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(sidebarTertiaryText)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 2)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            DisclosureGroup(isExpanded: Binding(
                get: { forceOpen || userExpanded },
                set: { newValue in
                    guard !forceOpen else { return }
                    var next = expandedIDs
                    if newValue { next.insert(key) } else { next.remove(key) }
                    expandedIDs = next
                    persistExpandedCategories()
                }
            )) {
                ForEach(SidebarSorting.sort(folders: folders, mode: sortMode)) { folder in
                    SourceFolderTreeRow(
                        node: folder,
                        currentHref: currentHref,
                        queryActive: !query.isEmpty,
                        primaryText: sidebarPrimaryText,
                        secondaryText: sidebarSecondaryText,
                        tertiaryText: sidebarTertiaryText,
                        navigate: { href in navigate(to: href) },
                        setExpanded: { id, isExpanded in setExpanded(id, isExpanded) },
                        expandedIDs: $expandedIDs,
                        sortMode: sortMode
                    )
                    .padding(.leading, 8)
                }
                // Files at the root level of the picked folder render
                // alongside the sub-folders (no synthetic "Guide" wrapper).
                ForEach(SidebarSorting.sort(docs: looseDocs, mode: sortMode)) { doc in
                    let isCurrent = doc.href == currentHref
                    Button {
                        navigate(to: doc.href)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "doc.text")
                                .font(.system(size: 9))
                                .foregroundStyle(isCurrent ? LoomTokens.thread : sidebarTertiaryText)
                                .frame(width: 12, alignment: .center)
                            Text(doc.title)
                                .font(.system(size: 11, weight: isCurrent ? .semibold : .regular))
                                .foregroundStyle(isCurrent ? LoomTokens.thread : sidebarPrimaryText)
                                .lineLimit(1)
                                .truncationMode(.tail)
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 2)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.leading, 8)
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "folder")
                        .font(.system(size: 10))
                        .foregroundStyle(containsCurrent ? LoomTokens.thread : sidebarTertiaryText)
                    Text(cat.label)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(containsCurrent ? LoomTokens.thread : sidebarPrimaryText)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Text("\(docs.count)")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(sidebarTertiaryText)
                }
                // Tap whole label → toggle disclosure (Finder-style)
                // AND open the folder home in the main pane. The two
                // happen together: disclosure shows the file tree,
                // home page shows description + listing.
                .contentShape(Rectangle())
                .onTapGesture {
                    if !forceOpen {
                        var next = expandedIDs
                        if userExpanded { next.remove(key) } else { next.insert(key) }
                        expandedIDs = next
                        persistExpandedCategories()
                    }
                    if let homeURL = folderHomeURL(for: cat) {
                        NotificationCenter.default.post(
                            name: .loomShowFolderHome,
                            object: nil,
                            userInfo: ["url": homeURL]
                        )
                    }
                }
            }
            .tint(sidebarSecondaryText)
        }
    }

    /// Build a `loom://content/<root-id>` URL for a top-level user
    /// category so clicking its name routes to the folder-home overlay.
    /// Manifest-driven categories (which lack a rootID) fall back to a
    /// legacy single-root URL handled by ContentView's resolver.
    private func folderHomeURL(for cat: UserCategory) -> URL? {
        // Slug format from disk-scan: "<stem>-<short-uuid>" — extract uuid
        // by looking up the root whose UUID prefix matches the slug suffix.
        for root in ContentRootStore.loadAll() {
            let short = root.id.uuidString.prefix(8).lowercased()
            if cat.slug.hasSuffix("-\(short)") {
                return URL(string: "loom://content/\(root.id.uuidString.lowercased())")
            }
        }
        // Manifest fallback: just send the category href as a loom://content URL
        return URL(string: "loom://content/" + cat.slug)
    }

    private func setExpanded(_ id: String, _ isExpanded: Bool) {
        var next = expandedIDs
        if isExpanded { next.insert(id) } else { next.remove(id) }
        expandedIDs = next
        persistExpandedCategories()
    }

    private func sourceFolderTree(for cat: UserCategory, docs: [Doc]) -> (folders: [SourceFolderNode], looseDocs: [Doc]) {
        let idPrefix = "source-folder:\(cat.slug)"
        var roots: [String: SourceFolderBuilder] = [:]
        var looseDocs: [Doc] = []

        for doc in docs {
            let path = sourceFolderPath(for: doc, in: cat)
            let parts = path
                .split(separator: "/")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            guard !parts.isEmpty else {
                looseDocs.append(doc)
                continue
            }

            var currentPath = ""
            var current: SourceFolderBuilder?
            for part in parts {
                currentPath = currentPath.isEmpty ? part : "\(currentPath) / \(part)"
                if let parent = current {
                    if parent.children[part] == nil {
                        parent.children[part] = SourceFolderBuilder(label: part, path: currentPath)
                    }
                    current = parent.children[part]
                } else {
                    if roots[part] == nil {
                        roots[part] = SourceFolderBuilder(label: part, path: currentPath)
                    }
                    current = roots[part]
                }
            }
            current?.docs.append(doc)
        }

        let nodes = roots.values
            .map { $0.node(idPrefix: idPrefix) }
            .sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
        return (folders: nodes, looseDocs: looseDocs)
    }

    private func sourceFolderPath(for doc: Doc, in cat: UserCategory) -> String {
        if let sourcePath = doc.sourcePath?.trimmingCharacters(in: .whitespacesAndNewlines),
           !sourcePath.isEmpty {
            let localPath = sourceFolderPath(fromSourcePath: sourcePath, in: cat)
            if !localPath.isEmpty { return localPath }
        }

        if let subcategory = doc.subcategory?.trimmingCharacters(in: .whitespacesAndNewlines),
           !subcategory.isEmpty {
            return subcategory
        }

        return ""
    }

    private func sourceFolderPath(fromSourcePath sourcePath: String, in cat: UserCategory) -> String {
        var parts = sourcePath
            .replacingOccurrences(of: "\\", with: "/")
            .split(separator: "/")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard parts.count > 1 else { return "" }
        parts.removeLast()
        guard !parts.isEmpty else { return "" }

        let categorySlug = cat.slug
        let categoryTail = categorySlug.hasPrefix("unsw-")
            ? String(categorySlug.dropFirst(5))
            : categorySlug
        let first = Self.slugify(parts[0])
        let second = parts.count > 1 ? Self.slugify(parts[1]) : ""
        if first == "unsw", !second.isEmpty, "unsw-\(second)" == categorySlug || second == categoryTail {
            parts.removeFirst(2)
        } else if first == categorySlug || first == categoryTail || "unsw-\(first)" == categorySlug {
            parts.removeFirst()
        }
        return parts.joined(separator: " / ")
    }

    private static func slugify(_ value: String) -> String {
        var result = ""
        var lastWasDash = false
        for scalar in value.lowercased().unicodeScalars {
            if CharacterSet.alphanumerics.contains(scalar) {
                result.unicodeScalars.append(scalar)
                lastWasDash = false
            } else if !lastWasDash {
                result.append("-")
                lastWasDash = true
            }
        }
        return result.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    /// Pull docs belonging to this user category out of the bundle
    /// search-index by href prefix. `/knowledge/<slug>/...` matches —
    /// works because Loom's build-time indexer emits one entry per doc
    /// even when the runtime user hasn't rebuilt the manifest yet.
    private func docsForUserCategory(_ cat: UserCategory) -> [Doc] {
        if let direct = cat.directDocs {
            return direct.sorted {
                $0.title.localizedStandardCompare($1.title) == .orderedAscending
            }
        }
        let prefix = cat.href + "/"
        var hits: [Doc] = []
        for bucket in bundleCategories {
            for doc in bucket.docs where doc.href.hasPrefix(prefix) {
                hits.append(doc)
            }
        }
        return hits.sorted {
            $0.title.localizedStandardCompare($1.title) == .orderedAscending
        }
    }

    private func recentRow(_ doc: Doc) -> some View {
        let isCurrent = doc.href == currentHref
        return HStack(spacing: 6) {
            Image(systemName: "clock")
                .font(.system(size: 10))
                .foregroundStyle(sidebarTertiaryText)
            Text(doc.title)
                .font(.system(size: 12, weight: isCurrent ? .semibold : .regular))
                .foregroundStyle(isCurrent ? LoomTokens.thread : sidebarPrimaryText)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .onTapGesture { navigate(to: doc.href) }
    }

    // MARK: - Section header (hand-rolled; replaces `Section("Foo")`)

    /// Section header for the hand-rolled sidebar. Vellum treatment:
    /// serif small-caps — the classical book-chapter heading form —
    /// instead of sans uppercase + tracking, which reads dashboard-y.
    /// Keeps the structural feel without the Dribbble typography.
    private func sectionHeader(_ title: String, destination: String? = nil, isActive: Bool = false) -> some View {
        Group {
            if let destination {
                Button {
                    navigate(to: destination)
                } label: {
                    HStack(spacing: 6) {
                        sectionHeaderLabel(title, isActive: isActive)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                sectionHeaderLabel(title, isActive: isActive)
            }
        }
    }

    private func sectionHeaderLabel(_ title: String, isActive: Bool) -> some View {
        Text(title)
            .font(.system(size: 11, design: .serif).smallCaps())
            .fontWeight(.medium)
            .tracking(0.5)
            .foregroundStyle(isActive ? LoomTokens.thread : sidebarSecondaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 10)
            .padding(.bottom, 2)
    }

    // MARK: - Workspace + Action rows (Vellum styling)

    private func workspaceRow(_ link: WorkspaceLink) -> some View {
        let isActive: Bool
        switch link.id {
        case "home":
            isActive = currentHref == "/"
        case "desk":
            isActive = link.href == "/desk" && isDeskContentPath(currentHref)
        default:
            isActive = currentHref == link.href
                || (link.href != "/" && (webState.currentURL).contains(link.href))
        }
        let iconColor: Color = isActive ? LoomTokens.thread : sidebarSecondaryText
        let titleColor: Color = isActive ? LoomTokens.thread : sidebarPrimaryText
        let titleWeight: Font.Weight = isActive ? .semibold : .regular
        return HStack(spacing: 10) {
            Image(systemName: link.icon)
                .symbolRenderingMode(.monochrome)
                .foregroundStyle(iconColor)
                .font(.system(size: 13, weight: .regular))
                .frame(width: 18, alignment: .center)
            Text(link.label)
                .font(.system(size: 12, weight: titleWeight))
                .foregroundStyle(titleColor)
            Spacer(minLength: 0)
            Text(link.shortcut)
                .font(.system(size: 9, design: .monospaced))
                .foregroundStyle(sidebarShortcutText)
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .onTapGesture { navigate(to: link.href) }
        .id(link.id)
    }

    /// "More" section row — mirrors the rhythm of workspace rows without
    /// the shortcut chip; these are one-shot actions (Browse / Rescan /
    /// Settings / About / Help), not navigation targets with ⌘-bindings.
    private func moreRow(label: String, icon: String, action: @escaping () -> Void) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .symbolRenderingMode(.monochrome)
                .foregroundStyle(sidebarSecondaryText)
                .font(.system(size: 13, weight: .regular))
                .frame(width: 18, alignment: .center)
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(sidebarPrimaryText)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
    }

    private func moreStatusRow(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "info.circle")
                .symbolRenderingMode(.monochrome)
                .foregroundStyle(sidebarSecondaryText)
                .font(.system(size: 12, weight: .regular))
                .frame(width: 18, alignment: .center)
            Text(message)
                .font(.system(size: 10))
                .foregroundStyle(sidebarSecondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }

    private func actionRow(_ link: ActionLink) -> some View {
        HStack(spacing: 10) {
            Image(systemName: link.icon)
                .symbolRenderingMode(.monochrome)
                .foregroundStyle(sidebarSecondaryText)
                .font(.system(size: 13, weight: .regular))
                .frame(width: 18, alignment: .center)
            Text(link.label)
                .font(.system(size: 12))
                .foregroundStyle(sidebarPrimaryText)
            Spacer(minLength: 0)
            if let shortcut = link.shortcut {
                Text(shortcut)
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(sidebarShortcutText)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .onTapGesture {
            NotificationCenter.default.post(
                name: .loomShowInspectorTab,
                object: nil,
                userInfo: ["tab": link.surfaceName]
            )
        }
        .id(link.id)
    }

    @ViewBuilder
    private func categoryRow(_ category: Category) -> some View {
        let containsCurrent = category.docs.contains { $0.href == currentHref }
        // Auto-expand wins over user preference when current doc lives
        // here or a query is active; otherwise respect the user's
        // last explicit toggle.
        let forceOpen = containsCurrent || !query.isEmpty
        let userExpanded = expandedIDs.contains(category.id)
        DisclosureGroup(isExpanded: Binding(
            get: { forceOpen || userExpanded },
            set: { newValue in
                // Only record user intent when there's no forced expand.
                guard !forceOpen else { return }
                var next = expandedIDs
                if newValue { next.insert(category.id) } else { next.remove(category.id) }
                expandedIDs = next
                persistExpandedCategories()
            }
        )) {
            ForEach(category.docs) { doc in
                let isCurrent = doc.href == currentHref
                HStack(spacing: 6) {
                    Text(doc.title)
                        .font(.system(size: 12, weight: isCurrent ? .semibold : .regular))
                        .foregroundStyle(isCurrent ? LoomTokens.thread : sidebarPrimaryText)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 1)
                .contentShape(Rectangle())
                .onTapGesture { navigate(to: doc.href) }
            }
        } label: {
            HStack(spacing: 4) {
                Text(category.label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(sidebarPrimaryText)
                Spacer(minLength: 0)
                Text("\(category.docs.count)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(sidebarTertiaryText)
            }
        }
        .tint(sidebarSecondaryText)
    }

    private func loadRecents() {
        if let data = UserDefaults.standard.data(forKey: "loom.sidebar.recentRecords.v2"),
           let decoded = try? JSONDecoder().decode([RecentDocRecord].self, from: data) {
            recentRecords = decoded
        } else if let legacy = UserDefaults.standard.stringArray(forKey: "loom.sidebar.recentHrefs") {
            // Old href-only format — upgrade in place; Coordinator will
            // overwrite with full records on next navigation.
            recentRecords = legacy.map { RecentDocRecord(href: $0, title: nil, at: 0) }
        } else {
            recentRecords = []
        }
    }

    private func loadExpandedCategories() {
        guard let data = expandedCategoriesJSON.data(using: .utf8),
              let arr = try? JSONDecoder().decode([String].self, from: data) else {
            expandedIDs = []
            return
        }
        expandedIDs = Set(arr)
    }

    private func persistExpandedCategories() {
        guard let data = try? JSONEncoder().encode(Array(expandedIDs)),
              let str = String(data: data, encoding: .utf8) else { return }
        expandedCategoriesJSON = str
    }

    private func navigate(to href: String) {
        NotificationCenter.default.post(
            name: .loomShuttleNavigate,
            object: nil,
            userInfo: ["path": href]
        )
    }

    private func isDeskContentPath(_ href: String?) -> Bool {
        guard let href else { return false }
        return href == "/desk" || isSourcesContentPath(href) || isWikiContentPath(href)
    }

    private func isSourcesContentPath(_ href: String?) -> Bool {
        guard let href else { return false }
        return href == "/sources" || href == "/knowledge" || href.hasPrefix("/knowledge/")
    }

    private func isWikiContentPath(_ href: String?) -> Bool {
        guard let href else { return false }
        return href == "/llm-wiki" || href.hasPrefix("/wiki/")
    }

    // MARK: - Data loads

    /// Load + group the bundle's MiniSearch index (built-in wiki + any
    /// categories baked at build time). Idempotent per instance.
    private func loadBundleIndex(force: Bool = false) async {
        if !force, !bundleCategories.isEmpty { return }
        let hostRoots = LoomRuntimePaths.resolveHostRoots()
        do {
            let ordered = try await Task.detached(priority: .utility) {
                try Self.readBundleCategories(hostRoots: hostRoots)
            }.value
            await MainActor.run { self.bundleCategories = ordered }
        } catch {
            // Silent — sidebar still renders Recent / Library.
        }
    }

    /// Load user's own Library categories from the content-root manifest.
    /// Mirrors `lib/knowledge-nav-client.ts` — same path, same shape. When
    /// no folder is picked yet (fresh install) the fetch 404s silently
    /// and the Library section just doesn't render.
    private func loadUserNav() async {
        guard !Self.isRunningInXCTestHost else {
            await MainActor.run { self.userCategories = [] }
            return
        }
        let activeRoots = ContentRootStore.allActiveURLs
        let storedRoots = ContentRootStore.loadAll()
        let bundleHostRoots = LoomRuntimePaths.resolveHostRoots()
        let resolved = await Task.detached(priority: .utility) {
            var collected: [UserCategory] = []
            for storedRoot in storedRoots {
                if let activeURL = activeRoots[storedRoot.id] {
                    // Folder-backed root: scan its files into a category.
                    let scanned = Self.scanContentRootCategories(
                        rootID: storedRoot.id,
                        displayName: storedRoot.displayName,
                        at: activeURL
                    )
                    collected.append(contentsOf: scanned)
                } else {
                    // Pure `+ Page` root: no external folder. Surface as a
                    // single sidebar entry with no children. The page's
                    // Loom.md lives in the file store and is opened via
                    // the same loom://content/<uuid> URL.
                    let short = storedRoot.id.uuidString.prefix(8).lowercased()
                    let slug = "page-\(short)"
                    collected.append(UserCategory(
                        slug: slug,
                        label: storedRoot.displayName,
                        count: 0,
                        directDocs: [],
                        createdAt: storedRoot.addedAt,
                        modifiedAt: storedRoot.updatedAt
                    ))
                }
            }
            if let manifestCats = try? Self.readUserCategories(hostRoots: bundleHostRoots) {
                collected.append(contentsOf: manifestCats)
            }
            return collected
        }.value
        await MainActor.run { self.userCategories = resolved }
    }

    private func reloadLibrary() async {
        await MainActor.run { reloadFeedback = .loading }
        guard !Self.isRunningInXCTestHost else {
            await MainActor.run {
                self.userCategories = []
                self.reloadFeedback = .missingFolder
            }
            return
        }
        let hostRoots = LoomRuntimePaths.resolveHostRoots()
        let activeRoots = ContentRootStore.allActiveURLs
        let storedRoots = ContentRootStore.loadAll()
        do {
            let result = try await Task.detached(priority: .utility) {
                let bundle = try Self.readBundleCategories(hostRoots: hostRoots)
                let feedback: LibraryReloadFeedback
                var userCategories: [UserCategory] = []
                if !activeRoots.isEmpty {
                    for stored in storedRoots {
                        guard let url = activeRoots[stored.id] else { continue }
                        userCategories.append(contentsOf: Self.scanContentRootCategories(
                            rootID: stored.id,
                            displayName: stored.displayName,
                            at: url
                        ))
                    }
                    if let manifestCats = try? Self.readUserCategories(hostRoots: hostRoots) {
                        userCategories.append(contentsOf: manifestCats)
                    }
                    feedback = userCategories.isEmpty ? .missingManifest : .success
                } else if let contentRoot = hostRoots["content"] {
                    // Legacy single-root fallback (no multi-root state yet).
                    if let manifestCats = try? Self.readUserCategories(hostRoots: hostRoots),
                       !manifestCats.isEmpty {
                        userCategories = manifestCats
                        feedback = .success
                    } else {
                        let scanned = Self.scanContentRootCategories(
                            rootID: nil,
                            displayName: contentRoot.lastPathComponent,
                            at: contentRoot
                        )
                        userCategories = scanned
                        feedback = scanned.isEmpty ? .missingManifest : .success
                    }
                } else {
                    feedback = .missingFolder
                }
                return (bundle: bundle, userCategories: userCategories, feedback: feedback)
            }.value
            await MainActor.run {
                self.bundleCategories = result.bundle
                self.userCategories = result.userCategories
                self.reloadFeedback = result.feedback
            }
            if result.feedback.isTransient {
                await resetReloadFeedback(after: 1_500_000_000)
            }
        } catch {
            await MainActor.run { reloadFeedback = .failed("Couldn't reload sources.") }
            await resetReloadFeedback(after: 2_000_000_000)
        }
    }

    private func resetReloadFeedback(after nanoseconds: UInt64) async {
        try? await Task.sleep(nanoseconds: nanoseconds)
        await MainActor.run {
            if reloadFeedback.isTransient {
                reloadFeedback = .idle
            }
        }
    }

    nonisolated private static func readBundleCategories(hostRoots: [String: URL]) throws -> [Category] {
        guard let url = URL(string: "loom://bundle/search-index.json") else { return [] }
        let data = try LoomLocalResourceLoader.data(
            from: url,
            hostRoots: hostRoots
        )
        guard
            let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let index = root["index"] as? [String: Any],
            let storedFields = index["storedFields"] as? [String: Any]
        else { return [] }

        var byCategory: [String: [Doc]] = [:]
        for (internalID, value) in storedFields {
            guard
                let fields = value as? [String: Any],
                let title = fields["title"] as? String,
                let href = fields["href"] as? String,
                !title.isEmpty,
                !href.isEmpty
            else { continue }
            let rawCategory = (fields["category"] as? String) ?? ""
            let categoryKey = rawCategory.isEmpty ? "Uncategorized" : rawCategory
            let subcategory = fields["subcategory"] as? String
            let sourcePath = fields["sourcePath"] as? String
            byCategory[categoryKey, default: []].append(
                Doc(
                    id: internalID,
                    title: title,
                    href: href,
                    subcategory: subcategory,
                    sourcePath: sourcePath
                )
            )
        }

        return byCategory
            .map { key, docs in
                let kind: CategoryKind = (docs.first?.href.hasPrefix("/wiki/") ?? false) ? .wiki : .library
                return Category(
                    id: key,
                    label: key,
                    kind: kind,
                    docs: docs.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
                )
            }
            .sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
    }

    nonisolated private static func readUserCategories(hostRoots: [String: URL]) throws -> [UserCategory] {
        guard let url = URL(string: "loom://derived/knowledge/.cache/manifest/knowledge-nav.json") else { return [] }
        let data = try LoomLocalResourceLoader.data(
            from: url,
            hostRoots: hostRoots
        )
        let decoded = try JSONDecoder().decode(UserNavPayload.self, from: data)
        return decoded.knowledgeCategories
            .filter { ($0.kind ?? "source") == "source" }
            .map { UserCategory(slug: $0.slug, label: $0.label, count: $0.count) }
            .sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
    }

    /// Disk-scan fallback used when no `knowledge-nav.json` manifest exists
    /// yet — e.g. the user just picked a fresh course folder. Mirrors the
    /// Finder tree directly: each top-level subdirectory becomes a category,
    /// each file inside becomes a Doc with a `loom://content/<encoded path>`
    /// href that the URL-scheme handler serves straight from disk. WKWebView
    /// renders PDFs natively from that response, so viewing source files
    /// requires no ingestion. Mirrors `feedback_loom_view_not_ingest`:
    /// view ≠ ingest.
    nonisolated private static func scanContentRootCategories(
        rootID: UUID?,
        displayName: String?,
        at contentRoot: URL,
        fileManager: FileManager = .default
    ) -> [UserCategory] {
        // Mirror the picked folder as ONE category entry (e.g. "FINS3646").
        // The user said "I picked FINS3646 — show that, not its contents
        // flat-spread". So the sidebar starts with the chosen folder
        // collapsed; expanding it reveals Project / Week 1 / Week 2 /
        // toolkit / loose root PDFs as children, matching Finder.
        // Recursive scan picks up everything inside; the tree builder
        // groups by directory at render time. URL prefix encodes the
        // root id so multi-root resolution stays unambiguous.
        let allDocs = scanFolderForDocs(folder: contentRoot, rootID: rootID, contentRoot: contentRoot, fileManager: fileManager)
        guard !allDocs.isEmpty else { return [] }
        let rawLabel = displayName ?? contentRoot.lastPathComponent
        let label = rawLabel.isEmpty ? "Library" : rawLabel
        let baseSlug = slugify(label)
        // Disambiguate slugs across roots so two folders with the same
        // last-path-component don't collide as a single category id.
        let slug: String = {
            if let rootID = rootID {
                let short = rootID.uuidString.prefix(8).lowercased()
                let stem = baseSlug.isEmpty ? "library" : baseSlug
                return "\(stem)-\(short)"
            }
            return baseSlug.isEmpty ? "library" : baseSlug
        }()
        let values = try? contentRoot.resourceValues(forKeys: [.contentModificationDateKey, .creationDateKey])
        return [UserCategory(
            slug: slug,
            label: label,
            count: allDocs.count,
            directDocs: allDocs,
            createdAt: values?.creationDate,
            modifiedAt: values?.contentModificationDate
        )]
    }

    nonisolated private static func makeDoc(for url: URL, rootID: UUID?, contentRoot: URL) -> Doc? {
        let rootPath = contentRoot.standardizedFileURL.path
        let standardized = url.standardizedFileURL.path
        guard standardized.hasPrefix(rootPath + "/") else { return nil }
        let relative = String(standardized.dropFirst(rootPath.count + 1))
        let encoded = relative
            .split(separator: "/")
            .map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
            .joined(separator: "/")
        let prefix: String = {
            if let rootID = rootID { return "loom://content/\(rootID.uuidString.lowercased())/" }
            return "loom://content/"
        }()
        let href = prefix + encoded
        return Doc(
            id: href,
            title: url.lastPathComponent,
            href: href,
            subcategory: nil,
            sourcePath: relative
        )
    }

    /// Recursively enumerate viewable files under `folder`, returning Docs
    /// whose `href` is a `loom://content/<root-id>/<encoded path>` URL when
    /// `rootID` is provided (multi-root mode), or a legacy `loom://content/
    /// <encoded path>` URL otherwise. `sourcePath` always carries the
    /// filesystem path relative to `contentRoot` so the folder-tree builder
    /// can group entries by sub-directory regardless of multi-root state.
    nonisolated private static func scanFolderForDocs(
        folder: URL,
        rootID: UUID?,
        contentRoot: URL,
        fileManager: FileManager
    ) -> [Doc] {
        guard let enumerator = fileManager.enumerator(
            at: folder,
            includingPropertiesForKeys: [.isDirectoryKey, .isRegularFileKey, .contentModificationDateKey, .creationDateKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else { return [] }

        var docs: [Doc] = []
        let rootPath = contentRoot.standardizedFileURL.path
        for case let url as URL in enumerator {
            let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .contentModificationDateKey, .creationDateKey])
            let isRegular = values?.isRegularFile ?? false
            guard isRegular else { continue }
            let standardized = url.standardizedFileURL.path
            guard standardized.hasPrefix(rootPath + "/") else { continue }
            let relative = String(standardized.dropFirst(rootPath.count + 1))
            // Each segment percent-encoded so spaces / unicode survive.
            let encoded = relative
                .split(separator: "/")
                .map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
                .joined(separator: "/")
            let prefix: String = {
                if let rootID = rootID { return "loom://content/\(rootID.uuidString.lowercased())/" }
                return "loom://content/"
            }()
            let href = prefix + encoded
            docs.append(Doc(
                id: href,
                title: url.lastPathComponent,
                href: href,
                subcategory: nil,
                sourcePath: relative,
                createdAt: values?.creationDate,
                modifiedAt: values?.contentModificationDate
            ))
        }
        return docs.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
    }

    private struct UserNavPayload: Decodable {
        let knowledgeCategories: [RawCategory]
    }

    private struct RawCategory: Decodable {
        let slug: String
        let label: String
        let count: Int
        let kind: String?
    }
}

enum SidebarThemeResolution {
    static func resolvedColorScheme(
        theme: String,
        systemIsDark: Bool = false,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> ColorScheme {
        switch theme {
        case "dark":
            return .dark
        case "light":
            return .light
        case "auto", "":
            return isNightTime(now: now, calendar: calendar) ? .dark : .light
        default:
            return systemIsDark ? .dark : .light
        }
    }

    static func isNightTime(now: Date = Date(), calendar: Calendar = .current) -> Bool {
        let hour = calendar.component(.hour, from: now)
        return hour < 6 || hour >= 21
    }

    static func usesNightPalette(colorScheme: ColorScheme) -> Bool {
        colorScheme == .dark
    }
}

enum LibraryReloadFeedback: Equatable, Sendable {
    case idle
    case loading
    case success
    case missingFolder
    case missingManifest
    case failed(String)

    var actionLabel: String {
        switch self {
        case .loading:
            return "Reloading…"
        case .success:
            return "Reloaded"
        case .failed:
            return "Reload failed"
        default:
            return "Reload sources"
        }
    }

    var statusMessage: String? {
        switch self {
        case .idle:
            return nil
        case .loading:
            return nil
        case .success:
            return nil
        case .missingFolder:
            return "Choose a source folder in Settings -> Data."
        case .missingManifest:
            return "No source manifest yet. Run npm run ingest or use Ingestion."
        case .failed(let message):
            return message
        }
    }

    var isTransient: Bool {
        switch self {
        case .loading, .success, .failed:
            return true
        default:
            return false
        }
    }
}

/// Recent-doc MRU record. Stored as JSON in UserDefaults by the
/// webview Coordinator every time navigation finishes — retains the
/// title seen at capture time so user-picked docs (not in the bundle
/// search-index) still surface with a human name in the sidebar.
struct RecentDocRecord: Codable, Identifiable, Equatable {
    let href: String
    let title: String?
    let at: Double
    var id: String { href }
}

extension Notification.Name {
    /// Posted by ContentView when the native sidebar toggles. Coordinator
    /// picks it up and pokes the webview's own Sidebar via a custom event
    /// + localStorage write, so the two don't render simultaneously.
    static let loomSetWebSidebarMode = Notification.Name("loomSetWebSidebarMode")

    /// Posted by the webview Coordinator after it appends a new URL to
    /// the sidebar Recents MRU list.
    static let loomRecentsChanged = Notification.Name("loomRecentsChanged")

    /// Posted when a file is dropped onto the main window. Carries a
    /// `URL` in `userInfo["url"]`.
    static let loomIngestFileDropped = Notification.Name("loomIngestFileDropped")

    /// Posted by the View menu → Rescan Library command. Sidebar listens
    /// and re-fetches both bundle and user-knowledge-nav manifests.
    static let loomRescanLibrary = Notification.Name("loomRescanLibrary")
}
