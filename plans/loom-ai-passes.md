# Loom Internal AI Passes — Engineering Spec

**Status:** M1 thesis filed 2026-05-02. Implementation gated on Camp C M4 completion (editable render must work first).

**Owner:** Claude (initial spec). Implementation TBD; coordinate via peer-chat at M4.5 start.

**Cross-references:**
- `LOOM.md` §6.7 — Input Surface and AI Passes (canonical positioning)
- `LOOM_RULES.md` §7.5 — Operating rules + bans (binding)
- `plans/loom-camp-c-editable-render.md` — editable render foundation (prerequisite)
- `plans/loom-cli.md` — external AI integration (peer)
- `tmp/loom-correction-log.md` entry-007 — substrate reframe context

---

## Why this plan exists

v4.0 establishes that Loom internal AI runs as **invisible background passes** on the active document, not as user-facing buttons / panels / commands. This plan specs how those passes work: triggers, types, marking, error handling.

## v4.1 update — non-generative hard rule

**Background passes are STRUCTURAL or REFERENTIAL ONLY. NEVER generative.**

Per `LOOM_RULES.md` §7.5 v4.1 rule #14, this is a HARD rule, not a guideline:

- ✓ **Structural** (allowed): rearrange paragraphs, detect heading levels, format lists, apply 5-shape detection, wrap blockquotes, KaTeX math syntax detection, oldstyle figure formatting
- ✓ **Referential** (allowed): cross-reference to other Loom documents, external citation lookup (DOI / Crossref / Semantic Scholar), add footnote references, suggest related captures
- ❌ **Generative** (FORBIDDEN): rewriting prose, suggesting new sentences, expanding bullets, generating alt text, auto-translating, auto-completing, ANY form of new content creation

**Generative work goes through ⌘K palette** (`plans/loom-cmd-k-palette.md`, M6/M7) — user-summoned with explicit invocation. NEVER background.

**M4.5 ships a contract test** (`tests/loom-ai-passes-non-generative.test.ts`) that asserts no pass function generates new content. Test verifies: pass output cardinality ≤ pass input cardinality (i.e., AI rearranges or annotates, never adds bulk text). Failing this test blocks the commit.

**Why this rule:**
- Substrate purity (Word's spell-check is structural; Word doesn't auto-write paragraphs in background)
- User authorial control (no surprise new content)
- Cost discipline (generative passes are expensive; structural are cheap)
- Trust building (users learn to trust background AI when they know its scope is bounded)

If a future feature seems to need background generative work, it should:
1. Move to ⌘K palette (user-summoned, explicit)
2. OR be redesigned to surface as a suggestion (margin mark with "AI suggests writing X here") that user accepts via click — never auto-applied

---

## What this plan does NOT do

- Does NOT add AI UI features (panels, chat boxes, /ai commands, co-edit toolbars). Per `LOOM_RULES.md` §7.5 ban list.
- Does NOT spec wiki-scale (multi-document) AI work. That's v4.1+ deferred.
- Does NOT spec external AI integration. See `plans/loom-cli.md`.
- Does NOT modify paper canon visual rules. Sealed v1.0.

---

## Trigger model

Three triggers, no others in v4.0:

### (1) Idle (~3-5s after last edit)

Most common trigger. After user stops typing/editing for 3-5 seconds, run typeset + structure passes. Conservative debounce — too short = distracting, too long = feels broken.

**Initial config:** typeset at 3s idle, structure at 5s idle, link at 10s idle, cite at 15s idle. Tunable based on M4.5 user data.

**Implementation:** debounced effect tied to document change events. Each pass type has its own debounce timer to avoid bunching.

### (2) On document open

When user opens an existing Loom document, re-run typeset + structure passes once. Reason: AI models improve over time; old documents benefit from re-passing under newer models.

**Implementation:** runs once per document-open event. Skipped if document was opened within the last hour (to avoid re-pass spam during normal navigation).

### (3) Manual ⌘↩ (return key with cmd modifier)

User explicitly requests an immediate pass on the current document/selection. Runs all 4 pass types in sequence. Useful when user has dictated a paragraph and wants immediate typesetting without waiting for idle.

**Implementation:** keyboard handler in editor. Bypasses idle debounce.

### NOT in v4.0

