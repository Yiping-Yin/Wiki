import Foundation

// MARK: - SlideDeckSchema
//
// Plan §3.3 Phase 3 — slide deck payload. Same FieldResult discipline as
// the other typed schemas so the UI and verifier share code.

struct SlideDeckSchema: Codable {
    let deckTitle: FieldResult<String>
    let author: FieldResult<String>
    let sections: [SlideSectionEntry]
    let topics: [FieldResult<String>]
}

/// A section within the deck. `title` is the section's label (e.g.
/// "Macroprudential tools"); `slideRange` is a free-text range like
/// "slides 5-8" — kept as a string because decks inconsistently number
/// their sections.
struct SlideSectionEntry: Codable {
    let title: FieldResult<String>
    let slideRange: FieldResult<String>
}
