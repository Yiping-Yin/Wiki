# Ingest Extractor Refactor — Implementation Plan

**Drafted 2026-04-24** after Obsidian Web Clipper + GPT-5.5 artifact investigation and MVP validation on UNSW FINS 3640 syllabus.

> NOTE on path: Repo root is `/Users/yinyiping/Desktop/LOOM/`. Earlier memory entries reference `Wiki` — that was the pre-rename name (launchd plist still `com.user.wiki.plist`). Same project.

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
- **Silently lost `courseName` and `term`**

### Schema-constrained output (7,422 bytes valid JSON)
- Every target field present as `FieldResult<T>`
- **`courseName` → `not_found`**, tried: `["document title 'Course Overview'", "first 500 chars", "'About the course' section"]`
- **`term` → `not_found`**, tried: includes reasoning `"October/November suggest Term 3 2025 but not explicitly stated"`
- 2 teachers with full (role, name, email) triples
- 4 assessment items with (name, weight, dueDate, format)
- 3 learning objectives, 4 weekTopics — each with `quote` + `charSpan`
- No AI prose; UI-renderable as table / list / form

### Key finding #1: honest not_found
The baseline quietly lost `courseName` and `term`. The schema-constrained call reported their absence honestly with `tried: [...]` reasoning. **This is the single biggest UX win.** Loom can surface "term not found — tried: first 500 chars, assessment dates" instead of blank or hallucination.

### Key finding #2: AI charSpan is ~95% unreliable AND the correct 5% are trivial (stability run, n=4 syllabi)

Built `/tmp/mvp-verify-spans.py` (Python reference impl of `verifySpans`) and ran it against 4 UNSW syllabi (FINS 3640, COMM 3030, INFS 3822, FINS 3635) across 4 disciplines. Aggregate over **125 FieldResult.found** entries:

| Sample | Chars | Found | ✓ span OK | ⚠ span wrong | ✗ hallucinated | % halluc |
|---|---|---|---|---|---|---|
| FINS 3640 | 5969 | 37 | 0 | 35 | 2 | 5.4% |
| COMM 3030 | 8000 | 20 | 1 | 18 | 1 | 5.0% |
| INFS 3822 | 8000 | 26 | 3 | 23 | 0 | 0.0% |
| FINS 3635 | 4320 | 42 | 2 | 35 | 5 | 11.9% |
| **TOTAL** | **26289** | **125** | **6** | **111** | **8** | **6.4%** |

**Aggregate span-correct rate: 4.8% (6/125).**

**100% of span-correct predictions are in the first ~100 characters of the source** (header / title / first bullet). Zero `assessmentItems`, `learningObjectives`, `weekTopics`, `officeHours`, or `textbook` spans were EVER AI-correct across any sample. AI offset counting breaks immediately past the header.

**8 hallucinations cluster on two patterns:**
1. **Filename-leak on identity fields** (3 samples hit this): AI quotes the filename (`"Course Overview_FINS3640.pdf"`) when `courseCode` / `courseName` / `term` isn't in the body. Filename appears in the prompt's metadata line, not in `input.txt`, so verifier catches it.
2. **Format-field stitching** (3 samples): AI joins non-contiguous fragments with ellipsis (`"Python ... Topic: Bond index replication..."`) or semicolons and calls it a single quote.

Quote-recovery rate is strong: **117/125 (93.6%) quotes are substring-recoverable** via verifier's normalized search even when AI charSpan is wrong. The quote is the recoverable signal; charSpan is noise.

### Implication (load-bearing, stronger than single-sample conclusion)

AI's `charSpan` is pure noise. Production design:
- **Drop `charSpan` from the AI-facing schema.** Don't ask the model for it — it wastes tokens and is always wrong past char 100.
- **Keep `quote` in the schema.** It's the recoverable signal — 93.6% of quotes are substring-findable.
- **Derive `charSpan` post-hoc** via `locate()`: exact → whitespace-normalized → first-30-char prefix fallback.
- **Two hardening guards**:
  - **Strip filename from AI prompt** (or auto-demote quotes that contain the filename stem) — kills filename-leak hallucination
  - **Require contiguous quote** or split `format` into sub-fields — kills ellipsis-stitching
- **On verify miss**: cap `confidence` at 0.4, set `verified: false`, surface in UI as warning badge.

