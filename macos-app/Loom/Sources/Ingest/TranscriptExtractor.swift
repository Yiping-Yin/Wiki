import Foundation

// MARK: - TranscriptExtractor
//
// Plan §3.3 Phase 3 — timestamp-aware transcript extraction.
//
// Design split:
//   1. **Deterministic segmentation.** We scan for `\d{1,2}:\d{2}(:\d{2})?`
//      timestamps and cut the source into segments bounded by those
//      timestamps. No AI involvement here — timecodes are ground truth.
//   2. **AI labels topics + picks key quotes.** Given the segmented text,
//      the AI receives a prompt that lists each segment by ordinal and
//      asks for `(topic, sourceQuote)` per segment plus a short
//      `keyQuotes` list across the whole transcript.
//   3. **Standard §3.6 + §3.7 hardening.** Same `verifySpans`,
//      filename-stem demote, and contiguous-quote rule as the syllabus
//      extractor.
//
// Match rules:
//   • `.vtt` / `.srt` → 0.95 (definitive extension)
//   • `.txt` with ≥10 `\d{1,2}:\d{2}` occurrences → 0.85
//   • Other extensions → 0.0

struct TranscriptExtractor: IngestExtractor {
    typealias Schema = TranscriptSchema

    static let extractorId = "transcript"

    /// Any transcript file with more segments than this gets truncated in
    /// the AI prompt to keep tokens under control. The segmentation still
    /// reports the full count back to the caller.
    static let maxSegmentsForAIPrompt = 30

    static func match(
        filename: String,
        parentPath: String,
        sample: String
    ) -> Double {
        let ext = (filename as NSString).pathExtension.lowercased()
        switch ext {
        case "vtt", "srt":
            return 0.95
        case "txt":
            // Timestamp-heavy .txt files (YouTube dump, Zoom export, etc.)
            // are transcripts; plain .txt falls to MarkdownNotesExtractor.
            let timestampCount = MarkdownNotesExtractor.countTimestampPatterns(in: sample)
            return timestampCount >= 10 ? 0.85 : 0.0
        default:
            return 0.0
        }
    }

    func extract(
        text: String,
        filename: String,
        docId: String
    ) async throws -> TranscriptSchema {
        // 1. Deterministic segmentation — cut on timestamps.
        let rawSegments = Self.segmentByTimestamps(text: text)

        // If the file has zero timestamps (e.g. a .txt we matched via
        // extension that turned out to be prose), fall back to a single
        // empty-timecode segment carrying the whole body.
        let segmentsToLabel: [RawSegment] = rawSegments.isEmpty
            ? [RawSegment(timecode: "", bodyRange: text.startIndex..<text.endIndex, body: text)]
            : rawSegments

        // 2. AI call. Segments truncated to `maxSegmentsForAIPrompt`;
        //    caller can rerun over large files if needed.
        let truncated = Array(segmentsToLabel.prefix(Self.maxSegmentsForAIPrompt))
        let prompt = Self.buildPrompt(sourceText: text, segments: truncated)
        let schema = Self.jsonSchema

        var options = StructuredOutputOptions()
        options.temperature = 0.0
        let data = try await StructuredOutputDispatch.sendForCurrentProvider(
            prompt: prompt,
            schema: schema,
            options: options
        )

        // 3. Decode.
        let decoder = JSONDecoder()
        let raw: AILabelPayload
        do {
            raw = try decoder.decode(AILabelPayload.self, from: data)
        } catch {
            let preview = String(data: data, encoding: .utf8) ?? ""
            throw StructuredOutputError.jsonParseFailed(
                provider: "TranscriptExtractor",
                raw: preview,
                attempts: 1
            )
        }

        // 4. Zip AI labels with deterministic timecodes. If the AI
        //    returned fewer labels than segments, pad with not_found;
        //    if more, drop the extras.
        let paddedLabels: [AISegmentLabel]
        if raw.segments.count < truncated.count {
            let padding = (raw.segments.count..<truncated.count).map { _ in
                AISegmentLabel(
                    topic: .notFound(tried: ["ai_returned_too_few_segments"]),
                    sourceQuote: .notFound(tried: ["ai_returned_too_few_segments"])
                )
            }
            paddedLabels = raw.segments + padding
        } else {
            paddedLabels = Array(raw.segments.prefix(truncated.count))
        }

        let filenameStems = SyllabusPDFExtractor.filenameStems(from: filename)
        func verify<T: Codable>(_ fr: FieldResult<T>) -> FieldResult<T> {
            let v = verifySpans(fr, sourceText: text, docId: docId)
            return SyllabusPDFExtractor.demoteIfFilenameQuote(v, filenameStems: filenameStems)
        }

        let segments: [SegmentEntry] = zip(truncated, paddedLabels).map { raw, label in
            SegmentEntry(
                timecode: raw.timecode,
                topic: verify(label.topic),
                sourceQuote: verify(label.sourceQuote)
            )
        }

        return TranscriptSchema(
            title: verify(raw.title),
            speakers: raw.speakers.map { verify($0) },
            segments: segments,
            keyQuotes: raw.keyQuotes.map { verify($0) }
        )
    }

    // MARK: - Segmentation

    /// One segmentation result. `body` is the raw text slice between this
    /// timestamp and the next; `timecode` is the emitted string.
    struct RawSegment {
        let timecode: String
        let bodyRange: Range<String.Index>
        let body: String
    }

