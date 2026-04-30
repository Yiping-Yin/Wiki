# Compile Pipeline MVP — Tier 2 Implementation Plan

> **Status**: filed 2026-05-01 — implementation plan, not yet started.
> **Tier**: 2 (per `LOOM.md §11` roadmap). Prerequisite: Tier 1 complete (CaptureAST + reading-flow + DS v1 foundation).
> **Estimated effort**: 4-6 hours for working prototype; 1-2 weeks for shippable MVP with full error handling, tests, and UX polish.
> **Source spec**: `LOOM.md §4` (mode handshake), `LOOM.md §7` (Compile pipeline + error cases), `LOOM.md §7.5` (privacy & data flow), `LOOM.md §13.5` (first-compile pulse).
> **Owner**: TBD when started. Likely Claude on TS/Swift bridge + system prompt; Codex on Swift integration if its CaptureAST work continues.

---

## 1. Why this plan exists

Per `LOOM.md §6`, Compile is the missing 8th of Loom's eight supporting pieces. Seven pieces are built or in flight. With Compile, the learning loop closes. Without it, Loom is "a great reading tool"; with it, Loom is "a learning loop" — the wow moment that takes Loom from useful tool to category-defining product.

This plan operationalizes the Compile pipeline as it's described in `LOOM.md §7`, fills in the implementation specifics that were elided in the canon doc, and establishes a definition-of-done sharp enough to ship against.

---

## 2. Goal

Ship a Compile button on every Loom Page that, when clicked:

1. Reads the user's scratch text in the Page body
2. Builds a context envelope (per `LOOM.md §4` mode handshake): scratch + source + Tier 1 prior notes + Ask AI conversation history archived on this Page
3. Streams a typeset learning artifact from the user's configured AI provider
4. Parses embedded directives (LaTeX math, `[term:...]` hover-reveals, `---` frame separators)
5. Renders the artifact in paper canon substrate
6. Writes the rendered artifact back to `Loom.md` as a `### Compiled · YYYY-MM-DD HH:MM` section

Subtask A (Recognize structure, ~95% reliable today) and Subtask B (Generate structure, ~90% reliable today) are in MVP scope. Subtask C (Embellish — visualizations, code-execution, interactive widgets) is deferred to a later milestone.

---

## 3. Prerequisites

Before this plan starts:

