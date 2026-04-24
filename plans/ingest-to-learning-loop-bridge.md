# Ingest → Learning Loop Bridge — Plan

**Drafted 2026-04-25** as Phase 7 followup to `plans/ingest-extractor-refactor.md`. Phase 7.1 execution now starts from this plan: native schema reads, schema-correction sidecars, and the Course Context strip are implemented incrementally against the gates below. Verify every file:line citation below before future execution — the underlying code is active.

---

## 1 · Problem (why now)

Phases 0–6 of the ingest extractor refactor shipped ~6500 LOC across 7 typed lanes. The schema persists honestly: `SyllabusSchema.assessmentItems`, `TranscriptSchema.keyQuotes`, `TextbookSchema.keyTerms`, `SlideDeckSchema.sections`, `MarkdownNotesSchema.headings`, `SpreadsheetSchema.sheets`, each field wrapped in `FieldResult<T>` with a verified `SourceSpan`.

**Nothing downstream consumes any of this.**

Verified by grep across `app/`, `lib/`, `components/`, and `macos-app/Loom/Sources/`: no reader of `"ingestion-<extractorId>"` trace kind, no decoder of `schemaJSON`, no UI surface outside the Phase 4 `IngestExtractorResultView.swift` (which renders once, in the ingest workbench, and is never revisited). Specifically:

- `lib/panel/derive.ts:10` — `derivePanelFromTraces` only folds `thought-anchor` events from `reading`-kind traces (`components/PanelSync.tsx:14` `rootReadingTraces` filter: `trace.kind === 'reading'`). Ingestion traces have kind `ingestion-<extractorId>` — they are silently excluded from panel derivation.
- `macos-app/Loom/Sources/IngestionView.swift:400–403` — ingested items live in `"ingested:<filename>"` / `"ingested-url:<url>"` namespaces, disjoint from the reading surface's `wiki/<slug>` and `know/<cat>__<file>` namespaces used by `lib/doc-context.ts:17–57`. Even if Panel derivation were relaxed, the docId won't match any reading page.
- `macos-app/Loom/Sources/IngestionView.swift:763–771` — the persisted event's `schemaJSON` / `extractorId` / `content` keys are custom; no web-side or Swift-side reader deserializes them. The history surface at `IngestionView.swift:825–849` only reads `currentSummary` and `kind` (for the extractor badge).

Result: the refactor is infrastructure with no user-facing outcome beyond the one-shot Phase 4 schema render. A syllabus drop produces a pretty card the user looks at once, then nothing.

The philosophical gap is sharper: `project_loom_learning_loop.md` names **Ingesting** as State 0 — "take a pile of raw materials and turn them into a learnable workspace." That end-state is not produced by "schema JSON sits in LoomTrace unread." The workspace is not learnable until the user can *act* on what was extracted inside the same surfaces they use for everything else (Panel, Weave, Pursuit, reading page overlays).

---

## 2 · Current state map

### 2.1 Data model (Swift)

| Type | File | Purpose | Schema bridge? |
|---|---|---|---|
| `LoomTrace` | `macos-app/Loom/Sources/LoomDataModel.swift:19–69` | Append-only event log; schema packed into `eventsJSON` | Write-only |
| `LoomPanel` | `:74–107` | Derived "settled claim" for a doc. `status` ∈ draft/provisional/crystallized | No reader of extractorId |
| `LoomWeave` | `:112–144` | Directed relation between two panels (supports/contradicts/elaborates) | None |
| `LoomPursuit` | `:159–234` | Top-level question with attached sources + panels | `attachSource` / `attachPanel` exist (`LoomPursuitWriter.swift:117,135`) but no schema-driven caller |
| `LoomSoanCard` / `LoomSoanEdge` | `:252–341` | Free-placement thinking cards (Sōan board) | None |

### 2.2 Panel construction (today's path)

