import XCTest
@testable import Loom

/// Phase 3 unit tests for `TextbookChapterExtractor`. Covers match scoring
/// (5+ samples) + Codable round-trip of the schema. AI-dependent live
/// extract is schema-checked only.
final class TextbookChapterExtractorTests: XCTestCase {
    // MARK: - Match scoring (5+ samples)

    func testMatchScoresChapterFilenames() {
        XCTAssertEqual(
            TextbookChapterExtractor.match(filename: "Chapter 3 — Portfolio Theory.pdf", parentPath: "Textbook", sample: ""),
            0.85
        )
        XCTAssertEqual(
            TextbookChapterExtractor.match(filename: "ch03-bonds.pdf", parentPath: "Textbook", sample: ""),
            0.85
        )
        XCTAssertEqual(
            TextbookChapterExtractor.match(filename: "Section 2 — Macro.pdf", parentPath: "Readings", sample: ""),
            0.85
        )
    }

    func testMatchScoresLongISBNPDFs() {
        let sample = String(repeating: "Body text. ", count: 200) + "ISBN 978-0-13-468239-1"
        XCTAssertEqual(
            TextbookChapterExtractor.match(filename: "reader-week-3.pdf", parentPath: "Course", sample: sample),
            0.7
        )
    }

    func testMatchRejectsNonTextbookFilenames() {
        XCTAssertEqual(
            TextbookChapterExtractor.match(filename: "Course Overview_FINS3640.pdf", parentPath: "Week 0", sample: ""),
            0.0
        )
        XCTAssertEqual(
            TextbookChapterExtractor.match(filename: "notes.md", parentPath: "Desk", sample: "# Notes"),
            0.0
        )
    }

    func testMatchShorthandHelperAcceptsCommonPatterns() {
        XCTAssertTrue(TextbookChapterExtractor.matchesChapterShorthand("ch3"))
        XCTAssertTrue(TextbookChapterExtractor.matchesChapterShorthand("ch 03"))
        XCTAssertTrue(TextbookChapterExtractor.matchesChapterShorthand("ch_04 title"))
        XCTAssertTrue(TextbookChapterExtractor.matchesChapterShorthand("intro ch-2 body"))
        XCTAssertFalse(TextbookChapterExtractor.matchesChapterShorthand("church bells"))
    }

    // MARK: - Verification hardening reuses SyllabusPDF pattern

    func testVerifyAndHardenDemotesFilenameStemQuote() {
        let stems = SyllabusPDFExtractor.filenameStems(from: "ch03-bonds.pdf")
        let raw = TextbookSchema(
            chapterTitle: .found(
                value: "ch03-bonds",
                confidence: 0.9,
                sourceSpans: [SourceSpan(docId: "doc", charStart: 0, charEnd: 10, quote: "ch03-bonds", verified: true)]
            ),
            chapterNumber: .notFound(tried: ["header"]),
            learningObjectives: [],
            keyTerms: [],
            sectionHeadings: [],
            summary: .notFound(tried: ["summary paragraph"])
        )
        let hardened = TextbookChapterExtractor.verifyAndHarden(
            schema: raw,
            sourceText: "ch03-bonds is in this text",
            docId: "doc",
            filenameStems: stems
        )
        guard case .found(_, let conf, let spans) = hardened.chapterTitle else {
            return XCTFail("expected found chapterTitle")
        }
        XCTAssertEqual(conf, 0.4)
        XCTAssertEqual(spans.count, 1)
        XCTAssertFalse(spans[0].verified)
        XCTAssertEqual(spans[0].verifyReason, "quote_contains_filename_stem")
    }

    // MARK: - Codable round-trip

    func testSchemaCodableRoundTrip() throws {
        let schema = TextbookSchema(
            chapterTitle: .found(value: "Chapter 3", confidence: 0.9, sourceSpans: []),
            chapterNumber: .found(value: "3", confidence: 0.95, sourceSpans: []),
            learningObjectives: [.found(value: "Explain duration", confidence: 0.7, sourceSpans: [])],
            keyTerms: [.found(value: "duration", confidence: 0.8, sourceSpans: [])],
            sectionHeadings: [.found(value: "Bond basics", confidence: 0.8, sourceSpans: [])],
            summary: .found(value: "Bonds are fixed-income instruments.", confidence: 0.7, sourceSpans: [])
        )
        let encoded = try JSONEncoder().encode(schema)
        let decoded = try JSONDecoder().decode(TextbookSchema.self, from: encoded)
        if case .found(let title, _, _) = decoded.chapterTitle {
            XCTAssertEqual(title, "Chapter 3")
        } else {
            XCTFail("expected chapterTitle found")
        }
        XCTAssertEqual(decoded.keyTerms.count, 1)
        XCTAssertEqual(decoded.sectionHeadings.count, 1)
    }
}
