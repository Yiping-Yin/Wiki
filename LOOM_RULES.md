# Loom — Product Rules & Engineering Protocol

> **Read this BEFORE starting any work on Loom.**
> This document captures the accumulated product decisions, hard vetoes, and design rules made over many design sessions with the product owner. It exists so any AI assistant (Claude, GPT, Codex, Gemini, etc.) — and any human collaborator — can pick up the work without re-litigating settled questions.
>
> **This is a living document.** Update it after every session in which a meaningful decision is made or a recurring feedback pattern emerges. Do not delete past entries; mark them superseded.
>
> **Maintained by:** the AI assistant currently working on Loom. The product owner approves substantive additions; small clarifications and decision-log entries can be added unilaterally.

---

## 1. What Loom Is — In One Paragraph

Loom is a macOS-native learning amplifier. It treats the **screen as a replacement for paper** for university-level study. The user picks folders or creates pages; Loom shows source files (PDFs, etc.) natively, lets the user select passages and respond in writing or via AI dialogue, and stores everything in portable Markdown the user owns. The app's job is to remove operation friction (no syncing, no organizing) and concept friction (AI summoned for explanation, translation, dialogue) so the user spends time *thinking* rather than *managing*.

Loom is **not** a Notion clone, Notability replacement, or research-management tool. It is a *thinking surface anchored to sources*.

---

## 2. North Star Principles

Each principle is load-bearing. When a feature contradicts a principle, the feature is wrong, not the principle.

1. **Learn, don't organize.** Notes are byproducts of learning, not the object. The system MUST NOT reward collection-as-an-end. Adding small intentional friction (e.g. "did you have a thought about this?") is a feature, not a bug.

2. **Source is authority.** The user's source files (PDFs, .docx, folders) are READ-ONLY. Loom never writes into the user's picked folders. Loom-managed data lives separately in `LoomFileStore`.

3. **Loom = pages.** The page (a `ContentRoot`) is the primary unit of meaning. Pages contain notes. Notes are anchored fragments. Pages are addressable, notes are not (until promoted).

4. **AI as Aladdin's lamp.** AI is summoned, never always-visible chrome. Curiosity-led — the user asks AI; AI never quizzes the user (until a Panel is provisional+ with ≥3 anchors, which is a separate feature).

5. **One primitive over many.** When two surfaces overlap functionally, collapse to one with progressive paths inside, even if it costs an extra click. Mental clarity > click count.

6. **Lean on macOS.** The system already provides Translate, Look Up, Writing Tools, Speech, Share via right-click on selected text. Loom adds only what macOS doesn't. Do not duplicate system features.

7. **Source fidelity.** Loom's sidebar mirrors the Finder tree the user picked. No auto-clustering, no silent flattening, no smart folders. The user already paid the organizing cost.

8. **Extract, don't author.** If information is in the source (syllabus, slides), AI extracts at ingest. The user corrects inline. Loom is not a Notion-style block editor.

9. **Apple-native aesthetic.** macOS feel: NavigationSplitView, native context menus, system materials, system fonts. Triangulate against (a) Loom's product philosophy, (b) Apple aesthetic, (c) App Store distribution goal — all three must agree.

10. **Markdown files the user owns.** All Loom-managed data is plain Markdown in a known location. Future iCloud sync friendly. No proprietary database.

---

## 3. Hard Vetoes (Never Do)

These are absolute. If you find yourself building one of these, stop and re-read this section.

| # | Veto | Why |
|---|------|-----|
| V1 | **Never write to user-picked folders.** | Source is authority; user's files are read-only. All Loom data lives in `LoomFileStore` (`~/Library/Containers/com.yinyiping.loom/Data/Documents/Loom Data/`). |
| V2 | **No keyboard shortcuts for low-frequency operations.** | Visible buttons or menu items beat invisible shortcuts. ⌘[ / ⌘] for back/forward and ⌘↩ for save-in-popover are the only acceptable shortcuts as of 2026-04-26. |
| V3 | **No always-visible AI chrome.** | AI is summoned per action, never sitting in the UI waiting. |
| V4 | **No quizzing the user.** | Direction is user→AI, not AI→user. Quiz/SRS modes are reserved for a far-later "Panel" feature with strict prerequisites. |
| V5 | **No automatic clustering, tagging, or smart folders.** | The user's manual organization IS the organization. |
| V6 | **No proprietary file formats or databases.** | Markdown only, in plain files. |
| V7 | **No silent failures.** | Every action shows a toast, error, or visible state change. Empty quiet failure is forbidden. |
| V8 | **No `## Notes` / `## Threads` / `## Pursuits` separation.** | Activity is grouped **per book** (per source file), not per activity-type. One section per source, all activity inline. |
| V9 | **No `List + .listStyle(.sidebar)` for the sidebar.** | Use `ScrollView + LazyVStack` always. List eats button clicks after the first selection. |
| V10 | **No automatic page-promotion thresholds.** | Promotion (note → standalone page) is always a deliberate one-click action. The system never decides for the user. |
| V11 | **No duplicate UI for the same outcome.** | If a feature exists in the system right-click menu (Translate, Look Up, Speech), do not also add it as a Loom menu item. |
| V12 | **No metaphor-laden feature names.** | Labels and status copy are literal. Canon metaphors (weave, panel) are grandfathered; new features get literal names. |

