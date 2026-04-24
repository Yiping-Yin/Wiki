import XCTest
@testable import Loom

/// Phase 3 unit tests for `TranscriptExtractor`. Covers match scoring,
/// deterministic timestamp segmentation, and Codable round-trip of the
/// schema (AI-dependent end-to-end extract is schema-checked only).
final class TranscriptExtractorTests: XCTestCase {
    // MARK: - Match scoring (5+ samples)

    func testMatchScoreTableCoversFiveRepresentativeInputs() {
        XCTAssertEqual(
            TranscriptExtractor.match(filename: "lecture.vtt", parentPath: "Week 1", sample: ""),
            0.95
        )
        XCTAssertEqual(
            TranscriptExtractor.match(filename: "seminar.srt", parentPath: "Week 2", sample: ""),
            0.95
        )

        let heavyTimestamps = (0..<12).map { "0\($0):1\($0) Speaker" }.joined(separator: "\n")
        XCTAssertEqual(
            TranscriptExtractor.match(filename: "zoom-export.txt", parentPath: "Meetings", sample: heavyTimestamps),
            0.85
        )

        XCTAssertEqual(
            TranscriptExtractor.match(filename: "notes.txt", parentPath: "Desk", sample: "no timestamps here at all"),
            0.0
        )
        XCTAssertEqual(
            TranscriptExtractor.match(filename: "reading.pdf", parentPath: "Week 1", sample: ""),
            0.0
        )
    }

    // MARK: - Deterministic segmentation

    func testSegmentByTimestampsSplitsOnEveryTimecode() {
        let text = """
        00:00 Intro paragraph goes here.
        00:42 Second topic begins and continues for a bit.
        05:15 Final wrap up.
        """
        let segments = TranscriptExtractor.segmentByTimestamps(text: text)
        XCTAssertEqual(segments.count, 3)
        XCTAssertEqual(segments[0].timecode, "00:00")
        XCTAssertEqual(segments[1].timecode, "00:42")
        XCTAssertEqual(segments[2].timecode, "05:15")
        XCTAssertTrue(segments[0].body.contains("Intro paragraph"))
        XCTAssertTrue(segments[1].body.contains("Second topic"))
        XCTAssertTrue(segments[2].body.contains("Final wrap"))
    }

    func testSegmentByTimestampsHandlesHoursAndMillis() {
        let text = "01:02:15 first section.\n01:02:30.500 next section."
        let segments = TranscriptExtractor.segmentByTimestamps(text: text)
        XCTAssertEqual(segments.count, 2)
        XCTAssertEqual(segments[0].timecode, "01:02:15")
        XCTAssertEqual(segments[1].timecode, "01:02:30.500")
    }

    func testSegmentByTimestampsReturnsEmptyWhenNoTimecodes() {
        XCTAssertTrue(TranscriptExtractor.segmentByTimestamps(text: "plain prose").isEmpty)
    }

    // MARK: - Schema Codable round-trip

    func testSchemaCodableRoundTripPreservesNestedFieldResults() throws {
        let schema = TranscriptSchema(
            title: .found(value: "Week 1 lecture", confidence: 0.8, sourceSpans: []),
            speakers: [.notFound(tried: ["speaker block"])],
            segments: [
                SegmentEntry(
                    timecode: "00:00",
                    topic: .found(value: "Intro", confidence: 0.7, sourceSpans: []),
                    sourceQuote: .found(value: "welcome", confidence: 0.8, sourceSpans: [])
                ),
                SegmentEntry(
                    timecode: "00:30",
                    topic: .notFound(tried: ["AI returned fewer"]),
                    sourceQuote: .notFound(tried: ["AI returned fewer"])
                ),
            ],
            keyQuotes: [.found(value: "Key point", confidence: 0.6, sourceSpans: [])]
        )
        let encoded = try JSONEncoder().encode(schema)
        let decoded = try JSONDecoder().decode(TranscriptSchema.self, from: encoded)

        guard case .found(let title, _, _) = decoded.title else {
            return XCTFail("expected title found")
        }
        XCTAssertEqual(title, "Week 1 lecture")
        XCTAssertEqual(decoded.segments.count, 2)
        XCTAssertEqual(decoded.segments[0].timecode, "00:00")
        if case .found(let topic, _, _) = decoded.segments[0].topic {
            XCTAssertEqual(topic, "Intro")
        } else {
            XCTFail("expected segments[0].topic found")
        }
    }
}
