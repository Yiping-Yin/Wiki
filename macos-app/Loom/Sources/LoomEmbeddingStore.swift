import Foundation
import NaturalLanguage

// MARK: Phase B — local embedding + similarity surface
//
// Every committed capture is embedded once (using Apple's on-device
// NLEmbedding model) and stored alongside its anchor + a short body
// snippet in a per-root JSON sidecar:
//
//     <store>/<rootID>/_embeddings.json
//
// At capture time, the sheet queries this store with the candidate
// body's embedding; the top matches above a similarity threshold get
// surfaced as "类似既有捕获" hints. This is the differentiation move
// against Web Clipper — every new capture is contextualized against
// everything already in the system.
//
// Design choices for v1:
// - NLEmbedding.sentenceEmbedding(for:) is per-language. We pick by
//   detecting the dominant script (CJK → simplifiedChinese, else →
//   english). Mixed-language docs land in whichever side dominates.
// - Vectors are ~512-dim Doubles. JSON-serialized; tiny per record
//   (~5KB each). 100K records ~500MB — well within bounds for v1.
// - Cosine similarity in pure Swift, no external math libs.
// - All work hops to a private serial queue so capture-time UI never
//   blocks on embed/index reads.

/// One indexed entry in a root's embedding sidecar. The body snippet
/// is what we surface in the "looks similar" hint — keeping it inline
/// avoids a second disk read when previewing matches.
struct EmbeddingRecord: Codable, Identifiable {
    let id: UUID
    /// Anchor identifier (matches `CaptureAnchor.id`). Lets the hint
    /// click-through to the right Loom.md.
    let anchorID: String
    /// User-readable anchor label (e.g. "Web · arxiv.org" or
    /// "Foo.pdf · p.3"). Frozen at capture time.
    let anchorLabel: String
    /// Path inside the file store where the entry lives. Persisted
    /// rather than re-derived so a future anchor schema change
    /// doesn't orphan old records.
    let targetPath: String
    /// First ~200 chars of the body, normalized. Used for the hint
    /// preview AND as the dedup fingerprint.
    let snippet: String
    /// ISO-8601 timestamp (so the sidecar reads cleanly in editors).
    let capturedAt: String
    /// Embedding vector. Length depends on which NLEmbedding model
    /// produced it (≈512 for English sentence; CJK varies).
    let vector: [Double]
    /// Detected language family ("en" / "zh" / "ja" / "und"). Used
    /// to compare embeddings only against same-family records (cross-
    /// language cosine values are noisy).
    let lang: String
}

enum LoomEmbeddingStore {
    /// Cosine threshold above which a candidate counts as "similar
    /// enough" to surface in the capture hint. 0.70 is conservative —
    /// we'd rather miss matches than create noisy false positives.
    static let similarityThreshold: Double = 0.70

    /// Maximum number of similar records to return per query.
    static let topK: Int = 5

    /// Serial queue for all read/write/embed work. Keeps the sheet
    /// non-blocking while still being thread-safe (sidecar is a single
    /// file; concurrent writes corrupt it).
    private static let queue = DispatchQueue(label: "com.loom.embedding-store")

    // MARK: Public API

    /// Add a record for a freshly-saved capture. Embeds the body,
    /// loads the sidecar, appends, writes back. Failures are swallowed
    /// — embedding is an optimization, not a correctness contract.
    static func index(
        rootID: UUID,
        anchorID: String,
        anchorLabel: String,
        targetPath: String,
        body: String,
        capturedAt: Date = Date()
    ) {
        queue.async {
            guard let (vector, lang) = embed(body) else { return }
            let record = EmbeddingRecord(
                id: UUID(),
                anchorID: anchorID,
                anchorLabel: anchorLabel,
                targetPath: targetPath,
                snippet: snippetize(body),
                capturedAt: ISO8601DateFormatter().string(from: capturedAt),
                vector: vector,
                lang: lang
            )
            var records = loadSidecar(rootID: rootID)
            records.append(record)
            saveSidecar(rootID: rootID, records: records)
        }
    }

    /// Return up to `topK` records similar to `body` from the given
    /// root's sidecar, ordered by similarity descending. Synchronous
    /// for caller convenience — the sheet treats this as part of its
    /// open-time setup, not a streaming query.
    static func similar(to body: String, in rootID: UUID) -> [SimilarHit] {
        return similar(to: body, in: [rootID], limit: topK)
    }

    /// Cross-root similarity query — used by "related captures" panels
    /// that surface across the full personal wiki, not just one root.
    /// This is what makes Loom's connection layer differentiate against
    /// per-vault tools (Obsidian / Web Clipper): a capture in MATH 1241
    /// can be summoned while the user is reading INFS 3822.
    static func similarAcrossAllRoots(to body: String, limit: Int = topK) -> [SimilarHit] {
        let allRootIDs = Array(ContentRootStore.allActiveURLs.keys)
        return similar(to: body, in: allRootIDs, limit: limit)
    }

    /// Cross-root primitive that backs both `similar(to:in:)` and
    /// `similarAcrossAllRoots(to:)`. Loads each root's sidecar in
    /// turn, scores against the query embedding, returns the top
    /// matches across all of them.
    static func similar(to body: String, in rootIDs: [UUID], limit: Int) -> [SimilarHit] {
        var output: [SimilarHit] = []
        queue.sync {
            guard let (vector, lang) = embed(body) else { return }
            var pool: [SimilarHit] = []
            for rid in rootIDs {
                let records = loadSidecar(rootID: rid)
                for rec in records {
                    if rec.lang != "und" && lang != "und" && rec.lang != lang {
                        continue
                    }
                    let s = cosine(vector, rec.vector)
                    guard s >= similarityThreshold else { continue }
                    pool.append(SimilarHit(record: rec, similarity: s))
                }
            }
            output = pool
                .sorted(by: { $0.similarity > $1.similarity })
                .prefix(limit)
                .map { $0 }
        }
        return output
    }

