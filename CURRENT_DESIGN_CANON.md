# Loom · Current Design Canon

Status: current, operative design canon  
Updated: 2026-04-13

This file is the shortest reliable answer to:

- What Loom is
- What interaction model is currently valid
- Which older design directions are historical only

Use this file for day-to-day product decisions.  
Use `DESIGN_MEMORY.md` for the long constitution and rationale.  
Use `CAPTURE_SPEC.md` for the capture/review pivot details.  
Treat `CANVAS_SPEC.md` as historical only.

## 1. Product Identity

Loom is not a generic note app, chat app, or wiki.

Loom is a **loom** for thought:

- Source documents are the warp
- Individual thoughts are the weft
- The user reads, selects, asks, captures, elaborates, and crystallizes
- `/kesi` is the accumulated fabric of understanding

If a design decision makes Loom feel like a floating AI chat tool or a generic PKM dashboard, the decision is wrong.

## 2. The Five Active Rules

These are the current top-level filters.

1. **Loom is a loom**
   Every action should map to reading, passing the shuttle, committing a block, or viewing the pattern.

2. **润物细无声**
   The user should feel the result, not the mechanism. No celebratory chrome, no noisy state reporting, no constant prompts.

3. **The source is sacred**
   The document remains primary. Notes never invade the source body as permanent inline clutter.

4. **Faster and cleaner than handwriting**
   Capture must be low-friction. AI output must improve structure, not add ceremony.

5. **Thought Map is the pattern**
   The thought structure is not secondary metadata. It is the core product surface.

## 3. Current Interaction Model

The active interaction model is:

1. Read the source
2. Select text
3. Do one of three things:
   - Click the warp thread to ask AI
   - `Cmd`-click or `Cmd+Shift+A` to capture a thought-anchor with quote-only
   - `Option`-click to highlight
4. Review thoughts in the right-side map
5. Expand the map with `Cmd+/` to elaborate captured thoughts
6. Crystallize completed understanding into `/kesi`

This means:

- **Capture-first** is the active model
- **Wide ReviewThoughtMap** is the active elaboration surface
- **Canvas as a free 2D workspace is not current product direction**

## 4. Valid Surfaces

These are the intended surfaces now:

- **Source document**
  Primary reading surface

- **SelectionWarp**
  Contextual ask/capture/highlight entrypoint

- **Anchor dots in the gutter**
  Minimal signal that thought exists at a source location

- **ReviewThoughtMap**
  Narrow state: peripheral structure
  Wide state: writable thought elaboration surface

- **Live artifact**
  The evolving, structured note for the current document

- **/kesi**
  The long-term woven output

## 5. Invalid or Historical Surfaces

These should not be reintroduced casually:

- Persistent AI sidebar or always-open chat panel
- Free-floating canvas workspace as the main thinking surface
- Always-visible ambient controls competing with the source
- Gamified or dashboard-like knowledge surfaces
- Loud "AI is thinking", "saved", "indexed", or "synced" UI

`CANVAS_SPEC.md` documents a rejected direction, not a pending one.

## 6. Visual Language

The visual language should continue to be:

- Apple-native feeling rather than browser-native
- Glass/material surfaces over flat boxed UI
- SF/system typography
- Quiet chrome, generous negative space
- Accent only where intent is focused
- Source-first layouts

What this means in practice:

- Prefer glass / material surfaces for containers that need a background
- Prefer dimming/receding the source over replacing it abruptly
- Avoid persistent toolbars, badges, chips, and status clutter
- Prefer subtle transitions over obvious modal choreography

## 7. AI Behavior

AI should feel like a silent collaborator, not a performer.

Required:

- Start with content, not preamble
- End when the answer ends
- Use markdown when useful
- Stay concise and structured

Forbidden:

- "Great question", "Sure", "Let me think"
- self-narration
- wrap-up fluff
- permission-seeking after every answer
- visible "assistant presence" when not summoned

## 8. Branding

Branding should remain literal and restrained:

- Loom mark = warp threads
- The absence of weft is intentional
- Brand should support the weaving model, not compete with the reading surface

Inside the product, brand should be quiet. The work surface is not a marketing surface.

## 9. Current Decision Table

Use this table when deciding between alternatives.

- If a choice increases focus and lowers ceremony: prefer it
- If a choice preserves source primacy: prefer it
- If a choice improves capture speed: prefer it
- If a choice makes the map more legible as a pattern: prefer it
- If a choice adds visible system presence without user intent: reject it
- If a choice revives canvas-first thinking: reject it unless the canon changes

## 10. What Still Needs Work

The current design is coherent, but not fully systematized.

Open design work:

- Reduce residual global-system feel in root layout overlays
- Keep interaction density low as more learning tools are added
- Continue collapsing historical naming and component residue
- Avoid reintroducing tracked generated artifacts into the product surface

## 11. Source of Truth Order

When documents disagree, use this precedence:

1. `CURRENT_DESIGN_CANON.md`
2. `CAPTURE_SPEC.md`
3. `DESIGN_MEMORY.md`
4. implementation
5. historical specs (`CANVAS_SPEC.md`)
