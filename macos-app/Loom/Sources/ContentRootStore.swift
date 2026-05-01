import Foundation

/// One picked study folder OR pure Loom page. Each root carries a
/// stable UUID; its Loom-managed data (Loom.md, sub-pages, attachments)
/// always lives at `<LoomFileStore.rootURL>/<id>/...`.
///
/// `externalFolderBookmark` is a security-scoped bookmark to an
/// EXTERNAL user-picked folder (set when the root was created via
/// `+ Folder`). When non-nil, Loom reads files from that folder
/// READ-ONLY — original files are never modified. nil for `+ Page`
/// roots which are pure Loom data, no external reference.
///
/// `displayName` and `description` are user-editable metadata.
struct ContentRoot: Codable, Identifiable, Hashable {
    let id: UUID
    var displayName: String
    var description: String
    /// External folder bookmark (read-only authoritative source).
    /// nil for pure `+ Page` roots.
    let externalFolderBookmark: Data?
    /// When non-nil, this record is a sub-page nested under the named
    /// parent root. The sidebar renders nested sub-pages indented
    /// under their parent. Sub-pages are always pure pages (no
    /// external folder).
    var parentID: UUID?
    let addedAt: Date
    var updatedAt: Date

    init(
        id: UUID,
        displayName: String,
        description: String,
        externalFolderBookmark: Data?,
        parentID: UUID? = nil,
        addedAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.displayName = displayName
        self.description = description
        self.externalFolderBookmark = externalFolderBookmark
        self.parentID = parentID
        self.addedAt = addedAt
        self.updatedAt = updatedAt
    }

    // Codable migration: legacy records used `bookmark: Data` (always
    // present). Decode the old key into `externalFolderBookmark` so
    // existing user-picked roots survive the schema change.
    enum CodingKeys: String, CodingKey {
        case id, displayName, description
        case externalFolderBookmark
        case bookmark   // legacy
        case parentID
        case addedAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        displayName = try c.decode(String.self, forKey: .displayName)
        description = try c.decode(String.self, forKey: .description)
        addedAt = try c.decode(Date.self, forKey: .addedAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
        if let modern = try c.decodeIfPresent(Data.self, forKey: .externalFolderBookmark) {
            externalFolderBookmark = modern
        } else if let legacy = try c.decodeIfPresent(Data.self, forKey: .bookmark) {
            externalFolderBookmark = legacy
        } else {
            externalFolderBookmark = nil
        }
        parentID = try c.decodeIfPresent(UUID.self, forKey: .parentID)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(displayName, forKey: .displayName)
        try c.encode(description, forKey: .description)
        try c.encodeIfPresent(externalFolderBookmark, forKey: .externalFolderBookmark)
        try c.encodeIfPresent(parentID, forKey: .parentID)
        try c.encode(addedAt, forKey: .addedAt)
        try c.encode(updatedAt, forKey: .updatedAt)
    }
}

/// Multi-root replacement for `SecurityScopedFolderStore`. Adds, removes,
/// activates, and persists multiple study folders at once. The legacy
/// single-bookmark store stays as a thin compatibility shim — new code
/// should reach through `ContentRootStore` directly.
///
/// Lifecycle:
///   1. App launch → `activateAtLaunch()` resolves all stored bookmarks
///      and calls `startAccessingSecurityScopedResource()` on each. The
///      app holds those scopes alive until quit.
///   2. User picks a new folder → `add(url:)` saves the bookmark, adds
///      the metadata record, and activates immediately so the new root
///      is usable without a relaunch.
///   3. User removes a folder → `remove(id:)` stops accessing the URL
///      and drops the record. The folder on disk is untouched.
enum ContentRootStore {
    static let defaultsKey = "loom.content-roots.v2"
    /// Legacy single-bookmark key. Migrated into `defaultsKey` on first
    /// launch under multi-root, then left in place as a safety net so a
    /// downgrade can still find the user's folder.
    static let legacyV1Key = "loom.content-root.bookmark.v1"

