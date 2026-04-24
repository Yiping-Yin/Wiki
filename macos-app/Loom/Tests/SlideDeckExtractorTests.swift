import XCTest
@testable import Loom

/// Phase 3 unit tests for `SlideDeckExtractor`. Match scoring (5+ samples)
/// + schema Codable round-trip + filename-stem hardening. AI-dependent
/// live extract is schema-checked only.
final class SlideDeckExtractorTests: XCTestCase {
    // MARK: - Match scoring (5+ samples)

    func testMatchScoresPPTXAndKeynoteHighest() {
        XCTAssertEqual(
            SlideDeckExtractor.match(filename: "Lecture 1.pptx", parentPath: "Week 1", sample: ""),
            0.9
        )
        XCTAssertEqual(
            SlideDeckExtractor.match(filename: "Presentation.key", parentPath: "Pitch", sample: ""),
            0.9
        )
    }

    func testMatchScoresSlideDensityPDFMidRange() {
        // Lots of short lines → slide-shaped density.
        let slideLike = (0..<20).map { "Point \($0)" }.joined(separator: "\n")
        XCTAssertEqual(
            SlideDeckExtractor.match(filename: "lecture-slides.pdf", parentPath: "Week 1", sample: slideLike + String(repeating: " ", count: 400)),
            0.7
        )
    }

    func testMatchRejectsProseDensityPDF() {
        // One long paragraph → prose-shaped density, not slides.
        let prose = String(repeating: "A long paragraph that runs for many characters without any line breaks at all. ", count: 10)
        XCTAssertEqual(
            SlideDeckExtractor.match(filename: "textbook-chapter.pdf", parentPath: "Reader", sample: prose),
            0.0
        )
    }

    func testMatchRejectsNonSlideExtensions() {
        XCTAssertEqual(
            SlideDeckExtractor.match(filename: "data.csv", parentPath: "Files", sample: ""),
            0.0
        )
        XCTAssertEqual(
            SlideDeckExtractor.match(filename: "notes.md", parentPath: "Desk", sample: "# h"),
            0.0
        )
    }

    // MARK: - Verification hardening

    func testVerifyAndHardenDemotesFilenameStemQuote() {
        let stems = SyllabusPDFExtractor.filenameStems(from: "LectureDeck_FINS3640.pptx")
        let raw = SlideDeckSchema(
            deckTitle: .found(
                value: "LectureDeck_FINS3640",
                confidence: 0.9,
                sourceSpans: [SourceSpan(docId: "doc", charStart: 0, charEnd: 10, quote: "LectureDeck_FINS3640", verified: true)]
            ),
            author: .notFound(tried: ["title slide"]),
            sections: [],
            topics: []
        )
        let hardened = SlideDeckExtractor.verifyAndHarden(
            schema: raw,
            sourceText: "LectureDeck_FINS3640 and more",
            docId: "doc",
            filenameStems: stems
        )
        guard case .found(_, let conf, let spans) = hardened.deckTitle else {
            return XCTFail("expected found deckTitle")
        }
        XCTAssertEqual(conf, 0.4)
        XCTAssertFalse(spans[0].verified)
        XCTAssertEqual(spans[0].verifyReason, "quote_contains_filename_stem")
    }

    // MARK: - Codable round-trip

    func testSchemaCodableRoundTrip() throws {
        let schema = SlideDeckSchema(
            deckTitle: .found(value: "Intro Deck", confidence: 0.9, sourceSpans: []),
            author: .notFound(tried: ["title slide"]),
            sections: [
                SlideSectionEntry(
                    title: .found(value: "Setup", confidence: 0.8, sourceSpans: []),
                    slideRange: .found(value: "slides 1-3", confidence: 0.7, sourceSpans: [])
                ),
            ],
            topics: [.found(value: "Portfolio theory", confidence: 0.7, sourceSpans: [])]
        )
        let encoded = try JSONEncoder().encode(schema)
        let decoded = try JSONDecoder().decode(SlideDeckSchema.self, from: encoded)
        XCTAssertEqual(decoded.sections.count, 1)
        XCTAssertEqual(decoded.topics.count, 1)
    }
}
