# Loom Desktop Entry Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Loom's desktop top-level routes and sidebar under one entry-shell system so `/`, `/today`, `/knowledge`, `/browse`, and `/patterns` feel like one coherent product without changing the underlying reading or data models.

**Architecture:** Add a dedicated desktop entry-shell layer that owns top-level page rhythm, section structure, rows, cards, and sidebar grouping. Keep existing data hooks and route contracts intact, but route all top-level entry surfaces through shared shell primitives and a tested sidebar/route descriptor module so layout behavior stops drifting page-by-page.

**Tech Stack:** Next.js App Router, React 18, TypeScript, inline style components, existing Loom tokens in `app/globals.css`, Node `node:test` via `tsx`, existing `npm run typecheck`, `npm run build`, and `npm run smoke`.

---

## File Map

- `lib/entry-shell.ts`
  Pure shell metadata for desktop top-level routes and sidebar sections. This is the main test seam for room ordering, labels, and contextual stack visibility.
- `tests/entry-shell.test.ts`
  Node tests for route descriptors and sidebar grouping rules.
- `components/entry-shell/EntryPageShell.tsx`
  Shared wrapper for top-level entry pages, built on `StageShell` but owning desktop header/utility/content rhythm.
- `components/entry-shell/EntryHeader.tsx`
  Shared top-level page header with eyebrow, title, stance, and utility row slots.
- `components/entry-shell/EntrySection.tsx`
  Shared section chrome for entry pages, including heading, optional trailing actions, and consistent spacing.
- `components/entry-shell/EntryCard.tsx`
  Shared interactive desktop card base for primary and secondary entry surfaces.
- `components/entry-shell/EntryRow.tsx`
  Shared row primitive for index-like surfaces and secondary navigation lists.
- `components/entry-shell/SidebarSection.tsx`
  Shared sidebar section wrapper for context stacks and utility grouping.
- `components/entry-shell/index.ts`
  Barrel export for the new shell primitives.
- `components/Sidebar.tsx`
  Reorganize into identity rail, primary navigation, context stack, and utility footer using `lib/entry-shell.ts`.
- `app/layout.tsx`
  Wire any shell-level spacing or class hooks needed by the new sidebar and top-level entry pages.
- `app/globals.css`
  Add or adjust shell-scoped desktop spacing, active-state, and surface rhythm tokens while preserving the current Loom look.
- `app/HomeClient.tsx`
  Convert `/` to the new `Desk` shell.
- `app/today/TodayClient.tsx`
  Convert `/today` to the `Desk / Today` shell variant.
- `app/knowledge/KnowledgeHomeStatic.tsx`
  Convert `/knowledge` to the `Atlas` shell with denser collection cards and clearer grouped hierarchy.
- `app/browse/BrowseClient.tsx`
  Convert `/browse` to the `Index` shell while preserving its text-forward role.
- `components/PatternsView.tsx`
  Bring `/patterns` under the shared shell header and section rhythm without rewriting its internal data model.
- `scripts/smoke.mjs`
  Extend the smoke run so the top-level routes covered by this plan are exercised after build.

## Task 1: Add Tested Entry-Shell Route Metadata

**Files:**
- Create: `lib/entry-shell.ts`
- Create: `tests/entry-shell.test.ts`
- Test: `tests/entry-shell.test.ts`

- [ ] **Step 1: Write the failing tests for top-level route order and contextual stacks**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPrimaryEntryRoutes,
  getSidebarContextSections,
  type EntryRouteId,
} from '../lib/entry-shell';

test('desktop primary entry routes stay in the approved order', () => {
  const ids = getPrimaryEntryRoutes().map((route) => route.id);
  assert.deepEqual(ids, ['home', 'today', 'knowledge', 'patterns', 'browse'] satisfies EntryRouteId[]);
});

test('knowledge route prioritizes atlas context and quiets llm reference', () => {
  const sections = getSidebarContextSections('/knowledge');
  assert.equal(sections[0]?.id, 'atlas');
  assert.equal(sections[0]?.expanded, true);
  assert.equal(sections[1]?.id, 'llm-reference');
  assert.equal(sections[1]?.expanded, false);
});

