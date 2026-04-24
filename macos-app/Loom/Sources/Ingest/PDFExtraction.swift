import Foundation
import PDFKit

// MARK: - PDFExtraction
//
// Phase 2 (plan §4) — deliverable B. Wraps PDFKit extraction + the
// Phase 2 `CleanText.apply()` port in a single entry point so every
// Swift-side PDF ingest goes through the same pipeline as the Node
// folder-scan path (`lib/pdf-extract.ts` → `cleanText()`).
//
// Before this file, `IngestionView.extractPDFText()` called
// `PDFDocument.page(at:).string` with NO cleaning — TOC dot-leaders
// intact, standalone page numbers included, nothing column-aware.
// That produced materially different text than the Node pipeline for
// the SAME PDF, which broke golden-file tests and AI-extractor parity.
//
// ### Page-offset table
//
// `ExtractedPDF.pageRanges` records `[charStart, charEnd)` for each
// page's contribution to the FINAL cleaned text. The mapping is
// derived before cleaning (cumulative UTF-16 offsets of the
// concatenated raw text) and then re-projected through the cleaner
// using a conservative heuristic: each page's raw slice is cleaned
// independently using the same transforms, and the cleaned slice
// lengths are used for the output `pageRanges`. This is only an
// approximation — some cross-page transforms (e.g. repeated-header
// detection, hyphen-break reflow) can move text across the boundary.
// For Phase 2 the ranges are "best effort"; plan §10 open-question 5
// flags full page-boundary preservation as future work once
// Swift-side SourceSpan page-mapping is wired into the UI.
//
// ### Relationship to `PDFDocument.page(at:).string`
//
// PDFKit's `.string` returns text in reading order per page, which is
// NOT the same as the Y-coordinate line reconstruction that
// `lib/pdf-extract.ts` does with pdfjs-dist. End-to-end byte parity
// between Node and Swift pipelines is NOT achievable here — the raw
// extractors disagree. What IS achievable (and tested) is that the
// cleaning pass (step 2+) produces identical output GIVEN identical
// input; see `Tests/CleanTextParityTests.swift`.

/// Result of extracting a single PDF. `text` is the fully cleaned
/// output that should be handed to downstream extractors; `pageRanges`
/// is a best-effort mapping from page numbers to cleaned-text UTF-16
/// offset windows; `originalText` is the pre-clean concatenation,
/// retained for debugging and for downstream diffing if the cleaning
/// pass ever needs to be bypassed.
///
/// `PageRange` is defined in `PageRange.swift` — the same type flows
/// through `verifySpans` so `SourceSpan.pageNum` can be populated
/// post-hoc (2026-04-24 tech-debt fix; plan §10 open question 5).
public struct ExtractedPDF {
    public let text: String
    public let pageRanges: [PageRange]
    public let originalText: String
}

public enum PDFExtractionError: Error {
    case unreadable
    case empty
}

public enum PDFExtraction {
    /// Extract cleaned plaintext + page ranges from a PDF on disk.
    ///
    /// Pipeline:
    /// 1. PDFKit opens the document; each page's `.string` is
    ///    collected in order.
    /// 2. Pages are concatenated with `\n\n` separators (matching
    ///    `lib/pdf-extract.ts`'s `pageTexts.join('\n\n')`).
    /// 3. The raw concatenation is truncated to `maxChars * 2` UTF-16
    ///    chars as a guard against pathological PDFs (post-clean
    ///    typically shrinks output by 10–30%, so 2× headroom is
    ///    plenty before the final `maxChars` slice in `CleanText`).
    /// 4. `CleanText.apply(_:maxChars:)` runs the full Node-parity
    ///    pipeline (plan §4 Phase 2).
    /// 5. Per-page cleaning is re-run over each page's raw slice to
    ///    populate `pageRanges` — see file-level comment for caveats.
    public static func extract(url: URL, maxChars: Int = 6000) throws -> ExtractedPDF {
        guard let document = PDFDocument(url: url) else {
            throw PDFExtractionError.unreadable
        }

        var pageTexts: [String] = []
        pageTexts.reserveCapacity(document.pageCount)
        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { continue }
            pageTexts.append(page.string ?? "")
        }

        // Match Node: pageTexts.join('\n\n').slice(0, maxChars). We
        // let CleanText.apply's own maxChars handle the final clip;
        // any earlier clip would risk a mid-transform truncation that
        // Node doesn't do.
        let rawJoined = pageTexts.joined(separator: "\n\n")
        // Raw-size safety cap: 200 KB matches the IngestionView
        // `maxBytes` limit — stops rogue PDFs from ballooning memory
        // through the cleaning passes.
        let rawCap = 200_000
        let rawForClean: String
        if rawJoined.utf8.count > rawCap {
            let data = rawJoined.data(using: .utf8) ?? Data()
            let clipped = data.prefix(rawCap)
            rawForClean = String(data: clipped, encoding: .utf8) ?? rawJoined
        } else {
            rawForClean = rawJoined
        }

        let cleaned = CleanText.apply(rawForClean, maxChars: maxChars)
        if cleaned.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw PDFExtractionError.empty
        }

        // Build page ranges by re-running CleanText over each page
        // independently and walking through the (approximate) cumulative
        // offsets in `cleaned`. Cross-page transforms (hyphen breaks,
        // repeated-header filtering) can shift text slightly, so we
        // clip each page's projected end to the actual cleaned length.
        //
        // This is a best-effort map — see file-level docs.
        var ranges: [PageRange] = []
        ranges.reserveCapacity(pageTexts.count)
        var cursor = 0
        let cleanedUTF16Len = cleaned.utf16.count
        for (i, raw) in pageTexts.enumerated() {
            let pageCleaned = CleanText.apply(raw, maxChars: maxChars)
            let length = pageCleaned.utf16.count
            let start = min(cursor, cleanedUTF16Len)
            // Approximate separator contribution ("\n\n" → " " under
            // the reflow rule when adjacent non-newline chars exist,
            // which is the overwhelmingly common case). We add 1 UTF-16
            // unit to `cursor` per separator to keep pages from
            // overlapping in the output range.
            let end = min(start + length, cleanedUTF16Len)
            ranges.append(PageRange(page: i + 1, charStart: start, charEnd: end))
            cursor = end + 1
        }

        return ExtractedPDF(text: cleaned, pageRanges: ranges, originalText: rawJoined)
    }
}
