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
/// kebab-case id used for dispatch and trace persistence.
struct ExtractorRegistration {
    let extractorId: String
    let match: (_ filename: String, _ parentPath: String, _ sample: String) -> Double
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
            match: SyllabusPDFExtractor.match(filename:parentPath:sample:)
        ),
        ExtractorRegistration(
            extractorId: SlideDeckExtractor.extractorId,
            match: SlideDeckExtractor.match(filename:parentPath:sample:)
        ),
        ExtractorRegistration(
            extractorId: TranscriptExtractor.extractorId,
            match: TranscriptExtractor.match(filename:parentPath:sample:)
        ),
        ExtractorRegistration(
            extractorId: TextbookChapterExtractor.extractorId,
            match: TextbookChapterExtractor.match(filename:parentPath:sample:)
        ),
        ExtractorRegistration(
            extractorId: SpreadsheetExtractor.extractorId,
            match: SpreadsheetExtractor.match(filename:parentPath:sample:)
        ),
        ExtractorRegistration(
            extractorId: MarkdownNotesExtractor.extractorId,
            match: MarkdownNotesExtractor.match(filename:parentPath:sample:)
        ),
        ExtractorRegistration(
            extractorId: GenericDocExtractor.extractorId,
            match: GenericDocExtractor.match(filename:parentPath:sample:)
        ),
    ]

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
        var best = all[0]
        var bestScore = best.match(filename, parentPath, sample)
        for registration in all.dropFirst() {
            let score = registration.match(filename, parentPath, sample)
            if score > bestScore {
                best = registration
                bestScore = score
            }
        }
        return best
    }
}
