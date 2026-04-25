import Foundation

/// Phase 7.1 · Folder → document resolver for extracted schemas.
///
/// The "namespace gap" (plan §2.5): extracted schemas live on
/// `LoomTrace.sourceDocId = "ingested:<filename>"`, while reading
/// pages live on `know/<cat>__<file>` or `wiki/<slug>`. This service
/// is the bridge — given a reading docId, it walks persisted traces,
/// finds the nearest syllabus trace that applies, decodes its schema
/// JSON, and layers any user corrections from the sidecar store.
///
/// Designed as a reusable service (not a bridge handler) because
/// Phase 7.2 (assessment → Pursuit seed) and Phase 7.3 (passive
/// AnchorDot projection) both need the same folder → doc matching
/// logic. Q1 of plan §8 (`folder → doc resolver location`) is locked
/// Swift-side here; Phase 7.2/7.3 will import `SchemaResolver`
/// directly rather than duplicate the matching heuristic.
///
/// Matching strategy (verified against the sample FINS 3640 schema
/// in `/tmp/phase6-e2e/fins-3640/loomtrace-events.json`):
///
/// 1. Normalise the reading page's category slug → `uppercaseLetters`
///    and `digitRuns` tokens (e.g. `unsw-fins-3640` → `FINS` + `3640`).
/// 2. Walk every `ingestion-syllabus-pdf` trace. For each, normalise
///    its source filename + any extracted `courseCode` field value
///    into the same token shape.
/// 3. First trace whose token set fully contains the category's
///    tokens wins. Ties break by most-recent `updatedAt` so re-drops
///    of a corrected syllabus supersede earlier versions.
///
/// Wiki pages return `nil` — there is no meaningful "course context"
/// for the generic LLM wiki; any match would be spurious.
///
/// When no syllabus trace matches, returns `nil` — the reading page
/// renders without the strip (plan §5.1 "hide entirely when schema
/// is null", restated in deliverable B).
@MainActor
enum SchemaResolver {

    /// Resolve the best-matching syllabus payload for a reading page.
    /// Returns `nil` when the reading page is not knowledge-scoped, or
    /// when no syllabus trace can be tied to the page's folder.
    ///
    /// Two-stage match (stage 2 added 2026-04-24, plan §6 Phase 7.1
    /// robustness):
    ///   1. **Token match.** Walk every syllabus trace, normalise its
    ///      filename + extracted `courseCode` field into the same
    ///      uppercase-letter / digit-run tokens as the category slug,
    ///      and pick the most-recently-updated full match.
    ///   2. **Folder fallback.** If no token match, count syllabus
    ///      traces whose source file's parent folder slugifies to the
    ///      reading page's category slug. If **exactly one** sibling
    ///      syllabus exists, use it (marked `matchSource = "folder-fallback"`).
    ///      Zero or multiple siblings → return `nil` (forced-pick is
    ///      worse than nothing per `feedback_source_fidelity`).
    ///
    /// `store` is injectable so unit tests can run against an in-memory
    /// `LoomDataStore`; production callers fall through to `.shared`.
    static func resolveSyllabus(
        forReadingDocId readingDocId: String,
        store: LoomDataStore = .shared
    ) -> SchemaPayload? {
        guard let categorySlug = categorySlug(fromReadingDocId: readingDocId) else {
            return nil
        }

        let traces: [LoomTrace]
        do {
            traces = try LoomTraceWriter.allTraces(store: store)
        } catch {
            NSLog("[Loom] SchemaResolver.resolveSyllabus: allTraces failed: \(error)")
            return nil
        }

        // Stage 1 — token match (cheap, deterministic). Skipped when the
        // category slug yields no usable tokens (e.g. `investments` —
        // lowercase only, no digit run); the fallback below covers that
        // case explicitly.
        let categoryTokens = tokens(fromSlug: categorySlug)
        var tokenBest: (trace: LoomTrace, event: [String: Any])? = nil
        if !categoryTokens.isEmpty {
            for trace in traces where trace.kind == "ingestion-\(SyllabusPDFExtractor.extractorId)" {
                guard let event = firstSchemaEvent(in: trace) else { continue }
                let filename = trace.sourceTitle ?? ""
                let filenameTokens = tokens(from: filename)
                let courseCodeTokens = tokens(fromCourseCodeField: event["schemaJSON"] as? String)
                let combined = filenameTokens.union(courseCodeTokens)
                guard categoryTokens.isSubset(of: combined) else { continue }

                if let current = tokenBest {
                    if trace.updatedAt > current.trace.updatedAt {
                        tokenBest = (trace, event)
                    }
                } else {
                    tokenBest = (trace, event)
                }
            }
        }

        if let winner = tokenBest {
            return makePayload(
                trace: winner.trace,
                event: winner.event,
                matchSource: "token"
            )
        }

        // Stage 2 — folder fallback. Only fires when token match
        // produced no winner. Counts syllabi whose parent folder
        // (slugified the same way `ingest-knowledge.ts` slugifies
        // category labels) equals the reading page's category slug.
        var folderCandidates: [(trace: LoomTrace, event: [String: Any])] = []
        for trace in traces where trace.kind == "ingestion-\(SyllabusPDFExtractor.extractorId)" {
            guard let event = firstSchemaEvent(in: trace) else { continue }
            guard let parentSlug = parentFolderSlug(fromTraceHref: trace.sourceHref),
                  parentSlug == categorySlug else {
                continue
            }
            folderCandidates.append((trace, event))
        }

        // "Exactly one" rule — multiple syllabi in the same folder is
        // ambiguous; refusing is honest. Zero is the existing silent
        // miss case (the strip will render the hint UI).
        guard folderCandidates.count == 1, let only = folderCandidates.first else {
            return nil
        }

        return makePayload(
            trace: only.trace,
            event: only.event,
            matchSource: "folder-fallback"
        )
    }

