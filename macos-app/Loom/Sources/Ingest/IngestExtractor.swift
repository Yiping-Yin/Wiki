import Foundation

// MARK: - IngestExtractor protocol
//
// Phase 0 scaffolding for the ingest-extractor-refactor plan
// (`plans/ingest-extractor-refactor.md`, §3.1). Each concrete extractor
// owns one structured schema, a `match` heuristic for dispatch, and an
// async `extract` step that returns the typed payload for a single
// dropped file.
//
// Phase 0 only introduces `GenericDocExtractor` (fallback, wraps the
// prior free-form prompt verbatim). Typed extractors (syllabus, textbook
// chapter, slide deck, transcript, ...) land in Phases 1–3. This file
// defines the shared contract every extractor will implement so the
// dispatch and verification pipeline can land ahead of them.

/// Deterministic, typed extractor for a single dropped file.
///
/// Implementations MUST be pure-ish: given the same `(text, filename,
/// docId)` they should produce the same `Schema` (modulo AI model
/// non-determinism — callers handle retries). Side-effects such as
/// trace writes happen in the caller, not the extractor.
protocol IngestExtractor {
    associatedtype Schema: Codable

    /// Stable, kebab-case identifier persisted alongside extracted
    /// output so later passes can rerun the same extractor (e.g. for
    /// model drift / replay). Must not change between versions without
    /// a migration.
    static var extractorId: String { get }

    /// Confidence in 0.0 — 1.0 that this extractor is the right choice
    /// for the given file. Dispatch picks the highest-scoring extractor.
    /// `GenericDocExtractor` returns a constant baseline so any typed
    /// extractor that matches at all wins.
    ///
    /// - Parameters:
    ///   - filename: basename only, e.g. "Course Overview_FINS3640.pdf"
    ///   - parentPath: immediate parent directory, e.g. "Week 0"
    ///   - sample: first ~2 KB of extracted plaintext, for content-based
    ///     sniffing (e.g. timestamp patterns for transcripts)
    static func match(
        filename: String,
        parentPath: String,
        sample: String
    ) -> Double

    /// Run the extractor against already-extracted plaintext. `docId`
    /// is the caller-supplied identifier that will be embedded in every
    /// `SourceSpan` so downstream click-back-to-source works without a
    /// separate lookup.
    func extract(
        text: String,
        filename: String,
        docId: String
    ) async throws -> Schema
}

// MARK: - FieldResult + SourceSpan
//
// Plan §3.2. Every field in a typed schema is wrapped in `FieldResult`
// so the model can honestly report "not found, tried: X, Y" instead of
// silently dropping data. `SourceSpan` attaches the verbatim `quote`
// plus character offsets; `verified` flips to false when `verifySpans`
// can't locate the quote in the source (plan §3.6).

/// Per-field extraction outcome. Typed extractors in Phase 1+ populate
/// `.found` / `.notFound` per field; `GenericDocExtractor` continues to
/// return a plain struct and doesn't touch this type.
///
/// **Plan §3.7 breaking change (Phase 1):** `sourceSpan` is now a LIST
/// (`sourceSpans`). The mitigation for AI quote-stitching is to require
/// the model to return multiple contiguous quotes rather than joining
/// fragments with ellipses. For the common case (one quote per field)
/// the list has one element; for `format`-style scattered fields the
/// list carries each fragment independently, and every element runs
/// through `verifySpans` individually.
enum FieldResult<T: Codable>: Codable {
    case found(value: T, confidence: Double, sourceSpans: [SourceSpan])
    case notFound(tried: [String])

    // Manual Codable — enum with associated values needs custom
    // encode/decode. Shape is JSON-friendly:
    //   {"status":"found","value":T,"confidence":D,"sourceSpans":[S,...]}
    //   {"status":"not_found","tried":[...]}
    private enum CodingKeys: String, CodingKey {
        case status
        case value
        case confidence
        case sourceSpans
        case sourceSpan   // legacy singleton key (input-only, for AI that still emits it)
        case tried
    }

