import XCTest
@testable import Loom

/// Phase 7.4 — fragment paste flow tests.
///
/// Coverage:
///   1. `extract()` returns the fragment text BYTE-IDENTICAL to the
///      input (no AI rewriting, no whitespace normalization).
///   2. Word count is computed deterministically and matches the
///      `MarkdownNotesExtractor` convention.
///   3. `match()` returns 0.0 for every plausible filename / sample,
///      so the registry never auto-picks the fragment extractor.
///   4. `FragmentSchema` round-trips through Codable losslessly.
final class FragmentExtractorTests: XCTestCase {

    // MARK: - 1. Verbatim text round-trip

    func testExtractReturnsVerbatimText() async throws {
        let original = """
        The most successful technologies are the ones that disappear. They
        weave themselves into the fabric of everyday life until they are
        indistinguishable from it.

        — Mark Weiser, 1991
        """

        let schema = FragmentExtractor.build(
            text: original,
            sourceURL: "https://example.com/disappearing-machine",
            sourceApp: "com.apple.Safari",
            sourceTitle: nil,
            capturedAt: 1714000000000
        )

        XCTAssertEqual(
            schema.text,
            original,
            "Fragment text must be byte-identical to clipboard input — no AI rewriting, no whitespace normalization."
        )
    }

    func testExtractPreservesLeadingAndInternalWhitespace() async throws {
        // Leading space, internal tabs, trailing newlines — all preserved
        // verbatim. (Capture-time trim happens upstream in
        // ClipboardInspector.captureNow on the OUTSIDE edges.)
        let weird = "  hello\t\tworld\n\nline two\n"
        let schema = FragmentExtractor.build(
            text: weird,
            sourceURL: nil,
            sourceApp: nil,
            sourceTitle: nil,
            capturedAt: 1714000000000
        )
        XCTAssertEqual(schema.text, weird)
    }

    // MARK: - 2. Word count

    func testExtractWordCountDeterministic() async throws {
        XCTAssertEqual(
            FragmentExtractor.build(
                text: "one two three",
                sourceURL: nil, sourceApp: nil, sourceTitle: nil
            ).wordCount,
            3
        )
        XCTAssertEqual(
            FragmentExtractor.build(
                text: "  one  two\tthree\nfour  ",
                sourceURL: nil, sourceApp: nil, sourceTitle: nil
            ).wordCount,
            4
        )
        XCTAssertEqual(
            FragmentExtractor.build(
                text: "",
                sourceURL: nil, sourceApp: nil, sourceTitle: nil
            ).wordCount,
            0
        )
        XCTAssertEqual(
            FragmentExtractor.build(
                text: "single",
                sourceURL: nil, sourceApp: nil, sourceTitle: nil
            ).wordCount,
            1
        )
    }

    func testExtractCharCountMatchesString() async throws {
        let text = "ABCDEFG"
        let schema = FragmentExtractor.build(
            text: text,
            sourceURL: nil, sourceApp: nil, sourceTitle: nil
        )
        XCTAssertEqual(schema.charCount, text.count)
    }

    // MARK: - 3. Registry never auto-picks fragment

    func testMatchAlwaysZero() {
        // A bouquet of plausible inputs — extensions, samples with
        // headings, samples with timestamps, etc. None should ever
        // get a non-zero match score.
        XCTAssertEqual(FragmentExtractor.match(
            filename: "any.txt",
            parentPath: "Notes",
            sample: "# A heading\n\nSome prose"
        ), 0.0)
        XCTAssertEqual(FragmentExtractor.match(
            filename: "syllabus.pdf",
            parentPath: "UNSW/FINS 3640",
            sample: "Course Outline FINS 3640"
        ), 0.0)
        XCTAssertEqual(FragmentExtractor.match(
            filename: "transcript.vtt",
            parentPath: "Recordings",
            sample: "00:00 Hello world"
        ), 0.0)
        XCTAssertEqual(FragmentExtractor.match(
            filename: "",
            parentPath: "",
            sample: ""
        ), 0.0)
        XCTAssertEqual(FragmentExtractor.match(
            filename: "fragment.fragment",
            parentPath: "fragments",
            sample: "hello"
        ), 0.0)
    }

    /// Bestmatch dispatch must NEVER pick fragment, even when no other
    /// extractor scores. Generic falls back at 0.1; fragment stays 0.0.
    func testRegistryDoesNotKnowFragment() {
        // Deliberately filename + sample that no typed extractor
        // claims — the winner should be the generic fallback.
        let pick = ExtractorRegistry.bestMatchWithScore(
            filename: "weirdname.weird",
            parentPath: "fragments",
            sample: "hello world"
        )
        XCTAssertNotEqual(
            pick.registration.extractorId,
            FragmentExtractor.extractorId,
            "Registry must never select FragmentExtractor — it's invoked exclusively from the paste flow."
        )
    }

    // MARK: - 4. Codable round-trip

    func testCodableRoundTrip() throws {
        let schema = FragmentSchema(
            text: "Hello world",
            sourceURL: "https://example.com/page",
            sourceApp: "com.apple.Safari",
            sourceTitle: "Example Page",
            capturedAt: 1714000000000,
            charCount: 11,
            wordCount: 2
        )
        let encoded = try JSONEncoder().encode(schema)
        let decoded = try JSONDecoder().decode(FragmentSchema.self, from: encoded)
        XCTAssertEqual(decoded.text, schema.text)
        XCTAssertEqual(decoded.sourceURL, schema.sourceURL)
        XCTAssertEqual(decoded.sourceApp, schema.sourceApp)
        XCTAssertEqual(decoded.sourceTitle, schema.sourceTitle)
        XCTAssertEqual(decoded.capturedAt, schema.capturedAt)
        XCTAssertEqual(decoded.charCount, schema.charCount)
        XCTAssertEqual(decoded.wordCount, schema.wordCount)
    }

    func testCodableRoundTripWithAllOptionalsNil() throws {
        let schema = FragmentSchema(
            text: "Bare fragment",
            sourceURL: nil,
            sourceApp: nil,
            sourceTitle: nil,
            capturedAt: 1714000000000,
            charCount: 13,
            wordCount: 2
        )
        let encoded = try JSONEncoder().encode(schema)
        let decoded = try JSONDecoder().decode(FragmentSchema.self, from: encoded)
        XCTAssertEqual(decoded.text, "Bare fragment")
        XCTAssertNil(decoded.sourceURL)
        XCTAssertNil(decoded.sourceApp)
        XCTAssertNil(decoded.sourceTitle)
    }
}
