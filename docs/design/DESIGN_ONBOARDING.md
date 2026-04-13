# Loom · Design Onboarding

Read this first if you are changing UI, interaction, or AI behavior.

## 1. What Loom is

Loom is a **loom for thought**, not:

- a generic chat app
- a generic note app
- a generic PKM dashboard
- a canvas-first whiteboard

Source documents are the warp.  
Thoughts are the weft.  
The product should always reinforce that structure.

## 2. The Fast Test

Before shipping any design change, ask:

1. Does this keep the source primary?
2. Does this reduce or increase visible system presence?
3. Does this make capture faster or slower?
4. Does this strengthen the thought map as the core pattern?
5. Does this accidentally make Loom feel like a normal AI chat tool?

If the answer to 2 or 5 is bad, stop.

## 3. Current Interaction Model

This is the current valid model:

1. Read the source
2. Select text
3. Ask / capture / highlight from the selection
4. Review in the right-side thought map
5. Expand with `Cmd+/` to elaborate
6. Crystallize into `/kesi`

Important:

- `Cmd`-click or `Cmd+Shift+A` captures
- click asks AI
- `Option`-click highlights
- wide `ReviewThoughtMap` is the active elaboration surface
- free-form canvas is not the current direction

## 4. Design Rules You Should Not Break

- The source document must stay visually dominant.
- Notes should not permanently clutter the source body.
- AI should feel summoned, not ever-present.
- The interface should feel Apple-native and quiet.
- Default state of chrome should be absence.
- The result should feel better than handwriting, not more ceremonial.

## 5. Visual Rules

- Prefer glass/material over flat boxed panels.
- Prefer subtle dim/recede transitions over hard mode switches.
- Use accent sparingly and intentionally.
- Avoid dashboards, badges, pills, and constant tool presence.
- Branding should stay quiet inside the work surface.

## 6. AI Rules

AI output should:

- start with content
- end without fluff
- avoid self-narration
- avoid “great question”, “let me think”, “hope this helps”
- use markdown only when it improves clarity

If the AI sounds like a chatbot, the prompt is wrong.

## 7. If You See These, Be Suspicious

- always-open AI panels
- floating assistant buttons
- new permanent toolbars
- canvas-first flows
- save/sync/indexing status chrome
- modal-heavy note creation
- decorative UI that competes with reading

## 8. Source of Truth

Read in this order:

1. `docs/design/DESIGN_ONBOARDING.md`
2. `docs/design/CURRENT_DESIGN_CANON.md`
3. `docs/design/CAPTURE_SPEC.md`
4. `docs/design/DESIGN_MEMORY.md`

Treat `docs/design/CANVAS_SPEC.md` as historical only.

## 9. Pre-Merge Checklist

Before merging a UI change:

- check the source page still feels calm
- check capture still takes under 2 steps
- check `Cmd+/` behavior still matches the review model
- check AI copy is still silent and direct
- check the page does not introduce unnecessary always-visible chrome
