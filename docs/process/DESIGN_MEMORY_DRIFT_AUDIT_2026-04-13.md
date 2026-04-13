# Design Memory Drift Audit · 2026-04-13

Status: baseline audit
Auditor: Codex
Scope: reading surfaces, global chrome, AI behavior scaffolding, about/help prose
Branch / commit context: local working tree on `main`

Related docs reviewed:

- `docs/design/DESIGN_MEMORY.md`
- `docs/design/CURRENT_DESIGN_CANON.md`
- `docs/design/CAPTURE_SPEC.md`
- `docs/design/DESIGN_ONBOARDING.md`

## 1. Mother document alignment

The overall product direction still aligns with the mother document:

- source-bound thinking remains the core loop
- the AI system prompt is centralized and explicitly encodes the silent-AI
  rules
- review / thought-map vocabulary is consistently used across docs and product

But there are two implementation-level contradictions on live reading surfaces:

1. a first-visit instructional hint is still mounted as fixed chrome
2. the narrow thought map currently behaves like an always-present right
   sidebar rather than an intro/review affordance that fades with reading depth

## 2. Aligned areas

### A. AI output contract is correctly centralized

Evidence:

- `lib/ai/system-prompt.ts`

Why it matters:

- This matches `DESIGN_MEMORY` §2 by enforcing no preambles, no recap, no
  self-narration, and no permission-seeking from a single source of truth.

### B. Loading treatment is partially aligned

Evidence:

- `components/DocViewer.tsx`

Why it matters:

- The document viewer uses a kesi-native shuttle indicator rather than a
  spinner, which is directionally aligned with §21's ban on generic loading
  theater.

## 3. Drift findings

### Finding 1 · First-visit instructional chrome reintroduces onboarding UI

- Principle(s): §1, §10, §26
- Surface / file: `components/FirstTimeHint.tsx`
- Severity: high

Evidence:

- The component is explicitly a first-visit bottom bar tutorial:
  `components/FirstTimeHint.tsx:3-9`
- It auto-appears on reading pages after a delay:
  `components/FirstTimeHint.tsx:24-39`
- It renders fixed bottom-center instructional chrome with command hints:
  `components/FirstTimeHint.tsx:50-76`
- It is mounted on every reading page through `PageScopedChrome`:
  `components/PageScopedChrome.tsx:29-34`

Why this drifts:

- `DESIGN_MEMORY` forbids greeting/onboarding-style guidance and insists that
  default chrome should be absence.
- Even though the hint is subtle, it is still a first-visit tutorial surface
  injected into the reading field. That is product-visible system presence,
  not source-first quietness.

Recommended correction:

- Remove the fixed first-visit hint from the reading surface.
- If onboarding guidance is still necessary, move it into an explicit help
  surface, command-palette affordance, or one-time non-blocking doc external
  to the source-reading moment.

### Finding 2 · Narrow thought map is currently implemented as a permanent right sidebar

- Principle(s): §38 thought-map geometry lock-in, current canon §3 / §4
- Surface / file: `components/ReviewThoughtMap.tsx`
- Severity: high

Evidence:

- The component comment states that the narrow state is "always-present
  peripheral surface":
  `components/ReviewThoughtMap.tsx:15-23`
- `shouldRender` is set to every reading page, not to a depth-sensitive or
  intro/review-specific condition:
  `components/ReviewThoughtMap.tsx:71-80`
- The aside is fixed-positioned as a right rail in narrow mode:
  `components/ReviewThoughtMap.tsx:218-237`

Why this drifts:

- `DESIGN_MEMORY` explicitly says the thought map is **not** a permanent right
  sidebar. It should appear as an intro/review affordance, fade as the user
  reads deeper, and return as primary structure in review mode.
- The current implementation hardens it into a constant fixed rail whenever a
  document has captures, which is a stronger and noisier geometry than the
  mother document allows.

Recommended correction:

- Introduce scroll-depth or reading-phase logic for narrow-state visibility.
- Keep wide review mode as the primary persistent deep-review surface.
- Re-evaluate whether the narrow state should be an initial / near-top rail
  rather than a full-time fixed aside.

### Finding 3 · A global toast primitive remains available in the root product shell

- Principle(s): §1, §21, forbidden list
- Surface / file: `app/layout.tsx`, `components/Toast.tsx`
- Severity: medium

Evidence:

- The root layout mounts `ToastHost` globally:
  `app/layout.tsx:11`, `app/layout.tsx:75`
- The toast utility advertises `toast('✓ Saved')` and generic fire-and-forget
  usage:
  `components/Toast.tsx:3-13`, `components/Toast.tsx:22-28`

Why this drifts:

- The forbidden list explicitly bans saved/synced completion toasts.
- Even if current usage is mostly outside the main user journey, keeping a
  polished global toast primitive in the root shell weakens the guardrail and
  makes forbidden UI easy to reintroduce.

Recommended correction:

- Either demote the toast system to dev-only tooling surfaces, or replace it
  with quieter surface-local status treatments where truly needed.
- At minimum, remove examples and semantics that normalize saved/synced toasts
  as valid product behavior.

## 4. Surfaces reviewed but not flagged as drift

### A. `/about`

Current judgment:

- mostly aligned

Reason:

- It is prose-first, not hero-card marketing
- the icon specimens are presented as content, not chrome

Note:

- This page should continue to be watched because it sits close to the line
  between product explanation and brand-display surface.

### B. `/help`

Current judgment:

- acceptable with caution

Reason:

- It is an explicit help page, so instructional prose is allowed there
- no immediate evidence of brand-chrome violations

Note:

- It should not become the place where forbidden reading-surface behaviors get
  rationalized into permanent onboarding patterns.

## 5. Required follow-ups

- Memory updates needed:
  no mother-document update required from this audit alone

- Canon updates needed:
  no canon wording change required yet; implementation should move toward the
  existing canon

- Spec updates needed:
  maybe, if the thought-map visibility model is clarified further during the
  fix

- Product changes needed:
  yes

- Review checklist changes needed:
  no immediate changes needed; current checklist already covers the observed
  drifts

## 6. Outcome

- Overall status: minor drift
- Highest-priority correction:
  remove the first-visit instructional chrome and bring narrow thought-map
  behavior back into line with the review/introduction model
- Owner review required: yes
