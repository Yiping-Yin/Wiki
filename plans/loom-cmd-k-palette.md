# Loom ⌘K Palette — Engineering Spec

**Status:** M1 thesis filed 2026-05-02 (this commit). Implementation gated on M6 milestone. Replaces LoomAIBar + distill panel functionality (deletion in M7 after M6 PASS).

**Owner:** Claude (initial spec). Implementation TBD; coordinate via peer-chat at start.

**Cross-references:**
- `LOOM.md` §1.5 (rewritten v4.1) — Option ε v2 architecture (3 AI surfaces by role)
- `LOOM_RULES.md` §7.5 v4.1 — operating rules + bans (binding)
- `plans/loom-ai-passes.md` — background passes (peer surface)
- `plans/loom-cli.md` — external AI integration (peer surface)
- `tmp/loom-correction-log.md` entry-009/010/011 — v4.1 reframe context

---

## Why this plan exists

v4.1 establishes that Loom has 3 AI surfaces by role:
1. **⌘K Palette** (this plan) — quick generative invocation (one-shot, summoned)
2. **AskAIWindow** (kept) — threaded conversation
3. **Background Passes** (`plans/loom-ai-passes.md`) — structural plumbing

⌘K is the universal summoning gesture for generative AI work that doesn't fit AskAIWindow's threaded model. It replaces the always-visible LoomAIBar pattern + the distill panel button.

## What this plan does NOT do

