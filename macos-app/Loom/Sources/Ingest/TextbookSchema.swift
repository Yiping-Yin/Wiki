import Foundation

// MARK: - TextbookSchema
//
// Plan §3.3 Phase 3 — textbook chapter payload. Same FieldResult wrapping
// as SyllabusSchema so the verifier and UI layer share code.

struct TextbookSchema: Codable {
    let chapterTitle: FieldResult<String>
    let chapterNumber: FieldResult<String>
    let learningObjectives: [FieldResult<String>]
    let keyTerms: [FieldResult<String>]
    let sectionHeadings: [FieldResult<String>]
    /// AI-written summary constrained to quote the end-of-chapter summary
    /// paragraph (or the first paragraph if no summary section exists).
    /// `sourceSpans` anchor the generated summary to real source text.
    let summary: FieldResult<String>
}
