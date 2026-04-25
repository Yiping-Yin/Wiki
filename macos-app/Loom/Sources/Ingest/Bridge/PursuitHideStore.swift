import Foundation

/// Phase 7.2 · Per-pursuit hide sidecar.
///
/// Q3 of plan §8 locked: ingest-time spawn produces Pursuits the user
/// hasn't yet seen. The escape valve is a per-pursuit "hide" toggle —
/// the user dismisses individual auto-spawned Pursuits without losing
/// them, and can restore later from a "hidden N · show" disclosure
/// at the bottom of the Pursuits room.
///
/// **Reversible** — never delete the Pursuit row, only mark it hidden.
/// This satisfies the "full adjustment right" clause of
/// `feedback_learn_not_organize.md` and the deliverable C constraint
/// ("Per-pursuit hide is reversible — never delete; always restorable").
///
/// Storage layout mirrors `SchemaCorrectionsStore` exactly (deliverable
/// C requirement: "match Phase 7.1's pattern: Swift writer + Next.js
/// fallback writer, both writing to the same path with the same
/// slugify rule"):
///
///     <user-data-root>/knowledge/.cache/pursuit-hide/
///         <slugified-sourceDocId>.json
///
/// Sidecar shape:
///
///     {
///       "sourceDocId": "ingested:Course Overview_FINS3640.pdf",
///       "hiddenPursuitIds": ["uuid-1", "uuid-3"]
///     }
///
/// Read order matches `SchemaCorrectionsStore.readURLs`: user-data
/// first, then content-root fallback.
enum PursuitHideStore {

    struct HideFile: Codable {
        let sourceDocId: String
        let hiddenPursuitIds: [String]
    }

    /// Read the hidden pursuit ids for a given sourceDocId. Returns
    /// an empty array when no sidecar exists. Order is preserved from
    /// the sidecar file (insertion order); callers that need a Set
    /// should construct one inline.
    static func read(sourceDocId: String) -> [String] {
        for url in readURLs(sourceDocId: sourceDocId) {
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            guard let data = try? Data(contentsOf: url),
                  let parsed = try? JSONDecoder().decode(HideFile.self, from: data) else {
                continue
            }
            return parsed.hiddenPursuitIds
        }
        return []
    }

    /// Read every hidden pursuit id across every sourceDocId sidecar
    /// in the user-data and content-root pursuit-hide directories.
    /// Used by the native bridge to project a single "all hidden ids"
    /// set into the web layer; the web side does not need to know
    /// which sourceDocId each hide came from to filter the Pursuits
    /// list. Returns a deduplicated set.
    static func readAll() -> Set<String> {
        var ids = Set<String>()
        for dir in allDirURLs() {
            guard let files = try? FileManager.default.contentsOfDirectory(
                at: dir,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            ) else { continue }
            for fileURL in files where fileURL.pathExtension == "json" {
                guard let data = try? Data(contentsOf: fileURL),
                      let parsed = try? JSONDecoder().decode(HideFile.self, from: data) else {
                    continue
                }
                for id in parsed.hiddenPursuitIds { ids.insert(id) }
            }
        }
        return ids
    }

    /// Append a pursuit id to the hidden list. No-op when already
    /// hidden — keeps the sidecar deduplicated so a future "show all"
    /// helper does not get confused. Returns the post-write list.
    @discardableResult
    static func hide(
        pursuitId: String,
        sourceDocId: String
    ) throws -> [String] {
        guard let url = userDataURL(sourceDocId: sourceDocId) else {
            throw NSError(
                domain: "LoomPursuitHide",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Could not resolve user-data path"]
            )
        }
        var existing = read(sourceDocId: sourceDocId)
        guard !existing.contains(pursuitId) else { return existing }
        existing.append(pursuitId)
        try writeAtomic(url: url, file: HideFile(
            sourceDocId: sourceDocId,
            hiddenPursuitIds: existing
        ))
        return existing
    }

    /// Remove a pursuit id from the hidden list. No-op when already
    /// visible. Returns the post-write list. The "restore" path —
    /// per deliverable C, hides are always reversible.
    @discardableResult
    static func restore(
        pursuitId: String,
        sourceDocId: String
    ) throws -> [String] {
        guard let url = userDataURL(sourceDocId: sourceDocId) else {
            throw NSError(
                domain: "LoomPursuitHide",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Could not resolve user-data path"]
            )
        }
        var existing = read(sourceDocId: sourceDocId)
        let next = existing.filter { $0 != pursuitId }
        if next.count == existing.count { return existing }
        existing = next
        try writeAtomic(url: url, file: HideFile(
            sourceDocId: sourceDocId,
            hiddenPursuitIds: existing
        ))
        return existing
    }

    // MARK: - URL resolution (mirrors SchemaCorrectionsStore)

    private static func readURLs(sourceDocId: String) -> [URL] {
        var urls: [URL] = []
        if let user = userDataURL(sourceDocId: sourceDocId) {
            urls.append(user)
        }
        if let content = contentRootURL(sourceDocId: sourceDocId) {
            urls.append(content)
        }
        return urls
    }

    private static func allDirURLs() -> [URL] {
        var urls: [URL] = []
        if let user = userDataDirURL() { urls.append(user) }
        if let content = contentRootDirURL() { urls.append(content) }
        return urls
    }

    static func userDataDirURL() -> URL? {
        return URL(fileURLWithPath: LoomRuntimePaths.appSupportRoot())
            .appendingPathComponent("user-data", isDirectory: true)
            .appendingPathComponent("knowledge", isDirectory: true)
            .appendingPathComponent(".cache", isDirectory: true)
            .appendingPathComponent("pursuit-hide", isDirectory: true)
    }

    static func contentRootDirURL() -> URL? {
        let root: URL
        if let active = SecurityScopedFolderStore.currentActiveURL {
            root = active
        } else if let path = LoomRuntimePaths.resolveContentRoot() {
            root = URL(fileURLWithPath: path)
        } else {
            return nil
        }
        return root
            .appendingPathComponent("knowledge", isDirectory: true)
            .appendingPathComponent(".cache", isDirectory: true)
            .appendingPathComponent("pursuit-hide", isDirectory: true)
    }

    static func userDataURL(sourceDocId: String) -> URL? {
        guard let dir = userDataDirURL() else { return nil }
        return dir.appendingPathComponent("\(slugified(sourceDocId)).json")
    }

    static func contentRootURL(sourceDocId: String) -> URL? {
        guard let dir = contentRootDirURL() else { return nil }
        return dir.appendingPathComponent("\(slugified(sourceDocId)).json")
    }

    /// Same slug rule as `SchemaCorrectionsStore.slugified` — preserves
    /// alphanumerics, dash, underscore, CJK; everything else becomes
    /// `_`. Identical implementation so the two sidecars sit alongside
    /// each other with consistent filename collation.
    static func slugified(_ value: String) -> String {
        var out = ""
        for scalar in value.unicodeScalars {
            if (scalar >= "a" && scalar <= "z") ||
               (scalar >= "A" && scalar <= "Z") ||
               (scalar >= "0" && scalar <= "9") ||
               scalar == "-" || scalar == "_" ||
               (scalar.value >= 0x4e00 && scalar.value <= 0x9fa5) {
                out.unicodeScalars.append(scalar)
            } else {
                out += "_"
            }
        }
        return out
    }

    private static func writeAtomic(url: URL, file: HideFile) throws {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(file)
        try data.write(to: url, options: .atomic)
    }
}
