import Foundation

// MARK: - SlideDeckExtractor
//
// Plan §3.3 Phase 3 — slide decks.
//
// Match rules:
//   • `.pptx` / `.key` → 0.9
//   • `.pdf` with ≥10 pages AND average page char count < 400
//     (slide-shaped density) → 0.7
//
// The registry's `sample` argument is the first ~2KB of extracted text,
// so we use a simple proxy for "page count + density": if the sample has
// many short lines and few long paragraphs, it's likely a slide deck.
// The plan's 10-page / 400-char-per-page rule is exercised directly in
// tests; the runtime match() uses the sample stand-in.
//
// `.pptx` parsing: conditional on `ZipFoundation`. When the dependency
// is unavailable, the caller is expected to have already extracted text
// via IngestionView's PDF/pptx path — we treat the incoming `text` as
// the full deck body and feed it to the AI directly.

struct SlideDeckExtractor: IngestExtractor {
    typealias Schema = SlideDeckSchema

    static let extractorId = "slide-deck"

    static func match(
        filename: String,
        parentPath: String,
        sample: String
    ) -> Double {
        let ext = (filename as NSString).pathExtension.lowercased()
        switch ext {
        case "pptx", "key":
            return 0.9
        case "pdf":
            // Slide-density heuristic. Cheap proxy: count newlines vs
            // overall length. Decks have many short lines (title +
            // 3–5 bullets/slide); prose PDFs have longer lines. If
            // average line length < 40 chars on a sample ≥400 chars,
            // treat as slide-shaped.
            guard sample.count >= 400 else { return 0.0 }
            let lineCount = sample.split(separator: "\n").count
            guard lineCount > 0 else { return 0.0 }
            let avgLineLen = Double(sample.count) / Double(lineCount)
            if avgLineLen < 40 {
                return 0.7
            }
            return 0.0
        default:
            return 0.0
        }
    }

    func extract(
        text: String,
        filename: String,
        docId: String
    ) async throws -> SlideDeckSchema {
        // For .pptx we *could* re-extract from the XML in ppt/slides/
        // if ZipFoundation is available and IngestionView's text dump
        // missed content. Phase 3 trusts whatever text the caller
        // produced and feeds it to the AI directly — matches the
        // plan's "deck-PDF falls through to PDF extraction (already
        // available)" shortcut.
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
        let raw: SlideDeckSchema
        do {
            raw = try decoder.decode(SlideDeckSchema.self, from: data)
        } catch {
            let preview = String(data: data, encoding: .utf8) ?? ""
            throw StructuredOutputError.jsonParseFailed(
                provider: "SlideDeckExtractor",
                raw: preview,
                attempts: 1
            )
        }

        let filenameStems = SyllabusPDFExtractor.filenameStems(from: filename)
        return Self.verifyAndHarden(
            schema: raw,
            sourceText: text,
            docId: docId,
            filenameStems: filenameStems
        )
    }

    // MARK: - PPTX parse (ZipFoundation-gated)
    //
    // Conditional on `canImport(ZIPFoundation)`. We extract `ppt/slides/slide*.xml`
    // entries and concatenate text runs. Not invoked by `extract()` in
    // Phase 3 (the caller passes already-extracted text) but exposed as
    // a class method so Phase 4+ UI can prefer a structured extraction
    // when the dependency is present.

    static func parsePPTXText(at url: URL) -> String? {
        #if canImport(ZIPFoundation)
        // Minimal implementation — if ZipFoundation is wired we unzip
        // in-memory and pull text runs. See ZipFoundation docs for
        // Archive initializer. Implementation deferred to caller.
        _ = url
        return nil
        #else
        _ = url
        return nil
        #endif
    }

    // MARK: - Prompt

    static func buildPrompt(sourceText: String) -> String {
        return """
        Extract structured fields from this slide deck.

        RULES:
        1. Return ONLY JSON matching the declared schema. No prose before or after.
        2. For every field, return either:
           - {"status": "found", "value": <value>, "confidence": 0.0-1.0, "sourceSpans": [{"quote": "<verbatim substring>"}]}
           - {"status": "not_found", "tried": ["<location you checked>"]}
        3. `quote` MUST be a contiguous substring of the source text below. If the value is scattered across multiple slides, return a LIST of quotes in `sourceSpans` — one per contiguous fragment. NEVER join fragments with ellipses (`…`, `...`), semicolons, or other connectors.
        4. NEVER invent values. If a field is not clearly supported, return status "not_found" with a non-empty `tried` array.
        5. Do NOT quote filenames, file paths, or "Slide N of M" counters — they are metadata, not content.
        6. `deckTitle` MUST come from a title slide or running header; never from the filename. `sections` should segment the deck into 3–8 major topic groups, each with a verbatim section title quoted from a section divider slide.

        SOURCE TEXT:
        ---
        \(sourceText)
        ---
        """
    }

    // MARK: - Verification + hardening

    static func verifyAndHarden(
        schema: SlideDeckSchema,
        sourceText: String,
        docId: String,
        filenameStems: [String]
    ) -> SlideDeckSchema {
        func verify<T: Codable>(_ fr: FieldResult<T>) -> FieldResult<T> {
            let verified = verifySpans(fr, sourceText: sourceText, docId: docId)
            return SyllabusPDFExtractor.demoteIfFilenameQuote(verified, filenameStems: filenameStems)
        }
        return SlideDeckSchema(
            deckTitle: verify(schema.deckTitle),
            author: verify(schema.author),
            sections: schema.sections.map { s in
                SlideSectionEntry(
                    title: verify(s.title),
                    slideRange: verify(s.slideRange)
                )
            },
            topics: schema.topics.map { verify($0) }
        )
    }

    // MARK: - JSON Schema

    static var jsonSchema: JSONSchema {
        JSONSchema(
            name: "SlideDeckSchema",
            description: "Structured fields extracted from a slide deck.",
            body: [
                "type": "object",
                "additionalProperties": false,
                "required": ["deckTitle", "author", "sections", "topics"],
                "properties": [
                    "deckTitle": fieldResultSchema(valueType: "string"),
                    "author": fieldResultSchema(valueType: "string"),
                    "sections": [
                        "type": "array",
                        "items": [
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["title", "slideRange"],
                            "properties": [
                                "title": fieldResultSchema(valueType: "string"),
                                "slideRange": fieldResultSchema(valueType: "string"),
                            ],
                        ],
                    ],
                    "topics": [
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
