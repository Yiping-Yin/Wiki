import Foundation

// MARK: - SyllabusPDFExtractor
//
// Plan §3.3 — the first typed extractor. Claims files whose filename
// matches a syllabus pattern and whose extension is `.pdf`; runs the
// configured structured-output provider against the declared
// `SyllabusSchema`; then post-hoc verifies every quote against the
// source text via `verifySpans` (plan §3.6).
//
// Prompt hardening (plan §3.7, LOAD-BEARING):
//   • The filename is NEVER included in the prompt — AI treats filenames
//     as source and quotes them for identity fields otherwise. This is
//     Mitigation A at the prompt layer.
//   • The prompt tells the model "if the value is scattered across
//     multiple sentences, return a LIST of quotes — never join
//     fragments with ellipses". This is Mitigation B at the prompt
//     layer.
//   • Defense-in-depth: after the AI returns, any quote whose substring
//     contains the filename stem (FINS3640, Course_Overview, …) is
//     auto-demoted to verified:false with capped confidence. Catches
//     the model even if Mitigation A regresses.
//
// Dispatch: Phase 1 `extract()` is a callable; the Ingest UI wiring
// for auto-vs-opt-in is Phase 5's problem. The caller is responsible
// for invoking `extract()` explicitly.

struct SyllabusPDFExtractor: IngestExtractor {
    typealias Schema = SyllabusSchema

    static let extractorId = "syllabus-pdf"

    /// Filename keywords that flag a PDF as a syllabus-style document.
    /// Matched case-insensitively against the filename; requires a `.pdf`
    /// extension in addition. Keywords cover UNSW / standard university
    /// naming (“Course Overview”, “Syllabus”, “Assessment Guide”) plus
    /// catch-alls like “guide” / “handbook”.
    static let syllabusKeywords: [String] = [
        "syllabus",
        "outline",
        "handbook",
        "course info",
        "course overview",
        "overview",
        "assessment guide",
        "guide",
    ]

    static func match(
        filename: String,
        parentPath: String,
        sample: String
    ) -> Double {
        // Only PDFs — slide decks and transcripts will get their own
        // extractors and these keywords (esp. "guide") shouldn't
        // steamroll a .pptx named "Lecture 1 Guide.pptx".
        let ext = (filename as NSString).pathExtension.lowercased()
        guard ext == "pdf" else { return 0.0 }

        let lower = filename.lowercased()
        for keyword in syllabusKeywords {
            if lower.range(of: keyword) != nil {
                // Anchored hit — confident this is the right extractor.
                return 0.9
            }
        }
        return 0.0
    }

    func extract(
        text: String,
        filename: String,
        docId: String
    ) async throws -> SyllabusSchema {
        // 1. Build the prompt — filename intentionally absent (plan §3.7 A).
        let prompt = Self.buildPrompt(sourceText: text)

        // 2. Call the current provider with structured output.
        let schema = Self.jsonSchema
        var options = StructuredOutputOptions()
        options.temperature = 0.0  // deterministic extraction
        let data = try await StructuredOutputDispatch.sendForCurrentProvider(
            prompt: prompt,
            schema: schema,
            options: options
        )

        // 3. Parse JSON into `SyllabusSchema`.
        let decoder = JSONDecoder()
        let raw: SyllabusSchema
        do {
            raw = try decoder.decode(SyllabusSchema.self, from: data)
        } catch {
            let preview = String(data: data, encoding: .utf8) ?? ""
            throw StructuredOutputError.jsonParseFailed(
                provider: "SyllabusPDFExtractor",
                raw: preview,
                attempts: 1
            )
        }

        // 4. Verify every quote against the source text (plan §3.6)
        //    + 5. apply filename-stem auto-demote (§3.7 Mitigation A
        //    defense-in-depth).
        let filenameStems = Self.filenameStems(from: filename)
        return Self.verifyAndHarden(
            schema: raw,
            sourceText: text,
            docId: docId,
            filenameStems: filenameStems
        )
    }

    // MARK: - Prompt

