import Foundation

// MARK: - MarkdownNotesSchema
//
// Plan §3.3 / Phase 3 — user-authored markdown / plain-text notes. Since
// the user wrote this themselves, we deliberately DO NOT call AI here
// (feedback_loom_never_do: no AI-authored prose summaries of user notes).
// The extractor scans for structural anchors only: H1..H6 headings, a
// word count, whether there's any code or math, and a short preview of
// the opening prose.
//
// Because nothing here is AI-derived, we don't use `FieldResult<T>`.
// Every field is a direct value: either present (for `title` — `nil` if
// no H1 and filename fallback would be redundant) or a deterministic
// scalar.
//
// Shape is intentionally flat so later phases (thought-map / Panel
// seeding) can read it via `JSONDecoder` without nested `.found` cases.

/// Structured anchors derived from a user-authored markdown / txt file.
/// Deterministic — no AI call, no hallucination risk, no need for
/// `FieldResult` wrapping.
struct MarkdownNotesSchema: Codable {
    /// First `#` heading in the file, if present. Falls back to the
    /// filename stem if there's no H1 at all.
    let title: String?
    /// Every heading (H1–H6) with its depth, text, and character offset
    /// into the source. Drives the thought-map outline surface later.
    let headings: [HeadingEntry]
    /// Whitespace-split word count over the raw source. Matches the way
    /// user-facing word counters (Obsidian, Bear) count — close enough
    /// for a "~300 words" sidebar hint.
    let wordCount: Int
    /// `true` if the file contains any fenced code block or indented
    /// (4-space) code — enough signal to surface a "contains code" flag.
    let hasCode: Bool
    /// `true` if the file contains LaTeX-style math — `$...$`, `$$...$$`,
    /// or `\(...\)`. Matches Obsidian's math extension + common pandoc.
    let hasMath: Bool
    /// First ~200 characters of the body, collapsed whitespace. Used as
    /// a sidebar preview so the user doesn't have to open the file.
    let preview: String
}

/// Heading entry. `level` is 1–6 (H1–H6), `text` is the heading body
/// with leading `#` + whitespace stripped, `charOffset` is the UTF-16
/// character offset at which the heading starts in the source.
struct HeadingEntry: Codable {
    let level: Int
    let text: String
    let charOffset: Int
}
