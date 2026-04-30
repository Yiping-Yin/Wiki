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

    /// Segment-window size per AI call. Past this count the transcript is
    /// partitioned into contiguous windows of this many segments each and
    /// each window is labeled by its own AI call; results are merged into
    /// one `TranscriptSchema` at the end (see `extract`).
    ///
    /// 30 is the historical single-chunk ceiling — empirically the prompt
    /// stayed under the 4096-token budget for ~30 segments of ~400 chars
    /// each. Rather than raise the ceiling we keep the known-good window
    /// and add N parallel calls on top.
    static let maxSegmentsForAIPrompt = 30

    /// Upper bound on concurrent provider calls for a single transcript.
    /// 4 balances wall-time (an hour-long lecture = ~120 segments = 4
    /// chunks, all fire at once) against rate-limits and CLI fork-storm
    /// risk (Anthropic free tier ≈ 5 rpm, local CLI spawns a process
    /// per call). Configurable should a user ship a 3000-segment auto-
    /// generated transcript — see `runChunksConcurrent` for the cap.
    static let maxConcurrentChunks = 4

    /// Test-seam: default chunk runner calls
    /// `StructuredOutputDispatch.sendForCurrentProvider`. Unit tests
    /// swap in a deterministic mock via `extract(..., chunkRunner:)`
    /// so we don't need a live AI provider to exercise merge logic.
    typealias ChunkRunner = (
        _ prompt: String,
        _ schema: JSONSchema,
        _ options: StructuredOutputOptions
    ) async throws -> Data

    static let defaultChunkRunner: ChunkRunner = { prompt, schema, options in
        try await StructuredOutputDispatch.sendForCurrentProvider(
            prompt: prompt,
            schema: schema,
            options: options
        )
    }

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
        docId: String,
        pageRanges: [PageRange]? = nil
    ) async throws -> TranscriptSchema {
        try await extract(
            text: text,
            filename: filename,
            docId: docId,
            pageRanges: pageRanges,
            chunkRunner: Self.defaultChunkRunner
        )
    }

    /// Overload used by tests: inject a deterministic `chunkRunner` to
    /// short-circuit the real provider call. Production code calls the
    /// 4-arg form above which uses `defaultChunkRunner`.
    func extract(
        text: String,
        filename: String,
        docId: String,
        pageRanges: [PageRange]?,
        chunkRunner: @escaping ChunkRunner
    ) async throws -> TranscriptSchema {
        // Transcripts are time-indexed (not paginated). The typical
        // .vtt/.srt path passes nil for pageRanges; the rarer
        // timestamped-.txt-in-a-pdf path (transcript-style content
        // rendered to PDF) flows pageRanges through to verifySpans so
        // any quotes it emits still get pageNum derived.

        // 1. Deterministic segmentation — cut on timestamps.
        let rawSegments = Self.segmentByTimestamps(text: text)

        // If the file has zero timestamps (e.g. a .txt we matched via
        // extension that turned out to be prose), fall back to a single
        // empty-timecode segment carrying the whole body.
        let segmentsToLabel: [RawSegment] = rawSegments.isEmpty
            ? [RawSegment(timecode: "", bodyRange: text.startIndex..<text.endIndex, body: text)]
            : rawSegments

        // 2. Partition into N contiguous windows of at most
        //    `maxSegmentsForAIPrompt` segments each. The single-chunk
        //    fast path (≤30 segments) produces exactly one chunk whose
        //    source slice == the whole text, matching the pre-chunking
        //    behavior byte-for-byte.
        let chunks = Self.partitionIntoChunks(
            segments: segmentsToLabel,
            wholeText: text,
            windowSize: Self.maxSegmentsForAIPrompt
        )

        // 3. Run chunks concurrently (bounded) via task group. Each
        //    chunk's AI failure is captured per-chunk, not fatal: we
        //    degrade that chunk's segments to `.notFound` but still
        //    merge the others.
        let chunkResults = await Self.runChunksConcurrent(
            chunks: chunks,
            chunkRunner: chunkRunner,
            maxConcurrent: Self.maxConcurrentChunks
        )

        // 4. Merge chunk results into a single TranscriptSchema with
        //    globally-consistent sourceSpan offsets, filename-stem
        //    demotion, and dedup across chunk boundaries.
        return Self.mergeChunkResults(
            chunkResults,
            chunks: chunks,
            wholeText: text,
            filename: filename,
            docId: docId,
            pageRanges: pageRanges
        )
    }

    // MARK: - Chunking

    /// One chunk's worth of segments, plus the slice of `text` the AI
    /// will see as "source text" for that chunk. `sourceOffset` is the
    /// UTF-16 offset of the slice's first character within the whole
    /// transcript — used at merge time to translate chunk-local
    /// sourceSpan offsets to global offsets.
    struct Chunk {
        /// Segments in this window, in their original global order.
        let segments: [RawSegment]
        /// Index of this chunk in the full partition (0-based).
        let chunkIndex: Int
        /// UTF-16 offset into the whole transcript where this chunk's
        /// `sourceSlice` begins. Chunk 0 is always 0.
        let sourceOffset: Int
        /// Substring of the whole transcript containing only this
        /// chunk's segments — the `SOURCE TEXT` the AI sees. Verifier
        /// runs on this slice so quote offsets are chunk-local.
        let sourceSlice: String
    }

    /// Split `segments` into contiguous windows of at most `windowSize`
    /// and compute each window's text slice out of `wholeText`.
    ///
    /// The slice for chunk N starts at the NSString location of the
    /// first timecode match for chunk N's first segment (we recover
    /// this from the segment's `bodyRange`, backing off to the
    /// pre-timecode boundary). The slice ends at the last segment's
    /// `bodyRange.upperBound`. The whole-transcript UTF-16 offset of
    /// the slice's first char is `sourceOffset`.
    ///
    /// Edge cases:
    ///   • ≤30 segments → 1 chunk whose slice == `wholeText` and
    ///     sourceOffset == 0. Fast-path preserves the pre-chunking
    ///     behavior for short transcripts.
    ///   • 31 segments → 2 chunks (30 + 1); the second chunk still
    ///     gets its own AI call, not skipped as "too small".
    ///   • 0 segments (no timestamps) → caller has already substituted
    ///     a single full-text segment; we produce 1 chunk containing it.
    static func partitionIntoChunks(
        segments: [RawSegment],
        wholeText: String,
        windowSize: Int
    ) -> [Chunk] {
        guard !segments.isEmpty else { return [] }

        // Fast path: fits in one window → slice == whole text,
        // preserves the pre-chunking behavior byte-for-byte.
        if segments.count <= windowSize {
            return [Chunk(
                segments: segments,
                chunkIndex: 0,
                sourceOffset: 0,
                sourceSlice: wholeText
            )]
        }

        var chunks: [Chunk] = []
        var idx = 0
        var chunkIdx = 0
        while idx < segments.count {
            let end = min(idx + windowSize, segments.count)
            let window = Array(segments[idx..<end])

            // Compute the slice that covers these segments. Lower
            // bound: first segment's bodyRange.lowerBound minus the
            // timecode prefix (so the AI sees "@00:00 …" style source,
            // not just the body). Upper bound: last segment's upper
            // bound. For chunks after the first, the slice start is
            // the timecode position; for the last chunk it runs to
            // end-of-text.
            let sliceLower = window.first!.bodyRange.lowerBound
            let sliceUpper: String.Index
            if end < segments.count {
                // End at the start of the NEXT chunk's first segment's
                // body range — that's where the next timecode lives.
                sliceUpper = segments[end].bodyRange.lowerBound
            } else {
                sliceUpper = wholeText.endIndex
            }
            let slice = String(wholeText[sliceLower..<sliceUpper])

            // UTF-16 offset of the slice's first char in wholeText.
            let sourceOffset = wholeText.utf16.distance(
                from: wholeText.utf16.startIndex,
                to: sliceLower.samePosition(in: wholeText.utf16) ?? wholeText.utf16.startIndex
            )

            chunks.append(Chunk(
                segments: window,
                chunkIndex: chunkIdx,
                sourceOffset: sourceOffset,
                sourceSlice: slice
            ))
            idx = end
            chunkIdx += 1
        }
        return chunks
    }

    /// Per-chunk AI call outcome. `.success` carries the decoded payload
    /// + verified + filename-demoted fields keyed to the chunk's slice.
    /// `.failure` records the error so we can degrade that chunk's
    /// segments to `.notFound` at merge time without failing the whole
    /// extract.
    enum ChunkOutcome {
        case success(AILabelPayload)
        case failure(Error)
    }

    /// Run `chunks` concurrently with a cap of `maxConcurrent` in
    /// flight. Each chunk sends its own prompt + decodes its own JSON.
    /// Failures are captured — never thrown out of the group — so one
    /// flaky AI call doesn't dynamite the rest of a 2-hour lecture.
    ///
    /// Rate-limit note: providers returning HTTP 429 surface as a
    /// `StructuredOutputError.invalidResponse` from the dispatch layer.
    /// That error is captured as `.failure(err)` for this chunk and
    /// logged at merge time; the chunk's segments become `.notFound`.
    /// With `maxConcurrent = 4`, the worst case is 4 simultaneous 429s
    /// → 4 `.notFound` chunks → user sees some windows labeled and
    /// others degraded, not a full-transcript wipeout.
    static func runChunksConcurrent(
        chunks: [Chunk],
        chunkRunner: @escaping ChunkRunner,
        maxConcurrent: Int
    ) async -> [ChunkOutcome] {
        // Preserve ordering — the result array is indexed by
        // chunk.chunkIndex. withTaskGroup doesn't guarantee completion
        // order, so we round-trip via (idx, outcome) tuples.
        var outcomes = Array<ChunkOutcome?>(repeating: nil, count: chunks.count)
        let cap = max(1, maxConcurrent)

        await withTaskGroup(of: (Int, ChunkOutcome).self) { group in
            var enqueued = 0
            // Seed up to `cap` tasks.
            while enqueued < chunks.count && enqueued < cap {
                let chunk = chunks[enqueued]
                group.addTask {
                    return (chunk.chunkIndex, await runSingleChunk(chunk: chunk, chunkRunner: chunkRunner))
                }
                enqueued += 1
            }
            // As each completes, enqueue the next pending. This keeps
            // at most `cap` provider calls in flight at any moment —
            // the key invariant that lets us tune for rate limits.
            for await (idx, outcome) in group {
                outcomes[idx] = outcome
                if enqueued < chunks.count {
                    let chunk = chunks[enqueued]
                    group.addTask {
                        return (chunk.chunkIndex, await runSingleChunk(chunk: chunk, chunkRunner: chunkRunner))
                    }
                    enqueued += 1
                }
            }
        }

        return outcomes.map { $0 ?? .failure(StructuredOutputError.invalidResponse(
            provider: "TranscriptExtractor",
            detail: "chunk never ran"
        )) }
    }

    /// One chunk → one AI call → decoded payload. Failures convert to
    /// `.failure(err)` so caller can continue with other chunks.
    private static func runSingleChunk(
        chunk: Chunk,
        chunkRunner: @escaping ChunkRunner
    ) async -> ChunkOutcome {
        let prompt = buildPrompt(sourceText: chunk.sourceSlice, segments: chunk.segments)
        let schema = jsonSchema

        var options = StructuredOutputOptions()
        options.temperature = 0.0

        let data: Data
        do {
            data = try await chunkRunner(prompt, schema, options)
        } catch {
            return .failure(error)
        }

        let decoder = JSONDecoder()
        do {
            let payload = try decoder.decode(AILabelPayload.self, from: data)
            return .success(payload)
        } catch {
            let preview = String(data: data, encoding: .utf8) ?? ""
            return .failure(StructuredOutputError.jsonParseFailed(
                provider: "TranscriptExtractor",
                raw: preview,
                attempts: 1
            ))
        }
    }

    // MARK: - Merge

    /// Merge chunk outcomes into a single `TranscriptSchema`. This does
    /// three jobs at once:
    ///   1. Per-chunk verify + filename-demote using the chunk's source
    ///      slice (so quote offsets locate correctly in-chunk).
    ///   2. Translate sourceSpan offsets from chunk-local to global
    ///      (relative to the whole transcript), so downstream
    ///      click-back-to-source still works.
    ///   3. Cross-chunk dedup on speakers + keyQuotes + choose the best
    ///      title across chunks.
    static func mergeChunkResults(
        _ outcomes: [ChunkOutcome],
        chunks: [Chunk],
        wholeText: String,
        filename: String,
        docId: String,
        pageRanges: [PageRange]?
    ) -> TranscriptSchema {
        let filenameStems = SyllabusPDFExtractor.filenameStems(from: filename)

        // Per-chunk verify helper: runs verifySpans on the chunk's
        // slice, applies filename-stem demotion, and shifts sourceSpan
        // offsets to whole-transcript coordinates.
        func verifyLocal<T: Codable>(_ fr: FieldResult<T>, chunk: Chunk) -> FieldResult<T> {
            let v = verifySpans(fr, sourceText: chunk.sourceSlice, docId: docId, pageRanges: nil)
            let demoted = SyllabusPDFExtractor.demoteIfFilenameQuote(v, filenameStems: filenameStems)
            return shiftOffsetsToGlobal(
                demoted,
                chunkOffset: chunk.sourceOffset,
                wholeText: wholeText,
                pageRanges: pageRanges
            )
        }

        // Single-chunk fast path: preserve byte-for-byte parity with
        // the pre-chunking behavior (no cross-chunk dedup, no
        // speaker-list filtering — just verify + return the AI's
        // payload as-is).
        if chunks.count == 1 {
            let chunk = chunks[0]
            switch outcomes[0] {
            case .failure:
                let degradedSegs = chunk.segments.map { raw in
                    SegmentEntry(
                        timecode: raw.timecode,
                        topic: .notFound(tried: ["chunk_ai_call_failed"]),
                        sourceQuote: .notFound(tried: ["chunk_ai_call_failed"])
                    )
                }
                return TranscriptSchema(
                    title: .notFound(tried: ["chunk_ai_call_failed"]),
                    speakers: [],
                    segments: degradedSegs,
                    keyQuotes: []
                )
            case .success(let payload):
                // Pad/trim labels to match the chunk's segment count,
                // matching the legacy truncation rule.
                let labels: [AISegmentLabel]
                if payload.segments.count < chunk.segments.count {
                    let padding = (payload.segments.count..<chunk.segments.count).map { _ in
                        AISegmentLabel(
                            topic: .notFound(tried: ["ai_returned_too_few_segments"]),
                            sourceQuote: .notFound(tried: ["ai_returned_too_few_segments"])
                        )
                    }
                    labels = payload.segments + padding
                } else {
                    labels = Array(payload.segments.prefix(chunk.segments.count))
                }
                let segs = zip(chunk.segments, labels).map { raw, label in
                    SegmentEntry(
                        timecode: raw.timecode,
                        topic: verifyLocal(label.topic, chunk: chunk),
                        sourceQuote: verifyLocal(label.sourceQuote, chunk: chunk)
                    )
                }
                return TranscriptSchema(
                    title: verifyLocal(payload.title, chunk: chunk),
                    speakers: payload.speakers.map { verifyLocal($0, chunk: chunk) },
                    segments: segs,
                    keyQuotes: payload.keyQuotes.map { verifyLocal($0, chunk: chunk) }
                )
            }
        }

        // Multi-chunk path: cross-chunk dedup on speakers + keyQuotes,
        // concatenated segments, title picked from the first chunk
        // that found one.
        var mergedSegments: [SegmentEntry] = []
        var seenSpeakers: Set<String> = []
        var speakerEntries: [FieldResult<String>] = []
        var seenQuotes: Set<String> = []
        var keyQuoteEntries: [FieldResult<String>] = []
        var titleCandidates: [FieldResult<String>] = []

        for (chunk, outcome) in zip(chunks, outcomes) {
            switch outcome {
            case .failure:
                // Entire chunk failed — produce .notFound entries for
                // every segment in the window so the caller sees
                // honest gaps, not a phantom crash.
                for raw in chunk.segments {
                    mergedSegments.append(SegmentEntry(
                        timecode: raw.timecode,
                        topic: .notFound(tried: ["chunk_ai_call_failed"]),
                        sourceQuote: .notFound(tried: ["chunk_ai_call_failed"])
                    ))
                }

            case .success(let payload):
                let labels: [AISegmentLabel]
                if payload.segments.count < chunk.segments.count {
                    let padding = (payload.segments.count..<chunk.segments.count).map { _ in
                        AISegmentLabel(
                            topic: .notFound(tried: ["ai_returned_too_few_segments"]),
                            sourceQuote: .notFound(tried: ["ai_returned_too_few_segments"])
                        )
                    }
                    labels = payload.segments + padding
                } else {
                    labels = Array(payload.segments.prefix(chunk.segments.count))
                }

                for (raw, label) in zip(chunk.segments, labels) {
                    mergedSegments.append(SegmentEntry(
                        timecode: raw.timecode,
                        topic: verifyLocal(label.topic, chunk: chunk),
                        sourceQuote: verifyLocal(label.sourceQuote, chunk: chunk)
                    ))
                }

                // Speakers dedup by `.found` value. `.notFound` entries
                // aren't comparable; we drop them in the multi-chunk
                // path because any chunk that legitimately has speakers
                // will produce `.found` and noise from chunks without
                // speakers would otherwise flood the list.
                for sp in payload.speakers {
                    let verified = verifyLocal(sp, chunk: chunk)
                    if case .found(let v, _, _) = verified {
                        if !seenSpeakers.contains(v) {
                            seenSpeakers.insert(v)
                            speakerEntries.append(verified)
                        }
                    }
                }

                // KeyQuotes dedup by quote string (first-seen wins).
                for kq in payload.keyQuotes {
                    let verified = verifyLocal(kq, chunk: chunk)
                    if case .found(let v, _, _) = verified {
                        if !seenQuotes.contains(v) {
                            seenQuotes.insert(v)
                            keyQuoteEntries.append(verified)
                        }
                    }
                }

                titleCandidates.append(verifyLocal(payload.title, chunk: chunk))
            }
        }

        // Title: first `.found` wins; if none found, fall back to the
        // longest `.notFound.tried` (most diagnostic signal), else a
        // generic not_found.
        let title: FieldResult<String> = {
            for cand in titleCandidates {
                if case .found = cand { return cand }
            }
            var best: FieldResult<String> = .notFound(tried: ["no_chunk_returned_title"])
            var bestTriedCount = -1
            for cand in titleCandidates {
                if case .notFound(let tried) = cand, tried.count > bestTriedCount {
                    best = cand
                    bestTriedCount = tried.count
                }
            }
            return best
        }()

        return TranscriptSchema(
            title: title,
            speakers: speakerEntries,
            segments: mergedSegments,
            keyQuotes: keyQuoteEntries
        )
    }

    /// Shift a `FieldResult`'s sourceSpan charStart/charEnd from
    /// chunk-local offsets to whole-transcript offsets. The chunk-
    /// local offsets were set by `verifySpans(chunkSlice)`; we add
    /// `chunkOffset` (the chunk's UTF-16 starting position in the
    /// whole transcript) and, when `pageRanges` is supplied, re-derive
    /// `pageNum` from the global offset so page attribution still works
    /// for rendered-to-PDF transcripts.
    private static func shiftOffsetsToGlobal<T: Codable>(
        _ result: FieldResult<T>,
        chunkOffset: Int,
        wholeText: String,
        pageRanges: [PageRange]?
    ) -> FieldResult<T> {
        guard case .found(let value, let conf, let spans) = result else { return result }
        guard !spans.isEmpty else { return result }

        let shifted = spans.map { span -> SourceSpan in
            // Only shift spans that were actually located
            // (verified==true means charStart/charEnd are meaningful
            // chunk-local offsets). For unverified spans the offsets
            // are already 0/0 and carry no meaning — leave them.
            guard span.verified else { return span }
            let newStart = span.charStart + chunkOffset
            let newEnd = span.charEnd + chunkOffset
            let newPage: Int?
            if let ranges = pageRanges, !ranges.isEmpty {
                newPage = pageForSpan(newStart..<newEnd, in: ranges)
            } else {
                newPage = span.pageNum
            }
            return SourceSpan(
                docId: span.docId,
                pageNum: newPage,
                charStart: newStart,
                charEnd: newEnd,
                quote: span.quote,
                verified: span.verified,
                verifyReason: span.verifyReason
            )
        }
        return .found(value: value, confidence: conf, sourceSpans: shifted)
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
    /// Non-private so chunking / test harnesses can refer to it; the
    /// type is still effectively internal to `TranscriptExtractor`.
    struct AILabelPayload: Codable {
        let title: FieldResult<String>
        let speakers: [FieldResult<String>]
        let segments: [AISegmentLabel]
        let keyQuotes: [FieldResult<String>]
    }

    struct AISegmentLabel: Codable {
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
