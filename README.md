# Loom

**Think on the Loom. Live in your Patterns.**

---

## What this is

Loom is a thinking tool. Not a note app, not a chat app, not an AI assistant — a **loom**: a tool that turns loose threads of thought into woven fabric.

In the AI era, two things matter that no chat tool gives you at the same time: **speed** (your brain never stops, ideas leap, you talk to AI continuously) and **permanence** (the trail of that thinking doesn't disappear when you close the tab). Loom gives you both.

## Dev Flow

- `npm run knowledge:refresh` rebuilds the local knowledge caches under `knowledge/.cache/` and prunes old generated files from `public/`.
- `npm run verify` runs typecheck, production build, and smoke checks in the correct order.
- `npm run app`, `npm run app:user`, and `npm run app:system` build and install the macOS shell.
- `npm run app:where` prints the currently installed Loom.app location.
- GitHub Actions runs `build -> typecheck -> smoke` and intentionally skips the chat-specific smoke path.
- Generated knowledge bodies, manifests, and derived indexes now live in `knowledge/.cache/` rather than tracked `public/` or `lib/` files.
- [docs/README.md](/Users/yinyiping/Desktop/Wiki/docs/README.md) indexes current design and process docs.
- [DESIGN_ONBOARDING.md](/Users/yinyiping/Desktop/Wiki/docs/design/DESIGN_ONBOARDING.md) is the fastest collaborator-facing intro to the current product/design model.
- [CURRENT_DESIGN_CANON.md](/Users/yinyiping/Desktop/Wiki/docs/design/CURRENT_DESIGN_CANON.md) is the shortest current product/design source of truth; use it before historical specs.

## Current surfaces

- `/` — Home. A single foreground workbench showing the next quiet move.
- `/today` — the daily desk for returns, review, and active threads.
- `/knowledge` — Atlas. Collection-level entry point into the library.
- `/patterns` — the archive of crystallized panels and settled relations.
- `/wiki/*`, `/knowledge/<category>/<doc>`, `/uploads/*` — reading surfaces where capture, rehearsal, and examiner flows happen.

---

## Why it's called Loom

Not because the interface draws warp and weft. Because the product **does what a loom does**.

A kesi weaver sits before a loom. The loom holds the tension, aligns the threads, structures the fabric. The weaver's job is to choose where to place color and when to break the weft. The loom absorbs the organizational burden; the weaver focuses on intent.

A Loom user sits before a document. The AI organizes the answer, anchors it to the right passage, connects it to prior thoughts. The user's job is to choose what to ask and when to commit. Loom absorbs the organizational burden; the thinker focuses on intent.

```
Freehand painting  :  Kesi weaving    =  Handwriting  :  Loom

The tool absorbs organization.
The human keeps intent.
```

Every action in Loom is a physical act of kesi:

| You do this | A weaver does this |
|---|---|
| Open a document | Sit before the loom |
| Read the source | Study the pattern |
| Select a passage and ask AI | Pass the shuttle through the warp |
| AI organizes the answer | The loom aligns the thread |
| Commit a thought-anchor | One color block is finished |
| See your thought map | Step back to see the emerging fabric |
| Crystallize | The panel joins the kesi |

---

## Five irreducible principles

### 1. Loom is a loom

The product does not reference kesi. The product IS kesi, performed on thought instead of thread. The weaver's workflow is the thinker's workflow.

### 2. Silent spring rain

The Chinese poet Du Fu: *moisten things silently, imperceptibly*. The tool exists, the work happens, the result is rich — but the user only notices the result. Not the tool arriving, not the AI working, not the interface changing.

### 3. The source is sacred

The document is never modified, never interrupted, never broken. Notes exist as tiny marks in the margin, visible only when you look for them. Three layers of progressive visibility: zero (reading) → dots (awareness) → hover (peeking) → full map (studying).

### 4. Faster and cleaner than handwriting

Not a replacement for pen and paper — structurally better output in less time. If any action takes more steps than handwriting, the design is wrong. If AI output is less structured than handwritten notes, the prompt is wrong.

### 5. The thought map is the pattern

A kesi weaver's mind holds the entire pattern before the first thread is laid. Loom's thought map is that mental pattern made visible: which sections you've understood, which are still blank, how your thinking maps to the source. Without it, Loom is just a chat tool. With it, Loom is a loom.

---

## How it works

**Reading** — open any document. The prose stays centered and stable. Source structure is quiet reference, not competing chrome.

**Asking** — select a passage, click the accent thread that appears. The document focuses on that passage; you discuss it with AI. Fast, local, passage-bound.

**Anchoring** — when you're done discussing, commit. One `◆` appears next to that passage. One passage, one anchored note.

**Reviewing** — hover any `◆` to peek. Press `Cmd+/` to enter review mode: the source recedes, a centered glass **Live Note** becomes the main object of attention, and a companion **thought map** appears beside it.

**Crystallizing** — when a document's thought map is complete, crystallize it. The panel — your structured understanding of that document — enters your Patterns archive.

**Living in your patterns** — open `/patterns` to see every panel you've ever woven. Each one is a complete piece of thinking, permanently linked to its source. Atlas at `/knowledge` stays collection-shaped; Patterns at `/patterns` stays work-shaped.

---

## The technique: 通经断纬

The Chinese silk-tapestry craft *kesi* has one defining technique: **continuous warp, broken weft**. The warp runs through the entire fabric unbroken — your sustained library of sources. The weft moves only within one color block — each thought has a clean boundary, never bleeding into the next.

ChatGPT is continuous warp, continuous weft — everything blurs into one infinite scroll. Nothing has shape. Loom is continuous warp, broken weft — each thought has its own panel, each panel keeps its color, the picture emerges only as panels join.

It is the discreteness that lets the picture be seen.

---

## What this is not

- **Not a note app.** Notes are dead text. Thought-anchors are living structures linked to sources.
- **Not a chat app.** Chats are linear and disposable. Loom anchors understanding to source.
- **Not a wiki.** Wikis are read by everyone. Your pattern archive is woven by you.
- **Not an AI assistant.** AI is the second weaver, never the first.
- **Not a productivity tool.** Loom doesn't help you do more. It helps you understand more.

---

> *Think on the Loom. Live in your Patterns.*

---

License: Personal project. All rights reserved by the author.
