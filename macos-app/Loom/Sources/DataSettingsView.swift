import SwiftUI
import WebKit

/// Data / Reset pane in the native Settings scene. Replaces the Reset row
/// from the web SettingsPanel.
///
/// Covers:
/// - Re-pick the content-root folder (triggers `NSOpenPanel`; updates
///   both the security-scoped bookmark and `content-root.json` via
///   `SecurityScopedFolderStore`).
/// - Clear migration status so Phase 2 re-runs on next launch.
/// - Full local reset: wipes UserDefaults keys + asks the webview to
///   clear its `wiki:*` localStorage + IndexedDB, then reloads.
/// - "Your Loom" review section: per-row list + delete for pursuits,
///   reading panels (traces kind="reading"), Sōan cards, and weaves.
///   Each row shows a small Cormorant-italic summary, a muted relative
///   date, and a tiny 𝗫 destructive button. Confirm alert gates every
///   delete; notifications wire refresh across panes.
///
/// NOTE: the `body` is intentionally split into a pile of small
/// `@ViewBuilder` properties and helpers. Keeping each Section tiny is
/// what lets the Swift type-checker finish in reasonable time — earlier
/// drafts with inline `ForEach { LoomManagementRow(title:meta:onDelete:) }`
/// inside the Form triggered "too complex to type-check in reasonable
/// time" at line 41. Do not inline these back.
struct DataSettingsView: View {
    @Environment(\.openWindow) private var openWindow
    @State private var status: String = ""
    @State private var confirmReset: Bool = false

    // "Your Loom" content listings. Refreshed on appear and on each
    // loom*Changed notification so the pane stays live with other
    // surfaces (Shuttle, Evening, overlays) without polling.
    @State private var pursuits: [LoomPursuit] = []
    @State private var readingPanels: [LoomTrace] = []
    @State private var soanCards: [LoomSoanCard] = []
    @State private var weaves: [LoomWeave] = []

    // Which item the user is about to remove, and which category it
    // belongs to (so the alert can use the right category word + the
    // right writer). A single alert binding keeps this section quiet;
    // no per-row @State explosion.
    @State private var pendingDeletion: PendingDeletion? = nil

    // Multi-root list state. Reloaded on appear + every
    // loomContentRootsChanged notification so adding/removing in this
    // pane reflects without manual refresh.
    @State private var contentRootsState: [ContentRoot] = []
    @State private var editingRootID: UUID? = nil
    @State private var editingDisplayName: String = ""
    @State private var confirmRemovalRoot: ContentRoot? = nil

    // MARK: - Body

