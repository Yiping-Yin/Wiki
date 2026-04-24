import Foundation

// MARK: - SyllabusSchema
//
// Plan §3.3 — the structured payload returned by `SyllabusPDFExtractor`.
// Every atomic field is wrapped in `FieldResult<T>` so the model can
// honestly report "not found, tried: X, Y" rather than silently drop
// data or hallucinate (plan §2 key finding #1).
//
// Design notes:
//   - Nested structs (`TeacherSchema`, `AssessmentSchema`, `WeekTopicSchema`)
//     stay flat and Codable so JSON round-trips cleanly through the
//     structured-output providers (OpenAI `json_schema`, Anthropic
//     `tool_use.input_schema`).
//   - `learningObjectives` is `[FieldResult<String>]` rather than
//     `FieldResult<[String]>` because each objective has its own quote
//     evidence and may independently `.notFound` — matches the shape
//     validated in the MVP run.
//   - Schema intentionally does NOT include `charSpan`. Plan §3.6:
//     `charSpan` is derived post-hoc via `locate()`; the AI only ever
//     returns `quote` (list form per §3.7 Mitigation B).

struct SyllabusSchema: Codable {
    let courseCode: FieldResult<String>
    let courseName: FieldResult<String>
    let term: FieldResult<String>
    let institution: FieldResult<String>
    let teachers: [TeacherSchema]
    let officeHours: FieldResult<String>
    let textbook: FieldResult<String>
    let assessmentItems: [AssessmentSchema]
    let learningObjectives: [FieldResult<String>]
    let weekTopics: [WeekTopicSchema]
}

struct TeacherSchema: Codable {
    let role: FieldResult<String>
    let name: FieldResult<String>
    let email: FieldResult<String>
}

struct AssessmentSchema: Codable {
    let name: FieldResult<String>
    let weightPercent: FieldResult<Double>
    let dueDate: FieldResult<String>
    let format: FieldResult<String>
}

struct WeekTopicSchema: Codable {
    let weekRange: FieldResult<String>
    let topic: FieldResult<String>
}
