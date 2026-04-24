import Foundation

// MARK: - ExtractorRegistry
//
// Plan §3.4 — dispatch. Every concrete typed extractor declares a
// `match()` score; the registry picks the highest-scoring extractor for
// a given file. `GenericDocExtractor` keeps a constant 0.1 baseline so
// any typed extractor that matches at all wins, and unclaimed files
// still have a fallback.
//
// **Swift-existential caveat:** `IngestExtractor` has an associated
// type (`Schema`), so you can't hold `[any IngestExtractor.Type]` in
// a collection and call `match()` through it directly — the compiler
// can't bind `Schema` to anything concrete in that context. We
// sidestep that with a small type-erased struct: the registration
// captures `match` + `extractorId` as closures / strings, and drops
// the associated-type machinery at the boundary. Phase 5 wiring that
// actually runs an extractor calls it by its concrete type anyway.

/// Type-erased extractor registration. `match` is the same heuristic
/// `IngestExtractor.match(...)` returns; `extractorId` is the stable
/// kebab-case id used for dispatch and trace persistence. `description`
/// is the Phase 5 gate copy. `run` is the type-erased entry point the
/// caller uses once the registry has picked a winner; it receives text
/// + filename + docId, calls the concrete extractor's `extract()`, and
/// packages the result as `AnyIngestResult` so the caller never has to
/// touch the associated-type machinery.
struct ExtractorRegistration {
    let extractorId: String
    let match: (_ filename: String, _ parentPath: String, _ sample: String) -> Double
    let description: SchemaDescription
    /// Type-erased entry point. `pageRanges` (optional) carries the
    /// PDF page-offset table from `PDFExtraction` so the winning
    /// extractor's `verifySpans` pass can populate `SourceSpan.pageNum`
    /// post-hoc (2026-04-24 tech-debt fix; plan §10 open question 5).
    /// Non-PDF sources pass `nil` and every `pageNum` stays nil.
    let run: (_ text: String, _ filename: String, _ docId: String, _ pageRanges: [PageRange]?) async throws -> AnyIngestResult
}

/// Result of a registry-dispatched extraction. Cases match 1:1 with
/// `IngestExtractorResultView.Schema`, so the view layer can switch on
/// `self` and render the right schema view without an extra mapping
/// step. Persistence encodes the concrete schema JSON via the
/// per-case associated value.
enum AnyIngestResult {
    case syllabus(SyllabusSchema)
    case transcript(TranscriptSchema)
    case textbook(TextbookSchema)
    case slideDeck(SlideDeckSchema)
    case markdownNotes(MarkdownNotesSchema)
    case spreadsheet(SpreadsheetSchema)
    case generic(GenericSchema)

    /// Extractor id that produced this result — persisted as
    /// `kind = "ingestion-\(extractorId)"` on the LoomTrace.
    var extractorId: String {
        switch self {
        case .syllabus: return SyllabusPDFExtractor.extractorId
        case .transcript: return TranscriptExtractor.extractorId
        case .textbook: return TextbookChapterExtractor.extractorId
        case .slideDeck: return SlideDeckExtractor.extractorId
        case .markdownNotes: return MarkdownNotesExtractor.extractorId
        case .spreadsheet: return SpreadsheetExtractor.extractorId
        case .generic: return GenericDocExtractor.extractorId
        }
    }

    /// Encode the concrete schema as JSON for persistence in
    /// `LoomTrace.eventsJSON`. Callers decode via `extractorId` since
    /// SwiftData has no schema field today (plan constraint: do NOT
    /// change LoomDataModel schema — pack into eventsJSON).
    func encodeJSON() throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data: Data
        switch self {
        case .syllabus(let s):       data = try encoder.encode(s)
        case .transcript(let s):     data = try encoder.encode(s)
        case .textbook(let s):       data = try encoder.encode(s)
        case .slideDeck(let s):      data = try encoder.encode(s)
        case .markdownNotes(let s):  data = try encoder.encode(s)
        case .spreadsheet(let s):    data = try encoder.encode(s)
        case .generic(let s):        data = try encoder.encode(s)
        }
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    /// Derive a short human-readable summary for the trace list surface
    /// (history row). Each case returns its most identifying string:
    /// course code + name for a syllabus, H1 title for markdown, etc.
    /// Falls back to a static label when the schema is sparse.
    var displaySummary: String {
        switch self {
        case .syllabus(let s):
            let parts = [fieldValue(s.courseCode), fieldValue(s.courseName)]
                .compactMap { $0 }
            return parts.isEmpty ? "Syllabus" : parts.joined(separator: " — ")
        case .transcript(let s):
            return fieldValue(s.title) ?? "Transcript"
        case .textbook(let s):
            return fieldValue(s.chapterTitle) ?? "Textbook chapter"
        case .slideDeck(let s):
            return fieldValue(s.deckTitle) ?? "Slide deck"
        case .markdownNotes(let s):
            if let t = s.title, !t.isEmpty { return t }
            return "Markdown notes · \(s.wordCount) words"
        case .spreadsheet(let s):
            let sheets = s.sheets.count
            return "Spreadsheet · \(sheets) sheet\(sheets == 1 ? "" : "s") · \(s.totalRows) row\(s.totalRows == 1 ? "" : "s")"
        case .generic(let s):
            return s.summary.isEmpty ? s.rawOutput : s.summary
        }
    }

    private func fieldValue(_ result: FieldResult<String>) -> String? {
        if case .found(let value, _, _) = result, !value.isEmpty { return value }
        return nil
    }
}