- ❌ Continuous (every keystroke triggers pass) — too distracting; defer to v4.2+ as opt-in
- ❌ On scroll (passes on visible region only) — premature optimization
- ❌ On time interval (e.g., every 5min) — invasive
- ❌ Background sync (passes on cloud) — out of scope

---

## Pass types

Four pass types, ordered by triggering urgency (typeset first, cite last):

### Typeset pass

**Goal:** raw markdown → paper canon visual structure. Idempotent.

**Operations:**
- Apply heading levels (`# `, `## `, etc.) where text patterns suggest titles
- Convert bullet patterns (`- `, `* `, `1. `) to proper lists
- Wrap quoted passages in blockquotes
- Detect and apply KaTeX math syntax (`$ ... $` and `$$ ... $$`) where math notation appears
- Apply oldstyle figure formatting to numerals in prose
- Convert dashes to em/en correctly

**Trigger:** idle 3s, on open, manual ⌘↩

**API call shape:** `prompt = "Restructure this content with paper canon markdown conventions: <content>. Return restructured markdown with no extra prose."`

**Margin marking:** typeset changes get a bronze dot in the right margin at the changed paragraph's level.

**Idempotency requirement:** running twice on already-typeset content produces zero changes. Tested via M4.5 contract.

### Structure pass

**Goal:** detect 5 shapes (Article / List / Passage / Conversation / Syllabus) and apply matching layout/styling.

**Operations:**
- Run existing 5-shape detector (per Phase C presentation layer work)
- Apply detected shape's CSS class to the article container
- If shape changed since last pass, log to correction-log debug area (not surfaced to user unless debug mode)

**Trigger:** idle 5s, on open

**API call shape:** structure detector is local (no API call); only updates DOM class. Cheap.

**Margin marking:** none (structure changes are container-level, not span-level).

### Link pass

**Goal:** find references to other Loom documents (by topic / explicit names) and add subtle margin links.

**Operations:**
- Extract noun phrases / proper nouns from current document
- Search Loom corpus for documents matching those phrases
- For matches above relevance threshold, add a subtle margin chip "→ [doc title]"
- User can click chip to navigate

**Trigger:** idle 10s

**API call shape:** local embedding search (`loom search` equivalent under the hood) + LLM ranking pass. ~1 LLM call per pass.

**Margin marking:** small bronze chips in right margin at the referenced span level. Hover shows preview.

**Wiki-scale boundary:** this pass operates on CURRENT document only. It LOOKS at other documents to find links, but doesn't MODIFY them. Multi-document modifying work is v4.1+.

### Cite pass

**Goal:** for academic-leaning content, find external citations (DOI / arXiv / Google Scholar) and add footnotes.

**Operations:**
- Detect claim-like sentences (statements with cite-able assertions)
- For each, query external citation source (DOI lookup / Crossref / Semantic Scholar API)
- For high-confidence matches, propose footnote with bibliographic entry
- AI passes only the proposal; user accepts/rejects via in-place edit

**Trigger:** idle 15-30s

**API call shape:** LLM call to detect cite-able claims + external API call for each. Costly; aggressive debounce.

**Margin marking:** bronze dot + tooltip "Cite suggestion available — hover".

**Opt-in?** Maybe behind a per-document setting (e.g., `frontmatter: cite-pass: true`). Cite pass adds latency + cost; not all docs need it. **TBD: M4.5 user testing decides default.**

---

## Margin marking spec

AI-touched content needs to be visible enough that user retains authorial control, subtle enough to not pollute the read.

### Visual

- **Mark:** small bronze dot (5x5 px, color `var(--thread)`) positioned in the right margin at the line of the touched span
- **Hover:** dot expands to a 12x12 affordance with caret indicator
- **Click:** popover appears anchored to the dot, showing:
  - Pass type that touched this content
  - Diff: what it was before / what AI made it
  - "Revert" button (single-click undo)
  - "Accept" button (dismisses the mark; treats as user-approved)
  - Timestamp of when AI ran the pass

### State

- Each AI-touched span has a `data-loom-ai-touched="<pass-type> <timestamp>"` attribute on the wrapping element
- localStorage entry per document: `loom:ai-marks:<doc-key>` = `{ markId: { passType, originalContent, newContent, timestamp, accepted } }`
- On user revert: span is replaced with originalContent, mark is removed from DOM + localStorage
- On user accept: mark is removed from DOM + localStorage; content stays
- On user edit (touching the span content): mark is auto-dismissed (treated as implicit accept)