---

## 4. Architecture (As of 2026-04-26)

### Data model

```
ContentRoot {
  id: UUID
  displayName: String
  description: String
  externalFolderBookmark: Data?   // nil = pure page; non-nil = folder root
  parentID: UUID?                 // nil = top-level; non-nil = nested sub-page (legacy)
  addedAt, updatedAt
}
```

- **Folder root**: user picked a folder via `+ Folder`. `externalFolderBookmark` non-nil. Loom shows its file tree.
- **Pure page**: user created via `+ Page`. `externalFolderBookmark` nil. Just a Markdown page.
- **Sub-page (legacy)**: created via the now-removed Extend gesture. `parentID` non-nil. Renders nested in sidebar.
- **Promoted page**: created via "Promote to new page…" on an inline note. **Top-level** (parentID nil), not nested.

### File layout

- **User's source folders**: untouched. Loom uses security-scoped bookmarks to read.
- **Loom-managed data**: `LoomFileStore.loomMDURL(for: rootID)` → `<file-store>/<root-id>/Loom.md`.
- **Loom.md structure**: `## Resources` (auto-folder listing) + one `## <filename>` section per source containing all activity for that source.

### Routing

- `loom://content/<uuid>` — page home (root or sub-page)
- `loom://content/<uuid>/<sub-path>/` — folder home (trailing slash)
- `loom://content/<uuid>/<file>` — source file viewer
- `loom://anchor?src=<source-loomURL>&page=N&rect=x,y,w,h&text=<excerpt>` — jump to a PDF passage

### Key files

- `LoomMinimalRootView.swift` — main window root, sidebar, navigation history
- `LoomFolderHomeView.swift` — page renderer (Markdown + actions)
- `SourceFileView.swift` — PDF / file viewer + Note popover + Ask AI panel
- `ContentRootStore.swift` — page registry, security-scoped bookmark management
- `LoomFileStore.swift` — Loom-managed data location
- `LoomAI.swift` — single AI entry point, routes to user-selected provider

---

## 5. Reading & Capture Model (Locked 2026-04-26)

### One menu item per selection

When the user right-clicks selected text in a PDF, Loom adds **exactly one item** to the system context menu:

> **Note this passage…**

Underneath sit the system items: Look Up, Translate, Search With Google, Copy, Share, Speech, Writing Tools. Loom does not duplicate any of them.

### Inside the Note popover

- Quote pre-filled at top (read-only)
- Textarea below (focused on open)
- Header has a **`✦ Ask AI`** escape hatch — switches to the AI side panel seeded with the same passage; popover dismisses without saving
- **Save** (⌘↩):
  - Empty body → saves a quote-only entry
  - With body → saves a note (quote + thought)
- A small hint reads "Save with empty body to keep the quote only."

### Inside the Ask AI panel

- Quote pinned at top
- Input pre-filled with an AI-suggested first question (heuristic on passage type: equation / definition / claim / general)
- ⌘↩ to send
- Tray-down icon archives the conversation under the parent page; X discards
- Conversation is saved as a thread inside the per-book section

### Lifecycle of a note

1. **Create**: right-click → Note → Save (empty or with body) → lands inline on parent page under `## <filename>`
2. **View**: parent page shows it as `*p.N · timestamp*` + quote + body. Quote is tappable to jump back to the PDF passage.
3. **Edit**: enter whole-page edit mode (click empty area, edit Markdown directly). Per-note edit not yet built.
4. **Delete**: right-click on inline note → Delete note → confirm → entry removed from Markdown
5. **Promote**: right-click on inline note → Promote to new page… → enter title → new top-level page created with `*from <parent>*` back-link + the note's content; inline note replaced with `→ [<title>](url)`

### Self-healing Markdown