    /// Build a `SchemaPayload` from a winning trace + its first
    /// schema-bearing event. Centralised so the two match paths
    /// (token / folder-fallback) emit identical wire shape modulo
    /// `matchSource`.
    private static func makePayload(
        trace: LoomTrace,
        event: [String: Any],
        matchSource: String
    ) -> SchemaPayload {
        let schemaJSON = (event["schemaJSON"] as? String) ?? "{}"
        let sourceDocId = trace.sourceDocId ?? ""
        let corrections = SchemaCorrectionsStore.read(
            extractorId: SyllabusPDFExtractor.extractorId,
            sourceDocId: sourceDocId
        )
        return SchemaPayload(
            traceId: trace.id,
            extractorId: SyllabusPDFExtractor.extractorId,
            sourceDocId: sourceDocId,
            sourceTitle: trace.sourceTitle ?? "",
            schemaJSON: schemaJSON,
            corrections: corrections,
            updatedAt: trace.updatedAt,
            matchSource: matchSource
        )
    }

    /// Phase 7.3 · Resolve provisional `extractor`-attribution anchors
    /// for a reading page.
    ///
    /// The 7.3 plan (§5.3 / §6) projects `TranscriptSchema.keyQuotes`
    /// and `TextbookSchema.keyTerms` onto the matching reading page's
    /// margin as gray-outlined provisional anchors. Each one carries
    /// `attribution: "extractor"` (Q2 in plan §8 — the first emission
    /// of this widened enum value). The user can confirm or dismiss;
    /// confirmation lands as a real `thought-anchor` event with
    /// `attribution: "mixed"` via the existing IndexedDB capture path,
    /// dismissal lands in a sidecar so the same provisional doesn't
    /// re-render after reload.
    ///
    /// Filename matching: `know/<cat>__<file>` ↔ `ingested:<filename>`.
    /// We slugify the trace's `sourceTitle` (the original filename, sans
    /// extension) and compare against the reading doc's `<file>` portion.
    /// First exact slug match wins; ties break by most-recent updatedAt.
    /// When no transcript or textbook trace matches, returns `[]` and
    /// the reading page renders no provisional layer (silent — plan
    /// §7.1 gate "no spurious anchors").
    static func resolveExtractorAnchors(
        forReadingDocId readingDocId: String
    ) -> [ExtractorAnchorPayload] {
        guard let fileSlug = fileSlug(fromReadingDocId: readingDocId) else {
            return []
        }
        guard !fileSlug.isEmpty else { return [] }

        let traces: [LoomTrace]
        do {
            traces = try LoomTraceWriter.allTraces()
        } catch {
            NSLog("[Loom] SchemaResolver.resolveExtractorAnchors: allTraces failed: \(error)")
            return []
        }

        // Find the best (most-recently-updated) transcript/textbook
        // trace whose filename slug matches.
        var transcriptBest: (trace: LoomTrace, event: [String: Any])? = nil
        var textbookBest: (trace: LoomTrace, event: [String: Any])? = nil

        let transcriptKind = "ingestion-\(TranscriptExtractor.extractorId)"
        let textbookKind = "ingestion-\(TextbookChapterExtractor.extractorId)"

        for trace in traces {
            guard trace.kind == transcriptKind || trace.kind == textbookKind else {
                continue
            }
            guard let event = firstSchemaEvent(in: trace) else { continue }
            let title = trace.sourceTitle ?? ""
            let traceSlug = filenameSlug(from: title)
            guard !traceSlug.isEmpty else { continue }
            guard traceSlug == fileSlug else { continue }

            if trace.kind == transcriptKind {
                if let current = transcriptBest {
                    if trace.updatedAt > current.trace.updatedAt {
                        transcriptBest = (trace, event)
                    }
                } else {
                    transcriptBest = (trace, event)
                }
            } else {
                if let current = textbookBest {
                    if trace.updatedAt > current.trace.updatedAt {
                        textbookBest = (trace, event)
                    }
                } else {
                    textbookBest = (trace, event)
                }
            }
        }

        // Read the dismissal sidecar so already-dismissed anchors are
        // filtered out before they ever reach the web side.
        let dismissed = ExtractorAnchorsDismissedStore.read(docId: readingDocId)

        var out: [ExtractorAnchorPayload] = []
        if let winner = transcriptBest {
            out.append(contentsOf: anchorsFromTranscript(
                trace: winner.trace,
                event: winner.event,
                readingDocId: readingDocId,
                dismissed: dismissed
            ))
        }
        if let winner = textbookBest {
            out.append(contentsOf: anchorsFromTextbook(
                trace: winner.trace,
                event: winner.event,
                readingDocId: readingDocId,
                dismissed: dismissed
            ))
        }
        return out
    }

