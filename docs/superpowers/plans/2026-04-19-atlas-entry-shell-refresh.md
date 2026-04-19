# Atlas Entry Shell Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the `/knowledge` Atlas entry surface so it feels tighter and more intentional without changing current source-library behavior, inline group management, or `LLM Wiki` separation.

**Architecture:** Keep the current Atlas information architecture and APIs intact, and only reshape the page shell and collection-tile presentation on top of the existing `KnowledgeHomeClient` / `KnowledgeHomeStatic` flow. Reuse the current Atlas primitives (`StageShell`, `QuietScene`, `QuietSceneIntro`, `WorkSurface`, `PatternSwatch`) instead of reviving the old `entry-shell` branch architecture.

**Tech Stack:** Next.js app router, React server/client components, TypeScript, existing Atlas shell primitives, `node --import tsx --test`, `npm run typecheck`, `npm run build`.

---

## File Map

- Modify: `/Users/yinyiping/Desktop/Wiki/app/knowledge/page.tsx`
  - Keep Atlas data loading as-is, but shape page-level inputs so the refreshed shell can present stronger section metadata.
- Modify: `/Users/yinyiping/Desktop/Wiki/app/knowledge/KnowledgeHomeClient.tsx`
  - Preserve existing inline group CRUD state machine and pass it cleanly into the refreshed static shell.
- Modify: `/Users/yinyiping/Desktop/Wiki/app/knowledge/KnowledgeHomeStatic.tsx`
  - Rebuild Atlas page rhythm and collection card presentation on top of existing behaviors.
- Test: `/Users/yinyiping/Desktop/Wiki/tests/knowledge-home-source-library.test.tsx`
  - Extend source-level contract checks so the refreshed shell is pinned without changing Atlas behavior.

No new API routes, no sidebar changes, no data-model changes.

---

### Task 1: Pin the Refreshed Atlas Shell Contract in Tests

**Files:**
- Modify: `/Users/yinyiping/Desktop/Wiki/tests/knowledge-home-source-library.test.tsx`

- [ ] **Step 1: Write the failing test for the new Atlas shell shape**

```ts
test('KnowledgeHomeStatic renders Atlas entry sections and collection tiles through the refreshed shell', () => {
  const { sourceText, sourceFile } = loadTsx('app/knowledge/KnowledgeHomeStatic.tsx');

  assert.match(sourceText, /<StageShell/);
  assert.match(sourceText, /<QuietScene tone="atlas"/);
  assert.match(sourceText, /Raw sources stay quiet until a thread warms them\./);
  assert.match(sourceText, /Grouping changes affect Loom metadata only\. Original source files stay unchanged\./);
  assert.match(sourceText, /Open collection/);
  assert.match(sourceText, /PatternSwatch/);
  assert.match(sourceText, /formatCount\(group\.items\.length, 'collection'\)/);
  assert.match(sourceText, /formatCount\(item\.count, 'doc'\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx --test tests/knowledge-home-source-library.test.tsx
```

Expected: FAIL because the current assertions do not yet pin the refreshed Atlas shell contract.

- [ ] **Step 3: Extend the existing test file without weakening current behavior checks**

```ts
test('KnowledgeHome page forwards collection and document totals into the Atlas shell', () => {
  const { sourceText } = loadTsx('app/knowledge/page.tsx');

  assert.match(sourceText, /const totalCollections = sourceLibraryGroups\.reduce/);
  assert.match(sourceText, /const totalDocs = sourceLibraryGroups\.reduce/);
  assert.match(sourceText, /<KnowledgeHomeClient[\s\S]*totalCollections=\{totalCollections\}[\s\S]*totalDocs=\{totalDocs\}/);
});
```

