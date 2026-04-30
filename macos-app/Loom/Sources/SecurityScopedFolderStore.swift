import Foundation

/// Compatibility shim around the multi-root `ContentRootStore`. Pre-existing
/// call sites (sidebar empty state, Next.js bridge for `content-root.json`,
/// the Re-pick button in Settings) all expect "the active content root" as
/// a single URL. Under multi-root those callers get the **first** active
/// root, which preserves single-folder behaviour for users who only ever
/// add one folder while letting power users add many.
///
/// New code should reach `ContentRootStore` directly so it can address
/// each root by id.
enum SecurityScopedFolderStore {
    static let defaultsKey = ContentRootStore.legacyV1Key
    private static let manifestRelativePath = "knowledge/.cache/manifest/knowledge-nav.json"

    private struct PersistedContentRoot: Encodable {
        let contentRoot: String
    }

    /// Capture and persist a security-scoped bookmark for a chosen URL.
    /// Routes through `ContentRootStore.add(url:)` so a single-root caller
    /// (Settings Re-pick button) ends up populating the multi-root list.
    @discardableResult
    static func save(
        _ url: URL,
        defaults: UserDefaults = .standard
    ) -> Bool {
        ContentRootStore.add(url: url, defaults: defaults) != nil
    }

    /// Resolve the FIRST stored bookmark back to a URL. Legacy callers
    /// expecting a single result get whichever root sorts first in the
    /// store. Does NOT call `startAccessingSecurityScopedResource()` —
    /// the multi-root activator already did that at launch.
    static func resolve(
        defaults: UserDefaults = .standard
    ) -> (url: URL, isStale: Bool)? {
        guard let first = ContentRootStore.loadAll(defaults: defaults).first,
              let bookmark = first.externalFolderBookmark else { return nil }
        var isStale = false
        do {
            let url = try URL(
                resolvingBookmarkData: bookmark,
                options: [.withSecurityScope],
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
            )
            return (url, isStale)
        } catch {
            return nil
        }
    }

    static func clear(defaults: UserDefaults = .standard) {
        let roots = ContentRootStore.loadAll(defaults: defaults)
        for root in roots {
            ContentRootStore.remove(id: root.id, defaults: defaults)
        }
        defaults.removeObject(forKey: ContentRootStore.legacyV1Key)
    }

    /// Restore at launch — kept for binary compatibility with existing
    /// AppDelegate call sites. Forwards to the multi-root activator and
    /// returns the first active URL (or nil if no roots).
    @discardableResult
    static func restoreAtLaunch(
        fallbackPath: String? = nil,
        defaults: UserDefaults = .standard,
        fileManager: FileManager = .default
    ) -> URL? {
        let active = ContentRootStore.activateAtLaunch(defaults: defaults)
        guard let firstRoot = active.first,
              let url = ContentRootStore.activeURL(for: firstRoot.id) else {
            return nil
        }
        try? persistContentRootConfig(url, fileManager: fileManager)
        return url
    }

    /// Add-and-activate a folder. Multi-root semantics: this APPENDS a new
    /// root rather than replacing the previous one, matching the user's
    /// stated need that re-picking shouldn't lose access to the previously-
    /// picked folder. To replace, callers must remove the old root first
    /// via `ContentRootStore.remove(id:)`.
    @discardableResult
    static func saveAndActivate(
        _ url: URL,
        defaults: UserDefaults = .standard
    ) -> Bool {
        ContentRootStore.add(url: url, defaults: defaults) != nil
    }

    /// Mirror the first active root's path into `content-root.json` so
    /// any remaining Next.js API routes (`/api/ingest` etc.) keep working.
    /// Multi-root callers should not depend on this — they should address
    /// roots by id via `loom://content/<root-id>/...`.
    static func persistContentRootConfig(
        _ url: URL,
        homeDirectory: String = NSHomeDirectory(),
        fileManager: FileManager = .default
    ) throws {
        let appSupport = URL(
            fileURLWithPath: LoomRuntimePaths.appSupportRoot(homeDirectory: homeDirectory),
            isDirectory: true
        )
        try fileManager.createDirectory(at: appSupport, withIntermediateDirectories: true)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(PersistedContentRoot(contentRoot: url.path))
        try data.write(to: appSupport.appendingPathComponent("content-root.json"), options: .atomic)
    }

    @discardableResult
    static func saveActivateAndPersistContentRoot(
        _ url: URL,
        defaults: UserDefaults = .standard,
        homeDirectory: String = NSHomeDirectory(),
        fileManager: FileManager = .default,
        activateAndSave: (URL, UserDefaults) -> Bool = { url, defaults in
            SecurityScopedFolderStore.saveAndActivate(url, defaults: defaults)
        }
    ) -> Bool {
        guard activateAndSave(url, defaults) else { return false }
        do {
            try persistContentRootConfig(url, homeDirectory: homeDirectory, fileManager: fileManager)
            return true
        } catch {
            return false
        }
    }

    /// First active multi-root URL. Single-folder consumers see the same
    /// behaviour as before (one URL); multi-root consumers should query
    /// `ContentRootStore.allActiveURLs` instead.
    static var currentActiveURL: URL? {
        ContentRootStore.allActiveURLs.values.first
    }

    static var currentRootDisplayName: String? {
        if let firstRoot = ContentRootStore.loadAll().first {
            return firstRoot.displayName.isEmpty ? nil : firstRoot.displayName
        }
        if let fallbackPath = LoomRuntimePaths.resolveContentRoot() {
            let name = URL(fileURLWithPath: fallbackPath).lastPathComponent
            return name.isEmpty ? nil : name
        }
        return nil
    }

    static func shouldPreferBookmark(
        resolvedURL: URL,
        fallbackPath: String?,
        fileManager: FileManager = .default
    ) -> Bool {
        guard let fallbackPath else { return true }
        let bookmarkURL = resolvedURL.standardizedFileURL
        let fallbackURL = URL(fileURLWithPath: fallbackPath).standardizedFileURL
        if bookmarkURL == fallbackURL { return true }

        let bookmarkExists = fileManager.fileExists(atPath: bookmarkURL.path)
        let fallbackExists = fileManager.fileExists(atPath: fallbackURL.path)
        if !bookmarkExists && fallbackExists { return false }

        let bookmarkHasManifest = fileManager.fileExists(
            atPath: bookmarkURL.appendingPathComponent(manifestRelativePath).path
        )
        let fallbackHasManifest = fileManager.fileExists(
            atPath: fallbackURL.appendingPathComponent(manifestRelativePath).path
        )
        if !bookmarkHasManifest && fallbackHasManifest { return false }

        return true
    }
}
