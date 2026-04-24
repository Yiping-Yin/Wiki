import Foundation

// MARK: - TranscriptSchema
//
// Plan §3.3 Phase 3 — transcripts (`.vtt` / `.srt` / timestamp-annotated
// `.txt`). Segment boundaries are derived deterministically from the
// timestamp pattern, so the AI only labels each segment's topic and
// extracts key quotes — no segmentation inference.

struct TranscriptSchema: Codable {
    let title: FieldResult<String>
    let speakers: [FieldResult<String>]
    let segments: [SegmentEntry]
    let keyQuotes: [FieldResult<String>]
}

/// One segment of a transcript, bounded by a pair of timestamps. `topic`
/// and `sourceQuote` are `FieldResult` because they're AI-derived even
/// though `timecode` is deterministic.
struct SegmentEntry: Codable {
    /// Opening timecode as emitted by the source file, e.g. `00:15`,
    /// `00:15:30`, `00:15:30.000`.
    let timecode: String
    let topic: FieldResult<String>
    let sourceQuote: FieldResult<String>
}