    /// Resolve by trace id (primary path for the native bridge —
    /// `loom://native/schema/<traceId>.json`). Returns `nil` when the
    /// trace does not exist or is not an ingestion trace.
    static func resolveByTraceId(_ traceId: String) -> SchemaPayload? {
        let traces: [LoomTrace]
        do {
            traces = try LoomTraceWriter.allTraces()
        } catch {
            NSLog("[Loom] SchemaResolver.resolveByTraceId: allTraces failed: \(error)")
            return nil
        }
        guard let trace = traces.first(where: { $0.id == traceId }) else { return nil }
        guard trace.kind.hasPrefix("ingestion-") else { return nil }
        guard let event = firstSchemaEvent(in: trace) else { return nil }

        let extractorId = (event["extractorId"] as? String) ?? String(trace.kind.dropFirst("ingestion-".count))
        let schemaJSON = (event["schemaJSON"] as? String) ?? "{}"
        let sourceDocId = trace.sourceDocId ?? ""
        let corrections = SchemaCorrectionsStore.read(
            extractorId: extractorId,
            sourceDocId: sourceDocId
        )

        return SchemaPayload(
            traceId: trace.id,
            extractorId: extractorId,
            sourceDocId: sourceDocId,
            sourceTitle: trace.sourceTitle ?? "",
            schemaJSON: schemaJSON,
            corrections: corrections,
            updatedAt: trace.updatedAt,
            matchSource: "token"
        )
    }

    // MARK: - Token normalisation