    /// Mutable shared state guarded by a lock so the URL scheme handler,
    /// sidebar disk-scan task, and main-thread UI can all read it safely.
    private static let stateLock = NSLock()
    nonisolated(unsafe) private static var _activeURLs: [UUID: URL] = [:]

    private static func withLock<T>(_ body: () -> T) -> T {
        stateLock.lock()
        defer { stateLock.unlock() }
        return body()
    }

    // MARK: Storage

    static func loadAll(defaults: UserDefaults = .standard) -> [ContentRoot] {
        guard let data = defaults.data(forKey: defaultsKey) else { return [] }
        return (try? JSONDecoder().decode([ContentRoot].self, from: data)) ?? []
    }

    @discardableResult
    static func saveAll(_ roots: [ContentRoot], defaults: UserDefaults = .standard) -> Bool {
        guard let data = try? JSONEncoder().encode(roots) else { return false }
        defaults.set(data, forKey: defaultsKey)
        return true
    }

    // MARK: Activation

    static var allActiveURLs: [UUID: URL] { withLock { _activeURLs } }
    static func activeURL(for id: UUID) -> URL? { withLock { _activeURLs[id] } }

    /// Resolve every stored bookmark and start security-scoped access.
    /// Stale bookmarks are skipped (user re-adds via the picker). Returns
    /// the records whose bookmarks resolved cleanly so callers can also
    /// surface a "stale, please re-add" hint in Settings if needed.
    @discardableResult
    static func activateAtLaunch(defaults: UserDefaults = .standard) -> [ContentRoot] {
        migrateV1IfNeeded(defaults: defaults)
        flattenLegacySubpages(defaults: defaults)
        let stored = loadAll(defaults: defaults)
        var newActive: [UUID: URL] = [:]
        for root in stored {
            guard let bookmark = root.externalFolderBookmark else { continue }
            var isStale = false
            do {
                let url = try URL(
                    resolvingBookmarkData: bookmark,
                    options: [.withSecurityScope],
                    relativeTo: nil,
                    bookmarkDataIsStale: &isStale
                )
                if isStale { continue }
                _ = url.startAccessingSecurityScopedResource()
                newActive[root.id] = url
            } catch {
                continue
            }
        }
        let previous = withLock { _activeURLs }
        for (id, url) in previous where newActive[id] == nil {
            url.stopAccessingSecurityScopedResource()
        }
        withLock { _activeURLs = newActive }
        // Architecture migration: any Loom.md that an earlier build
        // wrote INTO a user-picked external folder is copied into the
        // file store if needed. The user's folder is authoritative
        // source material: never move, delete, or otherwise mutate
        // external files during migration.
        for root in stored {
            copyExternalLoomMDIntoStoreIfMissing(root: root)
        }
        return stored
    }