- ✅ `LoomMinimalRootView`, `LoomFolderHomeView`, `SourceFileView` all built and shipped (commit `7351784`)
- ✅ `LoomAI.send` + `LoomAI.sendStream` exist with multi-provider support
- ✅ `LoomFileStore.loomMDURL(for:)` returns the canonical Markdown location
- ✅ Paper canon SEALED v1.0 + DS v1 lib + tint family
- 🔄 CaptureAST schema stable enough that source structured-data is queryable (Codex's pivot)
- ✅ Heal-on-load + heal-on-save in `SourceFileView.healLoomMD` (so the new `### Compiled` section survives round-trips)

If CaptureAST schema is still in flux when this plan starts, the pipeline can begin with source-content-as-markdown (current state); CaptureAST integration becomes a Phase 2 enhancement.

---

## 4. Architecture

### 4.1 Pipeline data flow

```
                  Click Compile button
                         │
                         ▼
   ┌─────────────────────────────────────────────────┐
   │ gatherPageContext(rootID:):                     │
   │   - read Loom.md (per-source section)           │
   │   - extract scratch (prose region above first   │
   │     ### subsection inside the per-source ##)    │
   │   - extract Ask AI conversation history (any    │
   │     ### `Ask` entries already archived)         │
   │   - read source file (PDF / markdown / web)     │
   │   - return CompileContext struct                │
   └─────────────────────────────────────────────────┘
                         │
                         ▼
   ┌─────────────────────────────────────────────────┐
   │ buildCompilePrompt(context: CompileContext):    │
   │   - apply system prompt (typesetter role)       │
   │   - include scratch (latest user thinking)      │
   │   - include source (truncated to ~6k tokens)    │
   │   - include prior notes (truncated to ~2k)      │
   │   - include Ask history (truncated to ~2k)      │
   │   - return PromptEnvelope                       │
   └─────────────────────────────────────────────────┘
                         │
                         ▼
   ┌─────────────────────────────────────────────────┐
   │ LoomAI.sendStream(prompt:onChunk:):             │
   │   - routes to user-configured provider          │
   │   - streams tokens                              │
   │   - emits chunks to onChunk callback            │
   └─────────────────────────────────────────────────┘
                         │
                         ▼
   ┌─────────────────────────────────────────────────┐
   │ CompileStreamParser.append(chunk:):             │
   │   - accumulates raw text                        │
   │   - detects frame separators (`---`)            │
   │   - detects [term: explanation] markers         │
   │   - detects $...$ and $$...$$ math              │
   │   - emits structured render events              │
   └─────────────────────────────────────────────────┘
                         │
                         ▼
   ┌─────────────────────────────────────────────────┐
   │ CompileRenderer (SwiftUI / WebView):            │
   │   - frames laid out per detected shape          │
   │   - LaTeX rendered via KaTeX (in webview) or    │
   │     iosMath (native) — choose at impl time      │
   │   - hover-reveals on [term:...] markers         │
   │   - paper canon typography throughout           │
   └─────────────────────────────────────────────────┘
                         │
                         ▼
   ┌─────────────────────────────────────────────────┐
   │ writeCompiledSection(rootID, source, artifact): │
   │   - opens Loom.md                               │
   │   - finds per-source `## <filename>` section    │
   │   - inserts/replaces `### Compiled · YYYY-MM-DD │
   │     HH:MM` subsection BELOW the scratch         │
   │   - heals adjacent sections                     │
   │   - writes back atomically                      │
   └─────────────────────────────────────────────────┘
```

### 4.2 New types

```swift
struct CompileContext {
    let rootID: UUID
    let sourceURL: URL?       // PDF / .md / web capture file
    let sourceMarkdown: String  // converted source content
    let scratch: String         // user's raw thinking
    let priorNotes: [String]    // Tier 1
    let askHistory: [String]    // archived Ask conversations
    let captureAST: CaptureAST?  // when available; nil otherwise
}

enum CompileEvent {
    case textChunk(String)
    case frameSeparator
    case termReveal(term: String, explanation: String)
    case mathBlock(latex: String, inline: Bool)
    case complete
    case error(CompileError)
}

enum CompileError: Error {
    case emptyScratch
    case sourceUnavailable
    case rateLimit(provider: String)
    case providerFailure(message: String)
    case malformedOutput(reason: String)
    case truncatedAtLimit(charsEmitted: Int)
}
```

### 4.3 System prompt (full version)

```
You are a typesetter for a learning artifact. The user has been studying a
source and writing their thinking on it. Your job is to produce a
well-typeset structured artifact from the user's raw notes — NOT to think
for them.

CONTEXT YOU RECEIVE:
- The source the user is studying (PDF excerpt, web page, etc.)
- The user's scratch (their raw thinking — UNSTRUCTURED, prose flow)
- Their prior notes on this source (Tier 1)
- Any AI conversations they archived on this source

YOUR JOB:
- Take the scratch and PRODUCE a typeset learning artifact.
- Recognize the content shape: math derivation? definition cluster?
  step-by-step process? conceptual explanation? Q&A reflection?
- Structure the output for the recognized shape.
- DO NOT add information the user did not write. Only structure what's there.
- DO NOT think on the user's behalf. The user did the cognitive work.
  You are a scribe.

RULES:
- Use $...$ for inline math, $$...$$ for blocks. LaTeX rigorous.
- For step-by-step content: separate frames with `---` on their own line.
- For definitions of unfamiliar terms: mark `[term: explanation]` for hover-reveal.
- Reference the user's prior notes when relevant: "as you noted earlier..."
- Reference archived Ask AI conversations when relevant: "in your earlier
  conversation with the assistant on this passage..."
- Read like a textbook page or a page of careful study notes — NOT like a
  chat reply.
- If the user wrote `(show plot)` or `(visualize this)` or similar hint,
  emit a directive `[plot: <description>]` for future visualization
  rendering. Don't try to draw it yourself.
- If the user wrote multiple contradictory statements, surface BOTH:
  `[user noted X=Y earlier and X=Z later]`. Never silently choose.

LANGUAGE:
- Respond in the SAME language the user wrote in.
- If the source is English but the user wrote in Chinese, output Chinese
  (with English source quotes preserved as block quotes).
- Math, LaTeX, code symbols are language-neutral.

LENGTH:
- Match the depth of the scratch. Do NOT pad. Do NOT explain things the
  user already explained in their scratch.

Begin.
```

### 4.4 Storage shape (in `Loom.md`)

Per `LOOM_RULES.md §5` heal-on-load + per-book sections, and `LOOM.md §7` storage shape:

```markdown
## ECON 3202 / Lecture 3 PDF

### Raw thoughts · 2026-05-01 14:30
ok so loss is x²+y² + sin(x)cos(y).
gradient is partial derivs.
step in -direction.
lr too small slow, too big oscillate.

### Compiled · 2026-05-01 14:35

**The loss surface**

$$ f(x, y) = \frac{x^2 + y^2}{4} + \sin(x)\cos(y) $$

[term: gradient | The vector of partial derivatives ∂f/∂x, ∂f/∂y]

---

**Step 1**: Compute the gradient at the current position.

**Step 2**: Take a step in the negative direction, scaled by learning rate.

**Step 3**: Repeat until convergence.
```

The `### Raw thoughts · …` and `### Compiled · …` headings are stable conventions. Heal-on-load preserves both. Re-compile replaces the latest `### Compiled · …` subsection (latest-only in MVP; version history is post-MVP).

---

## 5. UX

### 5.1 Button placement

The Compile button lives at the bottom of the Page body, anchored to the right edge, paper-canon-styled (small serif italic label + tasteful icon). It is visible only when:
- The Page has scratch content (≥ 30 characters)
- The user has not just compiled (debounce ~3 seconds after a successful compile)

### 5.2 Streaming UX

When clicked:
- Button transforms into a streaming progress indicator (subtle, no spinner — a single hairline that pulses)
- The artifact area below scratch becomes a live render target
- As tokens stream in, frames materialize with a soft fade
- LaTeX math typesets as soon as a `$...$` or `$$...$$` block closes
- `[term:...]` reveals don't appear in the streamed text (the marker is consumed)

### 5.3 First-compile onboarding (per `LOOM.md §13.5`)

When the user has written ≥50 words on a Page body but never compiled:
- A single quiet pulsing dot appears next to the Compile button (the only attention-grab in Loom — once)
- Click → first compile happens → user sees the wow
- Pulse never returns; subsequent compiles are silent

### 5.4 Re-edit / re-compile flow

After compile:
- User can edit either the scratch (`### Raw thoughts`) or the compiled artifact (`### Compiled`)
- Editing scratch and clicking Compile again replaces the existing Compiled section
- Editing the Compiled artifact directly preserves user changes; subsequent Compile WARNS via toast: "Edits to the compiled section will be replaced. Compile anyway?"
- Both edits flow through the same heal-on-load path, so consistency is automatic

### 5.5 Error UX (per V7 — no silent failures)

| Error | UX |
|-------|-----|
| Empty scratch | Button disabled with tooltip: "Write a few thoughts, then compile." |
| Stream interrupted | Save partial output as `### Compiled · YYYY-MM-DD HH:MM (partial)`. Toast: "Compile interrupted; partial output saved. Click Compile to retry." |
| Hallucination detected via `(unsupported)` markers | Inline `(unsupported)` annotation in the rendered artifact. No popup. |
| Contradictory thinking | Inline annotation as specified in system prompt (`[user noted both...]`). No popup. |
| Rate limit / API quota | Banner near the button: "AI provider rate-limited. Try a different provider in Settings, or wait." Scratch unchanged. |
| Malformed structured output | Fall back to plain-markdown render. Subtle eyebrow: "Output rendered without typesetting." User can re-compile. |
| Source unavailable | Compile uses scratch + prior notes only. Eyebrow: "Source file unavailable; compiled from notes only." |
| Output exceeds limit | Truncate at ~10k chars. Eyebrow: "Output truncated; consider splitting your scratch into focused sections." |

---

## 6. Privacy (per `LOOM.md §7.5`)

### What the AI provider sees during Compile

- Active Page's source content (or relevant excerpt — truncated to ~6k tokens)
- Tier 1 prior notes from this source (~2k tokens)
- Archived Ask AI history on this Page (~2k tokens)
- Scratch content (full)
- The system prompt above

### What the AI provider does NOT see

- Other sources or their notes
- Cross-source embeddings (LoomEmbeddingStore is sandbox-only)
- The user's identity beyond their provider config
- Data from other Loom Pages or other applications

### Default provider

Apple Foundation Models (on-device, free, no data leaves the machine) is the default per `LOOM_RULES.md §8 2026-04-26`. Compile pipeline uses whatever provider `LoomAI.send` is configured to route to — no special-case logic for Compile.

### Telemetry

None. Compile failures are NOT reported to any service. Errors are user-visible only.

---

## 7. Multi-language behavior (per `LOOM.md §4`)

The system prompt instructs the AI to mirror the user's language. Test plan:
- Scratch in English → output English ✓ (default)
- Scratch in Chinese → output Chinese (with original-language source quotes preserved as block quotes) ✓
- Scratch mixed → output mirrors the LAST-USED language in scratch
- Math, code, LaTeX symbols are language-neutral and rendered identically

This must be a **contract test**: feed the pipeline a known-Chinese scratch + known-English source, assert output is in Chinese.

---

## 8. Scope

### In MVP (Tier 2 ship)

- Compile button + streaming UX + storage writeback
- Subtask A (recognize structure) + Subtask B (generate structure)
- LaTeX math rendering via KaTeX in webview, or iosMath if native
- `[term:...]` hover-reveals
- `---` frame separators with smooth transitions
- All 8 error/edge cases from `LOOM.md §7`
- Multi-language support (per system prompt + contract test)
- First-compile onboarding pulse
- Tier 1 source-aware context envelope

### Deferred (post-MVP)

- Subtask C (Embellish): visualizations, code execution, interactive widgets
- Idle-detect compile (always manual button in MVP)
- Compile version history (latest-only in MVP)
- Compile-from-source-only mode (button disabled when scratch empty in MVP)
- Multi-Page batch compile
- Compile diff view (compare current compile to previous)

---

## 9. Testing

### 9.1 Contract tests (TS, run via `npx tsx --test`)

- Test that system prompt produces structured output for math derivation scratch
- Test that system prompt produces structured output for step-by-step scratch
- Test that system prompt produces structured output for definition-cluster scratch
- Test that AI mirrors user's language (Chinese-in → Chinese-out, even when source is English)
- Test that compile output writes to correct per-source section in Loom.md
- Test that re-compile replaces existing Compiled section (latest-only)
- Test that empty scratch disables Compile button
- Test that contradictory user statements emit `[user noted both...]` annotation

### 9.2 Integration tests (Swift / xcodebuild)

- Test that Compile button appears only when scratch has ≥30 chars
- Test streaming UX (chunk-by-chunk render)
- Test heal-on-load preserves Compiled section across save+reload
- Test that Compile uses configured AI provider (route through `LoomAI.send`)
- Test that source-unavailable case shows correct eyebrow

### 9.3 Manual test cases

For first ship:
1. Math derivation: 2D loss surface + gradient descent → flipbook output with LaTeX
2. Definition cluster: 3-5 ML terms → glossary cards with hover-reveals
3. Step-by-step process: 5-step algorithm explanation → numbered frames
4. Conceptual reflection: 200 words on "why backprop matters" → article-style output
5. Mixed: combination of all above in one scratch → AI dispatches per shape

Each case has a documented expected output shape. Manual review before ship.

---

## 10. Definition of done

The MVP ships when ALL FIVE of these are demonstrably true:

1. **Functional**: Click Compile on a Page with substantive scratch → typeset artifact appears below scratch within 15 seconds, no errors.
2. **Quality**: Manual test cases 1-5 from §9.3 produce output that the product owner subjectively rates as "this is what I would have written if I had Word/LaTeX skills".
3. **Robustness**: All 8 error cases from `LOOM.md §7` handle gracefully (no silent failures, no UI crashes, no `Loom.md` corruption).
4. **Privacy**: AI provider sees ONLY the data specified in §6. Verified by log inspection (provider request body) on a test compile.
5. **Multi-language**: Contract test from §9.1 passes (Chinese scratch + English source → Chinese output).

If any of the five is not yet true, MVP is not shipped. Iterate or descope.

---

## 11. Effort estimate (rough)

| Phase | Work | Time |
|-------|------|------|
| 1 | Working prototype: system prompt + simple parser + plain markdown render + button wiring | 4-6 hours |
| 2 | LaTeX rendering (KaTeX or iosMath) + frame separator handling | 3-4 hours |
| 3 | `[term:...]` hover-reveal renderer | 2-3 hours |
| 4 | Heal-on-load integration + storage shape | 2-3 hours |
| 5 | All 8 error/edge cases | 4-6 hours |
| 6 | First-compile onboarding pulse | 1-2 hours |
| 7 | Multi-language contract test + tweaks | 1-2 hours |
| 8 | Manual test cases run + product owner review | 2-4 hours |
| 9 | Subtask A/B reliability tuning (system prompt iteration) | 4-6 hours |
| Total | | **~25-40 hours over 1-2 weeks** |

Phase 1 alone is the "wow demo" milestone (~half a day). Full MVP per Definition of Done is 1-2 weeks of focused work.

---

## 12. Risks

1. **AI quality variance**: Compile output quality is bounded by model capability. GPT-4o / Claude 3.5+ are sufficient for Subtasks A+B per `LOOM.md §7`. If the user's chosen provider underperforms (e.g. an older / smaller model in their config), output quality drops. Mitigation: surface provider quality hints in Settings; default to Apple Foundation Models on supported hardware.

2. **Latency**: 5-15 second compile may feel slow if user expects ChatGPT-style instant. Mitigation: streaming UX shows progress immediately; the wow is in seeing the artifact form, not in instant completion.

3. **CaptureAST integration**: if Codex's CaptureAST schema is not yet stable when this plan starts, MVP falls back to source-content-as-markdown (current state). Schema integration becomes Phase 2 enhancement (improves Compile quality but doesn't block MVP).