    /// Pull matching tokens out of either a category slug
    /// (`unsw-fins-3640`) or a raw filename (`Course Overview_FINS3640.pdf`).
    /// Tokens are `[A-Z]+` runs (length ≥ 2) and `[0-9]+` runs — the
    /// shape that reliably identifies a university course code across
    /// both sources. Lower-case words are ignored to avoid noise from
    /// course names ("overview", "course", "investments").
    static func tokens(from value: String) -> Set<String> {
        let upper = value.uppercased()
        var result = Set<String>()
        var current = ""
        var currentKind: Character.Kind = .other
        func flush() {
            if currentKind == .letter && current.count >= 2 {
                result.insert(current)
            } else if currentKind == .digit && current.count >= 2 {
                result.insert(current)
            }
            current = ""
        }
        for ch in upper {
            let kind = ch.classify()
            if kind == currentKind && kind != .other {
                current.append(ch)
            } else {
                flush()
                currentKind = kind
                if kind != .other {
                    current.append(ch)
                }
            }
        }
        flush()
        return result
    }

    /// Same as `tokens(from:)` but tolerant of the slug-shape
    /// (`unsw-fins-3640`) — internally upper-cases then routes
    /// through the generic tokenizer. Institution prefixes are removed
    /// because extracted filenames / courseCode fields usually carry
    /// the course code (`FINS3640`) but not the source library prefix
    /// (`UNSW`). Pulled out so the caller's intent is clear at the
    /// call site.
    static func tokens(fromSlug slug: String) -> Set<String> {
        var result = tokens(from: slug)
        result.subtract(["UNSW"])
        return result
    }

    /// Pull the `courseCode` value out of a serialized `SyllabusSchema`
    /// JSON string, if present. The field is `FieldResult<String>`,
    /// which round-trips as either:
    ///   - `{"courseCode": {"status": "found", "value": "FINS3640", ...}}`
    ///   - `{"courseCode": {"status": "not_found", "tried": [...]}}`
    /// We only care about the `found` case; not-found returns empty.
    static func tokens(fromCourseCodeField schemaJSON: String?) -> Set<String> {
        guard let schemaJSON,
              let data = schemaJSON.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let field = root["courseCode"] as? [String: Any],
              (field["status"] as? String) == "found",
              let value = field["value"] as? String else {
            return []
        }
        return tokens(from: value)
    }

    // MARK: - Helpers

    /// Extract the category slug from a reading docId. Matches the
    /// two shapes documented in `lib/doc-context.ts:24-44`:
    ///   - `know/<cat>__<file>`
    ///   - `wiki/<slug>` (returns nil — wiki has no course scope)
    static func categorySlug(fromReadingDocId docId: String) -> String? {
        if docId.hasPrefix("know/") {
            let rest = String(docId.dropFirst("know/".count))
            if let separator = rest.range(of: "__") {
                return String(rest[..<separator.lowerBound])
            }
            return rest
        }
        return nil
    }

    /// Phase 7.1 robustness · Slugify the parent-folder name of a
    /// trace's `sourceHref` so it can be compared against a reading
    /// page's category slug. Mirrors the slugify rule used by
    /// `scripts/ingest-knowledge.ts:slugify` (lowercase NFKD,
    /// non-alphanumerics → `-`, leading/trailing dashes trimmed) so a
    /// folder like `Investments` slugifies to `investments`, matching
    /// the categorySlug emitted by the knowledge-manifest.
    ///
    /// Returns `nil` when the href is missing, not a `file://` URL, or
    /// has no parent folder. Non-file URLs (e.g. `https://`) currently
    /// return `nil` — folder semantics don't apply to remote sources.
    static func parentFolderSlug(fromTraceHref href: String?) -> String? {
        guard let href, !href.isEmpty else { return nil }
        guard let url = URL(string: href), url.isFileURL else { return nil }
        let parent = url.deletingLastPathComponent().lastPathComponent
        guard !parent.isEmpty, parent != "/" else { return nil }
        // Replace `+` with "plus" to match `ingest-knowledge.ts:slugify`
        // (so a folder named `C++ Stuff` slugifies the same on both
        // sides — `c-plus-plus-stuff`). Folder names rarely have
        // recognised extensions, so the trailing-extension strip in
        // `filenameSlug` is a no-op here in practice.
        let plussed = parent.replacingOccurrences(of: "+", with: "-plus-")
        let slug = filenameSlug(from: plussed)
        return slug.isEmpty ? nil : slug
    }