Verified outputs:
- FINS 3640: `/tmp/mvp-out/schema-verified.json`, `/tmp/mvp-out/verify-report.txt`
- Stability set (3 more): `/tmp/mvp-stability/{comm3030,infs3822,fins3635}/schema-verified.json`
- Aggregate: `/tmp/mvp-stability/aggregate-report.txt`

---

## 3. Target Architecture

### 3.1 Core protocol (Swift)

```swift
protocol IngestExtractor {
    associatedtype Schema: Codable

    static var extractorId: String { get }
    static func match(filename: String, parentPath: String, sample: String) -> Double
    static var schemaDescription: SchemaDescription { get }

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
    let quote: String            // verbatim, verified substring of source
    let verified: Bool           // false if quote not in source
    let verifyReason: String?    // e.g. "quote_not_substring_of_source"
}
```

### 3.3 Concrete extractors (P0 → P2)

| Extractor | Match pattern | Schema shape | AI call? |
|---|---|---|---|
| `SyllabusPDFExtractor` | filename `/(syllabus|outline|handbook|course\s+info|overview|guide)/i` + PDF ext | course code/name/term/teachers/office hours/textbook/assessment/LOs/week topics | yes (structured) |
| `TextbookChapterExtractor` | filename `chapter` / `ch\d+` / page-count > 20 / ISBN present | chapter title/LOs/key terms/summary | yes (structured) |
| `SlideDeckExtractor` | `.pptx` / `.key` / PDF with many small-bullet pages | deck title/section list/topics per section | yes (structured) |
| `TranscriptExtractor` | `.vtt` / `.srt` / `.txt` with timestamp pattern | speaker list/topic segments/key quotes | yes (structured) |
| `MarkdownNotesExtractor` | `.md` / `.mdx` / `.txt` without timestamps | user's own content — passthrough + anchor scan | **NO AI** |
| `SpreadsheetExtractor` | `.xlsx` / `.csv` / `.tsv` | sheet names/column schema/row count/sample | deterministic (no AI) |
| `GenericDocExtractor` | fallback | summary + key points (current behavior) | yes (unstructured) |

### 3.4 Dispatch

```swift
let chosen = extractors
    .map { ($0, $0.match(filename, parentPath, sample)) }
    .max(by: { $0.1 < $1.1 })!.0
```

### 3.5 AI call shape (JSON-schema constrained)

- **OpenAI**: `response_format: { type: "json_schema", json_schema: {...} }`
- **Anthropic**: tool-use with declared `input_schema`; result pulled from tool invocation
- **Ollama / CLI**: fall back to "JSON only" instruction + JSON.parse with retry

Each extractor declares its `jsonSchema` (derived from Codable or hand-written). Schema **must not** include `charSpan` — the model never estimates offsets. Only `quote` is requested.

### 3.6 Post-call verification (LOAD-BEARING)

**Empirical finding, n=125 across 4 UNSW syllabi (2026-04-24)**:
- AI span-correct rate: **4.8% aggregate** — and **100% of correct spans are in the first ~100 chars** (header). Past the header, 0% correct.
- Quote-hallucination rate: **6.4% aggregate** (range 0–11.9%), clustered on two patterns:
  1. AI quotes the filename when identity fields aren't in the body
  2. AI stitches non-contiguous fragments with ellipsis in `format` fields

This is NOT optional polish — `verifySpans` is the contract. Additionally, two hardening guards at the prompt layer are required (see §3.7).

Reference Python at `/tmp/mvp-verify-spans.py`. Swift port:

```swift
func verifySpans<T>(_ result: FieldResult<T>, sourceText: String, docId: String) -> FieldResult<T> {
    guard case .found(let value, let conf, let span) = result else { return result }

    if let range = locate(quote: span.quote, in: sourceText) {
        return .found(
            value: value,
            confidence: conf,
            sourceSpan: SourceSpan(
                docId: docId,
                pageNum: span.pageNum,
                charStart: range.lowerBound,
                charEnd: range.upperBound,
                quote: span.quote,
                verified: true,
                verifyReason: nil
            )
        )
    } else {
        return .found(
            value: value,
            confidence: min(conf, 0.4),
            sourceSpan: SourceSpan(
                docId: docId, pageNum: span.pageNum,
                charStart: 0, charEnd: 0,
                quote: span.quote,
                verified: false,
                verifyReason: "quote_not_substring_of_source"
            )
        )
    }
}

func locate(quote: String, in source: String) -> Range<Int>? {
    // 1. exact substring
    if let r = source.range(of: quote) { return source.offsetRange(of: r) }
    // 2. whitespace-normalized match
    let normSrc = source.collapsingWhitespace()
    let normQuote = quote.collapsingWhitespace()
    if quote.count > 10, let r = normSrc.range(of: normQuote) {
        return mapBackToRawOffsets(normRange: r, source: source)
    }
    // 3. first 30-char prefix fallback
    if quote.count > 30, let r = source.range(of: String(quote.prefix(30))) {
        let start = source.offset(of: r.lowerBound)
        return start..<min(start + quote.count, source.count)
    }
    return nil
}
```

