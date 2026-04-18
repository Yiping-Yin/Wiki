# Loom · Current Design Canon

**Status: current, operative design canon**  
**Updated: 2026-04-15**

Loom is an **Epistemic Loom**. It is not a dashboard, not a landing page, and not a chat shell. It is a reading-and-thinking environment where source-bound understanding is woven into memory.

LOOM is not an acronym. It names a time structure:

- **Library** — how the past reaches the present.
- **Eyes** — the living threshold where seeing becomes thought and judgment.
- **Memory** — how the present reaches the future.

Loom is where the world is seen, judged, woven, and stored across time.

---

## 1. Product Definition

- **织者即智者.** The loom holds the tension; the weaver makes the judgment.
- **润物无声.** The system should be felt in its results, not in its self-display.
- **Source is sacred.** The document is the first foreground object.
- **Panels are earned.** A panel is a settled judgment, not a decorative card.
- **Relations are earned.** A weave is a judged relation, not a loose backlink list.
- **Work begins from change.** The scheduler should surface unresolved change, not generic activity.

---

## 2. Surface Taxonomy

Every page belongs to one surface family. Do not force one shell across all of them.

- **Reading / prose-first**
  Source pages, Help. One clear foreground object: the prose.
- **Identity / manifesto**
  About. One clear foreground object: the product's identity grammar and commitments.
- **Work surfaces**
  Home, Today, Review. One clear foreground object: the next action or current judgment.
- **Archive / habitat**
  Patterns, Atlas collection pages. The foreground is the current pattern or collection material, not controls.
- **Relation surface**
  Graph. With focus, the object is foreground and the map recedes. Without focus, the map may dominate.

---

## 3. Attention Contract

Unify **attention**, not width.

- At any moment there should be **one clear foreground object**.
- System chrome must not compete with that object.
- Controls appear when needed and recede when not needed.
- Secondary information should be readable, but never louder than the current object of thought.

For reading surfaces:

- Main prose column should adapt with screen size.
- Large desktop windows should not collapse to a narrow center strip.
- Review rails should remain secondary to the prose.

---

## 4. Desktop Entry Hierarchy

Desktop entry roles are fixed.

- **Sidebar** is the primary navigation layer.
- **Shuttle** is the fast path. It is not a second home page.
- **Home / Observation Deck** is the quiet desktop start surface:
  - current work
  - recent resolved changes
  - recent threads

Do not reintroduce a landing-page hero or a second global navigation layer on Home.

---

## 5. System Layer Boundary

On macOS, the notch / island belongs to the **system layer**, not to the webpage layer.

- Ear regions are for **passive status only**.
- Primary interaction must live **below the safe area**.
- The notch may be used as a visual anchor, but not as the main interaction anchor.
- The web page must remain correct even if the top system layer is absent.

Ordinary window layouts may ignore the notch. Full-screen or custom top-chrome layouts must respect `safeAreaInsets`.

---

## 6. Visual Language

- **Quiet material over scene design.**
- **Glass is support, not spectacle.**
- **Density over decoration.**
- **Stillness over cinematic atmosphere.**
- **Comets are moments, not backgrounds.** Insight may flare, but the page should not become cinematic theater.

Preferred defaults:

- light living-vellum surfaces
- subtle grain and restrained depth
- SF / system-led typography
- thin borders, quiet shadows
- accent only where a thought is advancing

Avoid:

- theatrical backgrounds that dominate the page
- neon HUD behavior
- heavy hero cards pretending to be work surfaces
- dashboard density disguised as productivity

Exception:

- `About` may use a controlled identity treatment, including atmospheric imagery, so long as it remains a dedicated manifesto surface and does not leak that visual language into work or reading surfaces.

---

## 7. Interaction Grammar

- **Shuttle**: move anywhere quickly.
- **Interlace**: capture a source-bound thought.
- **Review**: bring the judgment layer forward.
- **Crystallize**: settle a thought container or a whole pattern.
- **Resolve**: finish the current change, not the object forever.

This grammar should feel 润物无声: the tool exists, the action occurs, and the result is rich, but the user should feel the result more than the system’s self-display.

If the user marked something done, interpret it as:

- **Done for current change**, not “hide this object forever”.

---

## 8. Scheduler Grammar

The scheduler is a workbench, not a scoring system.

- Prioritize unresolved change.
- Let users pin, snooze, hide for today, and mark done.
- Explain `Why now` quietly.
- Let resolved changes be reviewable after the fact.

Avoid rings, streaks, gamified scoreboards, or black-box recommendations.

---

## 9. Implementation Priority

When design decisions conflict, use this order:

1. Protect the foreground object.
2. Preserve source-first reading.
3. Keep system chrome above the page, not inside it.
4. Reduce control-panel density.
5. Only then optimize visual flourish.
