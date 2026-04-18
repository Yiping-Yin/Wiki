# Home Foreground Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/` page as a single-column foreground workbench with a narrower main column, one dominant foreground object, and lighter supporting sections below it.

**Architecture:** Keep the existing home data logic in `HomeClient`, but move the top-level composition onto the shared quiet-scene shell and extract home-only presentation into a focused helper file. Add one home-specific width token and workbench classes in `app/globals.css`, remove the right-side `DeskStatusCard`, and replace the wide card dashboard with a poster-like intro plus one dominant surface and a stacked support layer.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, global CSS, `node:test` via `tsx`

---

## File Map

- Modify: `app/HomeClient.tsx`
  Home route orchestration. Keep the data selection logic (`history`, `learning targets`, `resolved outcomes`, queue) but replace the two-column dashboard composition with the single-column workbench shell.

- Create: `components/home/HomeWorkbenchSections.tsx`
  Home-only presentation helpers for the foreground surface and the supporting stacked sections. This keeps `HomeClient` from continuing to mix routing/state logic with a large amount of inline layout.

- Modify: `components/QuietScene.tsx`
  Extend the shared quiet-scene wrapper to support a `home` tone so the homepage uses the same page-integrated shell language as `Today / Atlas / Patterns`.

- Modify: `app/globals.css`
  Add the narrower home workbench width token and home-specific intro/support classes. Keep the page-neutral background approach already established for the quiet pages.

- Create: `tests/home-foreground-workbench.test.tsx`
  Source-level regression tests that lock the home page into the new contract: shared quiet scene, shared quiet intro, no side status panel, and home-specific narrow workbench classes.

---

### Task 1: Lock the Home Workbench Contract with Failing Tests

**Files:**
- Create: `tests/home-foreground-workbench.test.tsx`
- Test: `app/HomeClient.tsx`
- Test: `components/QuietScene.tsx`
- Test: `app/globals.css`

- [ ] **Step 1: Write the failing test file**

```tsx
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('HomeClient uses the shared quiet intro and removes the side status panel', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'app/HomeClient.tsx'), 'utf8');

  assert.match(source, /QuietScene/);
  assert.match(source, /QuietSceneIntro/);
  assert.doesNotMatch(source, /DeskStatusCard/);
  assert.doesNotMatch(source, /gridTemplateColumns:\s*compact \?/);
});

test('quiet scene supports a home tone and dedicated workbench width classes', () => {
  const quietSceneSource = fs.readFileSync(path.join(repoRoot, 'components/QuietScene.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');

  assert.match(quietSceneSource, /type QuietSceneTone = 'home'/);
  assert.match(css, /--home-workbench-width/);
  assert.match(css, /\.loom-home-workbench__column\b/);
  assert.match(css, /\.loom-home-support-stack\b/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --import tsx --test tests/home-foreground-workbench.test.tsx
```

Expected: `FAIL` because the current home page still imports `QuietGuideCard`, still renders the right-side `DeskStatusCard`, and `QuietScene` does not yet support a `home` tone or the new home workbench CSS classes.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/home-foreground-workbench.test.tsx
git commit -m "test: lock home foreground workbench contract"
```

### Task 2: Add the Shared Home Workbench Primitives

**Files:**
- Create: `components/home/HomeWorkbenchSections.tsx`
- Modify: `components/QuietScene.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Create the home-only presentation helpers**

```tsx
'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { QuietGuideCard } from '../QuietGuideCard';
import { WorkEyebrow, WorkSurface } from '../WorkSurface';
import type { WorkSessionOutcome } from '../../lib/work-session';

export type HomeResumeItem = {
  id: string;
  title: string;
  href: string;
  viewedAt: number;
  category: string;
};

export function HomeForegroundObject({
  eyebrow,
  title,
  meta,
  summary,
  detail,
  actions,
}: {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  summary: ReactNode;
  detail?: ReactNode;
  actions: Array<{ label: string; href?: string; onClick?: () => void; primary?: boolean }>;
}) {
  return (
    <QuietGuideCard
      eyebrow={eyebrow}
      title={title}
      tone="primary"
      density="roomy"
      meta={meta}
      summary={summary}
      detail={detail}
      actions={actions}
    />
  );
}

export function HomeSupportSection({
  eyebrow,
  title,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="loom-home-support-section">
      <div className="loom-home-support-section__header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <WorkEyebrow subtle>{eyebrow}</WorkEyebrow>
          <div className="loom-home-support-section__title">{title}</div>
        </div>
        {aside ? <div className="t-caption2" style={{ color: 'var(--muted)' }}>{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function HomeRecentThreadsList({ items }: { items: HomeResumeItem[] }) {
  return (
    <div className="loom-home-support-list">
      {items.map((item) => (
        <Link key={item.id} href={item.href} className="loom-home-support-row">
          <span className="loom-home-support-row__title">{item.title}</span>
          <span className="loom-home-support-row__meta">{item.category || 'Recent source'}</span>
        </Link>
      ))}
    </div>
  );
}

export function HomeResolvedList({ items }: { items: WorkSessionOutcome[] }) {
  return (
    <div className="loom-home-support-list">
      {items.map((item) => (
        <div key={`${item.targetId}:${item.handledAt}`} className="loom-home-support-row">
          <span className="loom-home-support-row__title">{item.targetSnapshot.title}</span>
          <span className="loom-home-support-row__meta">{item.resolvedLabel}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Extend `QuietScene` to support the home tone**

```tsx
type QuietSceneTone = 'home' | 'today' | 'atlas' | 'patterns';
```

- [ ] **Step 3: Add the home workbench CSS contract**

```css
:root {
  --home-workbench-width: min(720px, calc(100vw - 180px));
}