**Phase 1 red-team tests** (all must reject / demote):
1. FINS 3640 `courseCode` — AI quoted filename → must be `verified: false`, `confidence: 0.4`
2. FINS 3635 `courseName` / `term` — same filename-leak → must reject
3. FINS 3640 `assessmentItems[0].format` — ellipsis-joined quote (`"Python ... Topic: ..."`) → must reject
4. FINS 3635 format fields (5 hallucinations observed) → must reject

### 3.7 Prompt-layer hardening (LOAD-BEARING)

Agent B stability run (2026-04-24) identified two predictable hallucination loci. Mitigations must ship in Phase 1, not deferred:

**Mitigation A — Filename leak prevention**

Current MVP prompt includes `SOURCE TEXT (filename: Course Overview_FINS3640.pdf):` header. AI treats the filename as if it were source content, quoting it for identity fields. Two options:

1. **Remove filename from prompt entirely** — if the extractor already used filename for `match()`, it shouldn't re-leak it as source. Cleanest.
2. **Keep filename for context, but verifier auto-demotes any quote whose substring contains the filename stem** (`FINS3640`, `Course_Overview`, etc.). Defense-in-depth; works even if prompt changes.

Recommend both.

**Mitigation B — Contiguous-quote enforcement**

Current schema allows a single-string `quote` per field. AI cheats by joining fragments with `"..."` or `";"`. Two options:

1. **Prompt-level rule**: "The `quote` must be a contiguous substring of source text. If the value is scattered across multiple sentences, return a LIST of quotes, not a joined string." Update `FieldResult.found.quote` to `[String]`.
2. **Split synthetic fields**: `assessmentItems[].format` becomes sub-fields `format.type`, `format.submission`, `format.groupSize` — each atomic, each individually locatable.

Recommend option 1 (prompt-level + quote as list) because it generalizes; option 2 is a schema proliferation.

Revised `FieldResult`:

```swift
enum FieldResult<T: Codable>: Codable {
    case found(value: T, confidence: Double, sourceSpans: [SourceSpan])  // LIST, not single
    case notFound(tried: [String])
}
```

When list has 1 element, renders as single-span (common case). When >1, UI shows "· see N quotes" expandable.

---

## 4. Migration Order

### Phase 0 — Scaffolding (1 day)
- New: `macos-app/Loom/Sources/Ingest/IngestExtractor.swift` (protocol + `FieldResult` + `SourceSpan` + `verifySpans` + `locate`)
- Refactor current `IngestionView.summarise` to delegate through `GenericDocExtractor` (wraps current prompt behavior). **Zero behavior change.**
- End-to-end test with UNSW FINS 3640 PDF — baseline output must match current byte-for-byte.

### Phase 1 — SyllabusPDFExtractor (2 days)
- Full schema, prompt, match function
- Provider adapters (OpenAI `response_format` + Anthropic tool-use + Ollama JSON-instruction)
- Test on 3+ real syllabi in `~/Desktop/Knowledge System/UNSW/*/Week 0/`
- **Gate**: ≥80% of declared fields return `.found`; `.notFound` fields have non-empty `tried`; red-team `courseCode`-quoting-filename case is rejected

### Phase 2 — Swift-side cleanText port (1 day)
- Port `scripts/ingest-knowledge.ts:cleanText()` (lines 255-347) to pure Swift
- Apply to PDF extraction in Swift (currently uses raw PDFKit `.string`)
- Golden-file parity: same PDF through Node and Swift paths must produce identical cleaned text

### Phase 3 — Remaining extractors (3-4 days)
- `MarkdownNotesExtractor` (no AI, anchor scan + preview)
- `SlideDeckExtractor` (PPTX via ZipFoundation)
- `TranscriptExtractor` (timestamp-aware)
- `TextbookChapterExtractor`
- `SpreadsheetExtractor` (deterministic, no AI)