`SourceFileView.restructure()` runs on every save AND on every page load (`LoomFolderHomeView.reload`). It:

- Parses the file into sections + entries
- Routes orphan `### entries` (legacy or floating) into per-book sections
- Coalesces multiple entries for the same source under one `## <filename>` heading
- Folds legacy `## Notes` / `## Threads` / `## Pursuits` content into per-book sections
- Drops legacy `## Source` / `## Thoughts` headings on sub-pages (purely a render-side hide for legacy structure)

The file gradually heals itself; no destructive migration script needed.

---

## 6. UI / UX Rules

### Layout

- **Back/forward chevrons live in the NSWindow titlebar** via `.toolbar { ToolbarItem(placement: .navigation) { ... } }`. Never a custom row eating vertical space below the titlebar.
- **Two-finger trackpad swipe** triggers back/forward via `NSEvent.trackSwipeEvent` + a global local `NSEvent.addLocalMonitorForEvents(.scrollWheel)` monitor. Convention: swipe right = back, swipe left = forward.
- **Sidebar** uses `ScrollView + LazyVStack`. Each row is a Button with its own selection background. **Never** `List + .listStyle(.sidebar)`.
- **Page body** uses native serif typography. Editable inline (click empty area to enter edit mode).
- **Page title (h1)** — 28pt serif semibold, editable inline by clicking. Only renameable at the root, never inside a subfolder.

### Interaction

- **Right-click is the primary discovery surface for actions.** All Loom actions on PDF selections, inline notes, and sidebar items live in native NSMenu / SwiftUI `.contextMenu`.
- **Promote / Delete / future Edit** appear on inline-note context menus only.
- **Sidebar rename** via right-click → Rename, or by clicking the inline page title at top of folder view. Both write through `ContentRootStore.update`; `liveRootName` keeps display in sync.
- **Cascade on remove** — removing a folder root cascades to all descendants in `ContentRootStore.remove(id:)`.
- **Toast** for confirmations: `.regularMaterial in: Capsule()`, ~1.5s fade. Used for "Quote saved", "Note saved to <page>", "Couldn't save", etc.

### Don't

- **Don't add chrome.** Floating panels appear only when summoned. No always-visible margin columns, no permanent toolbars beyond the back/forward chevrons.
- **Don't separate by activity type.** A book's notes, AI threads, and pursuit links all live under that book's section.
- **Don't show a feature inline in the page that already exists in the system menu** (e.g., Translate).
- **Don't create per-action toolbars in the page body.** Buttons appear on context menu, not always visible.

---

## 7. Visual / Typography (Locked 2026-04-26)

### Markdown rendering hierarchy (in `LoomMarkdownView`)

| Element | Style |
|---------|-------|
| Page title (h1, separately rendered) | 28pt serif semibold, editable inline at root |
| Body h1 (legacy or user-authored) | 20pt serif semibold |
| h2 (`## <filename>` per-book section) | 14pt serif semibold, primary color, 22pt top padding |
| h3 (legacy subsections) | 12pt medium, secondary color, 14pt top padding |
| Italic-only paragraph (`*p.N · ts*`) | 10pt serif italic, **tertiary** — eyebrow style |
| Jump-back paragraph (`[📍 ...](loom://anchor?...)`) | 11pt secondary |
| Quote (with anchor) | 13pt serif italic, primary at 75% opacity, accent-colored 2px left bar, ↗ glyph at top-right; **whole quote is the click target** |
| Quote (no anchor) | Same but secondary-colored bar, no glyph |
| Body paragraph | 14pt system, 2pt line-spacing |
| List item | 13pt system |
| Code | 12pt monospace, secondary background |

### Block spacing

- Outer VStack between blocks: **6pt**
- Per-block top padding adds the gap only at section/entry boundaries (h2: +22pt, h3: +14pt)

### Per-book section heading

- Saved as `## [<filename>](<source-loomURL>)` — the filename is a clickable link that opens the source file directly
- Both legacy (plain text) and new (linked) shapes resolve to the same subsection during heal

### "Jump to passage" UX

- The standalone `[📍 Jump to passage](...)` link is folded into the preceding quote at render time
- Quote becomes the click target; a small ↗ glyph hints at the action
- Hover help: "Jump to source passage"

---

## 8. Decision Log

Reverse-chronological. Date in YYYY-MM-DD.

### 2026-04-29 — Web Capture extension shipped