- Does NOT replace AskAIWindow (different role: threaded vs one-shot)
- Does NOT add inline /ai commands inside the document (per LOOM_RULES §7.5 ban)
- Does NOT enable agent loops (single-step per invocation)
- Does NOT add background AI work (that's `plans/loom-ai-passes.md`)
- Does NOT exceed 7 distinct actions (per LOOM_RULES §7.5 rule #8 hard cap)

---

## The 7 actions (HARD CAP — adding beyond 7 requires LOOM.md amendment + user GO)

### (1) **Rewrite** (selection-based)

**Trigger:** ⌘K with active selection
**Output:** in-place replacement of selected text, margin-marked
**Prompt template:** "Rewrite the following passage more clearly while preserving meaning: <selection>"
**Use case:** improve clarity / formality / concision of a chosen passage

### (2) **Expand** (selection-based)

**Trigger:** ⌘K with active selection
**Output:** in-place expansion (selection grows with new content), margin-marked
**Prompt template:** "Expand the following passage with more detail and supporting context: <selection>"
**Use case:** flesh out a brief note into a paragraph

### (3) **Distill** (document-level OR selection-based)

**Trigger:** ⌘K with no selection (whole doc) OR with selection (just that)
**Output:** new section appended at end of doc OR popover (user choice)
**Prompt template:** "Distill the following content into a structured summary with key points: <doc or selection>"
**Use case:** summarize a long capture into key points
**Replaces:** the distill panel that lived in capture/page.tsx

### (4) **Translate** (selection-based)

**Trigger:** ⌘K with active selection
**Output:** in-place replacement OR side-by-side (user choice via prefix "translate-side:")
**Prompt template:** "Translate the following to {target_language}: <selection>"
**Use case:** translate quoted foreign content; translate notes between Chinese/English

### (5) **Cite-source** (selection-based)

**Trigger:** ⌘K with active selection
**Output:** inserts a footnote reference; if external citation found via DOI/Crossref, adds full bibliographic entry; if Loom corpus match found, adds cross-reference link
**Prompt template:** internal — combines local search + external citation lookup
**Use case:** ground a claim with proper citation

### (6) **Restructure** (document-level)

**Trigger:** ⌘K with no selection
**Output:** rearranges document structure (heading levels, list nesting, section order) — margin-marked, user can revert
**Prompt template:** "Restructure this content for better flow and organization: <doc>"
**Use case:** raw dictated notes → organized structure
**Note:** this is INVOCATION-based (user-triggered); the background `structure` pass is automatic. Both exist; ⌘K version is for explicit user demand.

### (7) **Ask** (no doc context required)

**Trigger:** ⌘K, prefix with "ask:" or first word is question
**Output:** answer in popover anchored to ⌘K position; popover offers "→ Open in AskAIWindow" button to convert to threaded chat
**Prompt template:** "<user question>"
**Use case:** quick concept lookup, definition, fact-check
**Note:** for long Q&A, use AskAIWindow (⌘⇧E). ⌘K Ask is for one-shot.

---

## Keybinding decision (v4.1, filed 2026-05-04)

**Decision: Pattern B — ⌘K = M6 AI palette; ShuttleView (navigation) rebinds to ⌘P.**

### Why Pattern B over alternatives

| Pattern | Approach | Verdict |
|---|---|---|
| **A. Universal palette** | Merge AI + Nav into one ⌘K palette, sections + filtering | Right long-term but requires substantial ShuttleView refactor (991 lines). Defer to polish phase. |
| **B. Rebind Shuttle to ⌘P (chosen)** | M6 takes ⌘K (matches Cursor/ChatGPT muscle memory); Shuttle gets ⌘P (matches VS Code "Go to file") | Cleanest role split; minimal rebind cost; matches external genre conventions; bare ⌘P is currently FREE in `LoomApp.swift`. |
| **C. Context-sensitive ⌘K** | doc-view → AI; nav-view → Shuttle | Invisible mode; rejected per v4.1 unimodal principle. |
| **D. ⌘K + ⌘⌥K** | Add modifier for AI variant | Increases learning load; doesn't match external conventions. |

### External convention support

- **Cursor**: ⌘K = AI inline edit (matches our M6 use case exactly)
- **ChatGPT desktop**: ⌘K = quick prompt
- **Raycast Pro AI**: ⌘K = AI command
- **VS Code**: ⌘P = "Go to file" (matches Shuttle's nav role exactly)

The convention pattern says: ⌘K → AI, ⌘P → Navigation. Pattern B aligns Loom with these conventions instead of inventing.

### Implementation plan

1. **At M6 ship**: register native `keyboardShortcut("k", modifiers: .command)` for AI palette in `LoomApp.swift`. Verify NO existing native ⌘K conflict (current grep: clean).
2. **At M6 ship**: rebind ShuttleView from web/JS ⌘K to native + web `keyboardShortcut("p", modifiers: .command)`. Update `ShuttleView.swift:4` comment, `NavigationBridgeHandler.swift` openShuttle dispatch, any web-side keyDown listener.
3. **One-time migration toast**: first launch after M6, show "⌘K → AI palette / ⌘P → Navigation" notice (~3s, dismissable). Per LOOM_RULES V2 ("low-frequency operation shortcuts get visible UI not invisible bindings"), the rebind itself is fine but the change deserves a single launch announcement.
4. **Update docs**: this plan, LOOM_RULES §6 ("Layout"), Settings keyboard shortcut surface, README/SETUP.

### Risks + mitigations

- **R: Existing ⌘K muscle memory in users.** Mitigation: launch toast + setting to revert to legacy bindings (defer; ship if user feedback warrants).
- **R: Web/JS layer ⌘K still bound during transition window.** Mitigation: at M6 implementation, audit all web-side keyDown handlers; ensure precedence order (native ⌘K wins; legacy web ⌘K removed).
- **R: ShuttleView's web-side glue references ⌘K in copy/help.** Mitigation: grep + sweep before M6 ships.

### Out of scope (this plan)

- Universal palette merge (Pattern A) — revisit at polish phase
- Custom keybinding UI in Settings — defer

---

## UX spec

### Invocation
- Keystroke: ⌘K (default; configurable in Settings)
- Conflict check (corrected 2026-05-04 audit): ⌘K is **NOT clean** — `ShuttleView.swift:4` comment "opened by ⌘K" and `loomOpenShuttle` notification path indicate Shuttle (navigation palette, 991 lines) currently claims ⌘K. **However** `LoomApp.swift` does NOT register a native `keyboardShortcut("k", ...)` for Shuttle — the ⌘K binding lives in the web/JS bridge layer (Next.js webview side), which is being refactored under the architecture inversion. Bare ⌘P is FREE in `LoomApp.swift` (only `⌘⇧P` is taken at line 606). See "Keybinding decision (v4.1)" section below.

### Visual
- Floating prompt anchored to:
  - If selection: top-right of selection rect
  - If no selection: top-center of viewport, below toolbar
- Width: ~480pt (similar to Cursor's ⌘K)
- Height: ~80pt initial, expands as user types
- Background: paper-canon-aesthetic (warm vellum + bronze hairline border)
- Typography: serif (matches paper canon)
- Single text input + small action selector + send button

### Action selection
- User types prompt; first word or prefix detected:
  - "ask:" or starts with "what/why/how/who/when" → Ask action
  - With selection: defaults to Rewrite, user can switch via small dropdown to Expand / Translate / Cite / Distill (selection)
  - Without selection: defaults to Distill, user can switch to Restructure / Ask
- Manual override: "/rewrite" / "/expand" / "/translate" / "/cite" / "/distill" / "/restructure" / "/ask" prefixes force action

### Streaming + accept/reject
- AI response streams into:
  - For inline edits (rewrite, expand, translate): preview overlay over selection; user hits ⏎ to accept, ⎋ to reject
  - For doc-level (distill, restructure): preview margin-marked; persistent until user explicit accept/reject
  - For ask: popover with answer; auto-dismisses on click outside, or "→ Chat" button to escalate
- All AI-touched content is margin-marked per `plans/loom-ai-passes.md` margin spec

### Cost control
- Each invocation is one API call (no agent loop)
- Per-day API cap shared with background passes (configurable in Settings)
- Provider used: respects user's `AIProviderSettingsView` preference

---

## Implementation notes

### Code location
```
app/loom-render/capture/page.tsx
  └── new component: CommandPaletteOverlay
  └── new keyboard handler: registerCmdK
  └── new prompt parser: parseInvocation (action detection)

macos-app/Loom/Sources/
  └── existing AIProviderSettingsView (no change)
  └── existing callAiPrompt bridge (reused for streaming)
```

### Tech stack
- TS / React in capture/page.tsx (consistent with existing reader code)
- Keyboard handler: existing selectionchange + new keydown listener
- Streaming: reuses callAiPrompt bridge (Swift side unchanged)

### Estimated time
- 5-7 days single agent
- Includes: keyboard handler + overlay UI + 7 action implementations + accept/reject flow + margin marking integration + tests

---

## Coordination

- `app/loom-render/capture/page.tsx` is shared with Codex (capture work). HOT-FILE coordination via peer-chat at M6 start.
- Per-region anchoring (Codex's P0) does NOT need to land before M6 — ⌘K palette is independent of capture.
- M6 can ship in parallel with C.M4 (editable render hardening). They touch different code regions.

---

## M6 milestone scope

When triggered (any time after M2 PASS):

- Keyboard handler + overlay UI (1 day)
- Prompt parser + action detection (1 day)
- 7 actions implementation (3 days, ~0.5 day each)
- Accept/reject + margin marking integration (1 day)
- Tests + documentation (1 day)

**Total: 5-7 days, single agent.**

---

## M7 milestone scope (gated on M6 PASS)

Delete LoomAIBar + distill panel ONLY AFTER M6 ships:

- Verify ⌘K palette covers all distill panel functionality (manual test + user feedback)
- Delete `macos-app/Loom/Sources/LoomAIBar.swift` (224 lines)
- Delete distill panel UI in `app/loom-render/capture/page.tsx` (~80 lines)
- Update menu items / keyboard shortcuts
- Migration note in CHANGELOG: "LoomAIBar replaced by ⌘K palette; distill panel replaced by ⌘K → distill"

**Total: 2-3 days.**

**Gating condition for M7:** M6 has shipped + user has used ⌘K palette for ≥3 days + correction log shows no missing functionality. Without these, M7 doesn't ship (LoomAIBar stays).

---

## Failure modes + handling

### Network failure
Streaming pauses; user sees "AI offline" indicator in palette; can retry or cancel.

### API rate limit
Backoff + retry. After 3 failures, palette closes with error toast.

### Bad LLM output (corrupted markdown / breaks structure)
Server-side validation: before applying, parse output as markdown and verify it doesn't break paper canon structure. If broken, reject + show error.

### User cancels mid-stream
⎋ key cancels current invocation; partial output is discarded.

---

## Out of scope (defer to v4.2+ or later)

- ❌ More than 7 actions (hard cap per LOOM_RULES)
- ❌ Multi-step agent loops (use external AI via CLI)
- ❌ User-defined custom actions
- ❌ Plugin SDK for third-party actions
- ❌ Voice input directly into ⌘K palette (use OS dictation feeding into the text input)
- ❌ Image/file inputs (text only in v4.1)
- ❌ Cross-document operations (single-doc only)

---

## Update protocol

- When M6 ships: update this file with implementation commit refs
- When user data surfaces: append "Real-world findings" section
- When actions need adjustment (within the 7-cap): changelog entry
- Adding 8th action: requires LOOM.md + LOOM_RULES amendment + user GO
