import Foundation

// MARK: - FragmentExtractor
//
// Phase 7.4 — paste-flow companion to the typed extractor protocol.
//
// `FragmentExtractor` deliberately violates the registry's normal
// dispatch contract: `match()` returns 0.0 for every input so the
// `ExtractorRegistry.bestMatchWithScore` walk NEVER picks it. That's
// intentional — a fragment is the user's quote of someone else's text,
// not an AI-extractable file format. The only entry point is the
// IngestionView paste flow which constructs the schema directly and
// invokes `extract()` explicitly.
//
// Why still implement `IngestExtractor`?
//
//   - Symmetry with the rest of the Phase 5 state machine. The
//     `.extracted` state expects an extractor id + a schema; routing the
//     fragment through the protocol means we don't need a parallel
//     persistence path.
//   - Future-proofing. If we ever decide to surface a "show fragment
//     workbench" diagnostic, the registry knows how to dispatch back
//     by id (`ExtractorRegistry.byId("fragment")`).
//
// `extract()` does NO AI call. It computes deterministic byte-level
// fields (charCount, wordCount) over the verbatim clipboard text. Plan
// constraint H1 ("No AI call in the fragment path"). Plan constraint
// H4 ("FragmentExtractor.match() always returns 0.0").

struct FragmentExtractor: IngestExtractor {
    typealias Schema = FragmentSchema

    static let extractorId = "fragment"

    /// Always 0.0. `ExtractorRegistry.bestMatchWithScore` will never
    /// pick the fragment extractor — it is invoked exclusively from the
    /// paste flow in `IngestionView.pasteClipboardText`. Keeping the
    /// score at 0 (rather than a negative or sentinel) keeps the
    /// arithmetic in `bestMatchWithScore` simple; the always-present
    /// `GenericDocExtractor` baseline of 0.1 beats it without ceremony.
    static func match(
        filename: String,
        parentPath: String,
        sample: String
    ) -> Double {
        return 0.0
    }

    /// SchemaDescription is mostly cosmetic for fragments — the picker
    /// is the user-facing surface, not the registry gate. We override
    /// the default copy so anyone debugging via `byId("fragment")` sees
    /// the right "no AI" signal on the field list.
    static var schemaDescription: SchemaDescription {
        SchemaDescription(
            title: "Pasted fragment",
            blurb: "Verbatim quote from outside the local library. No AI.",
            fields: ["text", "source URL", "source app", "captured at"],
            callsAI: false
        )
    }

    /// Build a `FragmentSchema` from already-captured clipboard
    /// metadata. The caller (`IngestionRunner.ingestFragment`) decides
    /// whether to invoke this — the registry never does.
    ///
    /// The `text` parameter IS the verbatim quote. We do not paraphrase,
    /// summarise, translate, normalise punctuation, or rewrap whitespace.
    /// Plan §3.7-style "harden" passes don't apply because there's no
    /// AI output to verify; the user's clipboard IS the source.
    static func build(
        text: String,
        sourceURL: String?,
        sourceApp: String?,
        sourceTitle: String?,
        capturedAt: Double = Date().timeIntervalSince1970 * 1000
    ) -> FragmentSchema {
        return FragmentSchema(
            text: text,
            sourceURL: sourceURL,
            sourceApp: sourceApp,
            sourceTitle: sourceTitle,
            capturedAt: capturedAt,
            charCount: text.count,
            wordCount: countWords(in: text)
        )
    }

    /// Protocol conformance shim. The IngestExtractor protocol expects
    /// a `(text, filename, docId, pageRanges) async throws -> Schema`
    /// signature. For fragments we don't have a filename or page table;
    /// `filename` is repurposed as the source URL/app hint and dropped
    /// in the result, and `pageRanges` is ignored. Real call site is
    /// `IngestionRunner.ingestFragment` which goes through `build()`
    /// directly with full provenance fields.
    func extract(
        text: String,
        filename: String,
        docId: String,
        pageRanges: [PageRange]? = nil
    ) async throws -> FragmentSchema {
        // Fragments are non-paginated and have no AI call. pageRanges
        // is accepted for protocol conformance only.
        _ = pageRanges
        _ = docId
        return Self.build(
            text: text,
            sourceURL: nil,
            sourceApp: nil,
            sourceTitle: filename.isEmpty ? nil : filename
        )
    }

    // MARK: - Word count
    //
    // Mirrors `MarkdownNotesExtractor.countWords` so the two
    // deterministic extractors agree on what "a word" means. Splits on
    // whitespace + newlines, discards empties; stable across encodings.

    static func countWords(in text: String) -> Int {
        let parts = text
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
        return parts.count
    }
}