1. User ⌘E on a reading page → `lib/capture/from-selection.ts:64` `buildAnchorFromCurrentSelection()` → `appendEventForDoc` → `thought-anchor` event on a `reading` trace.
2. `components/PanelSync.tsx:17` listens to `TRACE_CHANGE_EVENT`, calls `derivePanelFromTraces` for each affected docId.
3. `lib/panel/derive.ts:10–130` folds `thought-anchor` events into `PanelSection[]`, builds `PanelContract`, emits `Panel` row with status `provisional` (pre-crystallize) or `settled` / `contested` (post).
4. `lib/panel/store.ts:57–174` persists into IndexedDB store `panels` (DB `loom`, version 3).

Every step is **user-driven**: the input is user captures, not extractor output. The Panel primitive is well-formed and rich; it just has no ingest-side feeder.

### 2.3 6-state surfaces (what's live)

Mapped against `project_loom_learning_loop.md` states (renamed from "phases" 2026-04-12):

| State | Surface | File:line | Status |
|---|---|---|---|
| Ingesting | `IngestionView.swift` + `Views/Ingest/*` | `macos-app/Loom/Sources/IngestionView.swift:30–1227` + `Views/Ingest/IngestExtractorResultView.swift` | **Live, isolated** |
| Questioning (chaotic) | `ChatFocus.tsx`, capture ⌘E | `components/ChatFocus.tsx` + `lib/capture/from-selection.ts` | Live |
| Questioning (systemic) | `ReviewThoughtMap.tsx` + AnchorDots | `components/ReviewThoughtMap.tsx` | Live |
| Reviewing (holistic) | same as above | — | Live (implicit) |
| Reconstruction | `RehearsalView.swift` / `RehearsalOverlay.tsx` | overlay ⌘E no-selection | Live |
| Verifying | `ExaminerView.swift` / `ExaminerOverlay.tsx` | `ExaminerOverlay.tsx` | Live |
| Recursing | `ReconstructionsView.swift` / `RecursingOverlay.tsx` | — | Live (UI exists) |

### 2.4 Cross-cutting surfaces that COULD consume schema

