# Quiet Horizon Empty-State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Quiet Horizon empty-state redesign so Today, Atlas, and Patterns share one calm scene language with a consistent content column.

**Architecture:** Add one reusable quiet-scene wrapper and column primitive, define the shared width/background tokens in global CSS, and then mount each target page into that shell without turning `QuietGuideCard` into a page-layout system.

**Tech Stack:** Next.js 15, React 18, TypeScript, global CSS, node:test with `tsx`

---

### Task 1: Lock the quiet-scene contract with tests

**Files:**
- Create: `tests/quiet-horizon-layout.test.tsx`
- Test: `app/knowledge/KnowledgeHomeStatic.tsx`
- Test: `app/today/TodayClient.tsx`
- Test: `components/PatternsView.tsx`
- Test: `app/globals.css`

- [ ] **Step 1: Write the failing tests**

```tsx
test('KnowledgeHomeStatic renders inside the atlas quiet scene column', () => {
  // Assert for quiet-scene markup that does not exist yet.
});

test('global CSS defines the quiet-scene width and background classes', () => {
  // Assert for --quiet-scene-width and .loom-quiet-scene selectors.
});

test('today and patterns mount the shared quiet-scene shell', () => {
  // Assert source usage for the shared scene in both files.
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --import tsx --test tests/quiet-horizon-layout.test.tsx`  
Expected: `FAIL` because the shared quiet-scene contract is not present yet.

### Task 2: Build the shared quiet-scene primitives and tokens

**Files:**
- Create: `components/QuietScene.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add the shared React wrapper**

```tsx
export function QuietScene(...) { ... }
export function QuietSceneColumn(...) { ... }
```

- [ ] **Step 2: Add shared CSS tokens and background rules**

```css
:root {
  --quiet-scene-width: ...;
}

.loom-quiet-scene { ... }
.loom-quiet-scene__column { ... }
```

- [ ] **Step 3: Re-run the new tests**

Run: `node --import tsx --test tests/quiet-horizon-layout.test.tsx`  
Expected: narrower failures or partial pass, with page-level usage tests still failing.

### Task 3: Apply the quiet scene to Today, Atlas, and Patterns

**Files:**
- Modify: `app/today/TodayClient.tsx`
- Modify: `app/knowledge/KnowledgeHomeStatic.tsx`
- Modify: `components/PatternsView.tsx`

- [ ] **Step 1: Move Today’s quiet surfaces into one shared column**

```tsx
<QuietScene tone="today">
  <QuietSceneColumn>
    <TodayHeader />
    ...
  </QuietSceneColumn>
</QuietScene>
```

- [ ] **Step 2: Keep Atlas intro in the quiet column, let the collection grid breathe below**

```tsx
<QuietScene tone="atlas">
  <QuietSceneColumn>
    <QuietGuideCard ... />
  </QuietSceneColumn>
  <div>...collection groups...</div>
</QuietScene>
```

- [ ] **Step 3: Replace the Patterns spotlight background with the shared scene**

```tsx
<QuietScene tone="patterns">
  <QuietSceneColumn>...</QuietSceneColumn>
</QuietScene>
```

- [ ] **Step 4: Re-run the quiet-scene tests**

Run: `node --import tsx --test tests/quiet-horizon-layout.test.tsx`  
Expected: `PASS`

### Task 4: Verify the integrated result

**Files:**
- Verify: `app/today/TodayClient.tsx`
- Verify: `app/knowledge/KnowledgeHomeStatic.tsx`
- Verify: `components/PatternsView.tsx`

- [ ] **Step 1: Run the broader test suite**

Run: `node --import tsx --test tests/*.test.ts tests/*.test.tsx`  
Expected: all targeted tests pass with no new regressions.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`  
Expected: exit code `0`

- [ ] **Step 3: Run a production build**

Run: `npm run build`  
Expected: exit code `0`
