import XCTest
@testable import Loom

/// Multi-page `SourceSpan.pageNum` gap-fill tests (2026-04-24 tech-debt
/// phase; plan §10 open question 5).
///
/// Covers:
///   1. `pageForCharOffset` binary search (basic + boundaries + nil)
///   2. `verifySpans` populates `pageNum` from `pageRanges` when provided
///   3. `verifySpans` leaves `pageNum` nil when `pageRanges` is nil
///      (backwards-compatible path for non-PDF sources)
///   4. Cross-page drift tolerance: when cleanText transforms shift a
///      quote by a few UTF-16 units, the derived page still resolves to
///      the correct page (documented tolerance ±5 chars in plan).
final class PageRangeTests: XCTestCase {

    // MARK: - pageForCharOffset basic

    func testPageForCharOffsetBasic() {
        let ranges = [
            PageRange(page: 1, charStart: 0,   charEnd: 100),
            PageRange(page: 2, charStart: 100, charEnd: 250),
            PageRange(page: 3, charStart: 250, charEnd: 400),
        ]
        XCTAssertEqual(pageForCharOffset(0,   in: ranges), 1)
        XCTAssertEqual(pageForCharOffset(50,  in: ranges), 1)
        XCTAssertEqual(pageForCharOffset(99,  in: ranges), 1)
        XCTAssertEqual(pageForCharOffset(100, in: ranges), 2)
        XCTAssertEqual(pageForCharOffset(249, in: ranges), 2)
        XCTAssertEqual(pageForCharOffset(250, in: ranges), 3)
        XCTAssertEqual(pageForCharOffset(399, in: ranges), 3)
    }

    func testPageForCharOffsetOutOfRange() {
        let ranges = [
            PageRange(page: 1, charStart: 0,   charEnd: 100),
            PageRange(page: 2, charStart: 100, charEnd: 250),
            PageRange(page: 3, charStart: 250, charEnd: 400),
        ]
        // Past the last page's end — off by more than one, nil.
        XCTAssertEqual(pageForCharOffset(500, in: ranges), nil)
        // Negative offset (guard against bad input).
        XCTAssertEqual(pageForCharOffset(-1,  in: ranges), nil)
    }

    func testPageForCharOffsetFinalBoundaryInclusive() {
        // Document-tail quote at exactly `charEnd` of the last page:
        // permissive by design so end-of-doc quotes don't render with
        // `pageNum: nil`.
        let ranges = [
            PageRange(page: 1, charStart: 0,   charEnd: 100),
            PageRange(page: 2, charStart: 100, charEnd: 250),
        ]
        XCTAssertEqual(pageForCharOffset(250, in: ranges), 2)
    }

    func testPageForCharOffsetEmptyRanges() {
        XCTAssertNil(pageForCharOffset(0, in: []))
    }

    // MARK: - verifySpans wires pageRanges through

    func testVerifySpansWithPageRangesPopulatesPageNum() {
        // Synthetic 2-page layout. "Body on page 2" sits past char 28
        // so it resolves to page 2 via pageForCharOffset.
        let source = "Header text\n\n--- PAGE 2 ---\n\nBody on page 2"
        let ranges = [
            PageRange(page: 1, charStart: 0,  charEnd: 28),
            PageRange(page: 2, charStart: 28, charEnd: source.utf16.count),
        ]
        let span = SourceSpan(
            docId: "test",
            pageNum: nil,
            charStart: 0,
            charEnd: 0,
            quote: "Body on page 2",
            verified: false,
            verifyReason: nil
        )
        let result: FieldResult<String> = .found(
            value: "body text",
            confidence: 0.9,
            sourceSpans: [span]
        )
        let verified = verifySpans(result, sourceText: source, docId: "test", pageRanges: ranges)
        guard case .found(_, _, let spans) = verified else {
            XCTFail("expected .found after verify")
            return
        }
        XCTAssertEqual(spans.count, 1)
        XCTAssertEqual(spans[0].pageNum, 2, "body-on-page-2 quote should resolve to page 2")
        XCTAssertTrue(spans[0].verified)
    }

    func testVerifySpansWithoutPageRangesLeavesPageNumNil() {
        // No pageRanges passed — legacy path for non-PDF sources. Any
        // pageNum the AI echoed is preserved (in practice the AI never
        // emits pageNum; we hard-code nil on the input here).
        let source = "A short markdown body with one quoted phrase."
        let span = SourceSpan(
            docId: "test",
            pageNum: nil,
            charStart: 0,
            charEnd: 0,
            quote: "one quoted phrase",
            verified: false,
            verifyReason: nil
        )
        let result: FieldResult<String> = .found(
            value: "phrase",
            confidence: 0.9,
            sourceSpans: [span]
        )
        let verified = verifySpans(result, sourceText: source, docId: "test")
        guard case .found(_, _, let spans) = verified else {
            XCTFail("expected .found")
            return
        }
        XCTAssertEqual(spans[0].pageNum, nil)
        XCTAssertTrue(spans[0].verified)
    }