    private static func copyExternalLoomMDIntoStoreIfMissing(
        root: ContentRoot,
        fileManager: FileManager = .default
    ) {
        guard let externalURL = withLock({ _activeURLs[root.id] }) else { return }
        let externalLoomMD = externalURL.appendingPathComponent("Loom.md")
        guard fileManager.fileExists(atPath: externalLoomMD.path) else { return }
        let storeLoomMD = LoomFileStore.loomMDURL(for: root.id)
        // If the store already has a Loom.md, don't clobber it and
        // don't clean up the external copy. Source folders stay
        // read-only from Loom's perspective.
        if fileManager.fileExists(atPath: storeLoomMD.path) {
            return
        }
        do {
            try fileManager.createDirectory(
                at: storeLoomMD.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try fileManager.copyItem(at: externalLoomMD, to: storeLoomMD)
        } catch {
            // Best-effort fallback: read + write internal copy only.
            // Never delete or move the external source file.
            do {
                let data = try Data(contentsOf: externalLoomMD)
                try data.write(to: storeLoomMD)
            } catch {
                // Give up silently; user can still read external Loom.md
                // by opening it in any editor.
            }
        }
    }

    // MARK: Mutation

    /// Add a new root. Captures a security-scoped bookmark, persists the
    /// record, and activates the URL so callers can use it immediately.
    /// Returns nil if bookmark capture or activation fails. If the URL
    /// is already a registered root (matched by file path), returns the
    /// existing record without creating a duplicate.
    /// Add a folder-backed root (`+ Folder` flow). Captures a security-
    /// scoped bookmark for the user's external folder so Loom can READ
    /// from it without writing. The Loom-managed `Loom.md` lives at
    /// `LoomFileStore.loomMDURL(for: root.id)` — separate from the
    /// external folder, never inside it.
    @discardableResult
    static func addFolder(
        url: URL,
        displayName: String? = nil,
        description: String = "",
        defaults: UserDefaults = .standard
    ) -> ContentRoot? {
        var roots = loadAll(defaults: defaults)
        if let existing = roots.first(where: { rootURL in
            guard let bm = rootURL.externalFolderBookmark else { return false }
            return resolveBookmarkPath(bm) == url.standardizedFileURL.path
        }) {
            let alreadyActive = withLock { _activeURLs[existing.id] != nil }
            if !alreadyActive, let bm = existing.externalFolderBookmark {
                var isStale = false
                if let resolved = try? URL(
                    resolvingBookmarkData: bm,
                    options: [.withSecurityScope],
                    relativeTo: nil,
                    bookmarkDataIsStale: &isStale
                ), !isStale {
                    _ = resolved.startAccessingSecurityScopedResource()
                    withLock { _activeURLs[existing.id] = resolved }
                }
            }
            return existing
        }
        do {
            let bookmark = try url.bookmarkData(
                options: .withSecurityScope,
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )
            _ = url.startAccessingSecurityScopedResource()
            let now = Date()
            let root = ContentRoot(
                id: UUID(),
                displayName: displayName ?? url.lastPathComponent,
                description: description,
                externalFolderBookmark: bookmark,
                addedAt: now,
                updatedAt: now
            )
            roots.append(root)
            guard saveAll(roots, defaults: defaults) else {
                url.stopAccessingSecurityScopedResource()
                return nil
            }
            withLock { _activeURLs[root.id] = url }
            NotificationCenter.default.post(name: .loomContentRootsChanged, object: nil)
            return root
        } catch {
            return nil
        }
    }

    /// Add a pure `+ Page` root — no external folder, just a Loom-
    /// managed page in the file store. Caller is expected to write the
    /// initial `Loom.md` content (e.g. `# <title>\n`) to
    /// `LoomFileStore.loomMDURL(for: root.id)` before navigating.
    /// Pass `parentID` to nest the new page under an existing root
    /// (M3 Extend-to-Page flow).
    @discardableResult
    static func addPage(
        displayName: String,
        description: String = "",
        parentID: UUID? = nil,
        defaults: UserDefaults = .standard
    ) -> ContentRoot? {
        var roots = loadAll(defaults: defaults)
        let now = Date()
        let root = ContentRoot(
            id: UUID(),
            displayName: displayName,
            description: description,
            externalFolderBookmark: nil,
            parentID: parentID,
            addedAt: now,
            updatedAt: now
        )
        roots.append(root)
        guard saveAll(roots, defaults: defaults) else { return nil }
        NotificationCenter.default.post(name: .loomContentRootsChanged, object: nil)
        return root
    }

    /// Backward-compat shim. Old call sites (Settings Re-pick, sidebar
    /// + Folder) still call `add(url:)`; route them to `addFolder`.
    @discardableResult
    static func add(
        url: URL,
        displayName: String? = nil,
        description: String = "",
        defaults: UserDefaults = .standard
    ) -> ContentRoot? {
        addFolder(url: url, displayName: displayName, description: description, defaults: defaults)
    }

    static func remove(id: UUID, defaults: UserDefaults = .standard) {
        // Cascade: collect this root + every descendant so
        // sub-pages don't survive their parent.
        let allRoots = loadAll(defaults: defaults)
        var toRemove: Set<UUID> = [id]
        var changed = true
        while changed {
            changed = false
            for r in allRoots where r.parentID.map(toRemove.contains) ?? false {
                if !toRemove.contains(r.id) {
                    toRemove.insert(r.id)
                    changed = true
                }
            }
        }
        let stoppedURLs: [URL] = withLock {
            var result: [URL] = []
            for rid in toRemove {
                if let removed = _activeURLs.removeValue(forKey: rid) {
                    result.append(removed)
                }
            }
            return result
        }
        for url in stoppedURLs { url.stopAccessingSecurityScopedResource() }
        var roots = allRoots
        roots.removeAll { toRemove.contains($0.id) }
        saveAll(roots, defaults: defaults)
        NotificationCenter.default.post(name: .loomContentRootsChanged, object: nil)
    }

    /// Update mutable fields (displayName, description). Bookmark and id
    /// are immutable after creation. Stamps `updatedAt`.
    static func update(_ root: ContentRoot, defaults: UserDefaults = .standard) {
        var roots = loadAll(defaults: defaults)
        guard let idx = roots.firstIndex(where: { $0.id == root.id }) else { return }
        var updated = root
        updated.updatedAt = Date()
        roots[idx] = updated
        saveAll(roots, defaults: defaults)
        NotificationCenter.default.post(name: .loomContentRootsChanged, object: nil)
    }

    // MARK: Migration

    /// One-shot v1 → v2 migration: if the v2 array is empty but the v1
    /// single-bookmark key exists, lift the v1 bookmark into a v2 record.
    /// The v1 key stays in place as a downgrade safety net (cheap dead
    /// data; no PII).
    /// One-shot migration: flatten any legacy nested sub-pages so all
    /// pages appear at top level in the sidebar. Sub-pages were
    /// created by the now-removed `⌘L Extend` gesture; with the new
    /// model (Promote inline notes → top-level pages), having two
    /// shapes (nested vs flat) coexisting is the kind of duplicate-
    /// shape inconsistency the product owner explicitly rejects.
    /// Idempotent — does nothing once everyone has parentID == nil.
    private static func flattenLegacySubpages(defaults: UserDefaults) {
        var roots = loadAll(defaults: defaults)
        var changed = false
        for i in roots.indices where roots[i].parentID != nil {
            roots[i].parentID = nil
            changed = true
        }
        if changed {
            saveAll(roots, defaults: defaults)
        }
    }

    private static func migrateV1IfNeeded(defaults: UserDefaults) {
        guard loadAll(defaults: defaults).isEmpty else { return }
        guard let v1Bookmark = defaults.data(forKey: legacyV1Key) else { return }
        var isStale = false
        guard let url = try? URL(
            resolvingBookmarkData: v1Bookmark,
            options: [.withSecurityScope],
            relativeTo: nil,
            bookmarkDataIsStale: &isStale
        ), !isStale else { return }
        let now = Date()
        let root = ContentRoot(
            id: UUID(),
            displayName: url.lastPathComponent,
            description: "",
            externalFolderBookmark: v1Bookmark,
            addedAt: now,
            updatedAt: now
        )
        saveAll([root], defaults: defaults)
    }

    // MARK: Helpers

    private static func resolveBookmarkPath(_ bookmark: Data) -> String? {
        var isStale = false
        guard let url = try? URL(
            resolvingBookmarkData: bookmark,
            options: [.withSecurityScope],
            relativeTo: nil,
            bookmarkDataIsStale: &isStale
        ) else { return nil }
        return url.standardizedFileURL.path
    }
}

extension Notification.Name {
    /// Posted whenever the multi-root list mutates (add / remove / update).
    /// ContentView listens to rebuild the webview hostRoots; the sidebar
    /// listens to refresh the category tree.
    static let loomContentRootsChanged = Notification.Name("loomContentRootsChanged")
}