enum ExtractorRegistry {
    /// Registered extractors, highest-priority typed ones first, then
    /// `GenericDocExtractor` as the always-available fallback. Phase 1
    /// shipped `SyllabusPDFExtractor`; Phase 3 (2026-04-24) adds the
    /// remaining typed extractors per plan §3.3.
    ///
    /// Order matters for ties: `bestMatch` keeps the first-seen entry
    /// when scores are equal, so put the more-specific extractors ahead
    /// of broader ones. The current ranking:
    ///
    ///   • Syllabus      — PDFs with syllabus keyword (0.9)
    ///   • SlideDeck     — .pptx/.key (0.9) or slide-density PDFs (0.7)
    ///   • Transcript    — .vtt/.srt (0.95) or timestamp-heavy .txt (0.85)
    ///   • Textbook      — chapter-named files (0.85) or long ISBN PDFs (0.7)
    ///   • Spreadsheet   — .csv/.tsv/.xlsx/.xls (0.9)
    ///   • MarkdownNotes — .md/.mdx/.txt without transcript signal (0.9)
    ///   • Generic       — fallback (0.1)
    static let all: [ExtractorRegistration] = [
        ExtractorRegistration(
            extractorId: SyllabusPDFExtractor.extractorId,
            match: SyllabusPDFExtractor.match(filename:parentPath:sample:),
            description: SyllabusPDFExtractor.schemaDescription,
            run: { text, filename, docId, pageRanges in
                let schema = try await SyllabusPDFExtractor()
                    .extract(text: text, filename: filename, docId: docId, pageRanges: pageRanges)
                return .syllabus(schema)
            }
        ),
        ExtractorRegistration(
            extractorId: SlideDeckExtractor.extractorId,
            match: SlideDeckExtractor.match(filename:parentPath:sample:),
            description: SlideDeckExtractor.schemaDescription,
            run: { text, filename, docId, pageRanges in
                let schema = try await SlideDeckExtractor()
                    .extract(text: text, filename: filename, docId: docId, pageRanges: pageRanges)
                return .slideDeck(schema)
            }
        ),
        ExtractorRegistration(
            extractorId: TranscriptExtractor.extractorId,
            match: TranscriptExtractor.match(filename:parentPath:sample:),
            description: TranscriptExtractor.schemaDescription,
            run: { text, filename, docId, pageRanges in
                let schema = try await TranscriptExtractor()
                    .extract(text: text, filename: filename, docId: docId, pageRanges: pageRanges)
                return .transcript(schema)
            }
        ),
        ExtractorRegistration(
            extractorId: TextbookChapterExtractor.extractorId,
            match: TextbookChapterExtractor.match(filename:parentPath:sample:),
            description: TextbookChapterExtractor.schemaDescription,
            run: { text, filename, docId, pageRanges in
                let schema = try await TextbookChapterExtractor()
                    .extract(text: text, filename: filename, docId: docId, pageRanges: pageRanges)
                return .textbook(schema)
            }
        ),
        ExtractorRegistration(
            extractorId: SpreadsheetExtractor.extractorId,
            match: SpreadsheetExtractor.match(filename:parentPath:sample:),
            description: SpreadsheetExtractor.schemaDescription,
            run: { text, filename, docId, pageRanges in
                let schema = try await SpreadsheetExtractor()
                    .extract(text: text, filename: filename, docId: docId, pageRanges: pageRanges)
                return .spreadsheet(schema)
            }
        ),
        ExtractorRegistration(
            extractorId: MarkdownNotesExtractor.extractorId,
            match: MarkdownNotesExtractor.match(filename:parentPath:sample:),
            description: MarkdownNotesExtractor.schemaDescription,
            run: { text, filename, docId, pageRanges in
                let schema = try await MarkdownNotesExtractor()
                    .extract(text: text, filename: filename, docId: docId, pageRanges: pageRanges)
                return .markdownNotes(schema)
            }
        ),
        ExtractorRegistration(
            extractorId: GenericDocExtractor.extractorId,
            match: GenericDocExtractor.match(filename:parentPath:sample:),
            description: GenericDocExtractor.schemaDescription,
            run: { text, filename, docId, pageRanges in
                let schema = try await GenericDocExtractor()
                    .extract(text: text, filename: filename, docId: docId, pageRanges: pageRanges)
                return .generic(schema)
            }
        ),
    ]

    /// `all` lookup by extractor id. Used by the ingest UI when it
    /// needs to re-resolve the winning registration from a persisted
    /// trace kind (`ingestion-syllabus-pdf` → `syllabus-pdf`).
    static func byId(_ id: String) -> ExtractorRegistration? {
        all.first { $0.extractorId == id }
    }

    /// Pick the registration with the highest `match()` score. Ties
    /// break in registration order (typed extractors listed first win
    /// against the generic fallback when they tie at 0.1 — but that
    /// tie can't happen because typed extractors only score 0 or ≥0.8
    /// today).
    static func bestMatch(
        filename: String,
        parentPath: String,
        sample: String
    ) -> ExtractorRegistration {
        bestMatchWithScore(filename: filename, parentPath: parentPath, sample: sample).registration
    }

    /// Like `bestMatch` but also returns the winning score so the
    /// Phase 5 gate can apply the ≥0.7 threshold (fall back to
    /// Generic when the typed winner's confidence is below that).
    static func bestMatchWithScore(
        filename: String,
        parentPath: String,
        sample: String
    ) -> (registration: ExtractorRegistration, score: Double) {
        var best = all[0]
        var bestScore = best.match(filename, parentPath, sample)
        for registration in all.dropFirst() {
            let score = registration.match(filename, parentPath, sample)
            if score > bestScore {
                best = registration
                bestScore = score
            }
        }
        return (best, bestScore)
    }
}
