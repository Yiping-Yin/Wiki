import Foundation

/// Phase 7.3 · Dismissal sidecar for provisional extractor anchors.
///
/// When the user right-clicks a gray-outlined extractor anchor and
/// chooses "dismiss", the anchor's fingerprint lands in a sidecar at:
///
///     <userData>/knowledge/.cache/extractor-anchors-dismissed/
///         <slugified-readingDocId>.json
///
/// Subsequent opens of the same reading page filter out any
/// provisional whose fingerprint is in the dismissal set, so the
/// anchor stays gone across reloads (plan §6 Phase 7.3 deliverable
/// C: "Sidecar at … so re-render doesn't bring it back").
///
/// Designed as a strict mirror of `SchemaCorrectionsStore` — same
/// slug rule, same user-data-vs-content-root precedence, same
/// `JSON-friendly Codable shape so the bridge handler can serialise
/// without going through the full Swift Codable stack.
///
/// On the web side, the matching writer is
/// `loomExtractorAnchors.postMessage({action: "dismiss", ...})` which
/// routes to `LoomExtractorAnchorsBridgeHandler.swift` and ends here.
/// In dev / browser mode the matching `/api/extractor-anchors-dismissed`
/// route writes the same sidecar via the `lib/extractor-anchors-dismissed.ts`
/// helper.
enum ExtractorAnchorsDismissedStore {

    struct DismissedFile: Codable {
        let docId: String
        let dismissedFingerprints: [String]
    }

    /// Read the dismissal set for a reading docId. Returns an empty
    /// set when no sidecar exists — the resolver renders all
    /// extractor-found anchors in that case.
    static func read(docId: String) -> Set<String> {
        for url in readURLs(docId: docId) {
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            guard let data = try? Data(contentsOf: url),
                  let parsed = try? JSONDecoder().decode(DismissedFile.self, from: data) else {
                continue
            }
            return Set(parsed.dismissedFingerprints)
        }
        return []
    }

    /// Append a fingerprint to the dismissal set. Idempotent — re-
    /// dismissing the same fingerprint is a no-op (returned set is
    /// the same shape as before). Returns the full post-write list so
    /// the bridge can echo it back to the JS caller.
    @discardableResult
    static func append(docId: String, fingerprint: String) throws -> [String] {
        guard let url = userDataURL(docId: docId) else {
            throw NSError(
                domain: "LoomExtractorAnchorsDismissed",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Could not resolve user-data path"]
            )
        }

        var existing = read(docId: docId)
        existing.insert(fingerprint)
        let next = Array(existing).sorted()

        let file = DismissedFile(
            docId: docId,
            dismissedFingerprints: next
        )
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(file)
        try data.write(to: url, options: .atomic)
        return next
    }

    /// Read-side URL list — user-data first (primary), then content
    /// root (legacy fallback). Mirrors `SchemaCorrectionsStore`.
    private static func readURLs(docId: String) -> [URL] {
        var urls: [URL] = []
        if let user = userDataURL(docId: docId) {
            urls.append(user)
        }
        if let content = contentRootURL(docId: docId) {
            urls.append(content)
        }
        return urls
    }

    static func userDataURL(docId: String) -> URL? {
        let root = URL(fileURLWithPath: LoomRuntimePaths.appSupportRoot())
            .appendingPathComponent("user-data", isDirectory: true)
            .appendingPathComponent("knowledge", isDirectory: true)
            .appendingPathComponent(".cache", isDirectory: true)
            .appendingPathComponent("extractor-anchors-dismissed", isDirectory: true)
            .appendingPathComponent("\(slugified(docId)).json")
        return root
    }

    static func contentRootURL(docId: String) -> URL? {
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
            .appendingPathComponent("extractor-anchors-dismissed", isDirectory: true)
            .appendingPathComponent("\(slugified(docId)).json")
    }

    /// Slug docId for filesystem safety. Mirrors the Phase 7.1 rule
    /// in `SchemaCorrectionsStore.slugified`.
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
}
