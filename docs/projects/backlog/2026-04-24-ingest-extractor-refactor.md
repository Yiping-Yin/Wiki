# Ingest Extractor Refactor — Implementation Plan

**Drafted 2026-04-24** after Obsidian Web Clipper + GPT-5.5 artifact investigation and MVP validation on UNSW FINS 3640 syllabus.

---

## 1. Problem Statement

Current Loom Swift ingest (`macos-app/Loom/Sources/IngestionView.swift:550-581`) runs a single generic prompt for every file type:

```
Summarise the following document ({filename}) in 2-3 sentences, then list 3-5 key points.
```

A syllabus, a textbook chapter, lecture slides, and personal markdown all hit the same prompt. This is the single biggest gap between Loom's stated philosophy (`source_fidelity` + `extract_not_author` + `protocols_over_prompts`) and its shipped code.

---

## 2. MVP Validation Results (2026-04-24)

Ran both prompts against UNSW FINS 3640 Course Overview PDF (extracted to 5,969 chars plaintext via existing Node `lib/pdf-extract.ts` + `scripts/ingest-knowledge.ts:cleanText()` pipeline).

### Baseline output (1,661 bytes)
- Free-form prose: 2-sentence summary + 5 bullet points
- All facts correct
- No structure, no source anchors, no field semantics
- Programmatic access impossible ("what's the TA's email?" requires re-parsing prose)
- Missing fields (course name, term) silently omitted

### Schema-constrained output (7,422 bytes valid JSON)
- Every target field present as `FieldResult<T>`
- **`courseName` → `not_found`**, tried: `["document title 'Course Overview'", "first 500 chars", "'About the course' section"]`
- **`term` → `not_found`**, tried: includes reasoning `"October/November suggest Term 3 2025 but not explicitly stated"`
- 2 teachers with full (role, name, email) triples
- 4 assessment items with (name, weight, dueDate, format)
- 3 learning objectives, 4 weekTopics — each with `quote` + `charSpan`
- No AI prose; UI-renderable as table / list / form

### Key finding
The baseline quietly lost `courseName` and `term`. The schema-constrained call *reported their absence honestly*. This is the single biggest UX win: Loom can surface "term not found — tried: first 500 chars, assessment dates" instead of leaving the field blank or hallucinating.