    /// Cut `text` at `\d{1,2}:\d{2}(:\d{2})?(\.\d{1,3})?` boundaries.
    /// Each segment's `body` runs from just after the timecode up to
    /// (but not including) the next timecode; the last segment runs to
    /// end-of-file.
    static func segmentByTimestamps(text: String) -> [RawSegment] {
        guard let regex = try? NSRegularExpression(
            pattern: #"\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?\b"#
        ) else {
            return []
        }
        let nsText = text as NSString
        let matches = regex.matches(in: text, range: NSRange(location: 0, length: nsText.length))
        guard !matches.isEmpty else { return [] }

        var segments: [RawSegment] = []
        for (idx, match) in matches.enumerated() {
            let timecodeRange = match.range
            let timecode = nsText.substring(with: timecodeRange)

            let bodyStartNSIndex = timecodeRange.location + timecodeRange.length
            let bodyEndNSIndex: Int
            if idx + 1 < matches.count {
                bodyEndNSIndex = matches[idx + 1].range.location
            } else {
                bodyEndNSIndex = nsText.length
            }
            guard bodyStartNSIndex <= bodyEndNSIndex else { continue }
            let bodyRangeNS = NSRange(location: bodyStartNSIndex, length: bodyEndNSIndex - bodyStartNSIndex)
            let bodySubstring = nsText.substring(with: bodyRangeNS)
                .trimmingCharacters(in: .whitespacesAndNewlines)

            // Also compute the Swift Range<String.Index> for downstream
            // callers that want to slice `text` directly.
            if let swiftRange = Range(bodyRangeNS, in: text) {
                segments.append(RawSegment(
                    timecode: timecode,
                    bodyRange: swiftRange,
                    body: bodySubstring
                ))
            }
        }
        return segments
    }

    // MARK: - Prompt

    static func buildPrompt(sourceText: String, segments: [RawSegment]) -> String {
        // Render segments as a numbered list so the AI has a stable
        // ordinal key to zip topics against.
        var segmentList = ""
        for (idx, s) in segments.enumerated() {
            // Trim each segment body to ~400 chars for prompt budget;
            // the full body is still in `sourceText` below for quote
            // recovery.
            let cap = 400
            let excerpt: String
            if s.body.count > cap {
                excerpt = String(s.body.prefix(cap)) + "…"
            } else {
                excerpt = s.body
            }
            segmentList += "[\(idx + 1)] @\(s.timecode)\n\(excerpt)\n\n"
        }

        return """
        Extract structured fields from this transcript.

        RULES:
        1. Return ONLY JSON matching the declared schema. No prose before or after.
        2. For every field, return either:
           - {"status": "found", "value": <value>, "confidence": 0.0-1.0, "sourceSpans": [{"quote": "<verbatim substring>"}]}
           - {"status": "not_found", "tried": ["<location you checked>"]}
        3. `quote` MUST be a contiguous substring of the source text below. If the value is scattered across multiple sentences, return a LIST of quotes in `sourceSpans` — one per contiguous fragment. NEVER join fragments with ellipses (`…`, `...`), semicolons, or other connectors.
        4. NEVER invent values. If a field is not clearly supported, return status "not_found" with a non-empty `tried` array.
        5. Do NOT quote filenames, file paths, or timestamps — they are metadata.
        6. The `segments` array in your response MUST have exactly one entry per numbered segment below, in the same order. For each segment, `topic` is a short noun phrase naming what's discussed; `sourceQuote` is the most illustrative verbatim substring of that segment.

        SEGMENTS (\(segments.count)):
        \(segmentList)

        FULL SOURCE TEXT:
        ---
        \(sourceText)
        ---
        """
    }

    // MARK: - AI payload + schema

    /// Intermediate payload the AI fills in; we then zip its `segments`
    /// onto the deterministic timecodes from `segmentByTimestamps`.
    private struct AILabelPayload: Codable {
        let title: FieldResult<String>
        let speakers: [FieldResult<String>]
        let segments: [AISegmentLabel]
        let keyQuotes: [FieldResult<String>]
    }

    private struct AISegmentLabel: Codable {
        let topic: FieldResult<String>
        let sourceQuote: FieldResult<String>
    }

    static var jsonSchema: JSONSchema {
        JSONSchema(
            name: "TranscriptSchema",
            description: "Structured labels for a timestamped transcript.",
            body: [
                "type": "object",
                "additionalProperties": false,
                "required": ["title", "speakers", "segments", "keyQuotes"],
                "properties": [
                    "title": fieldResultSchema(valueType: "string"),
                    "speakers": [
                        "type": "array",
                        "items": fieldResultSchema(valueType: "string"),
                    ],
                    "segments": [
                        "type": "array",
                        "items": [
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["topic", "sourceQuote"],
                            "properties": [
                                "topic": fieldResultSchema(valueType: "string"),
                                "sourceQuote": fieldResultSchema(valueType: "string"),
                            ],
                        ],
                    ],
                    "keyQuotes": [
                        "type": "array",
                        "items": fieldResultSchema(valueType: "string"),
                    ],
                ],
            ]
        )
    }

    private static func fieldResultSchema(valueType: String) -> [String: Any] {
        return [
            "oneOf": [
                [
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["status", "value", "confidence", "sourceSpans"],
                    "properties": [
                        "status": ["type": "string", "enum": ["found"]],
                        "value": ["type": valueType],
                        "confidence": ["type": "number", "minimum": 0, "maximum": 1],
                        "sourceSpans": [
                            "type": "array",
                            "minItems": 1,
                            "items": [
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["quote"],
                                "properties": [
                                    "quote": ["type": "string"],
                                ],
                            ],
                        ],
                    ],
                ],
                [
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["status", "tried"],
                    "properties": [
                        "status": ["type": "string", "enum": ["not_found"]],
                        "tried": [
                            "type": "array",
                            "items": ["type": "string"],
                        ],
                    ],
                ],
            ],
        ]
    }
}