**Decision:** Loom now ships a Safari Web Extension at `macos-app/Loom/LoomWebExtension/` paired with a native host (`Sources/Capture{Shape,Sheet,View,WebView}.swift`, `LoomURLSchemeHandler.swift` capture-bridge additions). The extension surfaces a toolbar action + three context menu items (page / selection / link) and emits one of two URL shapes: `loom://capture?payload=<json>` for small payloads or `loom://capture?via=clipboard` (short URL + clipboard JSON) for multi-MB rich-media payloads. Manifest declares `clipboardWrite`. `background.js` uses `scripting.executeScript({world: 'MAIN'})` to bypass page CSP for the `loom://` href click.
**Rationale:** Source files (Notion-style web pages, articles, HN threads) were second-class citizens — the only way to "save" one was to bookmark in the browser and rely on the user to revisit. Web Capture brings them under the same per-folder `Loom.md` substrate as PDFs. The two URL shapes exist because URL-encoded JSON truncates around ~2MB on multi-image captures; clipboard fallback tolerates anything the OS clipboard accepts.
**Coverage:** Atlas-compatible (the extension provides context menu items even when the toolbar action is hidden). Tested against `flipdisc.io` as the golden case fixture (long article + YouTube embed + Vimeo embed + composite SVG/canvas blocks + image gallery + code blocks).
**Reference:** `docs/process/WEB_CAPTURE_GOLDEN_CASE_2026-04-29.md` documents 11 failure modes (SVG layout attrs as black blocks, re-sign without entitlements, theme resolver gaps, validation locality, provider video fallback, extension-not-injected detection, etc.) + 13 product rules (never re-sign with bare codesign, source folder remains read-only, capture from live DOM not detached cloneNode for media-rich docs, screenshots as media sidecars not inline base64, etc.).
**Open caveat:** YouTube returns `Error 153` in `loom://` WKWebView origin; capture data and source link are present but provider playback requires trusted HTTPS origin. Vimeo plays fine.

### 2026-04-28 — Loom Design System v1.0 spec

**Decision:** Canonical visual-token source filed at `lib/loom-design-system.ts`. CSS twin staging at `app/globals-v2.css`. Swift mirror is `LoomTokens.swift` (existing, will be brought into alignment in tranche 2+). Primitives shipped at `components/loom/*` (Body, Display, Eyebrow, HairlineRule, LayoutArticle, LayoutGallery, LayoutIndex, LayoutMagazine, LayoutSnapshot, Stack, Surface).
**Rationale:** Loom had drifted into 15 font sizes, 5 expressions of the same bronze accent (`#9E7C3E` / `#C4A468` / `#B98E3F` / `#D4B478` / `#7A5E2E`), no spacing scale, no motion scale, and 4 rendering paths each with its own CSS. Per-feature improvisation was ratcheting inconsistency upward with every patch. The plan diagnoses 10 constitutional rules (no `backdrop-filter` on sticky/scroll-aware elements, hover may only change color/opacity/border, all `useEffect` must list real dependencies, scroll-spy callbacks read-only or 1Hz hysteresis-throttled, no `position: fixed` + `transform`, no inline `<style>` blocks, no new font sizes/colors/spacings outside the system, etc.).
**Migration:** 4 nights of disciplined work per `plans/loom-design-system-v1.md`. Inventory of 67 hex literals + ~40 more mapped to tokens at `plans/design-system-migration-inventory.md`. Tranche 1 (commit `e4c57c0`) collapsed 7 hexes in `components/{GradientDescent,NeuralNetCanvas}` to `color.{thread,paperDeep,ink1,ink3,paperUp,paperCard}`. Tranche 2 will require expanding the DS lib's tint family (sage/plum/indigo/umber/rose) and a light-mode token set (currently dark-only).

### 2026-04-27 — Phase C presentation layer (体面 OUT)

**Decision:** Filed `plans/phase-c-presentation-layer.md` for the 体面 OUT half of Loom (the rendering layer — Phase A handled 顺手 IN, capture-into-substrate). The plan establishes 4 content shapes (List / Article / Passage / Conversation; Syllabus deferred), each detected by heuristic content shape and rendered by a per-shape view. Source of truth remains `.md` files; renders are derived; AI distill (Phase C2) is the only path to write back to source as a tagged section.
**Rationale:** A perfectly-extracted markdown document still reads as raw source code in iA Writer / Xcode / wherever the user's default markdown viewer is. The unit of "体面" is rendered output, not extracted text. Phase A's optimization track (mini-Defuddle, sr-only stripping, HN tuple extractor) was the wrong ladder — even perfect extraction doesn't ship presentation.
**Status:** M1/Path B (in-Loom capture renderer at `app/loom-render/capture/page.tsx`) is partially shipped — explicit phase comment in the file. M2/M3/M4 (List / Article / Passage / Conversation renderers as a content-shape selector) not started.
**Constitutional rules:** Source folder remains immutable; `.md` is canonical; content-shape-aware (one renderer per detected shape, not user choice); no AI-generated rewriting at render time (render is deterministic given source); user retains full editing power on the rendered surface; no in-Loom AI chat (external LLMs do thinking, Loom does archive + presentation).