### Constraints

- Marks do NOT affect document layout (margin-only positioning, no inline)
- Marks do NOT survive document close/reopen unless explicitly persisted (in-memory by default; user can configure)
- Marks have a max age (e.g., 7 days) after which they're auto-cleared
- Marks across nested spans only mark the outermost span (no nested margin clutter)

---

## Coordination with editable render

AI passes WRITE to the .md source. Editable render's DOM↔MD bind reflects writes. Sequence during a pass:

1. Pass detects content needs typesetting/structuring/linking/citing
2. Pass calls API or local logic
3. Pass produces a diff against current .md
4. Pass writes new .md to LoomFileStore (atomic)
5. Editable render's MD watcher detects change → re-renders affected DOM region
6. Margin marks are added to changed spans

**Conflict handling:** if user is mid-edit when a pass tries to write, the pass is aborted (will retry at next trigger). Never overwrite user's in-progress typing.

**Debounce reset:** any user edit resets all pass timers. So if user is actively typing, no passes run until they pause.

---

## API provider integration

Loom already has 5 AI providers (Anthropic / OpenAI / OpenRouter / Custom / Foundation) via `AIProviderSettingsView` + `callAiPrompt` Swift bridge. AI passes use the same plumbing.

Per-pass model selection:
- Typeset: cheap fast model (Haiku 4.5 / GPT-4o-mini equivalent)
- Structure: local (no API)
- Link: medium model + embedding search
- Cite: cheap model for detection + external API for resolution

**Cost control:**
- Aggressive debounce
- Pass results cached (don't re-pass unchanged content)
- Per-day API call cap configurable (user can throttle)
- "AI passes paused" toggle in settings (kill switch)

---

## Failure modes + handling

### Network failure
Pass silently aborts. No error UI. Retries on next trigger. Logged to debug log (not user-facing).

### API rate limit
Pass exponential-backoff retries. If sustained, pauses passes for the document for 1 hour. Surfaces a small "AI passes paused" indicator (not a full error dialog).

### Bad LLM output (corrupted markdown / structure-breaking)
Pass detects via post-write parse + structure check. If broken, reverts the write atomically. Logs incident. Retries with stricter prompt next trigger.

### User edits during pass
Pass detects via mtime check before write. If file changed since pass started, abort.

### Cost exceeded user-configured cap
Passes stop. Indicator shown. User can raise cap or disable per-pass.

---

## Testing strategy

### Unit
- Each pass type has tests for: typical input → expected output, idempotency, edge cases (empty, very long, malformed markdown)
- Margin mark add/remove + localStorage round-trip

### Contract
- M4.5 ships a `tests/loom-ai-passes-contract.test.ts` that asserts:
  - Pass functions are NEVER called from UI handlers (only from idle/open/manual triggers)
  - No /ai inline commands exist anywhere
  - No chat box UI exists in capture/page.tsx
  - Margin marking format conforms to spec

### User
- M4.5 deployment to user for 1 week
- correction log records: useful passes (which types) / annoying passes (which types) / cost surprises / margin-mark UX feedback

---

## M4.5 milestone scope

When triggered (after M4 PASS):

- Implement typeset + structure passes (cheapest, most useful first)
- Wire idle (3s for typeset, 5s for structure) trigger model
- Margin marking visual + popover + revert/accept
- localStorage persistence
- API call cost tracking + per-day cap
- 1 week user test → correction log entry → decide on link + cite passes

**Estimated time:** 5-7 days for typeset + structure + margin marking + cost tracking. Link + cite passes are M4.6+ if user data justifies.

---

## Out of scope (defer to v4.1+ or later)

- ❌ Wiki-scale AI passes (cross-document auto-link, auto-cluster, library indexing)
- ❌ Continuous-while-typing trigger
- ❌ AI suggesting new content (only restructuring/marking what user wrote)
- ❌ Multi-step agent loop (only single-step API calls per pass)
- ❌ User-defined custom passes
- ❌ Pass scheduling / cron-like behavior

---

## Update protocol

- When M4.5 ships: update this file with implementation commit refs
- When user data surfaces: append a "Real-world findings" section
- When passes types change: add changelog at top with version bump
- Major scope changes require new plan file with explicit changelog