4. **Heal-on-load conflicts**: the new `### Compiled` section heading must round-trip correctly through `SourceFileView.healLoomMD`. Test thoroughly. If heal mishandles the new heading shape, Compile output gets corrupted.

5. **Interaction with archived Ask AI**: if Compile pipeline reads Ask history but the Ask history format changes (e.g. Codex updates how AI threads are stored), Compile may misinterpret. Mitigation: heal-on-load handles format migration; Compile uses heal output, not raw text.

6. **Markdown writeback atomicity**: if Compile fails mid-write, `Loom.md` could be corrupted. Mitigation: write to a temp file, fsync, atomic rename. Existing `LoomFileStore.write` should handle this; verify before ship.

---

## 13. Open questions (specific to this plan)

These are NOT decisions; they are unresolved questions to surface to the product owner:

1. **Compile button visual treatment**: standalone button vs integrated into existing toolbar? Paper canon constraint (no chrome) suggests standalone in page footer. Confirm.

2. **First-compile pulse**: should the pulse appear on the Compile button itself or near it? Should it use the bronze accent or a separate "new feature" hue?

3. **What if scratch has multiple distinct topics?**: should Compile produce one artifact or multiple? Default: one (the AI handles segmentation in output via frame separators). User can split scratch into separate Pages if they want separate artifacts.

