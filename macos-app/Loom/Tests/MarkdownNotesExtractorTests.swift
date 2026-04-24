import XCTest
@testable import Loom

final class MarkdownNotesExtractorTests: XCTestCase {
    func testMatchClaimsNotesButCedesTranscriptShapedText() {
        XCTAssertEqual(
            MarkdownNotesExtractor.match(
                filename: "seminar-notes.md",
                parentPath: "Week 1",
                sample: "# Notes"
            ),
            0.9
        )
        XCTAssertEqual(
            MarkdownNotesExtractor.match(
                filename: "recording.txt",
                parentPath: "Week 1",
                sample: "00:01 Speaker one\n02:15 Speaker two continues the discussion"
            ),
            0.0
        )
    }

    func testExtractsStructuralAnchorsWithoutAI() async throws {
        let text = """
        ---
        tags: loom
        ---
        # Course Notes

        Intro paragraph with $x+y$.

        ## Week 1

        ```swift
        # Not a heading
        let x = 1
        ```

        ### Questions
        """

        let schema = try await MarkdownNotesExtractor().extract(
            text: text,
            filename: "notes.md",
            docId: "doc-1"
        )

        XCTAssertEqual(schema.title, "Course Notes")
        XCTAssertEqual(schema.headings.map(\.text), ["Course Notes", "Week 1", "Questions"])
        XCTAssertEqual(schema.headings.map(\.level), [1, 2, 3])
        XCTAssertTrue(schema.hasCode)
        XCTAssertTrue(schema.hasMath)
        XCTAssertEqual(schema.preview, "Intro paragraph with $x+y$.")

        let nsText = text as NSString
        let firstOffset = schema.headings[0].charOffset
        XCTAssertTrue(nsText.substring(from: firstOffset).hasPrefix("# Course Notes"))
    }

    func testTitleFallsBackToFilenameStemWhenNoH1Exists() async throws {
        let schema = try await MarkdownNotesExtractor().extract(
            text: "Loose note body\n\n## Detail",
            filename: "loose-note.txt",
            docId: "doc-2"
        )

        XCTAssertEqual(schema.title, "loose-note")
        XCTAssertEqual(schema.headings.map(\.text), ["Detail"])
        XCTAssertEqual(schema.preview, "Loose note body")
    }

    /// Plan §9 asks for 5+ filename samples per extractor match function.
    /// This table covers `.md` / `.mdx` / `.txt` hits, transcript-shaped
    /// ceding, and extensions outside the extractor's scope.
    func testMatchScoreTableCoversFiveRepresentativeInputs() {
        XCTAssertEqual(MarkdownNotesExtractor.match(
            filename: "design-notes.md", parentPath: "Desk", sample: "# Notes"
        ), 0.9)
        XCTAssertEqual(MarkdownNotesExtractor.match(
            filename: "readme.mdx", parentPath: "Project", sample: "intro"
        ), 0.9)
        XCTAssertEqual(MarkdownNotesExtractor.match(
            filename: "todo.txt", parentPath: "Desk", sample: "buy milk"
        ), 0.9)
        XCTAssertEqual(MarkdownNotesExtractor.match(
            filename: "lecture.txt",
            parentPath: "Week 1",
            sample: "00:15 intro and then 01:30 covered topic"
        ), 0.0)
        XCTAssertEqual(MarkdownNotesExtractor.match(
            filename: "data.csv", parentPath: "Week 1", sample: ""
        ), 0.0)
    }

    func testCodableRoundTripPreservesFields() throws {
        let schema = MarkdownNotesSchema(
            title: "Sample",
            headings: [
                HeadingEntry(level: 1, text: "Sample", charOffset: 0),
                HeadingEntry(level: 2, text: "Subsection", charOffset: 12),
            ],
            wordCount: 17,
            hasCode: true,
            hasMath: false,
            preview: "Opening prose."
        )
        let encoded = try JSONEncoder().encode(schema)
        let decoded = try JSONDecoder().decode(MarkdownNotesSchema.self, from: encoded)
        XCTAssertEqual(decoded.title, "Sample")
        XCTAssertEqual(decoded.headings.count, 2)
        XCTAssertEqual(decoded.headings[0].level, 1)
        XCTAssertEqual(decoded.headings[1].charOffset, 12)
        XCTAssertEqual(decoded.wordCount, 17)
        XCTAssertTrue(decoded.hasCode)
        XCTAssertFalse(decoded.hasMath)
        XCTAssertEqual(decoded.preview, "Opening prose.")
    }
}