    /// Phase 7.3 · Extract the file-portion slug from a reading docId.
    /// Reading docIds shaped `know/<cat>__<file>` carry the file slug
    /// after the `__` separator. Matches the slug `ingest-knowledge.ts`
    /// produces from the source filename, so trace.sourceTitle's
    /// `filenameSlug` should equal this for a hit.
    static func fileSlug(fromReadingDocId docId: String) -> String? {
        guard docId.hasPrefix("know/") else { return nil }
        let rest = String(docId.dropFirst("know/".count))
        guard let sep = rest.range(of: "__") else { return nil }
        return String(rest[sep.upperBound...])
    }

    /// Phase 7.3 · Slugify a raw filename (with or without extension)
    /// the same way `scripts/ingest-knowledge.ts:slugify` does, so a
    /// trace's `sourceTitle` ("Week 3 Lecture.vtt") slugifies to the
    /// same value the knowledge manifest assigned to the matching
    /// `know/<cat>__<file>` doc ("week-3-lecture").
    static func filenameSlug(from raw: String) -> String {
        // 1. Strip extension (case-insensitive) — `readableTitle` in
        //    `ingest-knowledge.ts` first removes the extension, then
        //    converts `_-` runs to spaces, then `slugify` lowercases
        //    and re-collapses non-alphanumerics into `-`.
        var s = raw
        if let dot = s.lastIndex(of: ".") {
            let extPart = s[s.index(after: dot)...]
            // Only strip recognised extensions to avoid eating "."
            // chars in titles like `v0.5 notes`.
            let known: Set<String> = [
                "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
                "csv", "tsv", "json", "ipynb", "parquet",
                "txt", "md", "mdx",
                "vtt", "srt", "html", "htm",
            ]
            if known.contains(String(extPart).lowercased()) {
                s = String(s[..<dot])
            }
        }
        // 2. Lowercase + ascii-fold via NFKD + collapse non-allowed.
        let lowered = s.lowercased()
        let folded = lowered.applyingTransform(.toLatin, reverse: false) ?? lowered
        let stripped = folded.applyingTransform(.stripCombiningMarks, reverse: false) ?? folded
        var out = ""
        var lastWasDash = true
        for scalar in stripped.unicodeScalars {
            let isLower = scalar >= "a" && scalar <= "z"
            let isDigit = scalar >= "0" && scalar <= "9"
            let isCJK = scalar.value >= 0x4e00 && scalar.value <= 0x9fa5
            if isLower || isDigit || isCJK {
                out.unicodeScalars.append(scalar)
                lastWasDash = false
            } else if !lastWasDash {
                out.append("-")
                lastWasDash = true
            }
        }
        // Trim leading/trailing dashes; cap at 80 chars per
        // `ingest-knowledge.ts:slugify`.
        while out.hasPrefix("-") { out.removeFirst() }
        while out.hasSuffix("-") { out.removeLast() }
        if out.count > 80 { out = String(out.prefix(80)) }
        return out
    }

    // MARK: - Provisional anchor builders

    /// Build provisional anchors from `TranscriptSchema.keyQuotes`. Each
    /// `.found` entry with at least one verified `sourceSpan` becomes
    /// one anchor; `.notFound` entries are skipped (plan §6 Phase 7.3
    /// "Skip .notFound items"). The `fingerprint` is a stable hash over
    /// `(traceId, fieldPath)` so dismissal sidecars survive re-extracts.
    private static func anchorsFromTranscript(
        trace: LoomTrace,
        event: [String: Any],
        readingDocId: String,
        dismissed: Set<String>
    ) -> [ExtractorAnchorPayload] {
        guard let schema = parsedSchema(event: event),
              let quotes = schema["keyQuotes"] as? [[String: Any]] else {
            return []
        }
        let extractorId = (event["extractorId"] as? String) ?? TranscriptExtractor.extractorId
        let sourceDocId = trace.sourceDocId ?? ""
        var out: [ExtractorAnchorPayload] = []
        for (idx, field) in quotes.enumerated() {
            let fieldPath = "keyQuotes[\(idx)]"
            guard let anchor = buildAnchor(
                field: field,
                traceId: trace.id,
                extractorId: extractorId,
                sourceDocId: sourceDocId,
                fieldPath: fieldPath,
                readingDocId: readingDocId,
                dismissed: dismissed
            ) else { continue }
            out.append(anchor)
        }
        return out
    }