    private enum Status: String, Codable {
        case found
        case notFound = "not_found"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .found(let value, let confidence, let sourceSpans):
            try container.encode(Status.found, forKey: .status)
            try container.encode(value, forKey: .value)
            try container.encode(confidence, forKey: .confidence)
            try container.encode(sourceSpans, forKey: .sourceSpans)
        case .notFound(let tried):
            try container.encode(Status.notFound, forKey: .status)
            try container.encode(tried, forKey: .tried)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let status = try container.decode(Status.self, forKey: .status)
        switch status {
        case .found:
            let value = try container.decode(T.self, forKey: .value)
            let confidence = try container.decode(Double.self, forKey: .confidence)
            // Prefer the list form; fall back to legacy singleton if an
            // older AI call still returns `sourceSpan`. Empty list is
            // allowed — `verifySpans` will leave it untouched.
            let spans: [SourceSpan]
            if let list = try container.decodeIfPresent([SourceSpan].self, forKey: .sourceSpans) {
                spans = list
            } else if let single = try container.decodeIfPresent(SourceSpan.self, forKey: .sourceSpan) {
                spans = [single]
            } else {
                spans = []
            }
            self = .found(value: value, confidence: confidence, sourceSpans: spans)
        case .notFound:
            let tried = try container.decodeIfPresent([String].self, forKey: .tried) ?? []
            self = .notFound(tried: tried)
        }
    }
}

/// Pinpointer from an extracted field back to its originating source
/// text. `charStart` / `charEnd` are UTF-16 character offsets into the
/// extracted plaintext (NOT the raw PDF). `verified` is false when the
/// quote wasn't a substring of the source; callers should display a
/// warning badge in that case (plan §3.6).
struct SourceSpan: Codable {
    let docId: String
    let pageNum: Int?
    let charStart: Int
    let charEnd: Int
    let quote: String
    let verified: Bool
    let verifyReason: String?

    init(
        docId: String,
        pageNum: Int? = nil,
        charStart: Int,
        charEnd: Int,
        quote: String,
        verified: Bool,
        verifyReason: String? = nil
    ) {
        self.docId = docId
        self.pageNum = pageNum
        self.charStart = charStart
        self.charEnd = charEnd
        self.quote = quote
        self.verified = verified
        self.verifyReason = verifyReason
    }
}

// MARK: - verifySpans
//
// Plan §3.6 + empirical MVP finding: 0/37 AI-returned `charSpan`
// values were correct, 2/37 quotes were hallucinated. The AI's
// `charSpan` is discarded entirely; the `quote` is the only
// ground-truth signal, and we re-derive the char offsets by
// substring search here. On miss we cap confidence at 0.4 and flip
// `verified` to false so the UI can flag it.

/// Verify a `FieldResult` against the source text. Every span in the
/// list is independently located; located spans get `verified: true`
/// with real offsets, un-located spans get `verified: false` with a
/// machine-readable `verifyReason`. Confidence is capped at 0.4 if ANY
/// span fails to verify (the field as a whole becomes suspect the
/// moment one of its quotes is fabricated).
///
/// `.notFound` results pass through untouched — there's nothing to
/// verify. An empty-span `.found` is left as-is on the same principle.
func verifySpans<T>(
    _ result: FieldResult<T>,
    sourceText: String,
    docId: String
) -> FieldResult<T> {
    guard case .found(let value, let confidence, let spans) = result else {
        return result
    }
    guard !spans.isEmpty else { return result }

    var rebuilt: [SourceSpan] = []
    rebuilt.reserveCapacity(spans.count)
    var anyMissed = false

    for span in spans {
        if let range = locate(quote: span.quote, in: sourceText) {
            rebuilt.append(SourceSpan(
                docId: docId,
                pageNum: span.pageNum,
                charStart: range.lowerBound,
                charEnd: range.upperBound,
                quote: span.quote,
                verified: true,
                verifyReason: nil
            ))
        } else {
            anyMissed = true
            rebuilt.append(SourceSpan(
                docId: docId,
                pageNum: span.pageNum,
                charStart: 0,
                charEnd: 0,
                quote: span.quote,
                verified: false,
                verifyReason: "quote_not_substring_of_source"
            ))
        }
    }

    let effectiveConfidence = anyMissed ? min(confidence, 0.4) : confidence
    return .found(value: value, confidence: effectiveConfidence, sourceSpans: rebuilt)
}

// MARK: - locate
//
// Three-tier quote search, matching the Python reference at
// `/tmp/mvp-verify-spans.py`:
//   1. Exact substring — the common case.
//   2. Whitespace-normalized — handles PDFs where line breaks split
//      phrases that the model quoted as single-line.
//   3. First-30-char prefix — last-ditch; the end of the quote may
//      have been lightly paraphrased by the model but the opening
//      still anchors to real source.
//
// Returns `nil` if none of the three tiers hits.