.loom-home-workbench__column {
  width: min(100%, var(--home-workbench-width));
}

.loom-home-support-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.loom-home-support-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.loom-home-support-section__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.loom-home-support-section__title {
  color: var(--fg);
  font-family: var(--display);
  font-size: 1.02rem;
  font-weight: 580;
  letter-spacing: -0.018em;
}

.loom-home-support-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loom-home-support-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0.92rem 0;
  text-decoration: none;
  border-bottom: 0.5px solid color-mix(in srgb, var(--mat-border) 84%, transparent);
}

.loom-home-support-row__title {
  color: var(--fg);
  font-family: var(--display);
  font-size: 0.96rem;
  font-weight: 560;
  letter-spacing: -0.014em;
}

.loom-home-support-row__meta {
  color: var(--muted);
  font-size: 0.75rem;
  letter-spacing: 0.03em;
}
```

- [ ] **Step 4: Run the home test again**

Run:

```bash
node --import tsx --test tests/home-foreground-workbench.test.tsx
```

Expected: the `QuietScene` tone and CSS token assertions pass, while the `HomeClient` composition assertions still fail because the route has not been rewritten yet.

- [ ] **Step 5: Commit the primitives**

```bash
git add components/QuietScene.tsx components/home/HomeWorkbenchSections.tsx app/globals.css
git commit -m "feat: add home workbench primitives"
```

### Task 3: Rebuild `HomeClient` as a Single-Column Foreground Workbench

**Files:**
- Modify: `app/HomeClient.tsx`
- Use: `components/home/HomeWorkbenchSections.tsx`
- Use: `components/QuietScene.tsx`
- Use: `components/QuietSceneIntro.tsx`

- [ ] **Step 1: Replace the wide shell header with the shared workbench intro**

```tsx
import { QuietScene, QuietSceneColumn } from '../components/QuietScene';
import { QuietSceneIntro } from '../components/QuietSceneIntro';
import {
  HomeForegroundObject,
  HomeRecentThreadsList,
  HomeResolvedList,
  HomeSupportSection,
} from '../components/home/HomeWorkbenchSections';
```

Then replace the top-level render frame:

```tsx
return (
  <StageShell
    variant="working"
    contentVariant="working"
    innerStyle={{ minHeight: '100vh', paddingTop: '4.9rem', paddingBottom: '2.4rem' }}
  >
    <QuietScene tone="home">
      <QuietSceneColumn className="loom-home-workbench__column">
        <QuietSceneIntro
          eyebrow="Observation deck"
          title="One foreground object. The rest stays quiet."
          summary="Sidebar holds the Atlas. Shuttle moves anywhere. This desk keeps the next quiet move legible."
        />
      </QuietSceneColumn>
    </QuietScene>
  </StageShell>
);
```

- [ ] **Step 2: Replace the old two-column dashboard with one dominant foreground object**

Delete:

```tsx
<div
  style={{
    display: 'grid',
    gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'minmax(0, 1.34fr) minmax(280px, 0.82fr)',
    gap: 16,
    alignItems: 'start',
  }}
>
  <QuietGuideCard ... />
  <div ...>
    <DeskStatusCard ... />
    ...
  </div>