    /// Build provisional anchors from `TextbookSchema.keyTerms`. Same
    /// shape as transcript keyQuotes — each `.found` term with a
    /// verified span becomes a provisional anchor.
    private static func anchorsFromTextbook(
        trace: LoomTrace,
        event: [String: Any],
        readingDocId: String,
        dismissed: Set<String>
    ) -> [ExtractorAnchorPayload] {
        guard let schema = parsedSchema(event: event),
              let terms = schema["keyTerms"] as? [[String: Any]] else {
            return []
        }
        let extractorId = (event["extractorId"] as? String) ?? TextbookChapterExtractor.extractorId
        let sourceDocId = trace.sourceDocId ?? ""
        var out: [ExtractorAnchorPayload] = []
        for (idx, field) in terms.enumerated() {
            let fieldPath = "keyTerms[\(idx)]"
            guard let anchor = buildAnchor(
                field: field,
                traceId: trace.id,
                extractorId: extractorId,
                sourceDocId: sourceDocId,
                fieldPath: fieldPath,
                readingDocId: readingDocId,
                dismissed: dismissed
            ) else { continue }
            out.append(anchor)
        }
        return out
    }

    /// Shared `FieldResult<String>` → ExtractorAnchorPayload converter.
    /// Returns `nil` when the field is `.notFound`, has no value, or
    /// has no usable `sourceSpan` quote.
    private static func buildAnchor(
        field: [String: Any],
        traceId: String,
        extractorId: String,
        sourceDocId: String,
        fieldPath: String,
        readingDocId: String,
        dismissed: Set<String>
    ) -> ExtractorAnchorPayload? {
        guard (field["status"] as? String) == "found" else { return nil }
        let value = field["value"] as? String
        let spans = (field["sourceSpans"] as? [[String: Any]]) ?? []
        // Prefer the first span's quote; fall back to value (so a
        // valid keyTerm with no span still renders).
        var quote: String? = nil
        var pageNum: Int? = nil
        if let first = spans.first {
            if let q = first["quote"] as? String, !q.isEmpty {
                quote = q
            }
            if let p = first["pageNum"] as? Int { pageNum = p }
        }
        if quote == nil { quote = value }
        guard let text = quote, !text.isEmpty else { return nil }

        // Deterministic id from (traceId, fieldPath) — survives re-renders
        // and matches the sidecar dismissal fingerprint.
        let fingerprint = "\(traceId)::\(fieldPath)"
        if dismissed.contains(fingerprint) { return nil }

        // Source spans round-trip as plain dictionaries so the
        // resolver doesn't need to understand the full Codable shape.
        let sourceSpans: [[String: Any]] = spans.map { span in
            var out: [String: Any] = [:]
            if let q = span["quote"] as? String { out["quote"] = q }
            if let p = span["pageNum"] as? Int { out["pageNum"] = p }
            if let v = span["verified"] as? Bool { out["verified"] = v }
            return out
        }

        return ExtractorAnchorPayload(
            id: fingerprint,
            docId: readingDocId,
            traceId: traceId,
            extractorId: extractorId,
            sourceDocId: sourceDocId,
            fieldPath: fieldPath,
            text: text,
            pageNum: pageNum,
            fingerprint: fingerprint,
            sourceSpans: sourceSpans
        )
    }

    /// Decode the full schema JSON dictionary from a trace event.
    private static func parsedSchema(event: [String: Any]) -> [String: Any]? {
        guard let schemaJSON = event["schemaJSON"] as? String,
              let data = schemaJSON.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return parsed
    }

