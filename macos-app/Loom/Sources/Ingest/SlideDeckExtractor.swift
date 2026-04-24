import Foundation
#if canImport(ZIPFoundation)
import ZIPFoundation
#endif

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
        docId: String,
        pageRanges: [PageRange]? = nil
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
            filenameStems: filenameStems,
            pageRanges: pageRanges
        )
    }

    // MARK: - PPTX parse (ZipFoundation-gated)
    //
    // Conditional on `canImport(ZIPFoundation)`. We extract
    // `ppt/slides/slide<N>.xml` entries (and speaker-note counterparts
    // under `ppt/notesSlides/notesSlide<N>.xml`), pull text runs from
    // `<a:t>` elements via `Foundation.XMLParser`, and join slides with
    // a separator so downstream source anchoring can still map quotes
    // back to specific slides.
    //
    // Slide ordering MUST be numeric — `slide2.xml` precedes `slide10.xml`.
    // A lexical sort inverts that, which breaks `pageNum` heuristics and
    // produces misleading source spans.
    //
    // Malformed entries (non-UTF8, XML parse error, missing pattern) are
    // skipped silently so a single corrupted slide doesn't abort the
    // whole deck. Ingest has no logger we can reach from here; any
    // surfaced debug info would have to route through a Phase 4+ telemetry
    // hook that doesn't exist yet.

    /// Hard upper bound on the returned joined text. PPTX decks can run
    /// to 1MB+ of XML on 100+ slide decks; we cap at 200 KB to stay in
    /// parity with the ingest-wide text cap noted in the plan.
    static let pptxMaxChars = 200 * 1024

    static func parsePPTXText(at url: URL) -> String? {
        #if canImport(ZIPFoundation)
        // ZIPFoundation 0.9.20+ marks the failable `init?(url:accessMode:)`
        // deprecated in favor of the throwing `init(url:accessMode:pathEncoding:)`.
        // Call the throwing form explicitly so we don't resolve to the
        // deprecated overload.
        let archive: Archive
        do {
            archive = try Archive(url: url, accessMode: .read, pathEncoding: nil)
        } catch {
            return nil
        }

        let slideEntries = archive
            .compactMap { entry -> (Int, Entry, EntryKind)? in
                if let n = slideNumber(fromPath: entry.path, prefix: "ppt/slides/slide") {
                    return (n, entry, .slide)
                }
                if let n = slideNumber(fromPath: entry.path, prefix: "ppt/notesSlides/notesSlide") {
                    return (n, entry, .notes)
                }
                return nil
            }

        let slides = slideEntries
            .filter { $0.2 == .slide }
            .sorted { $0.0 < $1.0 }
        let notes = slideEntries
            .filter { $0.2 == .notes }
            .sorted { $0.0 < $1.0 }

        var slideTexts: [String] = []
        for (_, entry, _) in slides {
            if let text = extractTextRuns(from: entry, archive: archive) {
                slideTexts.append(text)
            }
        }

        var notesTexts: [String] = []
        for (_, entry, _) in notes {
            if let text = extractTextRuns(from: entry, archive: archive), !text.isEmpty {
                notesTexts.append(text)
            }
        }

        if slideTexts.isEmpty && notesTexts.isEmpty {
            return nil
        }

        var combined = slideTexts.joined(separator: "\n\n---\n\n")
        if !notesTexts.isEmpty {
            combined += "\n\n=== NOTES ===\n\n"
            combined += notesTexts.joined(separator: "\n\n---\n\n")
        }

        if combined.count > pptxMaxChars {
            let end = combined.index(combined.startIndex, offsetBy: pptxMaxChars)
            combined = String(combined[..<end])
        }

        return combined
        #else
        _ = url
        return nil
        #endif
    }

    #if canImport(ZIPFoundation)
    /// Distinguishes slide bodies from speaker notes in the sort pass.
    private enum EntryKind { case slide, notes }

    /// Parse `ppt/slides/slide12.xml` → 12. Returns nil for anything
    /// else (including `slideLayoutN.xml`, `slideMasterN.xml`, or
    /// variant paths we don't want to mix into the body).
    private static func slideNumber(fromPath path: String, prefix: String) -> Int? {
        guard path.hasPrefix(prefix) else { return nil }
        let tail = path.dropFirst(prefix.count)
        guard tail.hasSuffix(".xml") else { return nil }
        let numberPart = tail.dropLast(".xml".count)
        return Int(numberPart)
    }

    /// Extract bytes for an entry, parse XML, return the joined text-run
    /// content. Returns nil on any failure so the caller can skip the
    /// entry instead of aborting.
    private static func extractTextRuns(from entry: Entry, archive: Archive) -> String? {
        var buffer = Data()
        do {
            _ = try archive.extract(entry) { chunk in
                buffer.append(chunk)
            }
        } catch {
            return nil
        }
        return parseTextRuns(xml: buffer)
    }

    /// Parse OOXML drawing text runs via `Foundation.XMLParser`. Collects
    /// character data inside `<a:t>` elements and joins them with single
    /// spaces per slide.
    private static func parseTextRuns(xml data: Data) -> String? {
        guard data.range(of: Data("<a:t".utf8)) != nil else {
            return ""
        }

        let parser = XMLParser(data: data)
        let delegate = TextRunCollector()
        parser.delegate = delegate
        // `shouldProcessNamespaces = false` keeps the element name as
        // `a:t` (the raw qualified name) which is what we match below.
        parser.shouldProcessNamespaces = false
        guard parser.parse() else { return nil }
        let runs = delegate.runs
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if runs.isEmpty { return "" }
        return runs.joined(separator: " ")
    }

    /// Collects character data from inside `<a:t>` elements. A single
    /// `<a:t>` can contain multiple `foundCharacters` callbacks (e.g.
    /// entity-escaped content), so we accumulate into `current` and
    /// only flush on element close.
    private final class TextRunCollector: NSObject, XMLParserDelegate {
        private(set) var runs: [String] = []
        private var current: String = ""
        private var depth: Int = 0

        func parser(
            _ parser: XMLParser,
            didStartElement elementName: String,
            namespaceURI: String?,
            qualifiedName qName: String?,
            attributes attributeDict: [String: String] = [:]
        ) {
            if elementName == "a:t" {
                depth += 1
            }
        }

        func parser(_ parser: XMLParser, foundCharacters string: String) {
            if depth > 0 {
                current += string
            }
        }

        func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
            if depth > 0, let s = String(data: CDATABlock, encoding: .utf8) {
                current += s
            }
        }

        func parser(
            _ parser: XMLParser,
            didEndElement elementName: String,
            namespaceURI: String?,
            qualifiedName qName: String?
        ) {
            if elementName == "a:t" {
                runs.append(current)
                current = ""
                depth = max(0, depth - 1)
            }
        }
    }
    #endif

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
        filenameStems: [String],
        pageRanges: [PageRange]? = nil
    ) -> SlideDeckSchema {
        func verify<T: Codable>(_ fr: FieldResult<T>) -> FieldResult<T> {
            let verified = verifySpans(fr, sourceText: sourceText, docId: docId, pageRanges: pageRanges)
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
