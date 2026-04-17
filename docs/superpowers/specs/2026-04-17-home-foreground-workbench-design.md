# Home Foreground Workbench Design

Status: approved design direction  
Updated: 2026-04-17

## 1. Decision

Loom's `/` page will be redesigned as a **foreground workbench**.

The approved direction is:

- one clearly dominant foreground object
- narrower main column
- single-column desktop composition
- no right-side status panel
- supporting information pushed below the foreground object instead of beside it

This is not a copy of `Today`, `Atlas`, or `Patterns`. It is the desktop start surface, but it should stop behaving like a dashboard summary.

## 2. Problem

The current home page has the right ingredients, but the wrong composition.

Observed issues:

- the page reads like a quiet status panel instead of a decisive start surface
- the right-side `Desk status` block competes with the main surface without adding enough value
- the main column is too wide, so the page feels flatter and less intentional
- too many surfaces carry comparable visual weight
- the page answers "what states exist?" better than "what should I look at now?"

The result is structurally calm but compositionally weak.

## 3. Product Goal

The home page should function as Loom's most legible desktop starting point.

It should answer, in this order:

1. what is the foreground object right now
2. why is it foregrounded
3. what is the next action
4. what supporting context remains nearby if the user wants it

The home page should feel like:

- a workbench
- one object on the desk
- secondary traces nearby, but not fighting for attention

It should not feel like:

- a dashboard
- a split-pane overview
- a collection of equally quiet cards

## 4. Scope

This redesign applies to:

- `app/HomeClient.tsx`
- its immediate top-level page composition
- any home-only supporting presentational structure needed to support the new hierarchy

This redesign may reuse shared shell primitives, but it should not force broader route rewrites in the same pass.

## 5. Non-Goals

This change does not:

- redesign `Today`, `Atlas`, or `Patterns`
- change the sidebar architecture
- change underlying data sources for history, queue, resolved outcomes, panels, or weaves
- rewrite work-session logic
- redesign reading routes

## 6. Chosen Model

### 6.1 Foreground Workbench

The home page becomes a **single-axis page** built around one dominant object.

Structure:

1. intro block
2. foreground object
3. supporting strips / lists below

This replaces the current structure:

1. intro
2. main card
3. side status card
4. lower supporting card

The right column is removed entirely.

### 6.2 Why This Model

This model was chosen because it directly fixes the main failure:

- the page currently has no convincing foreground

Removing the side status block forces the page to commit to one center of attention. Narrowing the column increases pressure and makes the page feel authored instead of laid out by default.

## 7. Layout Contract

### 7.1 Column Width

The home page must be visibly narrower than it is now.

Target behavior:

- the main content reads as a deliberate work column
- the intro and foreground object share the same width
- the page no longer spreads into a broad two-column desk

Recommended target:

- desktop main column in the `~720px` range

This should feel closer to an editorial working column than a dashboard canvas.

### 7.2 Single Column

Desktop layout should become one main vertical axis.

Do not retain:

- a right-side `Desk status` region
- any replacement panel with equivalent weight on the right

The page should breathe horizontally, but only one column should carry meaning.

### 7.3 Vertical Rhythm

The top half of the page should feel like a poster:

- strong intro
- one foreground object
- generous but controlled whitespace

Only after that should the supporting information begin.

The lower supporting area can be denser, but it must remain subordinate.

## 8. Information Hierarchy

### 8.1 Intro Block

The intro block should establish:

- the room name
- the page thesis
- one short stance sentence

It should not behave like a summary dashboard header.

### 8.2 Foreground Object

The foreground object is the page's reason to exist.

If a focus target exists:

- it becomes the dominant object
- why-now context stays attached to it
- actions remain tightly scoped

If no focus target exists:

- the quiet empty state becomes the dominant object
- it still behaves like a foreground object, not a utility card

The foreground object may still use a surface treatment, but it must be the only major surface near the top of the page.

### 8.3 Supporting Layer

Supporting information moves below the foreground object.

It may include:

- recent threads
- resolved outcomes
- queue state

These should be presented as:

- lighter sections
- narrower rows
- supporting lists

not:

- peer hero cards
- side-by-side summary panels

## 9. Component Direction

### 9.1 Remove `DeskStatusCard`

The current `DeskStatusCard` should be removed from the home page.

Its content is too abstract for prime homepage real estate.

If any of its information remains useful, it should be absorbed into:

- a lower, lighter supporting strip
- metadata attached to the foreground object
- or omitted entirely

### 9.2 Keep the Foreground Object Tight

The foreground object should keep:

- title
- summary / reason
- why-now context
- at most two strong actions plus one secondary escape hatch

It should not become a control panel.

### 9.3 Supporting Sections

Supporting sections should become:

- compact stacked lists by default
- single-line rows where the content is summary-like
- subtle section bands only when separation is needed

The visual language should be calmer and flatter than the current card stack.

## 10. Copy Direction

Homepage copy should become more direct.

The title and stance should emphasize:

- one next object
- one next move
- no theater

Avoid:

- deck metaphors that over-explain the page
- summary language that sounds like a dashboard
- multiple sections all restating the same quietness idea

## 11. Interaction Model

The homepage should answer:

- what is the one thing here
- do I open it, defer it, or jump elsewhere

It should not ask the user to compare parallel panels.

Shuttle and Atlas may remain available, but they should read as exits from the foreground workbench, not as equal homepage destinations.

## 12. Visual Direction

The page should keep Loom's current restrained shell language:

- neutral background
- quiet atmospheric support
- strong typography
- minimal chrome

But compared to the current version, it should become:

- narrower
- more committed
- less panelized
- more obviously centered around one object

This is not a maximal redesign. It is a compositional correction.

## 13. Success Criteria

The redesign is successful if:

- the home page no longer reads as a status dashboard
- there is one obvious foreground object
- the right-side `Desk status` is gone
- the page width feels intentionally narrow
- the intro and main object align to one shared column
- supporting information reads as supporting, not competing

## 14. Validation Plan

Validate with screenshots for:

- desktop home with a focus target
- desktop home without a focus target
- mobile home

Specifically check:

- the page remains legible without the side status card
- the foreground object is visually dominant
- the lower sections do not climb back into equal emphasis
- the main column feels clearly narrower than the current homepage
