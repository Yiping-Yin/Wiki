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

    // MARK: - Chunking (transcripts longer than maxSegmentsForAIPrompt)
    //
    // Exercises the chunking path added alongside maxSegmentsForAIPrompt.
    // Tests inject a deterministic `chunkRunner` that returns canned
    // JSON per chunk so we don't require a live AI provider. Behavior
    // under test:
    //   • ≤30 segments → 1 chunk (fast path matches pre-chunking shape)
    //   • >30 segments → N chunks, all segments labeled after merge
    //   • Speakers deduped across chunk boundaries
    //   • sourceSpan offsets shifted to whole-transcript coordinates
    //   • A single chunk's failure degrades gracefully (others survive)

    /// Synthesize a transcript text with N segments, each ~80 chars long
    /// so the whole transcript exceeds any single chunk's slice.
    private func synthesizeTranscript(segmentCount: Int) -> String {
        var out = ""
        for i in 0..<segmentCount {
            let mm = String(format: "%02d", i / 60)
            let ss = String(format: "%02d", i % 60)
            out += "\(mm):\(ss) Segment \(i) body — discussion about topic number \(i) for the listener.\n"
        }
        return out
    }

    /// Build a canned AILabelPayload-shaped JSON for a chunk of
    /// `segmentCount` segments, with per-segment topic "topic-N" and
    /// quote set to the literal "Segment N body" prefix (which exists
    /// in `synthesizeTranscript` output so verifySpans finds it).
    private func cannedChunkJSON(
        globalStartIndex: Int,
        segmentCount: Int,
        title: String? = nil,
        speakers: [String] = [],
        keyQuotes: [String] = []
    ) -> Data {
        var payload: [String: Any] = [:]
        if let title = title {
            payload["title"] = [
                "status": "found",
                "value": title,
                "confidence": 0.8,
                "sourceSpans": [] as [[String: Any]],
            ]
        } else {
            payload["title"] = [
                "status": "not_found",
                "tried": ["no title in chunk"],
            ]
        }
        payload["speakers"] = speakers.map { sp in
            [
                "status": "found",
                "value": sp,
                "confidence": 0.7,
                "sourceSpans": [] as [[String: Any]],
            ]
        }
        payload["keyQuotes"] = keyQuotes.map { q in
            [
                "status": "found",
                "value": q,
                "confidence": 0.6,
                "sourceSpans": [["quote": q]],
            ]
        }
        var segs: [[String: Any]] = []
        for local in 0..<segmentCount {
            let global = globalStartIndex + local
            let quote = "Segment \(global) body"
            segs.append([
                "topic": [
                    "status": "found",
                    "value": "topic-\(global)",
                    "confidence": 0.7,
                    "sourceSpans": [["quote": quote]],
                ],
                "sourceQuote": [
                    "status": "found",
                    "value": quote,
                    "confidence": 0.7,
                    "sourceSpans": [["quote": quote]],
                ],
            ])
        }
        payload["segments"] = segs
        return try! JSONSerialization.data(withJSONObject: payload)
    }

    // MARK: testShortTranscriptUsesSingleChunk
    //
    // 25 segments → 1 AI call, all 25 are labeled, and the partitioner
    // produces exactly one chunk whose source slice is the whole text
    // (fast path, byte-for-byte parity with pre-chunking behavior).

    func testShortTranscriptUsesSingleChunk() async throws {
        let text = synthesizeTranscript(segmentCount: 25)
        let chunks = TranscriptExtractor.partitionIntoChunks(
            segments: TranscriptExtractor.segmentByTimestamps(text: text),
            wholeText: text,
            windowSize: TranscriptExtractor.maxSegmentsForAIPrompt
        )
        XCTAssertEqual(chunks.count, 1)
        XCTAssertEqual(chunks[0].sourceOffset, 0)
        XCTAssertEqual(chunks[0].sourceSlice, text)

        var callCount = 0
        let runner: TranscriptExtractor.ChunkRunner = { _, _, _ in
            callCount += 1
            return self.cannedChunkJSON(
                globalStartIndex: 0,
                segmentCount: 25,
                title: "Short lecture",
                speakers: ["Instructor"]
            )
        }
        let extractor = TranscriptExtractor()
        let schema = try await extractor.extract(
            text: text,
            filename: "short.vtt",
            docId: "doc-short",
            pageRanges: nil,
            chunkRunner: runner
        )
        XCTAssertEqual(callCount, 1, "short transcript should make exactly one AI call")
        XCTAssertEqual(schema.segments.count, 25)
        for (i, seg) in schema.segments.enumerated() {
            if case .found(let topic, _, _) = seg.topic {
                XCTAssertEqual(topic, "topic-\(i)")
            } else {
                XCTFail("segment \(i) topic should be found")
            }
        }
    }

    // MARK: testLongTranscriptChunks
    //
    // 75 segments → 3 AI calls (30 + 30 + 15). All 75 segments carry an
    // AI-provided topic after merge. The chunk runner inspects the
    // prompt to infer which chunk it's being asked for.

    func testLongTranscriptChunks() async throws {
        let text = synthesizeTranscript(segmentCount: 75)
        let rawSegments = TranscriptExtractor.segmentByTimestamps(text: text)
        XCTAssertEqual(rawSegments.count, 75)
        let chunks = TranscriptExtractor.partitionIntoChunks(
            segments: rawSegments,
            wholeText: text,
            windowSize: TranscriptExtractor.maxSegmentsForAIPrompt
        )
        XCTAssertEqual(chunks.count, 3)
        XCTAssertEqual(chunks[0].segments.count, 30)
        XCTAssertEqual(chunks[1].segments.count, 30)
        XCTAssertEqual(chunks[2].segments.count, 15)

        // Use an actor to safely count concurrent calls.
        let counter = CallCounter()
        let runner: TranscriptExtractor.ChunkRunner = { prompt, _, _ in
            await counter.increment()
            // Identify which chunk from the prompt's SOURCE TEXT slice.
            // Chunk N's slice starts with "Segment (N*30) body".
            if prompt.contains("Segment 0 body") && !prompt.contains("Segment 30 body") {
                return self.cannedChunkJSON(globalStartIndex: 0, segmentCount: 30)
            } else if prompt.contains("Segment 30 body") && !prompt.contains("Segment 60 body") {
                return self.cannedChunkJSON(globalStartIndex: 30, segmentCount: 30)
            } else {
                return self.cannedChunkJSON(globalStartIndex: 60, segmentCount: 15)
            }
        }
        let extractor = TranscriptExtractor()
        let schema = try await extractor.extract(
            text: text,
            filename: "long.vtt",
            docId: "doc-long",
            pageRanges: nil,
            chunkRunner: runner
        )
        let calls = await counter.value
        XCTAssertEqual(calls, 3, "75 segments / 30-segment window = 3 AI calls")
        XCTAssertEqual(schema.segments.count, 75)
        for (i, seg) in schema.segments.enumerated() {
            guard case .found(let topic, _, _) = seg.topic else {
                return XCTFail("segment \(i) topic not .found after merge")
            }
            XCTAssertEqual(topic, "topic-\(i)")
        }
    }

    // MARK: testChunkBoundarySpeakerDedup
    //
    // Speakers ["A","B"] from chunk 1 + ["B","C"] from chunk 2 → merged
    // ["A","B","C"] with B appearing once.

    func testChunkBoundarySpeakerDedup() async throws {
        let text = synthesizeTranscript(segmentCount: 45)
        let runner: TranscriptExtractor.ChunkRunner = { prompt, _, _ in
            if prompt.contains("Segment 0 body") && !prompt.contains("Segment 30 body") {
                return self.cannedChunkJSON(
                    globalStartIndex: 0,
                    segmentCount: 30,
                    speakers: ["A", "B"]
                )
            } else {
                return self.cannedChunkJSON(
                    globalStartIndex: 30,
                    segmentCount: 15,
                    speakers: ["B", "C"]
                )
            }
        }
        let extractor = TranscriptExtractor()
        let schema = try await extractor.extract(
            text: text,
            filename: "speakers.vtt",
            docId: "doc-speakers",
            pageRanges: nil,
            chunkRunner: runner
        )
        let names: [String] = schema.speakers.compactMap { sp in
            if case .found(let v, _, _) = sp { return v } else { return nil }
        }
        XCTAssertEqual(names, ["A", "B", "C"], "speakers should dedup across chunk boundary")
    }

    // MARK: testChunkOffsetTranslation
    //
    // A span whose quote lives inside chunk 2's slice should have its
    // charStart shifted from chunk-local to whole-transcript offset.
    // We feed a canned response whose segment quote is "Segment 30
    // body" (the first quote in chunk 2) and assert the verified
    // SourceSpan.charStart matches the literal position of that quote
    // in the WHOLE transcript, not in chunk 2's slice.

    func testChunkOffsetTranslation() async throws {
        let text = synthesizeTranscript(segmentCount: 45)
        // The whole-transcript UTF-16 offset of "Segment 30 body".
        let globalExpected: Int = {
            guard let range = text.range(of: "Segment 30 body") else {
                XCTFail("expected 'Segment 30 body' in synthesized text")
                return -1
            }
            return text.utf16.distance(from: text.utf16.startIndex, to: range.lowerBound)
        }()

        // Build a canned payload that only labels chunk 1 trivially and
        // chunk 2 specifically produces a found source-quote span on
        // its first segment pointing at "Segment 30 body".
        let runner: TranscriptExtractor.ChunkRunner = { prompt, _, _ in
            if prompt.contains("Segment 0 body") && !prompt.contains("Segment 30 body") {
                return self.cannedChunkJSON(globalStartIndex: 0, segmentCount: 30)
            } else {
                return self.cannedChunkJSON(globalStartIndex: 30, segmentCount: 15)
            }
        }
        let extractor = TranscriptExtractor()
        let schema = try await extractor.extract(
            text: text,
            filename: "offsets.vtt",
            docId: "doc-offsets",
            pageRanges: nil,
            chunkRunner: runner
        )
        // Segment at index 30 is the first segment of chunk 2. Its
        // sourceQuote span should verify against the whole transcript
        // at the expected global offset.
        let seg = schema.segments[30]
        guard case .found(_, _, let spans) = seg.sourceQuote, let span = spans.first else {
            return XCTFail("segment 30 sourceQuote span missing after merge")
        }
        XCTAssertTrue(span.verified, "span should be verified post-shift")
        XCTAssertEqual(span.charStart, globalExpected,
            "chunk-2 span charStart should equal the whole-transcript offset of its quote")
        // Sanity: re-slicing the whole transcript at the shifted offset
        // recovers the expected quote.
        let nsText = text as NSString
        let recovered = nsText.substring(with: NSRange(location: span.charStart, length: span.charEnd - span.charStart))
        XCTAssertEqual(recovered, span.quote)
    }

    // MARK: testChunkFailureDegradesGracefully
    //
    // Chunk 2 throws a provider error. Chunks 1 and 3 still return
    // normal labels. Segments inside chunk 2 are reported as
    // .notFound(tried: ["chunk_ai_call_failed"]).

    func testChunkFailureDegradesGracefully() async throws {
        let text = synthesizeTranscript(segmentCount: 75)
        let runner: TranscriptExtractor.ChunkRunner = { prompt, _, _ in
            if prompt.contains("Segment 0 body") && !prompt.contains("Segment 30 body") {
                return self.cannedChunkJSON(globalStartIndex: 0, segmentCount: 30)
            } else if prompt.contains("Segment 30 body") && !prompt.contains("Segment 60 body") {
                throw StructuredOutputError.providerFailure(
                    provider: "Mock",
                    underlying: NSError(domain: "mock", code: 429, userInfo: nil)
                )
            } else {
                return self.cannedChunkJSON(globalStartIndex: 60, segmentCount: 15)
            }
        }
        let extractor = TranscriptExtractor()
        let schema = try await extractor.extract(
            text: text,
            filename: "failure.vtt",
            docId: "doc-failure",
            pageRanges: nil,
            chunkRunner: runner
        )
        XCTAssertEqual(schema.segments.count, 75)
        // Chunk 1 (0..<30) and chunk 3 (60..<75) succeed.
        for i in 0..<30 {
            guard case .found = schema.segments[i].topic else {
                return XCTFail("chunk-1 segment \(i) should succeed")
            }
        }
        for i in 60..<75 {
            guard case .found = schema.segments[i].topic else {
                return XCTFail("chunk-3 segment \(i) should succeed")
            }
        }
        // Chunk 2 (30..<60) degrades to .notFound.
        for i in 30..<60 {
            guard case .notFound(let tried) = schema.segments[i].topic else {
                return XCTFail("chunk-2 segment \(i) should be .notFound, got .found")
            }
            XCTAssertEqual(tried, ["chunk_ai_call_failed"])
        }
    }
}

/// Actor for thread-safe call counting across concurrent chunk runs
/// (the task group fires chunks in parallel).
actor CallCounter {
    private(set) var value: Int = 0
    func increment() { value += 1 }
}