    var body: some View {
        Form {
            contentRootSection
            migrationSection
            localResetSection
            yourLoomSection
            statusSection
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .background(LoomTokens.paper)
        .tint(LoomTokens.thread)
        .padding()
        .frame(minWidth: 480, idealWidth: 520, minHeight: 360)
        .confirmationDialog(
            "Wipe all Loom data?",
            isPresented: $confirmReset,
            titleVisibility: .visible,
            actions: { wipeDialogActions },
            message: { wipeDialogMessage }
        )
        .alert(
            deletionAlertTitle,
            isPresented: deletionAlertBinding,
            presenting: pendingDeletion,
            actions: deletionAlertActions,
            message: deletionAlertMessage
        )
        // Single top-level remove-root alert. Mounting per-row inside
        // ForEach (where it lived initially) is well-known to misfire
        // because every row re-binds the same @State on appearance.
        .alert(item: $confirmRemovalRoot) { root in
            Alert(
                title: Text("Remove “\(root.displayName)” from Loom?"),
                message: Text("Folder is unchanged on disk. You can re-add it anytime."),
                primaryButton: .destructive(Text("Remove")) {
                    removeRoot(root)
                },
                secondaryButton: .cancel()
            )
        }
        .onAppear { refreshAll(); reloadContentRoots() }
        .onReceive(NotificationCenter.default.publisher(for: .loomPursuitChanged)) { _ in refreshPursuits() }
        .onReceive(NotificationCenter.default.publisher(for: .loomTraceChanged))   { _ in refreshPanels() }
        .onReceive(NotificationCenter.default.publisher(for: .loomSoanChanged))    { _ in refreshSoan() }
        .onReceive(NotificationCenter.default.publisher(for: .loomWeaveChanged))   { _ in refreshWeaves() }
        .onReceive(NotificationCenter.default.publisher(for: .loomContentRootsChanged)) { _ in reloadContentRoots() }
    }

    // MARK: - Top-level sections

    @ViewBuilder
    private var contentRootSection: some View {
        Section("Folders") {
            if contentRootsState.isEmpty {
                HStack {
                    Text("No folders added.")
                        .foregroundStyle(.secondary)
                        .font(.system(size: 11))
                    Spacer()
                    Button("Add folder…") { pickContentRoot() }
                }
            } else {
                ForEach(contentRootsState, id: \.id) { root in
                    contentRootRow(root)
                }
                HStack {
                    Spacer()
                    Button("Add folder…") { pickContentRoot() }
                }
            }
        }
    }

    @ViewBuilder
    private func contentRootRow(_ root: ContentRoot) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "folder")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
                .frame(width: 18, alignment: .center)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 2) {
                if editingRootID == root.id {
                    TextField("Display name", text: Binding(
                        get: { editingDisplayName },
                        set: { editingDisplayName = $0 }
                    ), onCommit: { commitRootEdit() })
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 12, weight: .medium))
                } else {
                    Text(root.displayName.isEmpty ? "Untitled" : root.displayName)
                        .font(.system(size: 12, weight: .medium))
                }
                if let resolvedPath = resolvedRootPath(root) {
                    Text(resolvedPath)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
            Spacer()
            if editingRootID == root.id {
                Button("Save") { commitRootEdit() }
                Button("Cancel") { cancelRootEdit() }
            } else {
                Button("Rename") { startRootEdit(root) }
                Button(role: .destructive) {
                    confirmRemovalRoot = root
                } label: {
                    Text("Remove")
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var migrationSection: some View {
        Section("Migration") {
            HStack {
                Text("Status: \(migrationStatusLabel)")
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Reset status") {
                    UserDefaults.standard.removeObject(forKey: MigrationBridgeHandler.statusDefaultsKey)
                    status = "Migration status cleared — runs again on next launch."
                }
            }
            Text("The IDB → SwiftData migration runs once per install. Reset this if you rolled back to an older version and want to re-import.")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }

    @ViewBuilder
    private var localResetSection: some View {
        Section("Local reset") {
            Button("Wipe all Loom data…", role: .destructive) {
                confirmReset = true
            }
            Text("Removes every Loom UserDefault and every `wiki:*` localStorage entry. Traces, panels, and weaves in SwiftData are kept — delete `~/Library/Containers/com.yinyiping.loom` manually to also remove those.")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }

    @ViewBuilder
    private var yourLoomSection: some View {
        Section("Your Loom") {
            pursuitsGroup
            panelsGroup
            soanGroup
            weavesGroup
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        if !status.isEmpty {
            Section {
                Label(status, systemImage: "info.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - "Your Loom" sub-groups

    @ViewBuilder
    private var pursuitsGroup: some View {
        LoomContentGroup(
            label: "Pursuits",
            count: pursuits.count,
            emptyCopy: "No pursuits yet."
        ) {
            pursuitRows
        }
    }

    @ViewBuilder
    private var pursuitRows: some View {
        ForEach(pursuits, id: \.id) { p in
            pursuitRow(p)
        }
    }

    @ViewBuilder
    private func pursuitRow(_ p: LoomPursuit) -> some View {
        LoomManagementRow(
            title: pursuitTitle(p),
            meta: pursuitMeta(p),
            onDelete: { queuePursuitDeletion(p) }
        )
    }

    @ViewBuilder
    private var panelsGroup: some View {
        LoomContentGroup(
            label: "Panels",
            count: readingPanels.count,
            emptyCopy: "No reading panels yet."
        ) {
            panelRows
        }
    }

    @ViewBuilder
    private var panelRows: some View {
        ForEach(readingPanels, id: \.id) { t in
            panelRow(t)
        }
    }

    @ViewBuilder
    private func panelRow(_ t: LoomTrace) -> some View {
        LoomManagementRow(
            title: panelRowTitle(t),
            meta: panelMeta(t),
            onDelete: { queuePanelDeletion(t) }
        )
    }

    @ViewBuilder
    private var soanGroup: some View {
        LoomContentGroup(
            label: "Sōan",
            count: soanCards.count,
            emptyCopy: "No Sōan cards yet."
        ) {
            soanRows
        }
    }

    @ViewBuilder
    private var soanRows: some View {
        ForEach(soanCards, id: \.id) { c in
            soanRow(c)
        }
    }

    @ViewBuilder
    private func soanRow(_ c: LoomSoanCard) -> some View {
        LoomManagementRow(
            title: soanRowTitle(c),
            meta: soanMeta(c),
            onDelete: { queueSoanDeletion(c) }
        )
    }

    @ViewBuilder
    private var weavesGroup: some View {
        LoomContentGroup(
            label: "Weaves",
            count: weaves.count,
            emptyCopy: "No weaves yet."
        ) {
            weaveRows
        }
    }

    @ViewBuilder
    private var weaveRows: some View {
        ForEach(weaves, id: \.id) { w in
            weaveRow(w)
        }
    }

    @ViewBuilder
    private func weaveRow(_ w: LoomWeave) -> some View {
        LoomManagementRow(
            title: weaveRowTitle(w),
            meta: weaveMeta(w),
            onDelete: { queueWeaveDeletion(w) }
        )
    }

    // MARK: - Row string builders (split out so type-checker has an
    // easy time with each LoomManagementRow call)

    private func pursuitTitle(_ p: LoomPursuit) -> String {
        p.question.isEmpty ? "(untitled)" : p.question
    }

    private func pursuitMeta(_ p: LoomPursuit) -> [String] {
        [p.season, relativeDate(p.updatedAt)]
    }

    private func panelMeta(_ t: LoomTrace) -> [String] {
        [relativeDate(t.updatedAt)]
    }

    private func soanMeta(_ c: LoomSoanCard) -> [String] {
        [relativeDate(c.updatedAt)]
    }

    private func weaveMeta(_ w: LoomWeave) -> [String] {
        [relativeDate(w.updatedAt)]
    }

    // MARK: - Deletion intents (keep alert set-up outside the ForEach)

    private func queuePursuitDeletion(_ p: LoomPursuit) {
        let name = p.question.isEmpty ? "this pursuit" : p.question
        pendingDeletion = PendingDeletion(id: p.id, name: name, category: .pursuit)
    }

    private func queuePanelDeletion(_ t: LoomTrace) {
        pendingDeletion = PendingDeletion(id: t.id, name: panelRowTitle(t), category: .panel)
    }

    private func queueSoanDeletion(_ c: LoomSoanCard) {
        let name = c.body.isEmpty ? "this card" : String(c.body.prefix(40))
        pendingDeletion = PendingDeletion(id: c.id, name: name, category: .soan)
    }

    private func queueWeaveDeletion(_ w: LoomWeave) {
        pendingDeletion = PendingDeletion(id: w.id, name: w.kind, category: .weave)
    }

    // MARK: - Alert plumbing

    private var deletionAlertTitle: String {
        "Remove \(pendingDeletion?.name ?? "this item")?"
    }

    private var deletionAlertBinding: Binding<Bool> {
        Binding(
            get: { pendingDeletion != nil },
            set: { if !$0 { pendingDeletion = nil } }
        )
    }

    @ViewBuilder
    private func deletionAlertActions(_ item: PendingDeletion) -> some View {
        Button("Cancel", role: .cancel) { pendingDeletion = nil }
        Button("Remove", role: .destructive) {
            performDelete(item)
            pendingDeletion = nil
        }
    }

    @ViewBuilder
    private func deletionAlertMessage(_ item: PendingDeletion) -> some View {
        Text("This will permanently delete this \(item.category.label).")
    }

    @ViewBuilder
    private var wipeDialogActions: some View {
        Button("Wipe", role: .destructive) { wipeLocalData() }
        Button("Cancel", role: .cancel) {}
    }

    @ViewBuilder
    private var wipeDialogMessage: some View {
        Text("This clears UserDefaults and the webview's localStorage. SwiftData (traces / panels / weaves) is left intact.")
    }

    // MARK: - Content-root + migration helpers

    private var currentContentRoot: String? {
        // The security-scoped bookmark is the authoritative source under
        // the inverted architecture (picked via first-run wizard / Re-pick).
        // Fall back to the legacy `content-root.json` for dev environments
        // that set it up before bookmarks existed.
        if let activeURL = SecurityScopedFolderStore.currentActiveURL {
            return activeURL.path
        }
        if let (url, _) = SecurityScopedFolderStore.resolve() {
            return url.path
        }
        return LoomRuntimePaths.resolveContentRoot()
    }

    private var migrationStatusLabel: String {
        let raw = UserDefaults.standard.string(forKey: MigrationBridgeHandler.statusDefaultsKey) ?? "pending"
        return raw
    }

    private func pickContentRoot() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose Folder"
        panel.title = "Add a study folder"
        if panel.runModal() == .OK, let url = panel.url {
            if let added = ContentRootStore.add(url: url) {
                // Mirror first root into legacy content-root.json so any
                // remaining Next.js callers keep working.
                if let firstURL = ContentRootStore.allActiveURLs.values.first {
                    try? SecurityScopedFolderStore.persistContentRootConfig(firstURL)
                }
                status = "Added “\(added.displayName)”."
            } else {
                status = "Couldn't activate that folder. Try again."
            }
        }
    }

    private func reloadContentRoots() {
        contentRootsState = ContentRootStore.loadAll()
    }

    private func resolvedRootPath(_ root: ContentRoot) -> String? {
        if let url = ContentRootStore.activeURL(for: root.id) { return url.path }
        return nil
    }

    private func startRootEdit(_ root: ContentRoot) {
        editingRootID = root.id
        editingDisplayName = root.displayName
    }

    private func cancelRootEdit() {
        editingRootID = nil
        editingDisplayName = ""
    }

    private func commitRootEdit() {
        guard let id = editingRootID,
              let existing = contentRootsState.first(where: { $0.id == id }) else { return }
        var updated = existing
        let trimmed = editingDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.displayName = trimmed.isEmpty ? existing.displayName : trimmed
        ContentRootStore.update(updated)
        editingRootID = nil
        editingDisplayName = ""
    }

    private func removeRoot(_ root: ContentRoot) {
        ContentRootStore.remove(id: root.id)
        confirmRemovalRoot = nil
        status = "Removed “\(root.displayName)”."
    }

    private func wipeLocalData() {
        // UserDefaults: remove every key that belongs to Loom. Keep Apple
        // system keys (NSGlobalDomain prefixes etc.) alone.
        let defaults = UserDefaults.standard
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix("loom.") || key.hasPrefix("wiki:") || key.hasPrefix("wiki.") {
            defaults.removeObject(forKey: key)
        }
        // Webview localStorage + IDB: ask the active webview to clear on
        // its side, then reload. Done via NotificationCenter so ContentView
        // can forward to its WKWebView.
        NotificationCenter.default.post(name: .loomWipeWebStorage, object: nil)
        status = "Wiped UserDefaults and asked the webview to clear local storage. Reloading…"
    }

    // MARK: - Refresh + delete

    private func refreshAll() {
        refreshPursuits()
        refreshPanels()
        refreshSoan()
        refreshWeaves()
    }

    private func refreshPursuits() {
        pursuits = (try? LoomPursuitWriter.allPursuits()) ?? []
    }

    private func refreshPanels() {
        let all = (try? LoomTraceWriter.allTraces()) ?? []
        readingPanels = all.filter { $0.kind == "reading" }
    }

    private func refreshSoan() {
        soanCards = (try? LoomSoanWriter.allCards()) ?? []
    }

    private func refreshWeaves() {
        weaves = (try? LoomWeaveWriter.allWeaves()) ?? []
    }

    private func performDelete(_ item: PendingDeletion) {
        switch item.category {
        case .pursuit:
            try? LoomPursuitWriter.delete(id: item.id)
        case .panel:
            try? LoomTraceWriter.delete(id: item.id)
        case .soan:
            try? LoomSoanWriter.deleteCard(id: item.id)
        case .weave:
            try? LoomWeaveWriter.delete(id: item.id)
        }
    }

    // MARK: - Row formatting

    private func panelRowTitle(_ t: LoomTrace) -> String {
        if let title = t.sourceTitle, !title.isEmpty { return title }
        if !t.currentSummary.isEmpty { return String(t.currentSummary.prefix(60)) }
        return "Untitled panel"
    }

    private func soanRowTitle(_ c: LoomSoanCard) -> String {
        let snippet: String
        if c.body.isEmpty {
            snippet = c.title.isEmpty ? "(empty)" : c.title
        } else {
            snippet = String(c.body.prefix(60))
        }
        return "\(c.kind): \(snippet)"
    }

    private func weaveRowTitle(_ w: LoomWeave) -> String {
        // Resolve the endpoint panels' titles so the row is readable
        // ("supports: Heat as motion → Entropy bounds"). Falls back to
        // truncated ids when either endpoint has been deleted since.
        let from = resolvePanelTitle(w.fromPanelId)
        let to   = resolvePanelTitle(w.toPanelId)
        return "\(w.kind): \(from) → \(to)"
    }

    private func resolvePanelTitle(_ id: String) -> String {
        if let match = readingPanels.first(where: { $0.id == id }),
           let title = match.sourceTitle, !title.isEmpty {
            return title
        }
        return String(id.prefix(6))
    }

    private func relativeDate(_ at: Double) -> String {
        let date = Date(timeIntervalSince1970: at / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

extension Notification.Name {
    static let loomWipeWebStorage = Notification.Name("loomWipeWebStorage")
}