    struct SimilarHit: Identifiable {
        let record: EmbeddingRecord
        let similarity: Double
        var id: UUID { record.id }
    }

    // MARK: Diagnostics

    /// Per-root snapshot of embedding inventory. Used by the in-app
    /// status panel so the user can verify the pipeline is actually
    /// recording captures (and not silently failing).
    struct RootStats: Identifiable {
        let rootID: UUID
        let label: String
        let recordCount: Int
        let languageBreakdown: [String: Int]
        var id: UUID { rootID }
    }

    /// Returns one RootStats per active ContentRoot. Synchronous and
    /// quick (just sidecar reads).
    static func diagnosticStats() -> [RootStats] {
        var out: [RootStats] = []
        let roots = ContentRootStore.loadAll()
        let active = ContentRootStore.allActiveURLs
        queue.sync {
            for root in roots where active[root.id] != nil {
                let records = loadSidecar(rootID: root.id)
                var langs: [String: Int] = [:]
                for r in records { langs[r.lang, default: 0] += 1 }
                out.append(RootStats(
                    rootID: root.id,
                    label: root.displayName,
                    recordCount: records.count,
                    languageBreakdown: langs
                ))
            }
        }
        return out
    }

    /// Probe whether the on-device sentence embedding model is loaded
    /// for a given language. Used by the diagnostic surface to flag
    /// "embedding will silently fall back to English" cases on macOS
    /// versions that don't ship CJK models.
    static func modelAvailable(for lang: NLLanguage) -> Bool {
        return NLEmbedding.sentenceEmbedding(for: lang) != nil
    }

    // MARK: Embedding

    /// Embed `text` into a vector + language tag. Picks NLEmbedding
    /// model based on the dominant script. Returns nil when the text
    /// is too short or the model isn't available on this OS version.
    private static func embed(_ text: String) -> ([Double], String)? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 8 else { return nil }
        let lang = detectLanguage(trimmed)
        let nlLang: NLLanguage = {
            switch lang {
            case "zh":  return .simplifiedChinese
            case "ja":  return .japanese
            default:    return .english
            }
        }()
        guard let model = NLEmbedding.sentenceEmbedding(for: nlLang) else {
            // Fallback to English embedding when the requested model
            // isn't available — better than nothing.
            guard let fallback = NLEmbedding.sentenceEmbedding(for: .english),
                  let v = fallback.vector(for: trimmed) else { return nil }
            return (v, "und")
        }
        // NLEmbedding returns nil for empty / model-unsupported input;
        // guard so we don't store a zero-vector that pollutes scoring.
        guard let v = model.vector(for: trimmed) else { return nil }
        return (v, lang)
    }

    /// Two-bucket script detector: "zh" / "ja" / "en". Cheap, doesn't
    /// load NLLanguageRecognizer for every embed (NLLanguageRecognizer
    /// is expensive to construct repeatedly).
    private static func detectLanguage(_ text: String) -> String {
        var cjk = 0
        var hiragana = 0
        var ascii = 0
        for s in text.unicodeScalars {
            let v = s.value
            if (0x4E00...0x9FFF).contains(v) || (0x3400...0x4DBF).contains(v) {
                cjk += 1
            } else if (0x3040...0x309F).contains(v) {
                hiragana += 1
            } else if (0x30A0...0x30FF).contains(v) {
                hiragana += 1
            } else if (0x41...0x7A).contains(v) {
                ascii += 1
            }
        }
        if hiragana > 0 { return "ja" }
        if cjk >= max(2, ascii / 4) { return "zh" }
        if ascii > 0 { return "en" }
        return "und"
    }

    /// Cosine similarity between two equally-sized vectors. Returns 0
    /// when sizes mismatch (cross-model records — extremely rare since
    /// we pick model by language, but guard anyway).
    private static func cosine(_ a: [Double], _ b: [Double]) -> Double {
        guard a.count == b.count, !a.isEmpty else { return 0 }
        var dot: Double = 0
        var magA: Double = 0
        var magB: Double = 0
        for i in 0..<a.count {
            dot += a[i] * b[i]
            magA += a[i] * a[i]
            magB += b[i] * b[i]
        }
        let denom = (magA.squareRoot() * magB.squareRoot())
        guard denom > 0 else { return 0 }
        return dot / denom
    }

    private static func snippetize(_ body: String) -> String {
        let collapsed = body
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "  ", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if collapsed.count <= 200 { return collapsed }
        let cut = collapsed.index(collapsed.startIndex, offsetBy: 200)
        return String(collapsed[..<cut]) + "…"
    }

    // MARK: Sidecar I/O

    private static func sidecarURL(rootID: UUID) -> URL {
        LoomFileStore.pageDirectoryURL(for: rootID)
            .appendingPathComponent("_embeddings.json")
    }

    private static func loadSidecar(rootID: UUID) -> [EmbeddingRecord] {
        let url = sidecarURL(rootID: rootID)
        guard let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([EmbeddingRecord].self, from: data)) ?? []
    }

    private static func saveSidecar(rootID: UUID, records: [EmbeddingRecord]) {
        let url = sidecarURL(rootID: rootID)
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let data = try JSONEncoder().encode(records)
            try data.write(to: url, options: .atomic)
        } catch {
            // Failures are non-fatal — the user's saved Loom.md is
            // canonical; the sidecar is purely an optimization.
            NSLog("LoomEmbeddingStore: failed to write \(url.path): \(error)")
        }
    }
}