### 2026-04-27 — Source folder is immutable (LoomFileStore enforced)

**Decision:** Loom-managed data writes go through `LoomFileStore` (sandbox container at `~/Library/Containers/com.yinyiping.loom/Data/Documents/Loom Data/`). Zero automated writes to the user's external folder. `Loom.md`, sidecars, caches all live in the sandbox; the user's source folder is read-only.
**Rationale:** Source authority (V1 in §3) is one of Loom's two load-bearing trust contracts. Any automated mutation of the user's folder breaks the contract. Hiding artifacts inside the user folder isn't a fix — redirect the writes. Don't auto-migrate or auto-delete legacy artifacts either; only humans modify the source folder.
**Coverage:** All capture writes go via `LoomFileStore.loomMDURL(for: rootID, subPath:)`. Tests `tests/source-authority-contract.test.ts` and `tests/web capture routing never falls back to broad or source-mutating paths` enforce.

### 2026-04-27 — Ingest-to-learning-loop bridge

**Decision:** Storage P0 + routing P1 of `plans/ingest-to-learning-loop-bridge.md` shipped. Schema-bound extractors land their structured output where the learning-loop surfaces (CourseContextStrip, Pursuits, extractor anchors) can read it. Folder-fallback resolver fires when the folder name lacks a course code AND there's exactly one syllabus sibling — eyebrow shows "folder fallback"; otherwise muted dismissible hint guides the user to drop a syllabus PDF and Extract.
**Rationale:** Ingest extractor refactor (Phases 0-7.4 plus 6 hardening commits) produced typed extractor lanes; without a bridge, the structured output sat unused. The bridge connects the schema layer to the reading-page surfaces so users see typed metadata without manual reconciliation.

### 2026-04-26 — Apple Foundation Models as default provider

**Decision:** New `AIProviderKind.appleFoundation` case wired through `AppleFoundationClient` (wraps the macOS 26+ `FoundationModels` framework). Set as the default for new installs / first-run. Streams natively via snapshot diffing. Graceful `notAvailable` failure with actionable banner when on unsupported hardware/OS.
**Rationale:** Removes the configuration barrier that was blocking testing — the user couldn't try shipped AI features without configuring a CLI binary or paying for an API key. Apple Intelligence works out-of-the-box on supported hardware. Aligns with V11 (lean on macOS for things macOS provides) and V1-class privacy (on-device, never leaves the machine).
**Coverage:** `LoomAI.send` and `LoomAI.sendStream` both route to `AppleFoundationClient`. `StructuredOutputClient` falls back to disabled for now (guided generation not yet wired). `FirstRunProviderSheet` treats it as credential-free.
**File:** `Sources/AppleFoundationClient.swift`, registered in pbxproj.

### 2026-04-26 — Bidirectional Note ↔ AI

**Decision:** Each AI reply in the Ask panel gets a `↓ Save as note` capsule. Click → closes the Ask panel and opens the Note popover pre-filled with the AI's text as the body and the original passage as the quote. User reviews/edits before saving — the saved note is theirs, not a raw AI dump.
**Rationale:** Tier 1 made AI READ user's notes. This shipping step makes AI replies become user's notes. Closes the loop: AI helps draft, user owns the takeaway. Aligns with curiosity-led — AI assists, user curates.
**Three capture granularities** from an AI conversation now coexist:
- Type your own + ⏎ → pure user note
- `↓ Save as note` on an AI message → AI-drafted, user-edited, anchored
- `📥` archive (top of panel) → full conversation transcript saved as thread
**Implementation:** `saveAIMessageAsNote(_:)` tears down Ask state and seeds the Note popover with the same selection (anchor preserved) + the AI text as `noteDraft`. Saves through the normal `commitNote` path so the note lands in the per-book section like any other.

### 2026-04-26 — Streaming Ask AI

