import XCTest
@testable import Loom

/// Phase 0 unit tests for `locate()` — the three-tier quote search used
/// by `verifySpans` to re-derive character offsets from an AI-returned
/// quote. Covers the three tiers the plan's reference Python exercises
/// (exact / whitespace-normalized / miss). Typed-extractor tests land
/// in later phases alongside those extractors.
final class IngestExtractorLocateTests: XCTestCase {
    func testLocateExactSubstringReturnsCorrectRange() {
        let source = "The term is Term 3 2025 and starts in October."
        let quote = "Term 3 2025"
        let range = locate(quote: quote, in: source)
        XCTAssertNotNil(range)
        XCTAssertEqual(range?.lowerBound, 12)
        XCTAssertEqual(range?.upperBound, 23)
    }

    func testLocateMatchesAcrossCollapsedWhitespace() {
        // Source has a newline + double-space between words that the
        // AI quoted on a single line with single spaces — the classic
        // PDF-line-break case.
        let source = "Learning objectives:\nUnderstand  bond\nindex replication."
        let quote = "Understand bond index replication."
        let range = locate(quote: quote, in: source)
        XCTAssertNotNil(range, "expected whitespace-normalized fallback to hit")
        if let range {
            // Range should cover "Understand" through the trailing period.
            let nsSource = source as NSString
            let slice = nsSource.substring(
                with: NSRange(location: range.lowerBound, length: range.upperBound - range.lowerBound)
            )
            XCTAssertTrue(slice.hasPrefix("Understand"))
            XCTAssertTrue(slice.hasSuffix("replication."))
        }
    }

    func testLocateReturnsNilWhenQuoteAbsent() {
        let source = "Syllabus for FINS3640 Investment Banking."
        let quote = "Monetary policy transmission channels"
        XCTAssertNil(locate(quote: quote, in: source))
    }

    func testGenericDocParsePreservesRawOutputForPhaseZeroCompatibility() {
        let raw = """
        This is the summary paragraph.

        - First point
        • Second point
        * Third point
        A trailing model note that existing callers should still receive.
        """

        let parsed = GenericDocExtractor.parse(rawOutput: raw)

        XCTAssertEqual(parsed.rawOutput, raw)
        XCTAssertEqual(parsed.summary, "This is the summary paragraph.")
        XCTAssertEqual(parsed.keyPoints, ["First point", "Second point", "Third point"])
    }

    func testVerifySpansChecksEveryQuoteAndCapsConfidenceOnAnyMiss() {
        let source = "First quote here. Second quote here."
        let result: FieldResult<String> = .found(
            value: "field",
            confidence: 0.91,
            sourceSpans: [
                SourceSpan(
                    docId: "model-doc",
                    charStart: 99,
                    charEnd: 110,
                    quote: "First quote",
                    verified: false
                ),
                SourceSpan(
                    docId: "model-doc",
                    charStart: 0,
                    charEnd: 0,
                    quote: "Invented quote",
                    verified: true
                ),
            ]
        )

        let verified = verifySpans(result, sourceText: source, docId: "doc-1")

        guard case .found(let value, let confidence, let spans) = verified else {
            XCTFail("expected found result")
            return
        }

        XCTAssertEqual(value, "field")
        XCTAssertEqual(confidence, 0.4)
        XCTAssertEqual(spans.count, 2)
        XCTAssertEqual(spans[0].docId, "doc-1")
        XCTAssertEqual(spans[0].charStart, 0)
        XCTAssertEqual(spans[0].charEnd, 11)
        XCTAssertTrue(spans[0].verified)
        XCTAssertNil(spans[0].verifyReason)
        XCTAssertFalse(spans[1].verified)
        XCTAssertEqual(spans[1].verifyReason, "quote_not_substring_of_source")
    }

    func testFieldResultDecodesLegacySingletonSourceSpanAsList() throws {
        let json = """
        {
          "status": "found",
          "value": "teacher",
          "confidence": 0.8,
          "sourceSpan": {
            "docId": "doc-legacy",
            "pageNum": null,
            "charStart": 4,
            "charEnd": 11,
            "quote": "teacher",
            "verified": true,
            "verifyReason": null
          }
        }
        """.data(using: .utf8)!

        let decoded = try JSONDecoder().decode(FieldResult<String>.self, from: json)

        guard case .found(let value, let confidence, let spans) = decoded else {
            XCTFail("expected found result")
            return
        }

        XCTAssertEqual(value, "teacher")
        XCTAssertEqual(confidence, 0.8)
        XCTAssertEqual(spans.count, 1)
        XCTAssertEqual(spans[0].docId, "doc-legacy")
        XCTAssertEqual(spans[0].quote, "teacher")
    }
}