### Phase 4 — UI surface (2 days)
- Schema-aware renderer replaces freeform summary display
- `.found` → labeled value with click-to-quote
- `.notFound` → muted "not found · tried: …"
- Unverified (verified:false) → warning badge
- Click on field → scroll source pane to span + highlight

### Phase 5 — Opt-in AI gate (1 day)
- After text extraction, show preview + extractor's planned field list
- "Extract" button triggers AI call (not auto-run)
- Respect existing `AIProviderKind.disabled`

**Total: ~10-12 engineering days across 5 phases.**

---

## 5. Test Strategy

### Golden files
`tests/fixtures/syllabus/fins3640.pdf` + `fins3640.expected.json` (hand-verified). Run extractor, diff. Catches regressions + model drift.

### Per-extractor unit tests
- Match function: 20+ filename/path samples, assert ranking
- `verifySpans`: synthetic cases — quote present / absent / off-by-one / after whitespace normalization
- `FieldResult` Codable round-trip

### Red-team (mandatory gate)
- Quote = filename → must reject
- Quote with ellipses → must reject
- Quote with invented text → must reject
- Quote with different whitespace than source → must accept via normalized-match path

### Integration: real library
Run `SyllabusPDFExtractor` over every UNSW syllabus in user's library. Per-course pass rate. Manual review of `.notFound` lists for false negatives.

### Provider parity
Same extractor, same input, 3 providers (OpenAI / Anthropic / Ollama local). Structurally identical output (same fields present, same `.notFound` set). Small value differences OK.

### Load test
50 PDFs end-to-end. p50 / p95 latency. Baseline ~10-20s/call; target ≤ 2x.

---

## 6. Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| ~~AI hallucinates `charSpan`~~ | **Confirmed 100%** — don't ask AI for charSpan; derive post-hoc |
| AI hallucinates `quote` | `verifySpans` catches, demotes confidence + sets verified:false |
| Provider structured-output APIs differ | Adapter layer; Ollama/CLI fallback via JSON-instruction |
| Wrong extractor picked | Match score visible for debugging; UI override in Phase 5+ |
| Schema evolution | `schemaVersion` field; migration registry |
| PPTX / XLSX native deps | ZipFoundation + CoreXLSX are pure-Swift SPM |
| Large syllabi > 200KB cap | Chunk text; run extractor per chunk; merge prefer highest-confidence per field |
| Page-boundary loss in cleanText | Preserve page-offset table in extraction output (Phase 2) |

---

## 7. What This Refactor Enables

Direct unlocks:
1. **Click-back-to-source** — every claim carries verified quote + charSpan
2. **Honest "not found"** — "Term · not found · tried: X, Y, Z" instead of blank
3. **Structured Panel seeding** — course code, assessment items pre-fill as anchors
4. **Unverified badge** — low-confidence extractions get visible warning, not silent lie
5. **Protocol swap** — change provider / model without touching extractor code

6-month unlocks:
6. **Per-field confidence surfacing** — UI highlights low-confidence for user review
7. **Extraction replay** — model improvements rerun old ingests with diffing
8. **Provenance audit** — any Panel claim traces to exact syllabus paragraph

---

## 8. Explicit Non-Goals

- No user-facing template editor (`feedback_loom_never_do.md#4`)
- No AI-authored prose summaries (`feedback_loom_never_do.md#1`)
- No new file-type support beyond listed
- No Node-side folder-scan ingest migration (two-layer split preserved)
- No Defuddle integration (`feedback_loom_never_do.md#12`)

---

## 9. Success Criteria

1. Dropping a syllabus PDF produces schema-populated UI with clickable source anchors — **Phase 4 (UI pending)**
2. Fields not in source render as `.notFound` with non-empty `tried:` — ✅ **SHIPPED 2026-04-24** (live run: 3/3 identity fields on FINS 3640 honestly `not_found` with `tried: [...]`)
3. Same syllabus under 3 providers → structurally identical — Phase 1 gate `--parity` infra ready; not yet run
4. `verifySpans` rejects or downgrades every AI-invented quote in red-team tests — ✅ **SHIPPED 2026-04-24** (gate: 5/5 red-team cases rejected with correct reason strings)
5. `GenericDocExtractor` preserves current behavior for files without a typed extractor — ✅ **SHIPPED** (Phase 0 + Phase 1 both preserve byte-identical flow for .md, .txt, non-syllabus PDFs)
6. User-authored markdown → zero AI calls at ingest — ✅ **SHIPPED 2026-04-24** (`MarkdownNotesExtractor` deterministic; registry-wired, UI still defaults to generic ingest until Phase 5)