    /// Build the structured-extraction prompt. Deliberately omits the
    /// filename so the model can't quote it back as source (§3.7 A).
    /// The quote-list + contiguous-fragment rule is spelled out
    /// explicitly so the model doesn't cheat by joining fragments with
    /// ellipses (§3.7 B).
    static func buildPrompt(sourceText: String) -> String {
        return """
        Extract structured fields from this university course syllabus.

        RULES:
        1. Return ONLY the tool call / JSON matching the declared schema. No prose before or after.
        2. For every field, return either:
           - {"status": "found", "value": <value>, "confidence": 0.0-1.0, "sourceSpans": [{"quote": "<verbatim substring>"}]}
           - {"status": "not_found", "tried": ["<location you checked>", "<another location>"]}
        3. **`quote` must be a contiguous substring of the source text below.** If the value is scattered across multiple sentences, return a LIST of quotes in `sourceSpans` — one quote per contiguous fragment. NEVER join fragments with ellipses (`…`, `...`), semicolons, or other connectors.
        4. NEVER invent values. If a field is not clearly supported by the source text, return status "not_found" with a non-empty `tried` array describing where you looked.
        5. Do NOT quote document titles, filenames, or file paths — they are metadata, not source content.

        SOURCE TEXT:
        ---
        \(sourceText)
        ---
        """
    }

    // MARK: - Verification + hardening

    /// Walk the decoded schema, running `verifySpans` on every
    /// `FieldResult` and applying the filename-stem auto-demote rule.
    static func verifyAndHarden(
        schema: SyllabusSchema,
        sourceText: String,
        docId: String,
        filenameStems: [String]
    ) -> SyllabusSchema {
        func verify<T: Codable>(_ fr: FieldResult<T>) -> FieldResult<T> {
            let verified = verifySpans(fr, sourceText: sourceText, docId: docId)
            return demoteIfFilenameQuote(verified, filenameStems: filenameStems)
        }

        return SyllabusSchema(
            courseCode: verify(schema.courseCode),
            courseName: verify(schema.courseName),
            term: verify(schema.term),
            institution: verify(schema.institution),
            teachers: schema.teachers.map { t in
                TeacherSchema(
                    role: verify(t.role),
                    name: verify(t.name),
                    email: verify(t.email)
                )
            },
            officeHours: verify(schema.officeHours),
            textbook: verify(schema.textbook),
            assessmentItems: schema.assessmentItems.map { a in
                AssessmentSchema(
                    name: verify(a.name),
                    weightPercent: verify(a.weightPercent),
                    dueDate: verify(a.dueDate),
                    format: verify(a.format)
                )
            },
            learningObjectives: schema.learningObjectives.map { verify($0) },
            weekTopics: schema.weekTopics.map { w in
                WeekTopicSchema(
                    weekRange: verify(w.weekRange),
                    topic: verify(w.topic)
                )
            }
        )
    }

    /// Defense-in-depth for Mitigation A: if any span's quote contains
    /// the filename stem (e.g. "FINS3640" or "Course_Overview"), flag
    /// the span as unverified and cap the field confidence at 0.4. The
    /// quote clearly came from the filename (or somewhere that
    /// resembles it), not from substantive source content.
    ///
    /// Runs AFTER `verifySpans`, so if the verifier already downgraded
    /// the span this function is a no-op on the confidence side. But
    /// the verifier only checks whether the quote is substring-present
    /// — it has no opinion on what the quote *means*. That's this
    /// function's job.
    static func demoteIfFilenameQuote<T>(
        _ result: FieldResult<T>,
        filenameStems: [String]
    ) -> FieldResult<T> {
        guard case .found(let value, let confidence, let spans) = result else {
            return result
        }
        guard !spans.isEmpty, !filenameStems.isEmpty else { return result }

        var anyFilenameHit = false
        let rebuilt = spans.map { span -> SourceSpan in
            let quoteLower = span.quote.lowercased()
            for stem in filenameStems {
                if quoteLower.contains(stem.lowercased()) {
                    anyFilenameHit = true
                    return SourceSpan(
                        docId: span.docId,
                        pageNum: span.pageNum,
                        charStart: 0,
                        charEnd: 0,
                        quote: span.quote,
                        verified: false,
                        verifyReason: "quote_contains_filename_stem"
                    )
                }
            }
            return span
        }
        if anyFilenameHit {
            return .found(value: value, confidence: min(confidence, 0.4), sourceSpans: rebuilt)
        }
        return result
    }