test('wiki reading route prioritizes llm reference context', () => {
  const sections = getSidebarContextSections('/wiki/attention');
  assert.equal(sections[0]?.id, 'llm-reference');
  assert.equal(sections[0]?.expanded, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail before implementation**

Run: `npx tsx --test tests/entry-shell.test.ts`  
Expected: FAIL with `Cannot find module '../lib/entry-shell'`

- [ ] **Step 3: Implement the pure route and sidebar descriptor module**

```ts
// lib/entry-shell.ts
export type EntryRouteId = 'home' | 'today' | 'knowledge' | 'patterns' | 'browse';

export type EntryRouteDescriptor = {
  id: EntryRouteId;
  href: string;
  label: string;
};

export type SidebarContextSection = {
  id: 'atlas' | 'llm-reference';
  label: string;
  expanded: boolean;
};

const PRIMARY_ENTRY_ROUTES: EntryRouteDescriptor[] = [
  { id: 'home', href: '/', label: 'Desk' },
  { id: 'today', href: '/today', label: 'Today' },
  { id: 'knowledge', href: '/knowledge', label: 'Atlas' },
  { id: 'patterns', href: '/patterns', label: 'Patterns' },
  { id: 'browse', href: '/browse', label: 'Browse' },
];

export function getPrimaryEntryRoutes() {
  return PRIMARY_ENTRY_ROUTES;
}

export function getSidebarContextSections(pathname: string): SidebarContextSection[] {
  const inAtlas = pathname.startsWith('/knowledge');
  const inWiki = pathname.startsWith('/wiki/');
  const atlas: SidebarContextSection = { id: 'atlas', label: 'The Atlas', expanded: inAtlas };
  const llm: SidebarContextSection = { id: 'llm-reference', label: 'LLM Reference', expanded: inWiki };
  return inWiki ? [llm, atlas] : [atlas, llm];
}
```

- [ ] **Step 4: Re-run the tests to verify they pass**

Run: `npx tsx --test tests/entry-shell.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit the descriptor foundation**

```bash
git add lib/entry-shell.ts tests/entry-shell.test.ts
git commit -m "refactor: add desktop entry shell descriptors"
```

## Task 2: Build the Shared Desktop Entry-Shell Primitives

**Files:**
- Create: `components/entry-shell/EntryPageShell.tsx`
- Create: `components/entry-shell/EntryHeader.tsx`
- Create: `components/entry-shell/EntrySection.tsx`
- Create: `components/entry-shell/EntryCard.tsx`
- Create: `components/entry-shell/EntryRow.tsx`
- Create: `components/entry-shell/SidebarSection.tsx`
- Create: `components/entry-shell/index.ts`
- Modify: `app/globals.css`
- Test: `tests/entry-shell.test.ts`

- [ ] **Step 1: Extend the tests with one small invariant for shell labels**

```ts
test('desktop entry labels stay user-facing and short', () => {
  const labels = getPrimaryEntryRoutes().map((route) => route.label);
  assert.deepEqual(labels, ['Desk', 'Today', 'Atlas', 'Patterns', 'Browse']);
});
```

- [ ] **Step 2: Run the tests as a quick regression gate**

Run: `npx tsx --test tests/entry-shell.test.ts`  
Expected: PASS

- [ ] **Step 3: Create the shared shell primitives**

```tsx
// components/entry-shell/EntryPageShell.tsx
import type { ReactNode } from 'react';
import { StageShell } from '../StageShell';

export function EntryPageShell({
  variant,
  children,
}: {
  variant: 'desk' | 'atlas' | 'index';
  children: ReactNode;
}) {
  const stageVariant = variant === 'atlas' ? 'archive' : 'working';
  return (
    <StageShell
      variant={stageVariant}
      contentVariant={stageVariant}
      innerClassName={`entry-page-shell entry-page-shell--${variant}`}
      innerStyle={{ minHeight: '100vh', paddingTop: '4.75rem', paddingBottom: '2.5rem' }}
    >
      {children}
    </StageShell>
  );
}
```

```tsx
// components/entry-shell/EntryHeader.tsx
import type { CSSProperties, ReactNode } from 'react';

export function EntryHeader({
  eyebrow,
  title,
  stance,
  utility,
  style,
}: {
  eyebrow: string;
  title: string;
  stance?: ReactNode;
  utility?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <header className="entry-header" style={style}>
      <div className="entry-header__copy">
        <div className="entry-header__eyebrow">{eyebrow}</div>
        <h1 className="entry-header__title">{title}</h1>
        {stance ? <div className="entry-header__stance">{stance}</div> : null}
      </div>
      {utility ? <div className="entry-header__utility">{utility}</div> : null}
    </header>
  );
}
```

```tsx
// components/entry-shell/EntrySection.tsx
import type { ReactNode } from 'react';

export function EntrySection({
  eyebrow,
  title,
  trailing,
  children,
}: {
  eyebrow?: string;
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="entry-section">
      {(eyebrow || title || trailing) ? (
        <div className="entry-section__header">
          <div className="entry-section__copy">
            {eyebrow ? <div className="entry-section__eyebrow">{eyebrow}</div> : null}
            {title ? <div className="entry-section__title">{title}</div> : null}
          </div>
          {trailing ? <div className="entry-section__trailing">{trailing}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
```

```tsx
// components/entry-shell/EntryCard.tsx
import type { CSSProperties, ReactNode } from 'react';

export function EntryCard({
  children,
  tone = 'default',
  interactive = false,
  style,
}: {
  children: ReactNode;
  tone?: 'default' | 'primary' | 'quiet';
  interactive?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`entry-card entry-card--${tone}${interactive ? ' entry-card--interactive' : ''}`}
      style={style}
    >
      {children}
    </div>
  );
}
```

```tsx
// components/entry-shell/EntryRow.tsx
import Link from 'next/link';

export function EntryRow({
  href,
  title,
  meta,
}: {
  href: string;
  title: string;
  meta?: string;
}) {
  return (
    <Link href={href} className="entry-row">
      <span className="entry-row__title">{title}</span>
      {meta ? <span className="entry-row__meta">{meta}</span> : null}
    </Link>
  );
}
```

```tsx
// components/entry-shell/SidebarSection.tsx
import type { ReactNode } from 'react';

export function SidebarSection({
  label,
  expanded,
  children,
}: {
  label: string;
  expanded: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`sidebar-section${expanded ? ' sidebar-section--expanded' : ''}`}>
      <div className="sidebar-section__label">{label}</div>
      {expanded ? <div className="sidebar-section__body">{children}</div> : null}
    </section>
  );
}
```

- [ ] **Step 4: Add the shell CSS hooks in `app/globals.css`**

```css
.entry-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.entry-header__eyebrow,
.entry-section__eyebrow {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}

.entry-header__title {
  margin: 0.1rem 0 0;
  font-family: var(--display);
  font-size: clamp(1.34rem, 1.1rem + 0.9vw, 1.9rem);
  line-height: 1.06;
  letter-spacing: -0.03em;
  color: var(--fg);
}

.entry-header__stance {
  max-width: 44rem;
  color: var(--fg-secondary);
  font-size: 0.92rem;
  line-height: 1.5;
}

.entry-card {
  border-radius: var(--r-4);
  border: 0.5px solid color-mix(in srgb, var(--mat-border) 88%, transparent);
  background: color-mix(in srgb, var(--mat-reg-bg) 94%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.28), 0 12px 30px rgba(0,0,0,0.05);
}

.entry-card--interactive:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 16%, var(--mat-border));
}

.entry-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 0.72rem 0;
  border-bottom: 0.5px solid var(--mat-border);
  text-decoration: none;
  color: var(--fg);
}

.entry-row__title {
  font-family: var(--display);
  font-size: 1rem;
  font-weight: 540;
  letter-spacing: -0.012em;
}

.entry-row__meta {
  color: var(--muted);
  font-size: 0.74rem;
}

.sidebar-section__label {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  font-weight: 700;
  margin-bottom: 0.28rem;
}
```

- [ ] **Step 5: Run typecheck to catch primitive export and CSS usage issues**

Run: `npm run typecheck`  
Expected: PASS

- [ ] **Step 6: Commit the new shell layer**

```bash
git add components/entry-shell app/globals.css
git commit -m "feat: add desktop entry shell primitives"
```

## Task 3: Rebuild the Desktop Sidebar Around the New Shell

**Files:**
- Modify: `components/Sidebar.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `lib/sidebar-mode.ts`
- Test: `tests/sidebar-mode.test.ts`
- Test: `tests/entry-shell.test.ts`

- [ ] **Step 1: Add one failing test for the sidebar desktop default to stay pinned**

```ts
import {
  defaultSidebarModeForWidth,
  resolveInitialSidebarMode,
} from '../lib/sidebar-mode';

test('desktop shell still defaults sidebar to pinned after shell refactor', () => {
  assert.equal(defaultSidebarModeForWidth(1280), 'pinned');
  assert.equal(
    resolveInitialSidebarMode({
      storedMode: null,
      legacyPinned: null,
      viewportWidth: 1280,
    }),
    'pinned',
  );
});
```

- [ ] **Step 2: Run the sidebar-mode and entry-shell tests before refactoring**

Run: `npx tsx --test tests/sidebar-mode.test.ts tests/entry-shell.test.ts`  
Expected: PASS

- [ ] **Step 3: Reorganize `Sidebar.tsx` into shell sections**

```tsx
// inside components/Sidebar.tsx
import { getPrimaryEntryRoutes, getSidebarContextSections } from '../lib/entry-shell';

const primaryRoutes = getPrimaryEntryRoutes();
const contextSections = getSidebarContextSections(pathname);

<aside className={`sidebar material-thick ${visible ? 'open' : ''}`}>
  <div className="sidebar-shell">
    <div className="sidebar-shell__identity">
      <Link href="/" className="sidebar-shell__brand"><LoomLogo size={16} density="compact" active={pathname === '/'} /></Link>
      <button type="button" className="sidebar-shell__pin" onClick={cycleMode}>◰</button>
    </div>

    <nav className="sidebar-shell__primary" aria-label="Primary">
      {primaryRoutes.map((route) => (
        <NavLink key={route.id} href={route.href} active={pathname === route.href || (route.href === '/knowledge' && pathname.startsWith('/knowledge'))}>
          {route.label}
        </NavLink>
      ))}
    </nav>

    <div className="sidebar-shell__context">
      {contextSections.map((section) => (
        <SidebarSection key={section.id} label={section.label} expanded={section.expanded}>
          {section.id === 'atlas'
            ? knowledgeCategories.map((category) => (
                <CategoryRow
                  key={category.slug}
                  cat={category}
                  activePath={pathname}
                  onNav={() => setOpen(false)}
                />
              ))
            : sections.map((sec) => (
                <div key={sec} style={{ marginTop: '0.5rem' }}>
                  <div className="sidebar-section__mini-label">{sec}</div>
                  {chapters.filter((chapter) => chapter.section === sec).map((chapter) => (
                    <Link key={chapter.slug} href={`/wiki/${chapter.slug}`} onClick={() => setOpen(false)}>
                      {chapter.title}
                    </Link>
                  ))}
                </div>
              ))}
        </SidebarSection>
      ))}
    </div>

    <div className="sidebar-shell__footer">
      <NavLink href="/about" active={pathname === '/about'}>About</NavLink>
      <NavLink href="/help" active={pathname === '/help'}>Help</NavLink>
    </div>
  </div>
</aside>
```

- [ ] **Step 4: Add the desktop shell sidebar styling and layout hooks**

```css
.sidebar-shell {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.sidebar-shell__identity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sidebar-shell__primary,
.sidebar-shell__context,
.sidebar-shell__footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sidebar-shell__footer {
  margin-top: auto;
  padding-top: 14px;
  border-top: 0.5px solid var(--mat-border);
}

.layout main {
  flex: 1;
  min-width: 0;
  padding-left: 0;
}
```

- [ ] **Step 5: Re-run the fast tests and typecheck**

Run: `npx tsx --test tests/sidebar-mode.test.ts tests/entry-shell.test.ts && npm run typecheck`  
Expected: PASS

- [ ] **Step 6: Commit the sidebar redesign foundation**

```bash
git add components/Sidebar.tsx app/layout.tsx app/globals.css lib/sidebar-mode.ts tests/sidebar-mode.test.ts tests/entry-shell.test.ts
git commit -m "refactor: rebuild desktop sidebar around entry shell"
```

## Task 4: Migrate the Desk Routes (`/` and `/today`)

**Files:**
- Modify: `app/HomeClient.tsx`
- Modify: `app/today/TodayClient.tsx`
- Modify: `components/QuietGuideCard.tsx`
- Modify: `components/WorkSurface.tsx`
- Test: `npm run typecheck`
- Test: `npm run build`

- [ ] **Step 1: Add the shared `EntryHeader` and `EntrySection` imports to the desk routes**

```tsx
// app/HomeClient.tsx
import { EntryCard, EntryHeader, EntryPageShell, EntrySection } from '../components/entry-shell';

// app/today/TodayClient.tsx
import { EntryCard, EntryHeader, EntryPageShell, EntrySection } from '../../components/entry-shell';
```

- [ ] **Step 2: Convert `/` to the new Desk shell**

```tsx
// app/HomeClient.tsx
return (
  <EntryPageShell variant="desk">
    <EntryHeader
      eyebrow="Desk"
      title="One foreground object. The rest stays quiet."
      stance="This room should make the next return obvious without turning the desk into a dashboard."
      utility={<div className="t-caption2" style={{ color: 'var(--muted)' }}>{guideMeta}</div>}
    />

    <div className="entry-grid entry-grid--desk">
      <EntryCard tone="primary">
        <QuietGuideCard
          eyebrow={focusTarget ? 'Current return' : 'Quiet surface'}
          title={focusTarget ? focusTarget.title : 'Nothing urgent is asking for attention.'}
          summary={focusTarget ? focusTarget.preview || focusTarget.reason : 'Open the Shuttle to move anywhere, or enter the Atlas from the Sidebar.'}
          actions={focusTarget ? [
            { label: learningTargetActionLabel(focusTarget.action), onClick: () => openLearningTarget(router, focusTarget), primary: true },
            { label: learningTargetSecondaryLabel(focusTarget), onClick: () => openLearningTargetSource(router, focusTarget) },
          ] : [
            { label: 'Open Shuttle', onClick: () => openShuttle(), primary: true },
            { label: 'Open Atlas', href: '/knowledge' },
          ]}
        />
      </EntryCard>

      <EntrySection eyebrow="Support" title="Recent and resolved">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DeskStatusCard
            focusLabel={focusTarget ? learningTargetActionLabel(focusTarget.action) : 'Waiting for a changed thread'}
            resolvedCount={resolvedOutcomes.length}
            queueCount={queueCount}
            recentCount={recentThreads.length}
          />
          {hasResolved ? <ResolvedList items={resolvedOutcomes} /> : null}
          {hasQueue ? (
            <LearningTargetQueueState
              queue={queue}
              onRestore={(target) => targetState.restore(target)}
              onTogglePinned={(target) => targetState.togglePinned(target)}
            />
          ) : null}
        </div>
      </EntrySection>
    </div>
  </EntryPageShell>
);
```

- [ ] **Step 3: Convert `/today` to the Desk / Today shell variant**

```tsx
// app/today/TodayClient.tsx
return (
  <EntryPageShell variant="desk">
    <EntryHeader
      eyebrow="Today"
      title="Today should surface returns, not scores."
      stance="Show what changed, what stayed pinned, and what is worth reopening. Nothing here should look like a metrics dashboard."
      utility={<div className="t-caption2" style={{ color: 'var(--muted)' }}>{displayedTargets.length} active returns</div>}
    />

    <EntrySection eyebrow="Foreground" title="Today's return">
      {focusTarget ? (
        <TodayFocusCard
          target={focusTarget}
          returnLabel={focusTargetReturnLabel}
          onOpen={() => openLearningTarget(router, focusTarget)}
          onOpenSource={() => openLearningTargetSource(router, focusTarget)}
        />
      ) : focusSurface ? (
        <StudySurfaceCard surface={focusSurface} onOpen={(next) => openNext(focusSurface, next)} onRefresh={() => openRefresh(focusSurface)} />
      ) : (
        <QuietEmptyState
          eyebrow="Today"
          title="Nothing is asking for attention yet."
          summary="Enter a source from the Sidebar or open the Shuttle. Once you read, capture, or weave, today’s returns settle back onto this desk."
          primaryLabel="Open Shuttle"
          onPrimary={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          secondaryLabel="Open Atlas"
          onSecondary={() => router.push('/knowledge')}
        />
      )}
    </EntrySection>

    <EntrySection eyebrow="Queue" title="Pinned and deferred">
      {hasTargetQueue ? (
        <LearningTargetQueueState
          queue={targetQueue}
          onRestore={(target) => targetState.restore(target)}
          onTogglePinned={(target) => targetState.togglePinned(target)}
        />
      ) : (
        <div className="t-caption2" style={{ color: 'var(--muted)' }}>No pinned or deferred returns for today.</div>
      )}
    </EntrySection>
  </EntryPageShell>
);
```

- [ ] **Step 4: Make `QuietGuideCard` and `WorkSurface` cooperate with the shell without owning page rhythm**

```tsx
// components/QuietGuideCard.tsx
// remove fixed marginBottom ownership so page shells control vertical rhythm
return (
  <WorkSurface tone={tone} density={density}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <WorkEyebrow>{eyebrow}</WorkEyebrow>
      <span aria-hidden style={{ flex: 1, height: 0.5, background: 'var(--mat-border)', opacity: 0.6 }} />
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: '1.16rem', fontWeight: 620, letterSpacing: '-0.02em', lineHeight: 1.25, marginBottom: meta || summary ? 6 : 0, color: 'var(--fg)' }}>
          {title}
        </div>
        {meta ? <div className="t-caption2" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', color: 'var(--muted)', letterSpacing: '0.04em', marginBottom: summary || detail ? 8 : 0 }}>{meta}</div> : null}
        {summary ? <div style={{ color: 'var(--fg-secondary)', fontSize: '0.89rem', lineHeight: 1.52, marginBottom: detail ? 8 : 0 }}>{summary}</div> : null}
        {detail}
      </div>
      {actions && actions.length > 0 ? (
        <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignSelf: 'center', flexWrap: 'wrap' }}>
          {actions.map((action) => (
            <WorkAction
              key={action.label}
              label={action.label}
              href={action.href}
              onClick={action.onClick}
              tone={action.primary ? 'primary' : 'secondary'}
            />
          ))}
        </div>
      ) : null}
    </div>
  </WorkSurface>
);
```

```tsx
// components/WorkSurface.tsx
// keep surface token behavior, but do not encode top-level page spacing here
export function WorkSurface({ children, tone = 'default', density = 'regular', style }: Props) {
  return <section style={{ ...surfaceStyle(tone, density), ...style }}>{children}</section>;
}
```

- [ ] **Step 5: Run typecheck and production build**

Run: `npm run typecheck && npm run build`  
Expected: PASS

- [ ] **Step 6: Commit the desk-route migration**

```bash
git add app/HomeClient.tsx app/today/TodayClient.tsx components/QuietGuideCard.tsx components/WorkSurface.tsx
git commit -m "refactor: migrate desk routes to entry shell"
```

## Task 5: Migrate `/knowledge` to the Atlas Shell

**Files:**
- Modify: `app/knowledge/KnowledgeHomeStatic.tsx`
- Modify: `app/globals.css`
- Test: `npm run typecheck`
- Test: `npm run build`

- [ ] **Step 1: Convert the current soft hero into an Atlas entry header**

```tsx
// app/knowledge/KnowledgeHomeStatic.tsx
import { EntryCard, EntryHeader, EntryPageShell, EntrySection } from '../../components/entry-shell';

return (
  <EntryPageShell variant="atlas">
    <EntryHeader
      eyebrow="Atlas"
      title="Collections stay quiet until a thread warms them."
      stance="The Atlas is the grouped entry surface for collections. Open a collection from its swatch and return when a thread changes."
      utility={<div className="t-caption2" style={{ color: 'var(--muted)' }}>{totalCollections} collections · {totalDocs} docs</div>}
    />

    {groups.map((group) => (
      <EntrySection
        key={group.label}
        eyebrow={group.label}
        title={`${group.items.length} collection${group.items.length === 1 ? '' : 's'}`}
        trailing={<span className="t-caption2" style={{ color: 'var(--muted)' }}>Grouped entry surface</span>}
      >
        <div className="entry-grid entry-grid--atlas">
          {group.items.map((item) => <CollectionCard key={item.slug} slug={item.slug} label={item.label} count={item.count} />)}
        </div>
      </EntrySection>
    ))}
  </EntryPageShell>
);
```

- [ ] **Step 2: Tighten the collection card density and action clarity**

```tsx
function CollectionCard({ slug, label, count }: Props) {
  return (
    <Link href={`/knowledge/${slug}`} className="atlas-collection-card">
      <PatternSwatch categorySlug={slug} height={28} />
      <div className="atlas-collection-card__copy">
        <div className="atlas-collection-card__title">{label}</div>
        <div className="atlas-collection-card__meta">{count} docs</div>
      </div>
      <div className="atlas-collection-card__action">
        <span>Open</span>
        <span aria-hidden>↗</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Add card and atlas-grid CSS tuned for denser desktop entry**

```css
.entry-grid--atlas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.atlas-collection-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 156px;
  padding: 0.9rem 0.95rem;
  text-decoration: none;
  color: var(--fg);
}

.atlas-collection-card__title {
  font-family: var(--display);
  font-size: 0.98rem;
  font-weight: 580;
  letter-spacing: -0.015em;
}

.atlas-collection-card__action {
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--fg-secondary);
  font-size: 0.74rem;
  font-weight: 650;
  letter-spacing: 0.04em;
}
```

- [ ] **Step 4: Run typecheck and build**

Run: `npm run typecheck && npm run build`  
Expected: PASS

- [ ] **Step 5: Commit the Atlas migration**

```bash
git add app/knowledge/KnowledgeHomeStatic.tsx app/globals.css
git commit -m "refactor: migrate atlas home to entry shell"
```

## Task 6: Migrate `/browse` and Attach `/patterns` to the Shared Shell

**Files:**
- Modify: `app/browse/BrowseClient.tsx`
- Modify: `components/PatternsView.tsx`
- Modify: `app/globals.css`
- Modify: `scripts/smoke.mjs`
- Test: `npm run typecheck`
- Test: `npm run build`
- Test: `npm run smoke`

- [ ] **Step 1: Convert `/browse` into the `Index` shell**

```tsx
// app/browse/BrowseClient.tsx
import { EntryHeader, EntryPageShell, EntryRow, EntrySection } from '../../components/entry-shell';

return (
  <EntryPageShell variant="index">
    <EntryHeader
      eyebrow="Browse"
      title="Find a chapter or collection without leaving the quiet index."
      stance="Browse is a secondary reference surface. It stays text-forward, searchable, and low-chrome."
      utility={
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a chapter or collection…"
          className="entry-index-search"
        />
      }
    />

    {groups.map((group) => (
      <EntrySection key={group.label} eyebrow={group.label}>
        {group.items.map((category) => (
          <EntryRow
            key={category.slug}
            href={`/knowledge/${category.slug}`}
            title={category.label.replace(/^[^·]+·\s*/, '')}
            meta={`${category.count} docs`}
          />
        ))}
      </EntrySection>
    ))}
  </EntryPageShell>
);
```

- [ ] **Step 2: Bring `PatternsView` under the shared shell header**

```tsx
// components/PatternsView.tsx
import { EntryHeader, EntryPageShell, EntrySection } from './entry-shell';

return (
  <EntryPageShell variant="index">
    <EntryHeader
      eyebrow="Patterns"
      title="Finished panels should read like one Loom room."
      stance="Patterns remains the portfolio of crystallized panels, but its top-level shell should match the rest of Loom."
      utility={<div className="t-caption2" style={{ color: 'var(--muted)' }}>{sortedPanels.length} visible panels</div>}
    />

    <EntrySection eyebrow="Foreground" title="Current pattern field">
      {returnPanel ? (
        <PatternHero
          panel={returnPanel}
          relationPreview={relationPreview}
          onContinue={() => continuePanelLifecycle(router, returnPanel)}
          onReview={() => openPanelReview(router, { href: returnPanel.href, anchorId: returnPanel.sections[0]?.anchorId ?? null })}
        />
      ) : null}
    </EntrySection>

    {secondaryThreads.length > 0 ? (
      <EntrySection eyebrow="Threads" title="Keep warm">
        <div style={{ display: 'grid', gridTemplateColumns: compactSurface ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {secondaryThreads.map((thread) => (
            <PatternThreadCard
              key={thread.panel.docId}
              panel={thread.panel}
              label={thread.label}
              cta={thread.cta}
              onOpen={() => focusPanelInPatterns(thread.panel)}
            />
          ))}
        </div>
      </EntrySection>
    ) : null}
  </EntryPageShell>
);
```

- [ ] **Step 3: Expand smoke coverage to all top-level entry routes**

```js
// scripts/smoke.mjs
await checkPage('/', '<title>Loom</title>');
await checkPage('/today', 'Today');
await checkPage('/knowledge', 'The Atlas');
await checkPage('/browse', 'Browse');
await checkPage('/patterns', 'Patterns');
await checkPage('/offline', 'Offline');
```

- [ ] **Step 4: Run typecheck, build, and smoke**

Run: `npm run typecheck && npm run build && npm run smoke`  
Expected: PASS with `/today ok`, `/knowledge ok`, `/browse ok`, `/patterns ok`, and final `smoke ok`

- [ ] **Step 5: Commit the index-shell migration and smoke update**

```bash
git add app/browse/BrowseClient.tsx components/PatternsView.tsx app/globals.css scripts/smoke.mjs
git commit -m "refactor: unify browse and patterns under entry shell"
```

## Task 7: Final QA and Regression Sweep

**Files:**
- Modify: any touched files from prior tasks only if QA reveals issues
- Test: `npm run verify`

- [ ] **Step 1: Run the full repository verification command**

Run: `npm run verify`  
Expected: PASS with successful typecheck, build, and smoke sequence

- [ ] **Step 2: Manually inspect the desktop routes in a local run**

Run: `npm run dev`  
Expected: local server on `http://0.0.0.0:3000`

Check these routes in a desktop browser:

- `/`
- `/today`
- `/knowledge`
- `/browse`
- `/patterns`

Confirm:

- sidebar primary navigation is stable and obvious
- only the relevant context stack is expanded
- every page has a consistent eyebrow/title/stance rhythm
- `/knowledge` cards feel denser and more actionable
- `/browse` remains text-forward but now looks system-owned
- `/` and `/today` feel related but not identical

- [ ] **Step 3: If manual QA found shell regressions, apply only the minimal fixes**

```tsx
// Example minimal follow-up shape
// keep fixes inside already-touched shell files instead of creating new ad hoc variants
<EntrySection eyebrow="Atlas" title="15 collections" trailing={<span className="t-caption2">Grouped entry surface</span>}>
  {children}
</EntrySection>
```

- [ ] **Step 4: Re-run the affected verification commands after the minimal fixes**

Run: `npm run typecheck && npm run build && npm run smoke`  
Expected: PASS

- [ ] **Step 5: Commit the QA adjustments**

```bash
git add app components scripts
git commit -m "fix: polish desktop entry shell qa issues"
```

## Self-Review

### Spec coverage

- Shared entry-shell architecture is covered by Tasks 1 and 2.
- Sidebar redesign is covered by Task 3.
- `/` and `/today` desk variants are covered by Task 4.
- `/knowledge` atlas restructuring is covered by Task 5.
- `/browse` and `/patterns` shell alignment is covered by Task 6.
- Desktop-first validation and no-regression review are covered by Task 7.

No approved spec requirement is left without a task.

### Placeholder scan

- No `TODO`, `TBD`, or deferred placeholders remain.
- Every code-changing task includes concrete file paths, code direction, and explicit commands.
- Every verification step uses commands that already exist in this repository.

### Type consistency

- The route ids used in tests match the descriptor module.
- The shell primitive names match across file map and tasks.
- The route variants `desk`, `atlas`, and `index` are used consistently throughout the plan.
- `SidebarSection` is now defined in the file map and created before the sidebar task uses it.
