import Foundation

/// Where Loom keeps its OWN markdown data — `Loom.md` files,
/// attachments, sub-page folders. Strictly separate from the user's
/// picked folders, which stay read-only authoritative sources.
///
/// Architecture (post-refactor 2026-04-26):
///   - User's picked folders (via `+ Folder`) are NEVER written to.
///     Loom only reads them via security-scoped bookmark.
///   - Every `ContentRoot` (folder-backed or pure `+ Page`) gets a
///     subfolder under the file store: `<store>/<id>/`.
///   - That subfolder holds `Loom.md` + any Loom-managed sub-pages /
///     attachments.
///
/// Default location: sandbox-container `Documents/Loom Data/`. A
/// future Settings entry will let the user move the store to a
/// Finder-visible / iCloud-synced location via NSOpenPanel +
/// security-scoped bookmark.
enum LoomFileStore {
    static let defaultsKey = "loom.file-store.location.v1"

    /// Resolved URL of the file-store root. Falls back to the
    /// app-container default when the user hasn't picked a custom
    /// location yet.
    static var rootURL: URL {
        if let custom = customRootURL() { return custom }
        return defaultRootURL()
    }

    /// Subdirectory for a specific page (root). Created on demand so
    /// callers can write straight into it without separate setup.
    static func pageDirectoryURL(for rootID: UUID, fileManager: FileManager = .default) -> URL {
        let dir = rootURL.appendingPathComponent(rootID.uuidString.lowercased(), isDirectory: true)
        if !fileManager.fileExists(atPath: dir.path) {
            try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    /// `Loom.md` path for a specific page. Caller can create / read /
    /// write at this URL freely; the parent directory is auto-created.
    static func loomMDURL(for rootID: UUID) -> URL {
        pageDirectoryURL(for: rootID).appendingPathComponent("Loom.md")
    }

    /// Inbox markdown path for a root. Captures with no specific
    /// anchor (quick-capture from global hotkey, AI-paste from generic
    /// clipboard) land here as time-stamped entries under `## Notes`.
    /// Lives at `<store>/<rootID>/sub/Inbox/Loom.md` so it appears as a
    /// regular sub-page in the wiki tree — opening it reuses the
    /// existing folder-home rendering for free.
    static func inboxURL(for rootID: UUID) -> URL {
        loomMDURL(for: rootID, subPath: "Inbox")
    }

    /// `Loom.md` path for a sub-path within a rooted folder. Mirrors
    /// the user's external folder hierarchy inside the sandbox-managed
    /// store so per-subfolder notes don't all collapse into one file.
    /// `subPath` is a forward-slash-joined relative path; empty/nil
    /// returns the root-level Loom.md.
    ///
    /// Example: rootID `ABC…`, subPath `Guide` →
    ///   `<store>/abc…/sub/Guide/Loom.md`
    ///
    /// Hard rule (Source Fidelity, 2026-04-27): the user's external
    /// folder is read-only authoritative source. Loom-generated
    /// metadata MUST live in the file store; never write into the
    /// user's picked folders.
    static func loomMDURL(
        for rootID: UUID,
        subPath: String,
        fileManager: FileManager = .default
    ) -> URL {
        let trimmed = subPath
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if trimmed.isEmpty {
            return loomMDURL(for: rootID)
        }
        let dir = pageDirectoryURL(for: rootID, fileManager: fileManager)
            .appendingPathComponent("sub", isDirectory: true)
            .appendingPathComponent(trimmed, isDirectory: true)
        if !fileManager.fileExists(atPath: dir.path) {
            try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir.appendingPathComponent("Loom.md")
    }

    // MARK: - Custom location (future)

    private static func customRootURL(defaults: UserDefaults = .standard) -> URL? {
        guard let data = defaults.data(forKey: defaultsKey) else { return nil }
        var isStale = false
        guard let url = try? URL(
            resolvingBookmarkData: data,
            options: [.withSecurityScope],
            relativeTo: nil,
            bookmarkDataIsStale: &isStale
        ), !isStale else {
            return nil
        }
        _ = url.startAccessingSecurityScopedResource()
        return url
    }

    @discardableResult
    static func setCustomLocation(_ url: URL, defaults: UserDefaults = .standard) -> Bool {
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

    // MARK: - Default fallback

    /// Container's `Documents/Loom Data/`. Always writable since it's
    /// inside the app's own sandbox space. Created on demand.
    private static func defaultRootURL(fileManager: FileManager = .default) -> URL {
        let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
        let store = documents.appendingPathComponent("Loom Data", isDirectory: true)
        if !fileManager.fileExists(atPath: store.path) {
            try? fileManager.createDirectory(at: store, withIntermediateDirectories: true)
        }
        return store
    }
}