Keep the existing inline-group-management tests intact. This task only adds shell-level contract coverage.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --import tsx --test tests/knowledge-home-source-library.test.tsx
```

Expected: PASS with the old source-library behavior tests still green plus the new shell assertions.

- [ ] **Step 5: Commit**

```bash
git add tests/knowledge-home-source-library.test.tsx
git commit -m "test: pin atlas entry shell refresh contract"
```

---

### Task 2: Tighten Atlas Page-Level Inputs Without Changing Behavior

**Files:**
- Modify: `/Users/yinyiping/Desktop/Wiki/app/knowledge/page.tsx`
- Modify: `/Users/yinyiping/Desktop/Wiki/app/knowledge/KnowledgeHomeClient.tsx`
- Test: `/Users/yinyiping/Desktop/Wiki/tests/knowledge-home-source-library.test.tsx`

- [ ] **Step 1: Add the failing test for page/client input shape**

```ts
test('KnowledgeHomeClient receives source-library groups with counts and page totals', () => {
  const { sourceText } = loadTsx('app/knowledge/page.tsx');

  assert.match(sourceText, /sourceLibraryGroups = await getSourceLibraryGroups\(\)/);
  assert.match(sourceText, /items: group\.categories\.map\(\(category\) => \(\{/);
  assert.match(sourceText, /count: category\.count/);
  assert.match(sourceText, /groupId: group\.id/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx --test tests/knowledge-home-source-library.test.tsx
```

Expected: FAIL until the current page/client handoff is tightened to match the refreshed shell contract.

- [ ] **Step 3: Update `/knowledge` page and client handoff minimally**

```tsx
// app/knowledge/page.tsx
export default async function KnowledgeHome() {
  const sourceLibraryGroups = await getSourceLibraryGroups();
  const totalCollections = sourceLibraryGroups.reduce((sum, group) => sum + group.categories.length, 0);
  const totalDocs = sourceLibraryGroups.reduce(
    (sum, group) => sum + group.categories.reduce((groupSum, category) => groupSum + category.count, 0),
    0,
  );

  const clientGroups = sourceLibraryGroups.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.categories.map((category) => ({
      slug: category.slug,
      label: category.label,
      count: category.count,
      groupId: group.id,
    })),
  }));

  return (
    <KnowledgeHomeClient
      sourceLibraryGroups={clientGroups}
      totalCollections={totalCollections}
      totalDocs={totalDocs}
    />
  );
}
```

```tsx
// app/knowledge/KnowledgeHomeClient.tsx
export function KnowledgeHomeClient({
  sourceLibraryGroups,
  totalCollections,
  totalDocs,
}: {
  sourceLibraryGroups: KnowledgeHomeGroup[];
  totalCollections: number;
  totalDocs: number;
}) {
  // preserve current inline group CRUD state machine
}
```

Do not add new client state or new API calls in this task.

- [ ] **Step 4: Run the test and typecheck**

Run:

```bash
node --import tsx --test tests/knowledge-home-source-library.test.tsx
npm run typecheck
```

Expected:
- test passes
- typecheck remains green

- [ ] **Step 5: Commit**

```bash
git add app/knowledge/page.tsx app/knowledge/KnowledgeHomeClient.tsx tests/knowledge-home-source-library.test.tsx
git commit -m "refactor: align atlas page inputs with refreshed shell"
```

---

### Task 3: Rebuild `KnowledgeHomeStatic` as a Tighter Atlas Shell

**Files:**
- Modify: `/Users/yinyiping/Desktop/Wiki/app/knowledge/KnowledgeHomeStatic.tsx`
- Test: `/Users/yinyiping/Desktop/Wiki/tests/knowledge-home-source-library.test.tsx`

- [ ] **Step 1: Write the failing test for the refreshed visual hierarchy**

```ts
test('KnowledgeHomeStatic keeps Atlas editing controls subordinate to grouped collection entry', () => {
  const { sourceText } = loadTsx('app/knowledge/KnowledgeHomeStatic.tsx');

  assert.match(sourceText, /<QuietSceneIntro/);
  assert.match(sourceText, /<WorkSurface tone="quiet" density="regular">/);
  assert.match(sourceText, /<CollectionCard/);
  assert.match(sourceText, /Start anywhere\. Return when a thread changes\./);
  assert.match(sourceText, /Delete this group\? Items move back to Ungrouped\./);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx --test tests/knowledge-home-source-library.test.tsx
```

Expected: FAIL until the static Atlas shell is reshaped.

- [ ] **Step 3: Rebuild `KnowledgeHomeStatic` using current Atlas primitives**

```tsx
// app/knowledge/KnowledgeHomeStatic.tsx
return (
  <StageShell
    variant="archive"
    contentVariant="archive"
    innerStyle={{ minHeight: '100vh', paddingTop: '4.75rem', paddingBottom: '2.5rem' }}
  >
    <QuietScene tone="atlas">
      <QuietSceneColumn>
        <QuietSceneIntro
          eyebrow="Atlas"
          title="Raw sources stay quiet until a thread warms them."
          meta={<span>{totalCollections} collections · {totalDocs} docs</span>}
          summary="Browse the grouped raw-source library below. Each swatch is woven from actual panel and weave activity, so the Atlas stays grounded in work rather than decorative chrome."
        />
      </QuietSceneColumn>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 4 }}>
        <WorkSurface tone="quiet" density="regular">
          {/* guardrail + add-group inline editor */}
        </WorkSurface>

        {resolvedGroups.map((group) => (
          <WorkSurface key={group.id} tone="quiet" density="regular">
            {/* group header + rename/delete inline controls + collection grid */}
          </WorkSurface>
        ))}
      </div>
    </QuietScene>
  </StageShell>
);
```

```tsx
function CollectionCard({ item, allGroups, onMoveCategory, busy }: CollectionCardProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0.92rem 0.98rem' }}>
      <Link href={`/knowledge/${item.slug}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PatternSwatch categorySlug={item.slug} height={32} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '0.98rem', fontWeight: 560 }}>
            {item.label}
          </div>
          <div className="t-caption2" style={{ color: 'var(--muted)' }}>
            {item.count} doc{item.count === 1 ? '' : 's'}
          </div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between' }}>
          <div className="t-caption2" style={{ color: 'var(--muted)' }}>Open collection</div>
          <span style={textActionStyle(true)}>Enter</span>
        </div>
      </Link>

      {/* existing move-to-group select stays */}
    </div>
  );
}
```

Important constraints for this task:
- preserve current inline add / rename / delete flows
- preserve move-to-group select
- do not introduce old `entry-shell` components
- do not reduce the visibility of current group-management affordances below discoverability

- [ ] **Step 4: Run focused verification**

Run:

```bash
node --import tsx --test tests/knowledge-home-source-library.test.tsx
npm run typecheck
npm run build
```

Expected:
- contract test passes
- typecheck passes
- build passes

- [ ] **Step 5: Commit**

```bash
git add app/knowledge/KnowledgeHomeStatic.tsx tests/knowledge-home-source-library.test.tsx
git commit -m "feat: refresh atlas entry shell"
```

---

## Self-Review

- **Spec coverage:** The plan only refreshes `/knowledge` shell presentation and explicitly preserves inline group CRUD, `LLM Wiki` separation, and source-library behavior. No sidebar, Today, Home, Browse, or Patterns scope leaked in.
- **Placeholder scan:** No `TODO`, `TBD`, or “appropriate handling” placeholders remain. Every task names exact files, commands, and code shapes.
- **Type consistency:** The plan consistently uses `sourceLibraryGroups`, `totalCollections`, `totalDocs`, `resolvedGroups`, and `CollectionCard` as the page shell contract, matching current `main` naming instead of reviving the old branch’s `groups`-only model.

