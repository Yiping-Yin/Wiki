import Foundation

// MARK: - PageRange
//
// Multi-page `SourceSpan.pageNum` gap-fill (plan §10 open question 5 +
// tech-debt cleanup 2026-04-24). `SourceSpan.pageNum` has been part of
// the schema since Phase 1 but was never populated for PDF sources — the
// `verifySpans` pipeline had no way to map a cleaned-text char offset
// back to the page that produced it.
//
// `PDFExtraction.extract()` already emits a best-effort page table
// (`[(page, start, end)]`). This file turns that into a first-class
// `PageRange` struct with a binary-search helper so every typed extractor
// that threads `pageRanges` through to `verifySpans` will automatically
// populate `SourceSpan.pageNum` post-hoc.
//
// Non-PDF sources (Markdown, Spreadsheet, HTML fetch, text drop) never
// have page ranges — `pageRanges` stays nil and `pageNum` stays nil on
// every emitted span. Fully backwards-compatible.

/// Contribution of one source page to the final cleaned text window.
///
/// `charStart` / `charEnd` are UTF-16 offsets into the cleaned text
/// (post `CleanText.apply()`), matching the offset semantics used by
/// `locate()` and every other place in the ingest pipeline. `page` is
/// 1-indexed to match the Node + Python sides.
///
/// Cross-page transforms in the cleaning pipeline (repeated-header
/// stripping, hyphen-break reflow) can shift text slightly across
/// boundaries. `PDFExtraction` builds the ranges by running `CleanText`
/// per-page and walking cumulative lengths — a "best effort" map with
/// documented drift typically under ±5 UTF-16 units on UNSW syllabi.
public struct PageRange: Codable, Equatable {
    /// 1-indexed page number.
    public let page: Int
    /// Inclusive UTF-16 char start in the cleaned text.
    public let charStart: Int
    /// Exclusive UTF-16 char end in the cleaned text.
    public let charEnd: Int

    public init(page: Int, charStart: Int, charEnd: Int) {
        self.page = page
        self.charStart = charStart
        self.charEnd = charEnd
    }
}

/// Return the 1-indexed page number whose `[charStart, charEnd)` window
/// contains `offset`, or `nil` when no range contains the offset
/// (possible at exact end-of-document boundaries, or when ranges have a
/// gap from separator reflow).
///
/// Runs in O(log n) via binary search. Input ranges MUST be sorted by
/// `charStart` with non-overlapping windows — `PDFExtraction` always
/// builds them that way, so callers don't need to pre-validate.
public func pageForCharOffset(_ offset: Int, in ranges: [PageRange]) -> Int? {
    guard offset >= 0, !ranges.isEmpty else { return nil }

    // Binary search: find the rightmost range with `charStart <= offset`,
    // then check whether `offset < charEnd`. Missing that check is the
    // classic off-by-one in range-containment searches — we guard it.
    var lo = 0
    var hi = ranges.count - 1
    var candidate: Int? = nil
    while lo <= hi {
        let mid = (lo + hi) / 2
        if ranges[mid].charStart <= offset {
            candidate = mid
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }

    guard let idx = candidate else { return nil }
    let range = ranges[idx]
    if offset < range.charEnd {
        return range.page
    }
    // Exact-end-of-range hit: callers at the document tail fall off the
    // last range by 1. Be permissive on the final page — an offset equal
    // to the last `charEnd` still belongs to that page in practice.
    if idx == ranges.count - 1, offset == range.charEnd {
        return range.page
    }
    return nil
}

/// Resolve a located quote span to a page.
///
/// Normal containment uses the span start, matching `pageForCharOffset`.
/// For PDF-derived cleaned text, repeated-header stripping and hyphen
/// reflow can move the first few UTF-16 units of a quote across a page
/// boundary. When the quote starts just before the next page but extends
/// across that boundary, prefer the next page.
public func pageForSpan(
    _ span: Range<Int>,
    in ranges: [PageRange],
    boundaryTolerance: Int = 5
) -> Int? {
    guard span.lowerBound >= 0, !ranges.isEmpty else { return nil }

    let tolerance = max(0, boundaryTolerance)
    if tolerance > 0, ranges.count > 1 {
        for idx in ranges.indices.dropLast() {
            let nextIndex = ranges.index(after: idx)
            let boundary = ranges[nextIndex].charStart
            if span.lowerBound < boundary,
               span.upperBound > boundary,
               boundary - span.lowerBound <= tolerance {
                return ranges[nextIndex].page
            }
        }
    }

    return pageForCharOffset(span.lowerBound, in: ranges)
}
