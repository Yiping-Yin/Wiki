import SwiftUI

/// Native left-column navigator — the **only** sidebar in Loom post-2026-04-22.
///
/// Replaces the web-side `components/Sidebar.tsx` entirely. Rendered as the
/// sidebar column of `NavigationSplitView` in ContentView. Six sections:
///
    ///   1. **Workspaces** — top-level navigation: Home / Desk / Coworks /
    ///      Patterns / Weaves. Keyboard shortcuts ⌘1–⌘5.
///   2. **Actions** — mode surfaces: Rehearsal / Examiner / Ingestion /
///      Reconstructions. Keyboard shortcuts ⌘⇧R / ⌘⇧X / ⌘⇧I.
///   3. **Recent** — most recently-visited docs, UserDefaults MRU list.
///   4. **Sources** — user-owned material categories, read from
///      `loom://content/knowledge/.cache/manifest/knowledge-nav.json`.
///   5. **LLM Wiki** — bundled curriculum categories from the bundle index.
///   6. **More** — reload / folder / help utilities.
///
/// Sources + LLM Wiki are Desk content domains, not peer workspaces.
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
    /// Persisted set of category IDs the user has manually collapsed.
    /// Auto-expands (current doc / active query) override this and
    /// stay computed. Survives launches via @AppStorage JSON blob.
    @AppStorage("loom.sidebar.collapsedCategories") private var collapsedCategoriesJSON: String = "[]"
    @State private var collapsedIDs: Set<String> = []

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
        var id: String { slug }
        var href: String { "/knowledge/\(slug)" }
    }

    struct Doc: Identifiable, Hashable, Sendable {
        let id: String
        let title: String
        let href: String
    }

    private var wikiCategories: [Category] { bundleCategories.filter { $0.kind == .wiki } }

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

    /// Normalize the webview's current URL to the search-index `href` shape.
    private var currentHref: String? {
        guard let url = URL(string: webState.currentURL) else { return nil }
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
        guard !q.isEmpty else { return userCategories }
        return userCategories.filter { $0.label.lowercased().contains(q) }
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
                        }

                        sectionHeader("Actions")
                        ForEach(Self.actions) { link in
                            actionRow(link)
                        }
                    }
                    if query.isEmpty && !recentDocs.isEmpty {
                        sectionHeader("Recent")
                        ForEach(recentDocs) { doc in
                            recentRow(doc)
                        }
                    }
                    if !filteredUserCategories.isEmpty {
                        sectionHeader("Sources", destination: "/sources", isActive: isSourcesContentPath(currentHref))
                        ForEach(filteredUserCategories) { cat in
                            userCategoryRow(cat)
                        }
                    } else if query.isEmpty {
                        sectionHeader("Sources", destination: "/sources", isActive: isSourcesContentPath(currentHref))
                        libraryEmptyState
                    }
                    if !wikiCategories.isEmpty {
                        let wiki = filteredBundleCategories.filter { $0.kind == .wiki }
                        if !wiki.isEmpty {
                            sectionHeader("LLM Wiki", destination: "/llm-wiki", isActive: isWikiContentPath(currentHref))
                            ForEach(wiki) { category in
                                categoryRow(category)
                            }
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
        .task(priority: .userInitiated) {
            await loadBundleIndex()
            await loadUserNav()
        }
        .onAppear {
            loadRecents()
            loadCollapsedCategories()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomRecentsChanged)) { _ in
            loadRecents()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomContentRootChanged)) { _ in
            Task { await loadUserNav() }
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
        let containsCurrent = docs.contains { $0.href == currentHref }
        let forceOpen = containsCurrent || !query.isEmpty
        let userCollapsed = collapsedIDs.contains("user:\(cat.slug)")
        if docs.isEmpty {
            // Fall back to original link-out behaviour only when we
            // can't enumerate — at least the user can try to navigate.
            Button {
                navigate(to: cat.href)
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
                get: { forceOpen || !userCollapsed },
                set: { newValue in
                    guard !forceOpen else { return }
                    var next = collapsedIDs
                    let key = "user:\(cat.slug)"
                    if newValue { next.remove(key) } else { next.insert(key) }
                    collapsedIDs = next
                    persistCollapsedCategories()
                }
            )) {
                ForEach(docs) { doc in
                    let isCurrent = doc.href == currentHref
                    Button {
                        navigate(to: doc.href)
                    } label: {
                        HStack(spacing: 6) {
                            Text(doc.title)
                                .font(.system(size: 12, weight: isCurrent ? .semibold : .regular))
                                .foregroundStyle(isCurrent ? LoomTokens.thread : sidebarPrimaryText)
                                .lineLimit(1)
                                .truncationMode(.tail)
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                }
            } label: {
                HStack(spacing: 4) {
                    Text(cat.label)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(sidebarPrimaryText)
                    Spacer(minLength: 0)
                    Text("\(docs.count)")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(sidebarTertiaryText)
                }
            }
            .tint(sidebarSecondaryText)
        }
    }

    /// Pull docs belonging to this user category out of the bundle
    /// search-index by href prefix. `/knowledge/<slug>/...` matches —
    /// works because Loom's build-time indexer emits one entry per doc
    /// even when the runtime user hasn't rebuilt the manifest yet.
    private func docsForUserCategory(_ cat: UserCategory) -> [Doc] {
        let prefix = cat.href + "/"
        var hits: [Doc] = []
        for bucket in bundleCategories {
            for doc in bucket.docs where doc.href.hasPrefix(prefix) {
                hits.append(doc)
            }
        }
        return hits.sorted {
            $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
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
        let userCollapsed = collapsedIDs.contains(category.id)
        DisclosureGroup(isExpanded: Binding(
            get: { forceOpen || !userCollapsed },
            set: { newValue in
                // Only record user intent when there's no forced expand.
                guard !forceOpen else { return }
                var next = collapsedIDs
                if newValue { next.remove(category.id) } else { next.insert(category.id) }
                collapsedIDs = next
                persistCollapsedCategories()
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

    private func loadCollapsedCategories() {
        guard let data = collapsedCategoriesJSON.data(using: .utf8),
              let arr = try? JSONDecoder().decode([String].self, from: data) else {
            collapsedIDs = []
            return
        }
        collapsedIDs = Set(arr)
    }

    private func persistCollapsedCategories() {
        guard let data = try? JSONEncoder().encode(Array(collapsedIDs)),
              let str = String(data: data, encoding: .utf8) else { return }
        collapsedCategoriesJSON = str
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
        let hostRoots = LoomRuntimePaths.resolveHostRoots()
        guard hostRoots["content"] != nil else {
            await MainActor.run { self.userCategories = [] }
            return
        }
        do {
            let sorted = try await Task.detached(priority: .utility) {
                try Self.readUserCategories(hostRoots: hostRoots)
            }.value
            await MainActor.run { self.userCategories = sorted }
        } catch {
            await MainActor.run { self.userCategories = [] }
        }
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
        do {
            let result = try await Task.detached(priority: .utility) {
                let bundle = try Self.readBundleCategories(hostRoots: hostRoots)
                let feedback: LibraryReloadFeedback
                let userCategories: [UserCategory]
                if hostRoots["content"] == nil {
                    userCategories = []
                    feedback = .missingFolder
                } else {
                    do {
                        userCategories = try Self.readUserCategories(hostRoots: hostRoots)
                        feedback = .success
                    } catch LoomLocalResourceLoader.LoadError.missingFile {
                        userCategories = []
                        feedback = .missingManifest
                    } catch {
                        userCategories = []
                        feedback = .failed("Couldn't reload sources.")
                    }
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
            byCategory[categoryKey, default: []].append(
                Doc(id: internalID, title: title, href: href)
            )
        }

        return byCategory
            .map { key, docs in
                let kind: CategoryKind = (docs.first?.href.hasPrefix("/wiki/") ?? false) ? .wiki : .library
                return Category(
                    id: key,
                    label: key,
                    kind: kind,
                    docs: docs.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
                )
            }
            .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    }

    nonisolated private static func readUserCategories(hostRoots: [String: URL]) throws -> [UserCategory] {
        guard let url = URL(string: "loom://content/knowledge/.cache/manifest/knowledge-nav.json") else { return [] }
        let data = try LoomLocalResourceLoader.data(
            from: url,
            hostRoots: hostRoots
        )
        let decoded = try JSONDecoder().decode(UserNavPayload.self, from: data)
        return decoded.knowledgeCategories
            .filter { ($0.kind ?? "source") == "source" }
            .map { UserCategory(slug: $0.slug, label: $0.label, count: $0.count) }
            .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
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
    static func resolvedColorScheme(theme: String, systemIsDark: Bool) -> ColorScheme {
        switch theme {
        case "dark":
            return .dark
        case "light":
            return .light
        default:
            return systemIsDark ? .dark : .light
        }
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
