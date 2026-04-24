import Foundation

// MARK: - TextbookChapterExtractor
//
// Plan §3.3 Phase 3 — textbook chapters / long-form reference PDFs.
//
// Match rules:
//   • filename contains `chapter`, `ch<digits>`, or `section` → 0.85
//   • `.pdf` extension + body contains `ISBN` + text length suggests
//     >20 pages (≥20_000 chars is a reasonable proxy) → 0.7
//   • everything else → 0.0 (falls through to Generic)
//
// AI call uses the same §3.6 + §3.7 hardening pattern as
// SyllabusPDFExtractor: filename stripped from the prompt, quote must
// be a contiguous substring, filename-stem demote on the way out.

struct TextbookChapterExtractor: IngestExtractor {
    typealias Schema = TextbookSchema

    static let extractorId = "textbook-chapter"

    /// Chars-per-page heuristic. Textbooks average 2–3k chars/page after
    /// cleanText stripping; 20 pages × 1000 chars gives a conservative
    /// floor for the ISBN+length path.
    static let minCharsForISBNPath = 20_000

    static func match(
        filename: String,
        parentPath: String,
        sample: String
    ) -> Double {
        let ext = (filename as NSString).pathExtension.lowercased()
        let lower = filename.lowercased()

        // Filename signal — accepts `chapter`, `ch3`, `ch_03`, `section 2`.
        let filenameHitsChapter = lower.contains("chapter")
            || matchesChapterShorthand(lower)
            || lower.contains("section")

        if filenameHitsChapter {
            return 0.85
        }

        // PDF body signal: long content + ISBN mention. `sample` is the
        // first ~2KB per the IngestExtractor contract, so "contains
        // ISBN" is a reliable textbook signal when present in the
        // front-matter / footer. Length check uses the sample stand-in
        // because the registry doesn't pass full text — good enough to
        // weed out short pamphlets.
        if ext == "pdf",
           sample.range(of: "ISBN", options: .caseInsensitive) != nil,
           sample.count >= 1500 {
            return 0.7
        }

        return 0.0
    }

    /// Matches `ch3`, `ch03`, `ch_3`, `ch-03`, etc. Returns true when
    /// the filename has `ch` followed by optional `_`/`-`/space + digits.
    static func matchesChapterShorthand(_ lowercased: String) -> Bool {
        guard let regex = try? NSRegularExpression(
            pattern: #"\bch[\s_\-]*\d+"#
        ) else {
            return false
        }
        let ns = lowercased as NSString
        return regex.firstMatch(
            in: lowercased,
            range: NSRange(location: 0, length: ns.length)
        ) != nil
    }

    func extract(
        text: String,
        filename: String,
        docId: String,
        pageRanges: [PageRange]? = nil
    ) async throws -> TextbookSchema {
        let prompt = Self.buildPrompt(sourceText: text)
        let schema = Self.jsonSchema

        var options = StructuredOutputOptions()
        options.temperature = 0.0
        let data = try await StructuredOutputDispatch.sendForCurrentProvider(
            prompt: prompt,
            schema: schema,
            options: options
        )

        let decoder = JSONDecoder()
        let raw: TextbookSchema
        do {
            raw = try decoder.decode(TextbookSchema.self, from: data)
        } catch {
            let preview = String(data: data, encoding: .utf8) ?? ""
            throw StructuredOutputError.jsonParseFailed(
                provider: "TextbookChapterExtractor",
                raw: preview,
                attempts: 1
            )
        }

        let filenameStems = SyllabusPDFExtractor.filenameStems(from: filename)
        return Self.verifyAndHarden(
            schema: raw,
            sourceText: text,
            docId: docId,
            filenameStems: filenameStems,
            pageRanges: pageRanges
        )
    }

    // MARK: - Prompt

    static func buildPrompt(sourceText: String) -> String {
        return """
        Extract structured fields from this textbook chapter.

        RULES:
        1. Return ONLY JSON matching the declared schema. No prose before or after.
        2. For every field, return either:
           - {"status": "found", "value": <value>, "confidence": 0.0-1.0, "sourceSpans": [{"quote": "<verbatim substring>"}]}
           - {"status": "not_found", "tried": ["<location you checked>"]}
        3. `quote` MUST be a contiguous substring of the source text below. If a value is scattered across multiple sentences, return a LIST of quotes in `sourceSpans` — one per contiguous fragment. NEVER join fragments with ellipses (`…`, `...`), semicolons, or other connectors.
        4. NEVER invent values. If a field is not clearly supported, return status "not_found" with a non-empty `tried` array describing where you looked.
        5. Do NOT quote filenames or file paths — they are metadata.
        6. `summary` MUST quote the chapter's end-of-chapter summary paragraph (sections often titled "Summary", "Key Points", "Chapter Review"). If no such paragraph exists, quote the first body paragraph after the chapter title. Never invent summary prose.

        SOURCE TEXT:
        ---
        \(sourceText)
        ---
        """
    }

    // MARK: - Verification + hardening

    static func verifyAndHarden(
        schema: TextbookSchema,
        sourceText: String,
        docId: String,
        filenameStems: [String],
        pageRanges: [PageRange]? = nil
    ) -> TextbookSchema {
        func verify<T: Codable>(_ fr: FieldResult<T>) -> FieldResult<T> {
            let verified = verifySpans(fr, sourceText: sourceText, docId: docId, pageRanges: pageRanges)
            return SyllabusPDFExtractor.demoteIfFilenameQuote(verified, filenameStems: filenameStems)
        }
        return TextbookSchema(
            chapterTitle: verify(schema.chapterTitle),
            chapterNumber: verify(schema.chapterNumber),
            learningObjectives: schema.learningObjectives.map { verify($0) },
            keyTerms: schema.keyTerms.map { verify($0) },
            sectionHeadings: schema.sectionHeadings.map { verify($0) },
            summary: verify(schema.summary)
        )
    }

    // MARK: - JSON Schema

    static var jsonSchema: JSONSchema {
        JSONSchema(
            name: "TextbookSchema",
            description: "Structured fields extracted from a textbook chapter.",
            body: [
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "chapterTitle", "chapterNumber",
                    "learningObjectives", "keyTerms",
                    "sectionHeadings", "summary",
                ],
                "properties": [
                    "chapterTitle": fieldResultSchema(valueType: "string"),
                    "chapterNumber": fieldResultSchema(valueType: "string"),
                    "learningObjectives": [
                        "type": "array",
                        "items": fieldResultSchema(valueType: "string"),
                    ],
                    "keyTerms": [
                        "type": "array",
                        "items": fieldResultSchema(valueType: "string"),
                    ],
                    "sectionHeadings": [
                        "type": "array",
                        "items": fieldResultSchema(valueType: "string"),
                    ],
                    "summary": fieldResultSchema(valueType: "string"),
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
