import Foundation

/// Phase 7.2 · Provenance metadata for spawned Pursuits.
///
/// Deliverable D ("Pursuit attribution / metadata") asks: did the
/// existing `LoomPursuit` carry an `origin` field? **No** — the model
/// has only `id`, `question`, `weight`, `season`, `sourceDocIdsJSON`,
/// `panelIdsJSON`, `createdAt`, `updatedAt`, `settledAt`. Adding a
/// new field to `LoomPursuit` would force a SwiftData migration
/// for a strictly-additive metadata signal. The deliverable allows
/// "ADD one to the Pursuit type" but warns it should be "quiet
/// metadata, not user-facing".
///
/// Cleaner path that respects "preserve and deepen": keep
/// `LoomPursuit` intact and store provenance in a sidecar file.
/// This matches the Phase 7.1 idiom (sidecar JSON layered at read
/// time, never mutating the source) and makes "from syllabus" a
/// pure projection — when the sidecar is missing, the Pursuit just
/// looks like a user-minted one. The webview reads the sidecar via
/// the same native bridge as the Pursuits list.
///
/// Storage layout:
///
///     <user-data-root>/knowledge/.cache/pursuit-spawn/
///         <slugified-sourceDocId>.json
///
/// Sidecar shape:
///
///     {
///       "sourceDocId": "ingested:Course Overview_FINS3640.pdf",
///       "entries": [
///         {
///           "pursuitId": "<uuid>",
///           "sourceTraceId": "<trace-uuid>",
///           "extractorId": "syllabus-pdf",
///           "fieldPath": "assessmentItems[0].name",
///           "sourceTitle": "Course Overview_FINS3640.pdf",
///           "body": "20% · due Friday Week 5\nGroup report (1500 words)",
///           "at": 1714000000000
///         }
///       ]
///     }
///
/// Per-source-doc files keep growth bounded and align cleanly with
/// `PursuitHideStore` — one course's spawn metadata sits alongside
/// the same course's hide list.
enum PursuitSpawnMetaStore {

    struct Entry: Codable {
        let pursuitId: String
        let sourceTraceId: String
        let extractorId: String
        let fieldPath: String
        let sourceTitle: String
        let body: String
        let at: Double
    }

    struct File: Codable {
        let sourceDocId: String
        let entries: [Entry]
    }

    /// Append a spawn-meta entry. Failures log + return — spawn
    /// metadata is best-effort polish; never block Pursuit creation
    /// on a sidecar write error.
    static func append(
        pursuitId: String,
        sourceTraceId: String,
        sourceDocId: String,
        sourceTitle: String,
        extractorId: String,
        fieldPath: String,
        body: String,
        at: Double = Date().timeIntervalSince1970 * 1000
    ) {
        guard let url = userDataURL(sourceDocId: sourceDocId) else {
            NSLog("[Loom] PursuitSpawnMetaStore.append: no user-data path")
            return
        }
        let existing = read(sourceDocId: sourceDocId)
        let entry = Entry(
            pursuitId: pursuitId,
            sourceTraceId: sourceTraceId,
            extractorId: extractorId,
            fieldPath: fieldPath,
            sourceTitle: sourceTitle,
            body: body,
            at: at
        )
        let next = existing + [entry]
        let file = File(sourceDocId: sourceDocId, entries: next)
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(file)
            try data.write(to: url, options: .atomic)
        } catch {
            NSLog("[Loom] PursuitSpawnMetaStore.append write failed: \(error)")
        }
    }

    /// Read entries for a single sourceDocId. Empty array on
    /// missing/malformed sidecar.
    static func read(sourceDocId: String) -> [Entry] {
        for url in readURLs(sourceDocId: sourceDocId) {
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            guard let data = try? Data(contentsOf: url),
                  let parsed = try? JSONDecoder().decode(File.self, from: data) else {
                continue
            }
            return parsed.entries
        }
        return []
    }

    /// Read every entry across every sourceDocId sidecar. Used by
    /// `buildPursuitsPayload` to project a `pursuitId → entry` map
    /// into the web layer in one pass; web side merges by id without
    /// having to know which sourceDocId each spawn came from.
    static func readAllEntriesById() -> [String: Entry] {
        var byId: [String: Entry] = [:]
        for dir in allDirURLs() {
            guard let files = try? FileManager.default.contentsOfDirectory(
                at: dir,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            ) else { continue }
            for fileURL in files where fileURL.pathExtension == "json" {
                guard let data = try? Data(contentsOf: fileURL),
                      let parsed = try? JSONDecoder().decode(File.self, from: data) else {
                    continue
                }
                for entry in parsed.entries {
                    byId[entry.pursuitId] = entry
                }
            }
        }
        return byId
    }

    // MARK: - URL resolution

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
            .appendingPathComponent("pursuit-spawn", isDirectory: true)
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
            .appendingPathComponent("pursuit-spawn", isDirectory: true)
    }

    static func userDataURL(sourceDocId: String) -> URL? {
        guard let dir = userDataDirURL() else { return nil }
        return dir.appendingPathComponent("\(PursuitHideStore.slugified(sourceDocId)).json")
    }

    static func contentRootURL(sourceDocId: String) -> URL? {
        guard let dir = contentRootDirURL() else { return nil }
        return dir.appendingPathComponent("\(PursuitHideStore.slugified(sourceDocId)).json")
    }
}