</div>
```

Replace with:

```tsx
<QuietSceneColumn className="loom-home-workbench__column">
  <HomeForegroundObject
    eyebrow={focusTarget ? 'Current return' : 'Quiet surface'}
    title={focusTarget ? focusTarget.title : 'Nothing urgent is asking for attention.'}
    meta={<span>{guideMeta}</span>}
    summary={
      focusTarget
        ? focusTarget.preview || focusTarget.reason
        : 'Open the Shuttle to move anywhere, or enter the Atlas from the Sidebar. Once a source changes, the return appears here.'
    }
    detail={
      <div className="t-caption2" style={{ color: 'var(--muted)', marginTop: 6 }}>
        {focusTarget
          ? `Why now · ${[learningTargetReturnLabel(focusTarget, targetState.state), learningTargetWhyNow(focusTarget)].filter(Boolean).join(' · ')}`
          : 'The empty state is still a desk: enough structure to begin, without pretending work already exists.'}
      </div>
    }
    actions={
      focusTarget
        ? [
            {
              label: learningTargetActionLabel(focusTarget.action),
              onClick: () => openLearningTarget(router, focusTarget),
              primary: true,
            },
            {
              label: learningTargetSecondaryLabel(focusTarget),
              onClick: () => openLearningTargetSource(router, focusTarget),
            },
            { label: 'Open Shuttle', onClick: () => openShuttle() },
          ]
        : [
            { label: 'Open Shuttle', onClick: () => openShuttle(), primary: true },
            { label: 'Open Atlas', href: '/knowledge' },
            { label: 'Open Today', href: '/today' },
          ]
    }
  />
```

- [ ] **Step 3: Move recent threads, resolved outcomes, and queue into the support stack**

Replace the existing `DeskStatusCard`, `ResolvedList`, and wide recent threads card with:

```tsx
<div className="loom-home-support-stack">
  {hasResolved ? (
    <HomeSupportSection
      eyebrow="Resolved recently"
      title="Completed moves stay nearby, but quiet."
    >
      <HomeResolvedList items={resolvedOutcomes} />
    </HomeSupportSection>
  ) : null}

  {hasQueue ? (
    <HomeSupportSection
      eyebrow="Queue state"
      title="Deferred work stays below the foreground object."
    >
      <LearningTargetQueueState
        queue={queue}
        onRestore={(target) => targetState.restore(target)}
        onTogglePinned={(target) => targetState.togglePinned(target)}
      />
    </HomeSupportSection>
  ) : null}

  {hasRecentThreads ? (
    <HomeSupportSection
      eyebrow="Recent threads"
      title="Return paths stay visible after the work settles."
      aside="Quiet resume threads, not a second navigation layer."
    >
      <HomeRecentThreadsList items={recentThreads} />
    </HomeSupportSection>
  ) : null}
</div>
```

Then delete the now-unused home-only helpers from `app/HomeClient.tsx`:

```tsx
function DeskStatusCard(...) { ... }
function DeskStatusRow(...) { ... }
function ResolvedList(...) { ... }
```

- [ ] **Step 4: Run the home workbench tests**

Run:

```bash
node --import tsx --test tests/home-foreground-workbench.test.tsx
```

Expected: `PASS`

- [ ] **Step 5: Commit the homepage rewrite**

```bash
git add app/HomeClient.tsx
git commit -m "refactor: rebuild home as a foreground workbench"
```

### Task 4: Run the Full Verification Pass

**Files:**
- Verify: `app/HomeClient.tsx`
- Verify: `components/home/HomeWorkbenchSections.tsx`
- Verify: `tests/home-foreground-workbench.test.tsx`
- Verify: `app/globals.css`

- [ ] **Step 1: Run the focused and broad test suites**

Run:

```bash
node --import tsx --test tests/home-foreground-workbench.test.tsx
node --import tsx --test tests/*.test.ts tests/*.test.tsx
```

Expected:

- the focused home workbench test passes
- the broader test suite remains green

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code `0`

- [ ] **Step 3: Run a production build**

Run:

```bash
npm run build
```

Expected: build completes with exit code `0`. The existing ESLint plugin warning about `array.prototype.findlast` may still print; treat it as pre-existing unless this plan is expanded to include dependency cleanup.

- [ ] **Step 4: Run a visual smoke pass in the browser**

Run:

```bash
npm run dev
```

Then verify the page in the browser:

1. `/`
2. `/` with no focus target
3. `/` at a narrow mobile viewport

Expected:

- no right-side `Desk status` block
- one obvious foreground object
- intro and foreground object aligned to the same narrower column
- support sections clearly lighter than the main object

- [ ] **Step 5: Commit the verification checkpoint**

```bash
git add app/HomeClient.tsx components/home/HomeWorkbenchSections.tsx app/globals.css tests/home-foreground-workbench.test.tsx
git commit -m "test: verify home foreground workbench redesign"
```
