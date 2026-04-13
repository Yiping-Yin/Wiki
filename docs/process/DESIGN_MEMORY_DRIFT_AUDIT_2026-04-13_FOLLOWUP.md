# Design Memory Drift Audit Follow-up · 2026-04-13

Status: remediation follow-up
Supersedes for implementation status:

- `docs/process/DESIGN_MEMORY_DRIFT_AUDIT_2026-04-13.md`

## Summary

This follow-up records the implementation work completed immediately after the
baseline audit.

## Addressed findings

### 1. First-visit instructional chrome removed from reading pages

Status:

- fixed

Evidence:

- `components/PageScopedChrome.tsx` no longer mounts `FirstTimeHint`
- `components/FirstTimeHint.tsx` removed

Design effect:

- reading pages no longer auto-inject a first-visit bottom tutorial bar
- the default reading surface is quieter and closer to `default chrome =
  absence`

### 2. Narrow thought map no longer behaves like a permanent right sidebar

Status:

- partially fixed

Evidence:

- `components/ReviewThoughtMap.tsx` now computes `introVisibility` from reading
  depth
- narrow mode renders only while near the top of the source document, then
  fades out as reading continues
- wide review mode still restores full presence on explicit user intent

Design effect:

- the narrow rail now behaves more like an intro/review affordance than a
  fully permanent right-side structure

Residual question:

- the exact fade window (`96 -> 760px`) is implementation-tuned and may still
  need refinement after real usage

### 3. Product-shell branding and help copy tightened

Status:

- fixed / reduced

Evidence:

- `/about` no longer opens with a `Loom` hero title + slogan pair
- `/about` no longer closes with a decorative slogan line
- `/help` no longer claims the thought map is always visible on the right
- `/help` no longer contains the broken `any reading page` link
- `/help` no longer ends with a decorative brand footer line

Design effect:

- `/about` reads more like prose-first design documentation and less like a
  branded hero surface
- `/help` is now closer to the current interaction model and carries less
  decorative brand presence

### 4. Generic loading copy reduced on user-facing overlays

Status:

- fixed / reduced

Evidence:

- `components/ExaminerOverlay.tsx` no longer renders literal `Loading…`
- `components/PyodideRunner.tsx` no longer writes `Loading Python runtime…`
  or swaps the primary action label to `Running…`

Design effect:

- examiner loading now uses a quiet shuttle indicator
- Pyodide execution now keeps the action label stable and uses a quieter
  in-header shuttle instead of generic loading copy

### 5. Decorative product-surface symbols reduced further

Status:

- fixed / reduced

Evidence:

- `components/SearchBox.tsx` no longer prefixes the primary search button with
  a decorative magnifier emoji
- `app/offline/page.tsx` no longer opens the offline empty state with a
  decorative `✦`

Design effect:

- primary navigation/search chrome is less ornamental
- the offline state now relies on copy and material treatment rather than a
  symbolic flourish

### 6. Callout styling no longer depends on decorative emoji

Status:

- fixed / reduced

Evidence:

- `components/Callout.tsx` now uses quiet uppercase labels (`Info`,
  `Warning`, `Note`) instead of emoji markers

Design effect:

- user-facing knowledge pages keep the informational hierarchy of callouts
  without importing decorative emoji into the reading surface

### 7. Remaining decorative symbols reduced on utility surfaces

Status:

- fixed / reduced

Evidence:

- `components/DropZone.tsx` no longer uses emoji state markers for drop /
  uploading / error
- `components/Mermaid.tsx` no longer prefixes render-failure copy with a
  warning emoji
- `components/PyodideRunner.tsx` no longer prefixes the runner title with a
  snake emoji

Design effect:

- utility and fallback surfaces rely more on tone, typography, and motion than
  on decorative symbolic markers

### 8. Toast labels aligned with quieter utility grammar

Status:

- fixed / reduced

Evidence:

- `components/Toast.tsx` now uses text labels (`OK`, `Info`, `Warn`,
  `Error`) instead of symbolic markers

Design effect:

- the remaining dev/debug toast surface is visually closer to Loom's quieter
  text grammar and less dependent on icon signaling

### 9. Service-worker update chrome removed from the product shell

Status:

- fixed / reduced

Evidence:

- `components/SWRegister.tsx` no longer renders a fixed bottom update toast,
  reload CTA, or dismiss control
- service-worker registration is now silent

Design effect:

- background update work no longer announces itself through product-surface
  status chrome
- new service-worker versions are picked up on the next full navigation /
  reload rather than interrupting the current session

### 10. Examiner CTA and loading states quieted

Status:

- fixed / reduced

Evidence:

- `components/unified/AIExaminer.tsx` no longer uses arrow-style CTA labels
- generating / grading states now use `WeftShuttle` without explicit loading
  copy
- verdict labels now use plain `Pass` / `Retry`

Design effect:

- the examiner surface reads more like a Loom-native tool and less like a
  generic assistant workflow
- transient AI work is signaled more by motion than by narrated state text

## Remaining drift

### Global toast primitive

Status:

- fixed for product shell

Evidence:

- `app/layout.tsx` no longer mounts `ToastHost`
- `app/dev/traces/page.tsx` mounts `ToastHost` locally on the debug surface
- `components/Toast.tsx` usage examples no longer normalize saved/synced
  product toasts

Design effect:

- the toast system is no longer a root-level product primitive
- toast feedback is now scoped to an explicit dev/debug surface rather than
  being available by default across the user-facing product shell

Residual note:

- if future product-facing surfaces request toast feedback, the change should
  be reviewed against the forbidden list rather than reusing the root-shell
  pattern

## Verification

- `npm run typecheck` passed
- `npm run smoke` passed

## Current status

- reading-surface drift reduced
- root-shell toast drift removed
- `/about` and `/help` copy brought closer to current canon
- user-facing generic loading copy reduced further
- decorative product-surface symbols reduced further
- callout styling brought closer to Loom's quieter text grammar
- utility-surface decorative markers reduced further
- toast labels aligned with quieter utility grammar
- service-worker update chrome removed from the product shell
- examiner CTA and loading states quieted
- no mother-document changes required
- remaining work, if any, is calibration-level rather than contradiction-level
