import Foundation

/// Persists a security-scoped bookmark for the user-picked study folder so
/// that, once `com.apple.security.app-sandbox` is enabled, Loom can re-open
/// the folder across app launches without re-prompting.
///
/// Bookmark bytes land in UserDefaults (small, opaque blob — this is the
/// standard Apple pattern for single-folder persistence; Keychain would be
/// overkill since the data is not secret).
///
/// Today's non-sandboxed build does not NEED this — `NSOpenPanel` returns a
/// path that stays readable forever. But saving the bookmark now is harmless
/// dead data and makes the sandbox flip one atomic change.
enum SecurityScopedFolderStore {
    static let defaultsKey = "loom.content-root.bookmark.v1"
    private static let manifestRelativePath = "knowledge/.cache/manifest/knowledge-nav.json"

    /// Capture and persist a security-scoped bookmark for a chosen URL.
    /// - Parameter url: the URL returned by NSOpenPanel.
    /// - Returns: true on success, false on bookmark-creation failure.
    @discardableResult
    static func save(
        _ url: URL,
        defaults: UserDefaults = .standard
    ) -> Bool {
        do {
            let data = try url.bookmarkData(
                options: .withSecurityScope,
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )
            defaults.set(data, forKey: defaultsKey)
            return true
        } catch {
            return false
        }
    }

    /// Attempt to resolve the saved bookmark back to a URL. Does NOT yet call
    /// `startAccessingSecurityScopedResource()`; the caller must do that once
    /// ready to read from the folder (and balance it with
    /// `stopAccessingSecurityScopedResource()`).
    /// - Returns: the resolved URL, or nil if no bookmark is stored or resolution failed.
    static func resolve(
        defaults: UserDefaults = .standard
    ) -> (url: URL, isStale: Bool)? {
        guard let data = defaults.data(forKey: defaultsKey) else { return nil }
        var isStale = false
        do {
            let url = try URL(
                resolvingBookmarkData: data,
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
        if let activeURL {
            activeURL.stopAccessingSecurityScopedResource()
            self.activeURL = nil
        }
        defaults.removeObject(forKey: defaultsKey)
    }

    /// Private holder for the currently-active security-scoped URL across
    /// the app lifetime. We call `startAccessingSecurityScopedResource()`
    /// exactly once and leave it active until quit; trying to balance
    /// start/stop across multiple readers would leak easily.
    private static var activeURL: URL?

    /// Call at app launch. Resolves the saved bookmark (if any), activates
    /// security-scoped access, and returns the URL so content-root consumers
    /// can read from it. Returns nil if nothing was saved or resolution
    /// failed (user will see the first-run folder picker).
    @discardableResult
    static func restoreAtLaunch(
        fallbackPath: String? = nil,
        defaults: UserDefaults = .standard,
        fileManager: FileManager = .default
    ) -> URL? {
        if let existing = activeURL { return existing }
        guard let (url, isStale) = resolve(defaults: defaults) else { return nil }
        if isStale || !shouldPreferBookmark(
            resolvedURL: url,
            fallbackPath: fallbackPath,
            fileManager: fileManager
        ) {
            clear(defaults: defaults)
            return nil
        }
        guard url.startAccessingSecurityScopedResource() else {
            clear(defaults: defaults)
            return nil
        }
        activeURL = url
        return url
    }

    /// Persist + activate in one step. Used by the first-run folder picker
    /// so the newly-picked URL becomes the live content root without a
    /// relaunch. Stops accessing any previously-active URL first so the
    /// start/stop pair stays balanced across re-picks.
    @discardableResult
    static func saveAndActivate(
        _ url: URL,
        defaults: UserDefaults = .standard
    ) -> Bool {
        guard save(url, defaults: defaults) else { return false }
        if let previous = activeURL, previous != url {
            previous.stopAccessingSecurityScopedResource()
            activeURL = nil
        }
        guard url.startAccessingSecurityScopedResource() else { return false }
        activeURL = url
        return true
    }

    /// The currently-active security-scoped URL, if `restoreAtLaunch` has
    /// been called and succeeded. Read-only accessor for content-root
    /// consumers that want to know the real path without reactivating.
    static var currentActiveURL: URL? { activeURL }

    /// Display-friendly name of the currently-picked folder, derived from
    /// its last path component. Returns `nil` when nothing is picked.
    /// Used by the sidebar to label the user-source section with the
    /// folder's name ("MyStudy") rather than a generic "Library", so the
    /// learner knows which pile of material they're looking at.
    static var currentRootDisplayName: String? {
        if let url = activeURL {
            let name = url.lastPathComponent
            return name.isEmpty ? nil : name
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