**Decision:** Ask AI responses stream token by token via `LoomAI.sendStream(prompt:systemPrompt:onChunk:)`. Empty placeholder message appears immediately on Send; chunks append as they arrive from the provider's SSE feed. "thinking…" indicator clears when stream completes.
**Rationale:** Felt latency was getting worse with Tier 1 prior-notes context (more tokens = longer wait). Streaming makes the AI panel feel responsive again — user sees progress, not a wait spinner. Standard pattern across modern AI tools.
**Provider coverage:** OpenAI + Anthropic stream natively. Custom endpoint / Ollama / CLI runtimes fall back to one-shot (single chunk on complete) so the UX doesn't break — they just don't stream.
**Implementation:** `OpenAIClient.Options.onChunk` and `AnthropicClient.Options.onChunk` already existed; `LoomAI.sendStream` is the new unified entry. `AskMessage` got a public `id` parameter so streaming can mutate the placeholder in place.

### 2026-04-26 — Source-aware Ask AI (Tier 1 of substrate AI)

**Decision:** Ask AI now automatically includes the user's existing notes on the same PDF as context in every call. System prompt instructs the model to reference prior notes when relevant (e.g., "your earlier note on p.3..."). No UI change — invisible by default, qualitatively transforms responses.
**Rationale:** Loom's unique substrate is the user's accumulated per-passage notes. No other PDF+AI tool (Adobe AI Assistant, NotebookLM, Readwise) knows your prior thinking on a specific document. Using it elevates Ask AI from "fresh AI per passage" to "AI that's been reading along with you."
**Implementation:** `SourceFileView.gatherPriorNotesFromPage()` reads the parent's `Loom.md`, finds the per-book section matching the current PDF, strips jump-link lines, caps at 8000 chars (most-recent tail when truncated), passes as `priorNotes:` to `buildAskPrompt`.
**Aligns with:** `LOOM_USER_PROFILE.md` §8 ("AI can act on the user's accumulated record"). First concrete step toward the broader substrate vision.
**Tier 2 deferred:** AI-generated suggested questions above the input field — defer until Tier 1 has been validated in actual reading sessions.

### 2026-04-26 — Two creation paths only (drop "+ Add note")

**Decision:** Removed the "+ Add note" button at the bottom of folder home. There are now exactly two ways to create content on a page:
1. **Free-form prose** — click the empty page area → edit mode → save. Lands at the top of `Loom.md` in the prose region.
2. **Anchored note** — right-click PDF selection → `Note this passage…` → save. Lands in the per-book `## <filename>` section.
**Rationale:** "+ Add note" was a third path writing to a legacy `## Notes` section, which `restructure()` would then re-route into a per-book section if there was one (surprising). Two orthogonal paths matches "one primitive per intent" (V8) and removes the confusion.

### 2026-04-26 — Note lifecycle complete + heal-on-load restored

**Decision:** Three updates landed together:
1. **Heal-on-load re-enabled.** `LoomFolderHomeView.reload` runs `SourceFileView.healLoomMD` on every page open and writes back when changed. The earlier regression's root cause was `isAtRoot` mismatching `/var` vs `/private/var`, not heal itself. Resources is no longer in the heal pipeline since it's now a synthesized view.
2. **Sidebar flattened.** `ContentRootStore.flattenLegacySubpages()` runs in `activateAtLaunch` and sets every `parentID` to nil. Legacy sub-pages (from removed ⌘L Extend) become top-level alongside new Promoted pages — eliminating the two-shapes-coexist inconsistency.
3. **Per-note Edit added.** Right-click any quote → menu now has Edit / Promote / Delete. Edit opens a sheet pre-filled with the existing body; eyebrow + quote + jump-link are preserved verbatim, only the body region is rewritten. Lifecycle (Create → Edit / Promote / Delete) is now complete.

**Rationale:** All three were ranked top in the global state analysis. Heal-on-load closes the gap where files only self-heal on save (a read-only user would never get migration). Sidebar flatten removes the inconsistency the product owner flags as "duplicates X". Edit was the missing verb on the note lifecycle.

### 2026-04-26 — Prose vs auto-managed split

**Decision:** A page's `Loom.md` is split conceptually into two regions: **user-authored prose** (everything before the first `## ` section) and **auto-managed sections** (Resources synthesized live, per-book `## <filename>` containing notes/threads/pursuits). Edit mode shows ONLY the prose; auto-managed sections are preserved verbatim on save and never exposed in the textarea.
**Rationale:** Auto-managed content is full of `[Name](url)` boilerplate, percent-encoded URLs, and rigid formatting that adds cognitive burden when the user just wants to write a thought. Loom owns those sections; the user shouldn't have to navigate around them.
**Implementation:** `extractProse(from:pageName:)` returns just the prose for the textarea; `mergeProse(_:into:pageName:)` reattaches it before the first `## ` boundary on save. Per-note actions (edit individual note / delete) need a different surfacing mechanism (TODO — was reverted from the entryGroups context menu attempt).
**Side effect:** `## Resources` is no longer persisted to disk at all — it's a live render from the folder scan. New folder roots get an empty `Loom.md`. Existing files with `## Resources` baked in have it stripped at render and dropped at next save.

