import Foundation

// MARK: - FragmentSchema
//
// Phase 7.4 — fragment paste.
//
// A *fragment* is a verbatim quote of someone else's text that the user
// pasted into Loom from outside the local Finder tree (Substack page,
// YouTube transcript, paper PDF on screen, anything copyable). It is the
// escape hatch for the local-files-only ingest contract — the moment
// the user wants to grab THIS PARAGRAPH from somewhere they can't drop a
// file from.
//
// Discipline that distinguishes Loom from Obsidian / Readwise:
//
//   - **Verbatim only.** The schema text is the user's clipboard,
//     byte-for-byte. Loom never paraphrases, summarises, or AI-extracts
//     fields from a fragment. The user is quoting someone else; we
//     don't author over them. (`feedback_extract_not_author`,
//     `feedback_loom_never_do#9` extended to all third-party prose.)
//
//   - **No destination → no save.** This schema deliberately omits any
//     destination identifier. Where the fragment lands is the parent
//     attachment on the resulting `LoomTrace`, which is decided at
//     capture time by the user. If the picker is cancelled, the
//     fragment is discarded — we do NOT auto-save to an inbox.
//     (`feedback_loom_never_do#3` capture-now-organize-later.)
//
//   - **Best-effort source provenance.** `sourceURL` /  `sourceApp` /
//     `sourceTitle` are recorded when the OS hands them to us, but the
//     schema treats all three as optional. We never fabricate a source.
//
// The shape is intentionally flat and tiny — there's nothing to AI here
// and no later pass that needs to surface "tried locations". It does
// not use `FieldResult<T>` for the same reason `MarkdownNotesSchema`
// doesn't: every value is deterministic at capture time.

/// Verbatim fragment paste payload. Persisted into the
/// `LoomTrace.eventsJSON` of a `kind = "fragment-paste"` trace. Decoders
/// downstream pull fields directly; there are no enum cases to switch on.
struct FragmentSchema: Codable, Equatable {
    /// The clipboard text, byte-for-byte. We only trim leading/trailing
    /// whitespace at capture time so empty pastes early-out before they
    /// reach this struct; everything in between is preserved verbatim.
    let text: String

    /// URL on the clipboard at capture time, if the OS exposed one. May
    /// be `nil` even when the user copied from a browser — many sites
    /// only put plain text on the pasteboard.
    let sourceURL: String?

    /// Bundle identifier of the frontmost application at capture time
    /// (e.g. `com.apple.Safari`, `com.tinyspeck.slackmacgap`). Used to
    /// disambiguate "from a web page" vs "from a desktop app" in the
    /// destination picker preview. Best-effort; nil-tolerant.
    let sourceApp: String?

    /// Best-effort window or page title at capture time. Often nil under
    /// the macOS sandbox without screen-recording permission — we
    /// deliberately don't request that entitlement just to read window
    /// titles. Treat as a hint, not a fact.
    let sourceTitle: String?

    /// Capture time as Unix milliseconds, mirroring every other Loom
    /// trace event timestamp.
    let capturedAt: Double

    /// Character count of `text` after the leading/trailing whitespace
    /// trim. Computed at capture time (not on demand) so the schema
    /// roundtrips with stable values even if the receiver normalises
    /// strings differently.
    let charCount: Int

    /// Whitespace-split word count over `text`. Same convention as
    /// `MarkdownNotesSchema.wordCount` — splits on `whitespacesAndNewlines`
    /// and discards empties. Close enough for "78 words" UI hints.
    let wordCount: Int
}