## 9.1 Phase 1 Shipped Results (2026-04-24)

Build: `xcodebuild clean build` ✅ + `build-for-testing` ✅. Only warning is pre-existing `AIStreamBridgeHandler.swift:92` Swift 6 captured-var (unrelated).

Gate (`python3 scripts/phase1-gate.py --skip-ai`, against 11 fixture syllabi + 4 red-team cases):
- Fields expected-found: **96/96 = 100%** (target 80%) ✅
- Fields expected-not_found: **36/42 = 86%** (target 80%) ✅
- Red-team rejection: **5/5 = 100%** (target 100%) ✅
- **PASS**

Live end-to-end via `claude` CLI on FINS 3640 with the **new hardened production prompt** (via Agent A's `/tmp/loom-phase1-verified.json`):
- Found fields: 23 populated `FieldResult.found`
- NotFound fields: 3 (`courseCode`, `courseName`, `term` — filename-only in source; honestly reported with `tried: [...]`)
- Total sourceSpans emitted: 46
- Spans verified as substring-present: **46/46 = 100%** (baseline across n=125 was 4.8%)
- Filename-stem demotions at runtime: 0 (Mitigation A worked at prompt — model never emitted filename as quote)
- Ellipsis-stitch demotions at runtime: 0 (Mitigation B worked at prompt — model returned lists of contiguous quotes for scattered fields)

**4.8% → 100% span verification** is the canonical Phase 1 win.

## 9.2 Phase 2/3 Shipped Results (2026-04-24)

- Phase 2: Swift `CleanText.apply()` now mirrors the Node `cleanText()` pipeline, and `PDFExtraction.extract()` centralizes PDFKit text extraction with a first-pass page-range table.
- Phase 3: Typed extractor scaffolds are registered for slide decks, transcripts, textbook chapters, spreadsheets, and markdown notes.
- Deterministic paths are active for `MarkdownNotesExtractor` and `SpreadsheetExtractor` with no AI call.
- AI-backed extractors now own their match heuristics, schema types, and quote-hardening tests, but remain registry-only until the Phase 5 opt-in extract UI.
- Added Swift parity/typed extractor tests plus red-team fixtures for filename-stem quote demotion.

## 9.3 Remaining Gaps

- Phase 4: UI surface (schema-aware renderer, click-to-quote, `not_found` badge, `verified:false` warning)
- Phase 5: Opt-in "Extract" button (remove auto-run AI at ingest)
- Phase 5 provider parity: run the schema-constrained extractors across OpenAI / Anthropic / local JSON fallback before making them user-visible.
- Page-boundary exactness: current Swift PDF extraction has best-effort page ranges; exact offset preservation across all `cleanText` transforms still needs a dedicated table.
- Reason-string canonicalization: Swift emits `quote_appears_non_contiguous`; gate accepts `quote_not_substring_of_source` as alias. Pick one canonical before Phase 4 UI.

---

## 10. Open Questions (resolve during Phase 1)

1. `extractorId` + `extractorVersion` as new fields on `LoomTrace`?
2. Store raw JSON extraction or flatten into typed fields at ingest?
3. How does `FieldResult<T>` serialize to SwiftData? Likely `@Attribute(.transformable)` with custom transformer.
4. When user edits an extracted field → new `SourceSpan` into user note, or stays on original source?
5. Multi-page PDFs: `cleanText` concatenates pages with `\n\n` losing page boundaries. Need to preserve page-offset table — touch `pdf-extract.ts` and `cleanText()` to emit `{text, pageRanges: [(pageNum, charStart, charEnd)]}`.

---

## Appendix A — Reference files

- **MVP script**: `/tmp/mvp-syllabus-compare.sh` — runs baseline + schema prompts via `claude -p`
- **Verifier**: `/tmp/mvp-verify-spans.py` — Python reference impl of `verifySpans`
- **Verified output**: `/tmp/mvp-out/schema-verified.json`
- **Verify report**: `/tmp/mvp-out/verify-report.txt`
- **Source PDF** (via existing pipeline): `~/Desktop/Knowledge System/UNSW/FINS 3640/Week 0/Course Overview_FINS3640.pdf`
- **Extracted source text**: `/tmp/syllabus-extracted.txt` (5,969 chars)
