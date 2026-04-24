import Foundation

/// Phase 7.1 · Corrections sidecar for extracted schemas.
///
/// The extracted `SyllabusSchema` (and sibling schemas) live inside
/// `LoomTrace.eventsJSON` — an append-only provenance log that must
/// never be mutated after extraction. When the user corrects a value
/// on a reading-page Course Context chip, the correction is layered
/// at read time via a sidecar JSON file:
///
///     <contentRoot>/knowledge/.cache/schema-corrections/
///         <extractorId>/<slugified-sourceDocId>.json
///
/// This mirrors the pattern in `lib/source-corrections.ts` — the same
/// "full adjustment right" clause of `feedback_learn_not_organize.md`
/// without mutating the source or the extractor output.
///
/// Swift-side reads the sidecar when `SchemaResolver` assembles the
/// `loom://native/schema/<traceId>.json` payload so the UI sees the
/// corrected values without a second network round-trip. In the shipped
/// native app, writes also happen Swift-side via
/// `LoomSchemaCorrectionsBridgeHandler`; in browser/dev mode the matching
/// Next.js `POST /api/schema-corrections` route writes the content-root
/// fallback sidecar.
enum SchemaCorrectionsStore {

    struct Correction: Codable {
        let fieldPath: String
        let original: String
        let corrected: String
        let at: Double

        enum CodingKeys: String, CodingKey {
            case fieldPath, original, corrected, at
        }

        init(fieldPath: String, original: String, corrected: String, at: Double) {
            self.fieldPath = fieldPath
            self.original = original
            self.corrected = corrected
            self.at = at
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            fieldPath = (try? container.decode(String.self, forKey: .fieldPath)) ?? ""
            original = (try? container.decode(String.self, forKey: .original)) ?? ""
            corrected = (try? container.decode(String.self, forKey: .corrected)) ?? ""
            at = (try? container.decode(Double.self, forKey: .at)) ?? 0
        }
    }

    struct CorrectionsFile: Codable {
        let extractorId: String
        let sourceDocId: String
        let corrections: [Correction]
    }

    /// Read corrections for a given (extractorId, sourceDocId) pair.
    /// Returns an empty array when no sidecar exists — the strip
    /// renders the raw extracted schema in that case (§3 design gate).
    static func read(extractorId: String, sourceDocId: String) -> [Correction] {
        for url in readURLs(extractorId: extractorId, sourceDocId: sourceDocId) {
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            guard let data = try? Data(contentsOf: url),
                  let parsed = try? JSONDecoder().decode(CorrectionsFile.self, from: data) else {
                continue
            }
            // Oldest-first — later corrections layer on top (matches the
            // sort convention in lib/source-corrections.ts:63).
            return parsed.corrections.sorted { $0.at < $1.at }
        }
        return []
    }

    /// Append a correction for a given (extractorId, sourceDocId) and
    /// return the full post-write list. Writes always land in the
    /// user-data directory — the content root is treated as read-only
    /// source material (same rule `SourceLibraryNativeStore` applies).
    @discardableResult
    static func append(
        extractorId: String,
        sourceDocId: String,
        fieldPath: String,
        original: String,
        corrected: String,
        at: Double = Date().timeIntervalSince1970 * 1000
    ) throws -> [Correction] {
        guard let url = userDataURL(extractorId: extractorId, sourceDocId: sourceDocId) else {
            throw NSError(
                domain: "LoomSchemaCorrections",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Could not resolve user-data path"]
            )
        }

        let existing = read(extractorId: extractorId, sourceDocId: sourceDocId)
        let entry = Correction(
            fieldPath: fieldPath,
            original: original,
            corrected: corrected,
            at: at
        )
        let next = existing + [entry]

        let file = CorrectionsFile(
            extractorId: extractorId,
            sourceDocId: sourceDocId,
            corrections: next
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
    /// root (fallback for pre-provisioned corrections if any). Matches
    /// the read order in `SourceLibraryNativeStore.metadataReadURLs()`.
    private static func readURLs(extractorId: String, sourceDocId: String) -> [URL] {
        var urls: [URL] = []
        if let user = userDataURL(extractorId: extractorId, sourceDocId: sourceDocId) {
            urls.append(user)
        }
        if let content = contentRootURL(extractorId: extractorId, sourceDocId: sourceDocId) {
            urls.append(content)
        }
        return urls
    }

    static func userDataURL(extractorId: String, sourceDocId: String) -> URL? {
        let root = URL(fileURLWithPath: LoomRuntimePaths.appSupportRoot())
            .appendingPathComponent("user-data", isDirectory: true)
            .appendingPathComponent("knowledge", isDirectory: true)
            .appendingPathComponent(".cache", isDirectory: true)
            .appendingPathComponent("schema-corrections", isDirectory: true)
            .appendingPathComponent(slugifiedExtractorId(extractorId), isDirectory: true)
            .appendingPathComponent("\(slugified(sourceDocId)).json")
        return root
    }

    static func contentRootURL(extractorId: String, sourceDocId: String) -> URL? {
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
            .appendingPathComponent("schema-corrections", isDirectory: true)
            .appendingPathComponent(slugifiedExtractorId(extractorId), isDirectory: true)
            .appendingPathComponent("\(slugified(sourceDocId)).json")
    }

    /// Slug sourceDocId for filesystem safety. Mirrors the approach
    /// used in `lib/source-corrections.ts:41` (allow CJK, strip
    /// punctuation). Kept tolerant so paths like `ingested:Course
    /// Overview_FINS3640.pdf` don't collide when their prefixes match.
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

    private static func slugifiedExtractorId(_ id: String) -> String {
        // extractor ids are already safe kebab-case today; still go
        // through the same normalizer so a future misbehaving id
        // (`"syllabus/pdf"`) can't escape the directory.
        slugified(id)
    }
}