| Surface | File:line | Signal |
|---|---|---|
| Reading page (knowledge/*/*) | `app/knowledge/[category]/...` + `app/DocClient.tsx` (482 L) | Where user reads — best eye-level moment for "course context" chip |
| DocOutline | `components/DocOutline.tsx` | Already shows h2 TOC — natural home for `MarkdownNotesSchema.headings` parity |
| Pursuits room | `app/PursuitsClient.tsx:76–156` + `PursuitDetailClient.tsx` | Question-first entry per `project_epistemic_critique.md`; `LoomPursuitWriter.attachSource` / `attachPanel` already wired |
| Sōan board | `app/SoanClient.tsx` (955 L) + `LoomSoanCard` | Free-placement thinking; could seed "question cards" from schema |
| Patterns / Constellation | `app/PatternsClient.tsx`, `ConstellationClient.tsx` | Macro views of panels — rendering, not creation |

### 2.5 Schema persistence shape (today)

`IngestionView.swift:750–784`:

```
event = {
  kind: "thought-anchor",
  blockId: "loom-ingestion-root",
  content: <plainText>,
  summary: <displaySummary>,
  extractorId: <id>,
  schemaJSON: <encodeJSON(result)>,
  at: <ms>,
}
trace = LoomTrace(
  kind: "ingestion-<extractorId>",
  sourceDocId: "ingested:<filename>",   // or ingested-url:<url>
  ...
)
```

Notes:
- `kind: "thought-anchor"` is a lie-of-convenience — it's not a thought-anchor in the capture sense. `derivePanelFromTraces` never sees it because the trace's `kind` is not `"reading"`, so the name collision is inert but sloppy.
- `sourceDocId` is the ingest namespace. To reach a reading-page surface, a bridge must either (a) re-emit per-field events onto a `reading` trace for the matching doc, or (b) teach downstream consumers to look up schemas by filename / folder match.

### 2.6 Source-correction precedent

`lib/source-corrections.ts:1–80` is the pattern to mirror for schema corrections: sidecar JSON at `knowledge/.cache/corrections/<docId>.json`, literal-substring edits with bounded edit distance, layered at read time. This satisfies the "full adjustment right" clause of `feedback_learn_not_organize.md` without mutating the source file or the extracted schema.

---

## 3 · Design principles (from north stars)

Every proposed bridge point must pass all five gates. Violations are hard vetoes.

1. **Zero-burden default + full adjustment right** (`feedback_learn_not_organize.md`). Schema may auto-seed draft content; user always edits, never forced to organize.
2. **Curiosity-led, not quiz-led** (`feedback_curiosity_led_not_quiz_led.md`). Arrow is user→AI. Schema can present material; it cannot ambush the user with quizzes or AI-asks-user flows before the user has formed their own "why"s. Verifier / examiner surfaces require Panel ≥ provisional + ≥3 user anchors.
3. **Extract, don't author** (`feedback_extract_not_author.md`). Schema values arrived by extraction, not by user re-entry. Correction UI is inline single-field, not modal form — mirror `SourceCorrectModal.tsx` pattern.
4. **Source fidelity** (`feedback_source_fidelity.md`). Display ≡ Finder tree. Do not re-cluster syllabus `weekTopics` into a new organizational structure that overrides the user's folder layout. Schema augments the existing tree; it does not replace it.
5. **Never-do list** (`feedback_loom_never_do.md`):
   - #1 No AI-authored deep-analysis articles. Schema is extractive; synthesis comes from the user.
   - #7 No SRS farm from highlights. `keyTerms` / `keyQuotes` render as anchors, not as a review deck.
   - #9 No summarizing user's own markdown. `MarkdownNotesSchema` stays AI-free on display too — we surface the headings, not a paraphrase.
   - #8 Silent-failure ban. Unverified / notFound fields must stay visible as warnings, not silently dropped.

Additional principle from `project_loom_dual_friction_purpose.md`: the bridge must reduce either operation friction (finding where a fact lives) or concept friction (making an abstraction graspable). If a bridge point does neither, cut it.

---

## 4 · Proposed bridge points

Each schema type has 2–3 candidate bridges. Tradeoffs are explicit; §5 picks a recommendation.

### 4.1 `SyllabusSchema`

Fields: `courseCode`, `courseName`, `term`, `institution`, `teachers[]`, `officeHours`, `textbook`, `assessmentItems[]`, `learningObjectives[]`, `weekTopics[]`.

**Option A — Course Context strip on reading page.** When the user opens any document whose folder contains a syllabus-extracted schema (e.g. `UNSW/FINS 3640/Week 3/lecture-notes.pdf` sits alongside `UNSW/FINS 3640/Week 0/Course Overview.pdf`), show a thin, dismissible banner at the top of the reading page: "FINS 3640 · Term 3 2025 · Week 3 lecture · next: Assessment 2 due Nov 18." All fields clickable → scroll-to-quote in the syllabus source.
- Pro: Always-on ambient context. Zero user action. Passes dual-friction test (reduces "what course is this" operation friction).
- Con: Requires folder-sibling lookup (folder → syllabus trace). New routing.

**Option B — Auto-seed Panel drafts from `assessmentItems`.** Each assessment item (`Midterm · 35% · 18 Oct`) becomes a draft Panel with status `provisional`, title = assessment name, body = the extracted quote. User visits Panels and either elaborates or dismisses.
- Pro: Direct material for reconstruction. Due dates become visible.
- Con: Could feel pre-populated — borders on "organize for me" if every ingest spawns 4 draft panels. Test whether Panel noise outweighs value.

**Option C — Seed Pursuits.** Each `learningObjective` → one draft Pursuit with weight `tertiary`, season `active`. User promotes to `secondary`/`primary` as they find themselves returning.
- Pro: Aligns with epistemic critique's issue-first framing. Pursuits are already the "question the mind is holding" surface.
- Con: Learning objectives are often phrased as "students will be able to X" — needs transform to first-person question form, which crosses into AI-authoring territory. Can be avoided by preserving source phrasing verbatim.

### 4.2 `TranscriptSchema`

Fields: `title`, `speakers[]`, `segments[]` (timecode + topic + quote), `keyQuotes[]`.

**Option A — Anchored segments in the reading view.** Every `segments[].timecode` becomes a scroll-target anchor on the transcript reading page (like §-anchors for headings today). `keyQuotes` render as pre-placed AnchorDots in the margin with empty user content — the user's ⌘E on the same passage joins the same anchor container via `passage-locator` fingerprint (see `project_thought_model.md`).
- Pro: Integrates with existing anchor container model. Zero new surface.
- Con: Pre-placed dots violate "user→AI curiosity arrow" if they read as "here is what matters, please study." Mitigation: render as provisional (gray outline, not filled) until user interacts.

**Option B — Outline panel from segments.** `segments` populate DocOutline-style left-rail that scrolls with the transcript.
- Pro: Navigation aid.
- Con: Redundant with timecode anchors if those work.

### 4.3 `TextbookSchema`

Fields: `chapterTitle`, `chapterNumber`, `learningObjectives[]`, `keyTerms[]`, `sectionHeadings[]`, `summary`.

**Option A — Key terms as hover-glossary.** `keyTerms` become passive overlays: when the user hovers a key term in the reading view, show a small definition card (pulled from the term's surrounding source quote, not AI-generated).
- Pro: Passes dual-friction (reduces concept-friction lookup). No new surface.
- Con: Requires inline text matching; may be fragile for poorly-quoted terms.

**Option B — Section headings join DocOutline.** `sectionHeadings[]` augment the existing heading-derived outline when headings were poorly extracted (e.g. underlined instead of styled).
- Pro: Pure source-fidelity upgrade.
- Con: Narrow value; overlaps with `MarkdownNotesSchema.headings`.

**Vetoed — SRS from keyTerms.** Would violate never-do #7.

### 4.4 `MarkdownNotesSchema`

Fields: `title`, `headings[]`, `wordCount`, `hasCode`, `hasMath`, `preview`.

**Option A — DocOutline parity.** `headings[]` already provide what DocOutline renders from the live DOM. If the live DOM is missing one (edge case: fragile markdown), use schema as backup.
- Pro: Pure polish, no new surface.
- Con: Low impact if DOM-derived outline already works.

**Vetoed — any AI summary of these.** Never-do #9.

### 4.5 `SpreadsheetSchema`

Fields: `sheets[]`, `totalRows`, `preview[][]`.

**Option A — Tabular preview in ingest view only.** Keep today's behavior. Don't bridge to learning-loop — spreadsheets are reference data, not prose knowledge.
- Pro: Honest scope.
- Con: Schema work wasted if no downstream consumer.

**Option B — Spreadsheet-as-Pursuit-metrics.** If the sheet is a grade tracker, each row with a "weight" and "grade" column could produce a single summary Pursuit. Speculative.
- Pro: Direct value.
- Con: Requires heuristic column detection. Fragile. Probably defer.

### 4.6 `SlideDeckSchema`

Fields: `deckTitle`, `author`, `sections[]` (title + slideRange), `topics[]`.

**Option A — Section navigation in reading view.** `sections[].slideRange` → scroll anchors on the PDF-as-reading-page.
- Pro: Consistent with transcript segments.
- Con: PDF reading surface currently doesn't support per-slide anchor jumping for non-text-layer PDFs; feasibility check needed.

---

## 5 · Recommended architecture

**Pick the smallest set of bridges that ships a user-visible outcome this week, with a migration ladder for the rest.**

### 5.1 Phase 7.1 — One bridge, end-to-end

**Ship: SyllabusSchema → Course Context strip on reading pages.**

Rationale:
- Highest eye-level moment. Every time the user opens a lecture/seminar/exercise inside a course folder, they see "which course, which week, what's next." Dual-friction win on both axes.
- No new primitive. The strip is a rendered projection of existing schema; no new data model.
- Falsifiable: if the user dismisses it every time, we learn fast.
- Feeds the curiosity arrow, doesn't ambush. The strip is silent — no notifications, no quizzes, no prompts to act.
- Passes all 5 design principles.

### 5.2 Phase 7.2 — One conversion, deterministic

**Ship: SyllabusSchema.assessmentItems → draft Pursuits (not Panels).**

Rationale:
- Pursuits are the `project_epistemic_critique.md` issue-first surface. An assessment item is literally a "question the mind is holding": "how do I do Assessment 2?"
- `LoomPursuitWriter.createPursuit` + `attachSource` already exist. Zero new writers.
- Weight default: `tertiary` ("at the horizon"). User promotes when they start studying for it.
- NOT Panels. Panels are a *claim* about source material; an assessment is a *task*. Mis-typing here corrupts the panel model.
- Deterministic conversion from schema verbatim — no AI call.

### 5.3 Phase 7.3 — Passive anchors

**Ship: TranscriptSchema.keyQuotes + TextbookSchema.keyTerms → pre-placed provisional AnchorDots on the corresponding reading page.**

Rationale:
- Leverages the existing container model (`project_thought_model.md`). When user ⌘E's the same passage, their capture joins the schema-seeded container as v2, not a parallel lane.
- Provisional rendering (gray outline) respects curiosity-led: the dot says "the extractor noticed this," not "you must study this."
- Requires resolving the ingest-namespace gap (§2.5): the schema lives on `ingested:<filename>` but the reading page is `know/<cat>__<file>`. Option: on ingest, the extractor looks up the filename against the knowledge tree; if a matching doc exists, write a second "mirror" event set onto the matching `reading`-kind trace's docId. Implementation detail for Phase 7.3 — deliberately deferred past 7.1/7.2.

### 5.4 Phase 7.4+ — Deferred

Everything else in §4 stays deferred until 7.1–7.3 prove value. Explicit deferrals:
- `weekTopics` as a reading-plan surface — needs new UI that doesn't exist.
- `learningObjectives` as Pursuit seeds — philosophically overlaps with `assessmentItems` but phrasing is third-person; skip until we see user edits.
- `MarkdownNotesSchema` → anything — low-value; keep as ingest-only.
- `SpreadsheetSchema` → anything — defer.
- `SlideDeckSchema` sections as PDF anchors — depends on PDF anchor support.

### 5.5 Crosscutting: corrections

Every bridge point must honor the "full adjustment right" clause. User-visible mechanism:

- **Inline correction** at the display site. Click the course code chip → text field → blur → persist. Mirrors `components/SourceCorrectModal.tsx` / `lib/source-corrections.ts` as precedent.
- **Storage**: sidecar JSON at `knowledge/.cache/schema-corrections/<extractorId>/<sourceDocId>.json` (analogous to the source corrections path). Layered over the extracted schema at read time. Survives re-ingest.
- **Never mutate `LoomTrace.eventsJSON`.** The schema JSON in the trace is the extractor's output, immutable. User edits are a separate layer.
- **Unverified fields stay visible.** An unverified-at-extraction field that the user corrects becomes verified-by-user (new provenance tag `userCorrected: true`).

### 5.6 Wiring sketch (verify before coding)

```
Ingest →  LoomTrace(kind=ingestion-<id>, sourceDocId=ingested:<filename>, eventsJSON.schemaJSON)
                │
                │ [Phase 7.1] new bridge:
                ▼
         resolveCourseSibling(folderPath) → docIds sharing folder
                │
                ▼
         CourseContextStrip (reads schema via native bridge loom://native/schema/<traceId>.json)
                                       ▲
                                       │ new read path — mirror pattern of loom://native/panel/<id>.json
                                       │
                                  loadSchemaCorrections (sidecar) ← user inline edits
                │
                │ [Phase 7.2] new bridge:
                ▼
         foreach assessmentItem (verified spans only):
              LoomPursuitWriter.createPursuit(question: item.name.value, weight: "tertiary")
              LoomPursuitWriter.attachSource(pursuitId, sourceDocId: ingested:<filename>)
         (idempotent — keyed on (traceId, field path) so re-running ingest doesn't dupe)
                │
                │ [Phase 7.3] new bridge:
                ▼
         foreach keyQuote/keyTerm with verified span + filename-match in know/ tree:
              emit thought-anchor event on that doc's reading trace
              with attribution: "extractor" (new value, see §8)
              summary: "", content: "", quote: <span.quote>
              → existing derivePanelFromTraces picks it up as a provisional anchor
```

---

## 6 · Migration / phase breakdown

Each phase ships independently; each has a user-visible outcome.

### Phase 7.1 · Course Context strip (3–4 days)

- **Day 1** · Native-bridge read path for schemas. New endpoint `loom://native/schema/<traceId>.json` in `LoomURLSchemeHandler.swift`. Web-side helper `lib/loom-schema-records.ts` mirroring `lib/loom-panel-records.ts`. Folder-sibling resolver: given `know/unsw-fins-3640__lecture-notes-w3`, find the syllabus trace whose `sourceDocId` derives from a filename in the same course folder.
- **Day 2** · `components/CourseContextStrip.tsx` — renders on knowledge/* reading pages only (check `contextFromPathname`). Pulls schema, shows course code, term, current week, next assessment due. Dismissable per-session (sessionStorage flag).
- **Day 3** · Inline correction. Click a chip → contenteditable → blur → POST to `/api/schema-corrections` (new route, mirror of `/api/source-corrections`). Sidecar at `knowledge/.cache/schema-corrections/syllabus-pdf/<sourceDocId>.json`.
- **Day 4** · Polish, keyboard escape, verified/unverified badge styling, dark-mode tokens per `feedback_loom_dark_mode_tokens.md`.
- **Gate to 7.2**: user can drop a syllabus PDF, open any lecture in the same course folder, see the strip, click a chip, edit the term, reload, edit persists. Strip honors unverified-field dim styling.

### Phase 7.2 · Assessment → Pursuit auto-seed (2–3 days)

- **Day 1** · `SchemaToPursuitBridge.swift` — on successful typed extraction with `extractorId == "syllabus-pdf"`, walk `assessmentItems` and call `LoomPursuitWriter.createPursuit` + `attachSource` for each verified-span item. Idempotency key = `"\(traceId):assessment:\(itemIndex)"` stored in a small SwiftData table or as a property on the `LoomPursuit` (new field `sourceFieldPath: String?`).
- **Day 2** · Pursuit listing surface surfaces these with a discreet "drawn from syllabus" provenance line (one-liner on `PursuitRow`).
- **Day 3** · Defer-to-edit: the Pursuit's `question` text is editable inline (already shipped path via `postReviseTraceSummary` precedent in `PanelDetailClient.tsx:40–53`). User can reword the assessment title into a real question.
- **Gate to 7.3**: drop syllabus with 4 assessments → 4 draft Pursuits land in `/pursuits` at tertiary weight with source attachment. User edits title; persists. Re-dropping same syllabus does not duplicate.

### Phase 7.3 · Passive anchors (3–5 days)

- **Day 1–2** · Folder-to-knowledge-doc resolver: given a schema's sourceDocId `ingested:<filename>`, find the matching `know/*` docId by filename. When not found, skip silently (never surface "couldn't match" — source-fidelity: user moved the file, that's fine).
- **Day 3** · For each verified `keyQuote` / `keyTerm` whose filename resolves: find-or-create a `reading`-kind trace for the resolved docId, append a `thought-anchor` event with `attribution: "extractor"`, empty summary/content, quote from schema.
- **Day 4** · Introduce `attribution: "extractor"` as a new case in `lib/trace/types.ts` `TraceEvent.thought-anchor`. Update `VersionedAnchorCard.tsx` to render extractor-sourced anchors in a provisional style (gray outline, no version badge until user joins). Update thought-anchor-model.ts container merge to accept extractor → user as v1 → v2.
- **Day 5** · Test end-to-end: drop a transcript whose filename matches a knowledge doc. Open the reading page. See gray dots at the key quote positions. Select one and ⌘E — the capture joins the same container as v2.
- **Gate**: capture-onto-provisional behaves identically to capture-onto-empty today, with the extractor quote preserved as v1.

---

## 7 · Success criteria

Each phase has ship-or-no-ship gates, not vibes.

**Phase 7.1 must deliver:**
1. Drop a syllabus PDF. Open a sibling lecture in the same folder. See a course context strip with course code, term, and next assessment due date.
2. Click the course code chip. Type a correction. Blur. Reload the page. Correction persists.
3. Unverified fields (e.g. a `term` that was notFound) render muted with a "not found" affordance — clickable to add the user's answer.
4. Strip is dismissable for the session; does not return until next app open.
5. No regression in `plans/ingest-extractor-refactor.md` gate (phase1-gate.py still PASS).

**Phase 7.2 must deliver:**
1. Drop a syllabus with N assessment items. After extraction, `/pursuits` shows N new draft pursuits at tertiary weight, each attached to the syllabus source.
2. Re-dropping the same file does not duplicate pursuits.
3. Editing a pursuit question inline persists through the native bridge.
4. Each pursuit's detail surface shows its source attachment (syllabus filename) in the Sources section.

**Phase 7.3 must deliver:**
1. Drop a transcript whose filename matches a `know/*` doc. Open the reading page. See provisional AnchorDots at the key quote positions.
2. ⌘E on a quoted passage joins the schema-seeded container as v2. The AnchorCard now shows v2 with versioned history.
3. Dropping an ingested file that does NOT match any reading doc produces no spurious anchors anywhere.

**Crosscutting:**
- No new AI calls in any bridge (extraction is the AI moment; bridges are deterministic).
- All new event payloads round-trip through Codable without loss.
- Dark mode tokens respected throughout.

---

## 8 · Open questions (flagged for human decision)

1. **Who owns the folder→doc resolver?** Swift side has clean filesystem access; web side has knowledge-store index. The matcher needs filename normalization (extension stripping, case, UNSW doc naming quirks). Recommend Swift-side; add a bridge handler `loom://native/resolve-doc?filename=...`. **Needs decision.**

2. **`attribution: "extractor"` vs `"ai"` on the thought-anchor event.** Today `attribution` is `"user" | "ai" | "mixed"` (`lib/trace/types.ts:149`). Extracted quotes aren't user-authored and aren't conversational AI output. Adding a fourth value has downstream implications (thought-map rendering, SRS eligibility, learning-status summary). **Needs decision: add new attribution, or reuse `"ai"` with an extra `source: "extractor" | "chat"` tag?**

3. **Does 7.2 spawn pursuits at ingest time, or at first user visit to `/pursuits`?** Ingest-time is simpler (run at end of `persistExtractedTrace`) but creates pursuits the user hasn't seen yet. Visit-time is lazier (only materialize when viewed) but harder to un-materialize cleanly. **Recommend ingest-time with per-pursuit "hide" affordance**; flag for human sign-off.

4. **What happens to a pursuit when its backing syllabus trace is deleted?** `LoomTraceWriter.delete` exists (`LoomTraceWriter.swift:202`) but has no cascade into pursuits. Without cascade, pursuits become dangling with missing source. Options: (a) cascade-delete auto-seeded pursuits with matching `sourceFieldPath`, (b) leave as orphaned — user can retire manually. **Needs decision.**

5. **When the user corrects a schema value, does that correction propagate to downstream-derived pursuits?** If `assessmentItems[0].name.value` changes from "Midterm" to "Midterm (paper)" via inline correction, does the auto-seeded pursuit rename? Yes is obvious but non-trivial if the user has since edited the pursuit title. Option: correction propagates only while pursuit question still matches the original schema value (no user edit yet). **Needs decision.**

Top 3 that block execution:
- Q1 (folder→doc resolver location) blocks all 7.1+ work.
- Q2 (`attribution` shape) blocks 7.3.
- Q3 (pursuit spawn timing) blocks 7.2.

---

## 9 · Non-goals (explicit vetoes)

The following are NOT part of this plan. Reason cited for each.

1. **No auto-summary of extracted content.** `never-do #1`. Schema is extractive; synthesis is the user's work.
2. **No SRS / quiz loop from `keyTerms` or `keyQuotes`.** `never-do #7`. `feedback_curiosity_led_not_quiz_led.md` — user→AI arrow only.
3. **No re-summary of `MarkdownNotesSchema` content.** `never-do #9`. User wrote it; AI doesn't reword.
4. **No new template editor for schema shape.** `never-do #4`. Field layout is code, not user-authored.
5. **No "Inbox" / "To review" surface.** `never-do #3`. Capture-now-organize-later is the Obsidian trap. Schema material goes straight to its permanent surface or to a draft Pursuit — no inbox.
6. **No new organizational structure that overrides Finder.** `feedback_source_fidelity.md`. `weekTopics` renders contextually (strip) but does not create a new `/weeks` or `/courses` routing that competes with the existing `know/*` tree.
7. **No AI-authored Pursuit question phrasing.** Extracted values become Pursuit `question` verbatim. If they read awkwardly ("Students will demonstrate..."), the user rewrites inline; we do not transform.
8. **No charts / visualizations generated from spreadsheet rows.** `never-do #10`. If the spreadsheet has a chart, show it as-is; don't synthesize new ones.
9. **No retroactive batch-seed of pursuits/anchors for already-ingested schemas.** On ship, new ingests get bridged; old ingests don't. User can re-drop a file to opt in. Keeps the ship small.
10. **No web-side IndexedDB write of schema JSON.** The schema is Swift-owned via native-JSON endpoints. Web reads, does not mirror.

---

## Appendix A · Referenced code

All citations verified against current repo state on 2026-04-25; re-verify before execution.

- Schema types: `macos-app/Loom/Sources/Ingest/SyllabusSchema.swift:23–53`, `TranscriptSchema.swift:10–26`, `TextbookSchema.swift:8–18`, `SlideDeckSchema.swift:8–22`, `MarkdownNotesSchema.swift:23–52`, `SpreadsheetSchema.swift:17–35`
- Persistence: `macos-app/Loom/Sources/IngestionView.swift:750–784`
- Trace writer: `macos-app/Loom/Sources/LoomTraceWriter.swift:25–75`
- Panel derivation: `lib/panel/derive.ts:10–130`, `components/PanelSync.tsx:14–96`
- Capture path: `lib/capture/from-selection.ts:64–155`
- Source-correction precedent: `lib/source-corrections.ts:1–80`, `components/SourceCorrectModal.tsx`
- Pursuit writer: `macos-app/Loom/Sources/LoomPursuitWriter.swift:26–149`
- Pursuits surface: `app/PursuitsClient.tsx:76–156`, `app/PursuitDetailClient.tsx:102–289`
- Doc namespace: `lib/doc-context.ts:17–57`
- Anchor container model: `components/thought-anchor-model.ts`, `project_thought_model.md`
- Learning-loop states: `project_loom_learning_loop.md`
- Overlay architecture: `project_overlay_architecture.md`
- Epistemic critique: `project_epistemic_critique.md`

## Appendix B · Unknown / flagged

- **PDF anchor feasibility.** 7.3 depends on whether `components/PDF.tsx` can receive external anchors for non-text-layer PDFs. If not, `SlideDeckSchema.sections` → PDF anchors stays deferred indefinitely. Check before expanding 7.3 scope.
- **Native bridge performance.** `loom://native/schema/<traceId>.json` will be hit on every knowledge-page load where a sibling syllabus exists. If the schemas are large (syllabus + full page ranges), may need caching. Acceptable at dev stage; revisit if warm-open latency regresses.
- **Legacy ingests.** The decision to NOT retroactively process old ingests (non-goal #9) means early users see no bridges until they re-drop. Verify this is acceptable or propose a migration utility under Settings > Data.