### 2026-04-26 — Refresh action + live Resources

**Decision:** Added a refresh path with three triggers: ↻ button in the titlebar toolbar (after back/forward), ⌘R keyboard shortcut (universal browser/Finder convention — qualifies as exempt from V2 since it's globally known), and automatic refresh on `NSApplication.didBecomeActiveNotification`. Each refresh also re-scans the source folder and rewrites the `## Resources` block in `Loom.md` so new files / new subfolders surface live.
**Rationale:** User often updates folder structure in Finder externally. Without refresh, Loom would show a stale tree until restart. Without live Resources, the sub-folder list inside a page would never reflect Finder changes (it was scaffolded once on first visit and frozen).
**Implementation:** `LoomMinimalRootView.refreshActive()` reloads sidebar roots and posts `.loomRefreshActivePage`. `LoomFolderHomeView.reload` runs heal-on-load + `refreshResources(in:entries:)` which replaces the existing `## Resources` block (or inserts one) with a fresh scan. Writes back only when the live list differs from disk.

### 2026-04-26 — Single capture primitive

**Decision:** Collapsed three right-click menu items (Quote / Note / Ask AI) into one (**Note this passage…**). The Note popover handles all three paths via empty body (= quote), filled body (= note), or `Ask AI` button (= conversation in side panel).
**Rationale:** Quote and Note had functional overlap (Quote = empty Note). Ask AI is rarer; it deserves to be summoned from inside the note surface, not as a peer menu item. Aligns with V11 (no duplicate UI for same outcome) and the "Learn, don't organize" principle (small friction at capture-time prompts engagement).
**Tradeoff:** +1 click per pure quote vs old 1-click Quote. Accepted because it nudges the user toward engagement.

### 2026-04-26 — Drop ⌘L Extend → Page

**Decision:** Removed the "Extend to new page" gesture from the PDF right-click menu and the `extendToPage` handler entirely. Replaced with **Promote to new page…** on inline notes (right-click on parent-page note).
**Rationale:** Sub-pages and inline notes had ~80% functional overlap (both: anchored response to a passage). Forcing the choice upfront (Note vs Extend) was the friction. Promotion now happens after the note has grown enough to need its own home, not before.
**Migration:** Existing sub-pages keep working (still nested in sidebar). New promoted notes are top-level.

### 2026-04-26 — Per-book sections (not per-activity)

**Decision:** Loom.md is structured as `## Resources` + one `## <filename>` section per source. All activity for a source (notes, AI threads, pursuit links) lives inline under that source's heading. No `## Notes` / `## Threads` / `## Pursuits` separation.
**Rationale:** User mental model is "what have I done with this book?", not "what are all my notes across all books?".
**Heal-on-load:** `restructure()` migrates legacy structure on every save and load.

### 2026-04-26 — Right-click as primary action surface

**Decision:** All Loom actions on selected text (PDF) and inline notes (parent page) live in native context menus. Removed all keyboard shortcuts (⌘T/D/E/K/L) for these actions. Removed the visual shortcut hints in the file header.
**Rationale:** User feedback: minimize shortcuts, leverage Apple-native patterns, prefer "stacked windows" (single context menu) over scattered surfaces.
**Kept shortcuts:** ⌘[ / ⌘] (back/forward), ⌘↩ (save-in-popover). Universally known.

### 2026-04-26 — Trackpad swipe back/forward

**Decision:** Added native two-finger horizontal trackpad swipes for navigation via `NSEvent.trackSwipeEvent` + global scroll-wheel monitor.
**Rationale:** Matches Safari/Finder. The MBP's primary input is the trackpad.

### 2026-04-26 — Heal Markdown on read

**Decision:** `LoomFolderHomeView.reload` runs `SourceFileView.healLoomMD(_:)` on every page load and writes back if changed.
**Rationale:** User saw stale legacy structure not reorganizing. Heal-on-save alone wasn't enough; opening a page also fixes it.

### 2026-04-26 — Title and source name in sync (live)

**Decision:** Editable page title at top of folder view. `liveRootName` state is refreshed on every `.loomContentRootsChanged` notification, so renaming via sidebar OR page title updates both surfaces immediately.

### 2026-04-26 — Drop legacy ContentView, ship "minimal mode"

**Decision:** `LoomMinimalRootView` is the default UI (`UserDefaults` flag `loom.minimal.enabled` defaults to true). The legacy webview-based ContentView remains accessible via the flag but is not maintained.
**Rationale:** Clean rebuild, no legacy chrome (Desk / Reference / Coworks / Patterns / Weaves / Pursuits surfaces are gone in minimal mode).

### Earlier — Architecture inversion

**Decision:** Loom shifted from "Next.js in WKWebView" to "Swift-primary Mac app, webview renders MDX only".
**Rationale:** Sandboxing, simpler distribution, native feel.
**Status:** Inversion mostly complete; some Vellum-era webview surfaces still exist for `/wiki` content but minimal mode bypasses them.

---

## 8b. The Three-Substrate Model (Aspirational)

Loom is being built toward a vision where AI can act *as the user would*, not just *as told*. This requires three substrates working together:

1. **`LOOM_RULES.md`** — what Loom is (product invariants, vetoes, architecture). Constrains AI from violating product principles.
2. **`LOOM_USER_PROFILE.md`** — who the user is (observed habits, preferences, working patterns). Tells AI how to fit the user's grain.
3. **`LoomFileStore` data** — what the user has done (notes, pages, anchors, AI conversation history). The actual substrate AI acts on.

(1) and (2) constrain. (3) is the material. Together they make autonomous task completion possible.

**First autonomous task to attempt** (when ready): *Cross-source surfacing* — when the user opens a PDF, surface their own past notes from other books that engaged with similar passages. Low-stakes (just suggestions), high-value (impossible without the substrate), uses all three layers.

**Architectural implication**: when Loom-the-app eventually adds personalization features, they MUST read `LOOM_USER_PROFILE.md` (either copied into `LoomFileStore` on launch or read via a known path). Do not duplicate the profile inside the app — keep one source of truth.

## 9. Open Questions / In Flight

- **Edit a single inline note.** Currently the only way to edit is whole-page Markdown edit. A right-click → Edit on a note (popover with body in textarea) would close the loop with Promote / Delete.
- **Sidebar nesting consistency.** Legacy sub-pages render nested; new promoted pages are top-level. Decide: flatten all or keep both?
- **Pages library view.** When you click "Pages" in the sidebar, the library shows root cards. Could become a recent-activity dashboard.
- **Anchor durability.** `loom://anchor?src=...&rect=...` includes a text excerpt for fallback search if rect drifts. Untested at scale (large PDFs, replaced PDFs).
- **Free-form notes (no source).** Currently land in `## Notes`. With per-book grouping as the primary structure, these are second-class. Consider: a top-level page for free notes?
- **AI provider settings reachability.** The user selects provider in Settings. New users on first launch get `disabled` and a confused error. Surface a clearer "AI not configured" path.
- **Figures / images.** Selection-driven capture is text-only. Academic PDFs are full of figures. Worth a rectangular drag → image quote eventually.

---

## 10. How to Maintain This Document

### When to update

Update **this file in the same commit** as the corresponding code change. Specifically:

1. **A hard veto emerges** from user feedback ("never do X"). Add to §3.
2. **A design decision is made** that pivots an architectural shape, UX flow, or user-facing model. Add to §8 with date and rationale.
3. **A feature ships** that changes the reading / capture / promotion model. Update §5.
4. **A visual rule locks in** (typography, spacing, color). Update §7.
5. **An open question is resolved.** Move from §9 to §8.

### How to update

- Don't delete past entries. Mark superseded with strikethrough or a "**Superseded:** ..." note.
- Be specific. Cite file paths and function names where they help (e.g., `SourceFileView.restructure()`).
- Use dates (YYYY-MM-DD) on all decision-log entries.
- Write so a fresh AI assistant with no prior context can ingest the doc and act correctly.

### Tone

This document is **not** marketing copy. It is engineering protocol. State decisions plainly. Prefer "MUST NOT" / "MUST" / "SHOULD" framing. Show tradeoffs honestly.

### When in doubt

If you (the AI assistant) are about to make a design decision that contradicts something here, **stop and ask the product owner**. Do not silently override.

---

*Last meaningful update: 2026-04-30. §8 catchup added 5 entries (2026-04-27 ×2, 2026-04-28, 2026-04-29) covering Phase C plan, source-folder immutability, ingest-bridge, DS v1 spec, and Web Capture extension. Initial version captured decisions through the late-April 2026 reading-flow rewrite.*