    /// Pull the first `thought-anchor` event with a non-empty
    /// `schemaJSON` string from a trace. IngestionView persists
    /// exactly one such event per trace (`IngestionView.swift:763-784`)
    /// but we tolerate extras gracefully.
    private static func firstSchemaEvent(in trace: LoomTrace) -> [String: Any]? {
        guard let data = trace.eventsJSON.data(using: .utf8),
              let events = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return nil
        }
        return events.first { event in
            guard (event["kind"] as? String) == "thought-anchor" else { return false }
            guard let schemaJSON = event["schemaJSON"] as? String else { return false }
            return !schemaJSON.isEmpty && schemaJSON != "{}"
        }
    }
}

// MARK: - SchemaPayload

/// The serialised response for `loom://native/schema/<traceId>.json`
/// and the internal resolver output. Kept as plain values so the
/// bridge handler can JSON-serialise in one step without reaching
/// back into the schema Codable stack.
struct SchemaPayload {
    let traceId: String
    let extractorId: String
    let sourceDocId: String
    let sourceTitle: String
    /// Serialised schema (the original string pulled from the
    /// trace's `eventsJSON.schemaJSON` field — NOT re-encoded). The
    /// web side re-parses it and applies corrections at render time.
    let schemaJSON: String
    /// Corrections layered over the schema at read time. Oldest-first
    /// — later corrections win per field path.
    let corrections: [SchemaCorrectionsStore.Correction]
    let updatedAt: Double
    /// How the resolver picked this trace:
    ///   - `"token"` — filename / courseCode token match (high
    ///     confidence; the historical default).
    ///   - `"folder-fallback"` — only one syllabus PDF in the same
    ///     folder, name didn't carry a course-code token. The web
    ///     layer can show subtle provenance UI for this case so the
    ///     user knows the match wasn't deterministic.
    let matchSource: String

    func jsonDictionary() -> [String: Any] {
        // Schema JSON is re-parsed into a dictionary so the web side
        // can consume `response.schema` directly without a second
        // JSON.parse. Falling back to null if the stored JSON is
        // malformed — the consumer renders nothing rather than
        // crashing.
        let schemaObject: Any
        if let data = schemaJSON.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) {
            schemaObject = parsed
        } else {
            schemaObject = NSNull()
        }
        return [
            "traceId": traceId,
            "extractorId": extractorId,
            "sourceDocId": sourceDocId,
            "sourceTitle": sourceTitle,
            "schema": schemaObject,
            "corrections": corrections.map { c in
                [
                    "fieldPath": c.fieldPath,
                    "original": c.original,
                    "corrected": c.corrected,
                    "at": c.at,
                ] as [String: Any]
            },
            "updatedAt": updatedAt,
            "matchSource": matchSource,
        ]
    }
}

// MARK: - ExtractorAnchorPayload

/// Phase 7.3 · A single provisional anchor projected onto a reading
/// page from a transcript / textbook schema. Serialised as the payload
/// items of `loom://native/extractor-anchors-for-doc/<docId>.json`.
///
/// `attribution` is fixed to `"extractor"` on the wire — the type
/// union widening shipped in Phase 7.1 (`lib/trace/types.ts:149`) and
/// this is its first emitter (Q2 in plan §8). On confirm, the web
/// side promotes the value to `"mixed"` when it writes the real
/// thought-anchor event into IndexedDB.
struct ExtractorAnchorPayload {
    /// Stable React key. Same as `fingerprint` today.
    let id: String
    let docId: String
    let traceId: String
    let extractorId: String
    let sourceDocId: String
    let fieldPath: String
    let text: String
    let pageNum: Int?
    let fingerprint: String
    let sourceSpans: [[String: Any]]

    func jsonDictionary() -> [String: Any] {
        var dict: [String: Any] = [
            "id": id,
            "docId": docId,
            "traceId": traceId,
            "extractorId": extractorId,
            "sourceDocId": sourceDocId,
            "fieldPath": fieldPath,
            "text": text,
            "fingerprint": fingerprint,
            "attribution": "extractor",
            "status": "provisional",
            "sourceSpans": sourceSpans,
        ]
        if let pageNum {
            dict["pageNum"] = pageNum
        }
        return dict
    }
}

// MARK: - Character.Kind

private extension Character {
    enum Kind {
        case letter
        case digit
        case other
    }

    func classify() -> Kind {
        if isLetter { return .letter }
        if isNumber { return .digit }
        return .other
    }
}