### Known caveat (must fix in production)
AI estimated some `charSpan` values without counting (e.g., `charSpan: [0, 0]` for `courseCode` quoting the *filename*, which isn't in source text). Production extractor must:
- Run regex search for `quote` substring in source text
- Override AI's `charSpan` with verified offsets
- Downgrade `confidence` to ≤0.5 if quote is not substring-present

Raw outputs preserved at `/tmp/mvp-out/{baseline.txt, schema.txt, input.txt}`.

---

## 3. Target Architecture

### 3.1 Core protocol (Swift)

```swift
protocol IngestExtractor {
    associatedtype Schema: Codable

    /// Declared name for telemetry and selection.
    static var extractorId: String { get }

    /// Does this extractor claim the given file?
    /// Return a confidence score; highest-scoring extractor wins.
    static func match(filename: String, parentPath: String, sample: String) -> Double

    /// Fields the extractor will attempt to fill, declarative for UI.
    static var schemaDescription: SchemaDescription { get }

    /// Extract. Returns typed schema with FieldResult per field.
    func extract(
        text: String,
        filename: String,
        docId: String
    ) async throws -> Schema
}
```

### 3.2 FieldResult (universal)

```swift
enum FieldResult<T: Codable>: Codable {
    case found(value: T, confidence: Double, sourceSpan: SourceSpan)
    case notFound(tried: [String])
}

struct SourceSpan: Codable {
    let docId: String
    let pageNum: Int?
    let charStart: Int
    let charEnd: Int
    let quote: String  // verbatim fragment, verified substring of source
}
```

### 3.3 Concrete extractors (P0 → P2)

| Extractor | Match pattern | Schema shape | AI call? |
|---|---|---|---|
| `SyllabusPDFExtractor` | filename regex `/(syllabus|outline|handbook|course\s+info|overview|guide)/i` + PDF ext | course code/name/term/teachers/office hours/textbook/assessment/LOs/week topics | yes (structured) |
| `TextbookChapterExtractor` | filename has `chapter` / `ch\d+` / page-count > 20 / contains ISBN | chapter title/LOs/key terms/summary | yes (structured) |
| `SlideDeckExtractor` | `.pptx` / `.key` / PDF with many small pages of bullets | deck title/section list/topics per section | yes (structured) |
| `TranscriptExtractor` | `.vtt` / `.srt` / `.txt` with timestamp pattern | speaker list/topic segments with timecodes/key quotes | yes (structured) |
| `MarkdownNotesExtractor` | `.md` / `.mdx` / `.txt` without timestamps | user's own content — passthrough with anchor extraction | **NO AI** |
| `SpreadsheetExtractor` | `.xlsx` / `.csv` / `.tsv` | sheet names/column schema/row count/sample | deterministic (no AI) |
| `GenericDocExtractor` | fallback | summary + key points (current behavior) | yes (unstructured) |

### 3.4 Matching / dispatch

```swift
let extractors: [IngestExtractor.Type] = [
    SyllabusPDFExtractor.self,
    TextbookChapterExtractor.self,
    SlideDeckExtractor.self,
    TranscriptExtractor.self,
    MarkdownNotesExtractor.self,
    SpreadsheetExtractor.self,
    // Generic is always last (score 0.1 baseline)
    GenericDocExtractor.self,
]

let chosen = extractors
    .map { ($0, $0.match(filename, parentPath, sample)) }
    .max(by: { $0.1 < $1.1 })!
    .0
```

Ranking by score allows soft overlap (e.g., a syllabus might also look like slides; pick the stronger match). Ties broken by order in list.

### 3.5 AI call shape (JSON-schema constrained)

For OpenAI and Anthropic, use their respective structured-output modes:
- **OpenAI**: `response_format: { type: "json_schema", json_schema: { ... } }`
- **Anthropic**: tool-use with declared `input_schema`, call returns JSON in tool invocation
- **Ollama / local CLI**: fall back to "JSON only" instruction + JSON.parse with retry

Each extractor has a static `jsonSchema` derived from its Codable Schema type (via Swift reflection or hand-written). Prompts live in the extractor file, beside the schema:

```swift
struct SyllabusPDFExtractor: IngestExtractor {
    typealias Schema = SyllabusSchema

    static let extractorId = "syllabus-pdf"

    static let promptTemplate = """
    You are a SyllabusPDFExtractor. Extract structured fields...
    [full prompt — see /tmp/mvp-syllabus-compare.sh for validated version]
    """

    static let jsonSchema = ... // generated or hand-written

    static func match(...) -> Double { ... }
    func extract(...) async throws -> SyllabusSchema { ... }
}
```

### 3.6 Post-call verification (mandatory)

After AI returns JSON:

```swift
func verifySpans<T>(_ result: FieldResult<T>, sourceText: String) -> FieldResult<T> {
    guard case .found(let value, let conf, let span) = result else { return result }

    // Verify quote is substring of source text
    if let verifiedRange = sourceText.range(of: span.quote) {
        let start = sourceText.distance(from: sourceText.startIndex, to: verifiedRange.lowerBound)
        let end = sourceText.distance(from: sourceText.startIndex, to: verifiedRange.upperBound)
        return .found(
            value: value,
            confidence: conf,
            sourceSpan: SourceSpan(
                docId: span.docId,
                pageNum: span.pageNum,
                charStart: start,
                charEnd: end,
                quote: span.quote
            )
        )
    } else {
        // Quote not present → AI hallucinated or source was transformed
        return .found(
            value: value,
            confidence: min(conf, 0.4),  // downgrade
            sourceSpan: span  // keep AI's guess but flag low confidence
        )
    }
}
```

---

## 4. Migration Order

### Phase 0 — Scaffolding (1 day)
- New file: `macos-app/Loom/Sources/Ingest/IngestExtractor.swift` (protocol + `FieldResult` + `SourceSpan` + `verifySpans`)
- Refactor current `IngestionView.summarise` to delegate through a new `GenericDocExtractor` that wraps the current prompt behavior. **No behavior change yet.**
- Add end-to-end test with the UNSW FINS 3640 PDF — baseline must match current output byte-for-byte.

### Phase 1 — SyllabusPDFExtractor (2 days)
- Implement `SyllabusPDFExtractor` with full schema, prompt, match function
- Wire into dispatcher
- Add provider adapters for structured output (OpenAI `response_format` + Anthropic tool-use + Ollama JSON-instruction fallback)
- Test on real syllabi in `~/Desktop/Knowledge System/UNSW/*/Week 0/` (3+ courses minimum)
- **Gate:** ≥80% of declared fields return `.found` across test syllabi; `.notFound` fields have non-empty `tried`

### Phase 2 — Swift-side cleanText port (1 day)
- Port `scripts/ingest-knowledge.ts:cleanText()` (lines 255-347) to pure Swift
- Apply to PDF extraction in Swift (currently uses raw PDFKit `.string`)
- Golden-file test: same PDF through Node path and Swift path must produce identical cleaned text

### Phase 3 — Remaining extractors (3-4 days)
- `MarkdownNotesExtractor` (no AI, just anchor scan + preview)
- `SlideDeckExtractor` (needs PPTX extraction via ZipFoundation)
- `TranscriptExtractor` (timestamp-aware)
- `TextbookChapterExtractor`
- `SpreadsheetExtractor` (deterministic, no AI)

### Phase 4 — UI surface (2 days)
- Replace freeform summary display in `IngestionView` with schema-aware renderer
- Show `.found` fields as labeled values with click-to-quote
- Show `.notFound` fields as muted "not found · tried: …"
- Click on a field → scroll source pane to span + highlight quote

### Phase 5 — Opt-in AI gate (1 day)
- After text extraction, show preview + list of fields the chosen extractor WILL extract
- "Extract" button triggers AI call
- Respect `AIProviderKind.disabled` (already wired in current code)

**Total: ~10-12 engineering days across 5 phases.**

---

## 5. Test Strategy

### Golden files
Store `tests/fixtures/syllabus/fins3640.pdf` + `tests/fixtures/syllabus/fins3640.expected.json` (hand-verified expected extraction). Run extractor against it; diff. This catches both regressions and model drift.

### Per-extractor unit tests
- Match function: 20+ filename/path samples, assert ranking
- `verifySpans`: synthetic cases where AI quote is present / absent / off-by-one
- FieldResult Codable round-trip

### Integration: real library
After Phase 1, run full `SyllabusPDFExtractor` over every UNSW syllabus in the user's library. Report per-course pass rate. Manually review `.notFound` lists for false negatives.

### Provider parity
Same extractor, same input, 3 providers (OpenAI / Anthropic / Ollama local). Results should be structurally identical (same fields present, same `notFound` set). Small value differences acceptable.

### Load test
Run 50 PDFs end-to-end. Measure p50 / p95 latency. Baseline: each call ~10-20s. Target: no worse than 2x current (multiplicative overhead of structured output is small).

---

## 6. Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| AI hallucinates `charSpan` | Mandatory `verifySpans` step; downgrade confidence when quote not substring |
| Provider structured-output APIs differ | Adapter layer; Ollama/CLI fallback parses JSON-only instruction |
| Wrong extractor picked for a file | User can override in UI (stretch goal, Phase 5+); match score is visible for debugging |
| Schema evolution breaks old manifests | `schemaVersion` field in each extracted record; migration registry |
| PPTX / XLSX ingestion adds native deps | ZipFoundation / CoreXLSX are pure-Swift, SPM-friendly; no C++ bridging |
| Large syllabi exceed 200KB cap | Chunk text, run extractor on each chunk, merge fields (prefer highest-confidence per field) |

---

## 7. What This Refactor Enables

Direct unlocks:
1. **Click-back-to-source UX** — every extracted claim has a quote + charSpan; click → highlights in source pane
2. **Honest "not found" rendering** — field labeled "Term · not found · tried: first 500 chars, due-date scan" instead of blank
3. **Structured Panel seeding** — Loom Panels can pre-fill from syllabus schema (course code, assessment items) as anchors
4. **Protocol swap** — change provider / model without touching extractor code; `protocols_over_prompts` real in code

Indirect unlocks (6-month):
5. **Per-field confidence surfacing** — UI can highlight low-confidence extractions for user review
6. **Extraction replay** — when model improves (4.7 → 4.8), rerun old ingests and diff; user sees what changed
7. **Provenance audit** — for any claim in any Panel, trace back to exact syllabus paragraph

---

## 8. Explicit Non-Goals

- No user-facing template editor (see `feedback_loom_never_do.md#4`)
- No AI-authored prose summaries (see `feedback_loom_never_do.md#1`)
- No new file-type support beyond the listed extractors
- No migration of Node-side folder-scan ingest (Node handles deterministic indexing; Swift handles AI extraction — two-layer split preserved)
- No Defuddle integration (see `feedback_loom_never_do.md#12` — web ingestion is vetoed in current phase)

---

## 9. Success Criteria

Refactor is shipped when:
1. Dropping a syllabus PDF produces schema-populated UI with clickable source anchors
2. Fields not in source render as `.notFound` with non-empty `tried:` list (not silent empty)
3. Same syllabus extracted under OpenAI / Anthropic / Ollama yields structurally identical output
4. `verifySpans` rejects or downgrades every AI-invented quote in a red-team test
5. Current behavior preserved for files that fall through to `GenericDocExtractor` (zero regression in non-syllabus flow)
6. Markdown files the user wrote themselves never trigger an AI call

---

## 10. Open Questions (to resolve during Phase 1)

1. Where does `extractorId` live in `LoomTrace`? New field `extractorId` + `extractorVersion`?
2. Do we store the raw JSON extraction, or flatten into typed fields at ingest time?
3. How does `FieldResult<T>` serialize to SwiftData (enum with associated values + `@Model`)? Custom `@Attribute(.transformable)` likely.
4. When a user edits an extracted field, does it become a new `SourceSpan` pointing into the user's note, or stay attached to original source?
5. For multi-page PDFs, `SourceSpan` needs `pageNum`; what if `pdf-extract.ts` didn't preserve page boundaries? (Check: cleanText concatenates with `\n\n`, page info is lost. Need to preserve page-offset table in extraction output.)