    /// Derive filename-stem tokens to check against quotes.
    ///
    /// For a filename like `"Course Overview_FINS3640.pdf"` we return:
    ///   ["Course Overview_FINS3640",   // full stem
    ///    "FINS3640",                   // each underscore-split part
    ///    "Course Overview",
    ///    "Course", "Overview"]         // each space-split part
    ///
    /// Short tokens (< 4 chars) are skipped — they'd hit too many
    /// legitimate quotes ("UNSW", "Term"). Pure-digit tokens likewise.
    static func filenameStems(from filename: String) -> [String] {
        let ns = filename as NSString
        let stem = ns.deletingPathExtension
        var tokens: Set<String> = [stem]

        for part in stem.components(separatedBy: CharacterSet(charactersIn: "_-")) {
            let trimmed = part.trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty { tokens.insert(trimmed) }
            for sub in trimmed.components(separatedBy: .whitespaces) {
                let s = sub.trimmingCharacters(in: .whitespaces)
                if !s.isEmpty { tokens.insert(s) }
            }
        }

        // Filter: only keep tokens that are distinctive enough to
        // indicate a filename leak rather than generic English.
        return tokens.filter { token in
            guard token.count >= 4 else { return false }
            // Strings like "2025" would demote every legitimate year
            // quote — only keep tokens that mix letters and digits, or
            // are long enough (>=8) that collision with natural English
            // is unlikely.
            let hasLetter = token.rangeOfCharacter(from: .letters) != nil
            let hasDigit = token.rangeOfCharacter(from: .decimalDigits) != nil
            if hasLetter && hasDigit { return true }
            if token.count >= 8 { return true }
            return false
        }
    }

    // MARK: - JSON Schema (provider-facing)
    //
    // The model sees this via OpenAI's `response_format.json_schema.schema`
    // / Anthropic's `input_schema`. `additionalProperties: false` is set
    // at every object level so OpenAI's `strict: true` mode is satisfied.
    // Schema deliberately excludes `charSpan` / `pageNum` / `verified` —
    // the model only returns `quote` (list form), everything else is
    // derived post-hoc by `verifySpans` (plan §3.6).

    static var jsonSchema: JSONSchema {
        JSONSchema(
            name: "SyllabusSchema",
            description: "Structured fields extracted from a university course syllabus.",
            body: [
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "courseCode", "courseName", "term", "institution",
                    "teachers", "officeHours", "textbook",
                    "assessmentItems", "learningObjectives", "weekTopics",
                ],
                "properties": [
                    "courseCode": fieldResultSchema(valueType: "string"),
                    "courseName": fieldResultSchema(valueType: "string"),
                    "term": fieldResultSchema(valueType: "string"),
                    "institution": fieldResultSchema(valueType: "string"),
                    "teachers": [
                        "type": "array",
                        "items": [
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["role", "name", "email"],
                            "properties": [
                                "role": fieldResultSchema(valueType: "string"),
                                "name": fieldResultSchema(valueType: "string"),
                                "email": fieldResultSchema(valueType: "string"),
                            ],
                        ],
                    ],
                    "officeHours": fieldResultSchema(valueType: "string"),
                    "textbook": fieldResultSchema(valueType: "string"),
                    "assessmentItems": [
                        "type": "array",
                        "items": [
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["name", "weightPercent", "dueDate", "format"],
                            "properties": [
                                "name": fieldResultSchema(valueType: "string"),
                                "weightPercent": fieldResultSchema(valueType: "number"),
                                "dueDate": fieldResultSchema(valueType: "string"),
                                "format": fieldResultSchema(valueType: "string"),
                            ],
                        ],
                    ],
                    "learningObjectives": [
                        "type": "array",
                        "items": fieldResultSchema(valueType: "string"),
                    ],
                    "weekTopics": [
                        "type": "array",
                        "items": [
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["weekRange", "topic"],
                            "properties": [
                                "weekRange": fieldResultSchema(valueType: "string"),
                                "topic": fieldResultSchema(valueType: "string"),
                            ],
                        ],
                    ],
                ],
            ]
        )
    }

    /// Per-field shape: a `oneOf` of `found` + `notFound`. Kept in one
    /// helper so `valueType` varies per field (string / number) without
    /// duplicating the outer envelope.
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