    func testVerifySpansPreservesExistingPageNumWhenRangesNil() {
        // If the AI (or an upstream pass) supplied a pageNum and we're
        // not deriving a new one, preserve the incoming value so edits
        // propagate cleanly through re-verification.
        let source = "Inline body with target phrase embedded."
        let span = SourceSpan(
            docId: "test",
            pageNum: 7,
            charStart: 0,
            charEnd: 0,
            quote: "target phrase",
            verified: false,
            verifyReason: nil
        )
        let result: FieldResult<String> = .found(
            value: "target phrase",
            confidence: 0.9,
            sourceSpans: [span]
        )
        let verified = verifySpans(result, sourceText: source, docId: "test", pageRanges: nil)
        guard case .found(_, _, let spans) = verified else {
            XCTFail("expected .found")
            return
        }
        XCTAssertEqual(spans[0].pageNum, 7)
    }

    func testVerifySpansMultiSpanDerivesPerSpanPage() {
        // Two quotes on different pages — each span resolves
        // independently.
        let source = "Page one body content here.\n\n---\n\nPage two deeper content."
        let ranges = [
            PageRange(page: 1, charStart: 0,  charEnd: 28),
            PageRange(page: 2, charStart: 28, charEnd: source.utf16.count),
        ]
        let span1 = SourceSpan(
            docId: "t", pageNum: nil, charStart: 0, charEnd: 0,
            quote: "Page one body", verified: false, verifyReason: nil
        )
        let span2 = SourceSpan(
            docId: "t", pageNum: nil, charStart: 0, charEnd: 0,
            quote: "Page two deeper content.", verified: false, verifyReason: nil
        )
        let result: FieldResult<String> = .found(
            value: "multi-span",
            confidence: 0.9,
            sourceSpans: [span1, span2]
        )
        let verified = verifySpans(result, sourceText: source, docId: "t", pageRanges: ranges)
        guard case .found(_, _, let spans) = verified else {
            XCTFail("expected .found")
            return
        }
        XCTAssertEqual(spans.count, 2)
        XCTAssertEqual(spans[0].pageNum, 1)
        XCTAssertEqual(spans[1].pageNum, 2)
    }

    // MARK: - Drift tolerance

    func testVerifySpansToleratesSmallCrossPageDrift() {
        // Cleaned text shifts the quote start 2 chars before the next
        // page boundary, but the quote itself crosses the boundary. The
        // span-level resolver should still land on the page containing
        // the material, not only the first UTF-16 unit.
        let source = "abcdefghijklmnopqrstuvwxBody on page two starts here"
        XCTAssertEqual(source.range(of: "Body on page two")?.lowerBound.utf16Offset(in: source), 24)
        let ranges = [
            PageRange(page: 1, charStart: 0,  charEnd: 26),
            PageRange(page: 2, charStart: 26, charEnd: source.utf16.count),
        ]
        let span = SourceSpan(
            docId: "t", pageNum: nil, charStart: 0, charEnd: 0,
            quote: "Body on page two", verified: false, verifyReason: nil
        )
        let result: FieldResult<String> = .found(
            value: "v", confidence: 0.9, sourceSpans: [span]
        )
        let verified = verifySpans(result, sourceText: source, docId: "t", pageRanges: ranges)
        guard case .found(_, _, let spans) = verified else {
            XCTFail("expected .found")
            return
        }
        // Drift of 2 chars before the page boundary still lands on page 2.
        XCTAssertEqual(spans[0].pageNum, 2)
    }

    func testPageForSpanKeepsLargeBoundaryOverlapOnStartPage() {
        let ranges = [
            PageRange(page: 1, charStart: 0,  charEnd: 26),
            PageRange(page: 2, charStart: 26, charEnd: 60),
        ]
        XCTAssertEqual(pageForSpan(20..<40, in: ranges), 1)
    }

    // MARK: - PageRange Codable round-trip

    func testPageRangeCodableRoundTrip() throws {
        let ranges = [
            PageRange(page: 1, charStart: 0,   charEnd: 100),
            PageRange(page: 2, charStart: 100, charEnd: 250),
        ]
        let data = try JSONEncoder().encode(ranges)
        let decoded = try JSONDecoder().decode([PageRange].self, from: data)
        XCTAssertEqual(ranges, decoded)
    }
}