4. **Edit-then-recompile**: when user edits the rendered Compiled section AND has unchanged scratch, what does the next Compile do? Default: warn that edits will be lost (per §5.4 UX). Alternative: preserve user edits via a 3-way merge against new compile output. The 3-way merge is more sophisticated but complicates UX. Default to "warn" in MVP; revisit if users complain.

5. **CaptureAST integration depth**: should Compile read CaptureAST as additional context (richer source structure) or just use source-content-as-markdown? In MVP, the simpler path; Phase 2 adds CaptureAST when its schema is stable.

6. **LaTeX rendering choice**: KaTeX in webview vs native iosMath/swift-latex? Webview consistent with existing reading-flow rendering; native is faster but less complete. Default to KaTeX in webview unless performance is shown to be a problem.

7. **Compile triggered by keyboard shortcut?**: per V2 (no shortcuts for low-frequency operations), Compile probably should NOT have a keyboard shortcut in MVP. But if compile becomes high-frequency (which it might, once users get hooked), revisit.

---

## 14. Relationship to other plans

| Plan | How it relates |
|------|----------------|
| `LOOM.md` (root) | Source spec — §4 mode handshake, §7 pipeline, §7.5 privacy, §13.5 onboarding |
| `plans/loom-unified-product-vision.md` | Navigation map — this plan is Tier 2 in its tier table |
| `plans/phase-c-presentation-layer.md` | Phase C M2-M4 renderers will USE Compile output for content-shape-aware rendering of compiled artifacts; this plan unblocks them |
| `plans/loom-design-system-v1.md` | Compile output rendering uses paper canon tokens from DS v1; tranche 2-4 migration affects the render layer |
| (TBD) `plans/cosmic-canon-v1.md` | Tier 4 brand substrate — Compile is working-substrate; cosmic is session-boundary; they don't overlap directly |
| (TBD) `plans/connect-surface-echoes.md` | Tier 5 — Compile will eventually emit Echoes references when AI detects cross-source patterns; but Connect surface is a separate UI |
| (TBD) `plans/return-surface-last-read.md` | Tier 6 — Compile artifacts are what Return surface re-surfaces |

---

## 15. Update protocol

This plan is updated:
- When a phase from §11 is shipped (mark it complete + record commit hash)
- When an open question from §13 is resolved (move to a decision log section)
- When the system prompt in §4.3 is iterated (preserve old version in git history)

It is NOT updated for every implementation tweak — those go in commit messages.

---

*Filed 2026-05-01 by Claude. Tier 2 plan derived from `LOOM.md` v2.0. Ready to start when Tier 1 is fully landed (CaptureAST stabilized, reading-flow committed (✓ as of `7351784`), DS v1 foundation stable). Pre-flight: confirm `LoomAI.sendStream` works for the user's default provider (Apple Foundation Models or otherwise).*