/// Locate `quote` inside `source`. Returns a half-open `Range<Int>` of
/// character offsets (UTF-16-based via `String.utf16.distance`) so the
/// result lines up with JavaScript / web-layer anchoring.
func locate(quote: String, in source: String) -> Range<Int>? {
    guard !quote.isEmpty else { return nil }

    // Tier 1: exact substring.
    if let r = source.range(of: quote) {
        let start = source.utf16.distance(from: source.utf16.startIndex, to: r.lowerBound)
        let end = source.utf16.distance(from: source.utf16.startIndex, to: r.upperBound)
        return start..<end
    }

    // Tier 2: whitespace-normalized. Only worth trying for quotes long
    // enough that collision is unlikely — short quotes ("Yes", "2025")
    // risk matching the wrong phrase after normalization.
    if quote.count > 10 {
        let normSource = source.collapsingWhitespace()
        let normQuote = quote.collapsingWhitespace()
        if !normQuote.isEmpty, let normRange = normSource.range(of: normQuote) {
            let normStart = normSource.distance(from: normSource.startIndex, to: normRange.lowerBound)
            let normEnd = normSource.distance(from: normSource.startIndex, to: normRange.upperBound)
            if let rawRange = mapNormalizedRangeToSource(
                normStart: normStart,
                normEnd: normEnd,
                source: source
            ) {
                return rawRange
            }
        }
    }

    // Tier 3: first-30-char prefix fallback. The quote is clearly long
    // enough that a 30-char prefix carries signal; we accept the hit
    // and synthesize an end offset by adding the quote's character
    // length (clipped to source bounds).
    if quote.count > 30 {
        let prefix = String(quote.prefix(30))
        if let r = source.range(of: prefix) {
            let start = source.utf16.distance(from: source.utf16.startIndex, to: r.lowerBound)
            let sourceLength = source.utf16.count
            let end = min(start + quote.utf16.count, sourceLength)
            return start..<end
        }
    }

    return nil
}

/// Given a normalized-space range `[normStart, normEnd)` into
/// `source.collapsingWhitespace()`, walk the raw `source` and return
/// the raw character range that contains those normalized characters.
///
/// The normalization collapses every run of whitespace to one space
/// and trims leading whitespace; this helper reverses that by stepping
/// through `source` and counting normalized characters as we go.
private func mapNormalizedRangeToSource(
    normStart: Int,
    normEnd: Int,
    source: String
) -> Range<Int>? {
    var rawStart: Int? = nil
    var rawEnd: Int? = nil
    var normCursor = 0
    var rawCursor = 0
    var lastWasSpace = true // mirrors `collapsingWhitespace` leading-trim

    for scalar in source.unicodeScalars {
        let isWhitespace = CharacterSet.whitespacesAndNewlines.contains(scalar)
        let scalarLen = scalar.utf16.count

        // Decide whether this raw character contributes to the
        // normalized string at all.
        let contributes: Bool
        if isWhitespace {
            // A run of whitespace collapses to a single space, and
            // leading whitespace is trimmed entirely.
            contributes = !lastWasSpace
        } else {
            contributes = true
        }

        if contributes {
            if normCursor == normStart, rawStart == nil {
                rawStart = rawCursor
            }
            normCursor += 1
            if normCursor == normEnd, rawEnd == nil {
                rawEnd = rawCursor + scalarLen
                break
            }
        }

        lastWasSpace = isWhitespace
        rawCursor += scalarLen
    }

    if let s = rawStart, let e = rawEnd, s < e {
        return s..<e
    }
    return nil
}

// MARK: - String helper

extension String {
    /// Collapse every run of whitespace/newline to a single space and
    /// trim leading+trailing whitespace. Used by `locate()` tier 2 to
    /// match quotes across PDF line-break boundaries.
    func collapsingWhitespace() -> String {
        var result = ""
        result.reserveCapacity(self.utf16.count)
        var lastWasSpace = true // treat string-start as post-whitespace so we trim
        for scalar in self.unicodeScalars {
            if CharacterSet.whitespacesAndNewlines.contains(scalar) {
                if !lastWasSpace {
                    result.append(" ")
                    lastWasSpace = true
                }
            } else {
                result.unicodeScalars.append(scalar)
                lastWasSpace = false
            }
        }
        // Trim a trailing collapsed space if we added one.
        if result.hasSuffix(" ") {
            result.removeLast()
        }
        return result
    }
}
