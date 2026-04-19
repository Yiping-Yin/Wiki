# Atlas Source Library IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `Atlas` into an editable raw source library while keeping `LLM Wiki` separate, with grouping driven by Loom-owned metadata and no mutation of original source files.

**Architecture:** Keep the current ingest pipeline as the read-only source discovery layer, but overlay it with a new local grouping metadata layer. The sidebar, `/knowledge`, and Shuttle will stop treating all categories as one Atlas blob; instead they will render raw source groups from metadata, while `LLM Wiki` remains a separate fixed navigation family. All grouping edits operate on metadata only; original files and paths remain immutable.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, node:test via `tsx`, local JSON metadata persisted inside the repo runtime cache / Loom-owned data area

---

## File Map

- Create: `lib/source-library-metadata.ts`
  Single source of truth for editable raw-source grouping metadata: file format, reads, writes, normalization, and fallback behavior.

- Create: `app/api/source-library/groups/route.ts`
  Read and write group definitions (`add`, `rename`, `delete`) without touching source files.

- Create: `app/api/source-library/membership/route.ts`
  Move a source collection or category into a chosen group by updating metadata only.

- Modify: `lib/knowledge-types.ts`
  Add the minimum types needed to distinguish raw source categories from presentation groups.

- Modify: `lib/knowledge-store.ts`
  Read grouping metadata and expose a grouped raw-source view for UI consumers, while keeping current manifest/doc access intact.

- Modify: `lib/use-knowledge-nav.ts`
  Return the split navigation model instead of a flat `knowledgeCategories` list.

- Modify: `components/Sidebar.tsx`
  Render `Atlas` as grouped raw sources with editable groups, and rename `LLM Reference` to `LLM Wiki`.

- Modify: `app/knowledge/page.tsx`
  Change the knowledge landing page to render editable raw-source groups rather than path-derived top-level buckets.

- Modify: `app/knowledge/KnowledgeHomeClient.tsx`
  Pass through the new grouped source-library payload and group CRUD hooks.

- Modify: `app/knowledge/KnowledgeHomeStatic.tsx`
  Render the grouped raw-source library UI, including add / rename / delete affordances in the first pass.

- Modify: `components/QuickSwitcher.tsx`
  Split search groups so raw source library collections and `LLM Wiki` results are separate families.

- Modify: `scripts/ingest-knowledge.ts`
  Preserve the current read-only manifest generation, but stop making filesystem-derived grouping the final display truth.

- Create: `tests/source-library-metadata.test.ts`
  Unit tests for metadata CRUD and fallback behavior.

- Create: `tests/sidebar-source-library-ia.test.tsx`
  Source-level contract tests for sidebar separation: `Atlas` editable library + `LLM Wiki` separate section.

- Create: `tests/knowledge-home-source-library.test.tsx`
  Source-level contract tests for `/knowledge` rendering grouped raw-source library sections.

- Create: `tests/source-library-api.test.ts`
  Route contract tests for group CRUD and membership updates.

---

### Task 1: Lock the New IA Contract with Failing Tests

**Files:**
- Create: `tests/sidebar-source-library-ia.test.tsx`
- Create: `tests/knowledge-home-source-library.test.tsx`
- Create: `tests/source-library-api.test.ts`
- Test: `components/Sidebar.tsx`
- Test: `app/knowledge/page.tsx`
- Test: `app/knowledge/KnowledgeHomeStatic.tsx`
- Test: `app/api/source-library/groups/route.ts`
- Test: `app/api/source-library/membership/route.ts`

- [ ] **Step 1: Write the sidebar IA contract test**

```tsx
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('Sidebar separates Atlas source groups from LLM Wiki navigation', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'components/Sidebar.tsx'), 'utf8');

  assert.match(source, /Section title="The Atlas"/);
  assert.match(source, /Section title="LLM Wiki"/);
  assert.match(source, /SourceLibraryGroupRow/);
  assert.doesNotMatch(source, /Section title="LLM Reference"/);
});
```

- [ ] **Step 2: Write the `/knowledge` source-library contract test**

```tsx
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('knowledge home renders grouped raw-source library sections instead of path-derived top buckets', () => {
  const pageSource = fs.readFileSync(path.join(repoRoot, 'app/knowledge/page.tsx'), 'utf8');
  const staticSource = fs.readFileSync(path.join(repoRoot, 'app/knowledge/KnowledgeHomeStatic.tsx'), 'utf8');

  assert.match(pageSource, /getSourceLibraryGroups/);
  assert.match(staticSource, /Add group/);
  assert.match(staticSource, /Delete group/);
  assert.match(staticSource, /Rename group/);
});
```

- [ ] **Step 3: Write the API route contract test**

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('source library routes exist for group CRUD and membership reassignment', () => {
  const groupsRoute = fs.readFileSync(
    path.join(repoRoot, 'app/api/source-library/groups/route.ts'),
    'utf8',
  );
  const membershipRoute = fs.readFileSync(
    path.join(repoRoot, 'app/api/source-library/membership/route.ts'),
    'utf8',
  );

  assert.match(groupsRoute, /export async function GET/);
  assert.match(groupsRoute, /export async function POST/);
  assert.match(groupsRoute, /export async function PATCH/);
  assert.match(groupsRoute, /export async function DELETE/);
  assert.match(membershipRoute, /export async function PATCH/);
});
```

- [ ] **Step 4: Run the contract tests and verify they fail**

Run:

```bash
node --import tsx --test \
  tests/sidebar-source-library-ia.test.tsx \
  tests/knowledge-home-source-library.test.tsx \
  tests/source-library-api.test.ts
```

Expected:

- `Sidebar` still says `LLM Reference`
- there is no grouped source-library metadata path yet
- the source-library API routes do not exist

- [ ] **Step 5: Commit the failing tests**

```bash
git add \
  tests/sidebar-source-library-ia.test.tsx \
  tests/knowledge-home-source-library.test.tsx \
  tests/source-library-api.test.ts
git commit -m "test: lock atlas source library IA contract"
```

---

### Task 2: Add the Grouping Metadata Layer

**Files:**
- Create: `lib/source-library-metadata.ts`
- Modify: `lib/knowledge-types.ts`
- Test: `tests/source-library-metadata.test.ts`

- [ ] **Step 1: Create the metadata module**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_LIBRARY_METADATA_PATH = path.join(
  ROOT,
  'knowledge',
  '.cache',
  'manifest',
  'source-library-groups.json',
);

export type SourceLibraryGroup = {
  id: string;
  label: string;
  order: number;
};

export type SourceLibraryMembership = {
  categorySlug: string;
  groupId: string;
  order: number;
};

export type SourceLibraryMetadata = {
  groups: SourceLibraryGroup[];
  memberships: SourceLibraryMembership[];
};

const EMPTY_METADATA: SourceLibraryMetadata = {
  groups: [],
  memberships: [],
};

export async function readSourceLibraryMetadata(): Promise<SourceLibraryMetadata> {
  try {
    return JSON.parse(await fs.readFile(SOURCE_LIBRARY_METADATA_PATH, 'utf8')) as SourceLibraryMetadata;
  } catch {
    return EMPTY_METADATA;
  }
}

export async function writeSourceLibraryMetadata(next: SourceLibraryMetadata) {
  await fs.mkdir(path.dirname(SOURCE_LIBRARY_METADATA_PATH), { recursive: true });
  await fs.writeFile(SOURCE_LIBRARY_METADATA_PATH, JSON.stringify(next, null, 2), 'utf8');
}
```

- [ ] **Step 2: Add the first metadata behavior helpers**

```ts
export function ensureFallbackGroup(metadata: SourceLibraryMetadata): SourceLibraryMetadata {
  if (metadata.groups.some((group) => group.id === 'ungrouped')) return metadata;
  return {
    ...metadata,
    groups: [
      { id: 'ungrouped', label: 'Ungrouped', order: 9999 },
      ...metadata.groups,
    ],
  };
}

export function assignCategoryToGroup(
  metadata: SourceLibraryMetadata,
  categorySlug: string,
  groupId: string,
): SourceLibraryMetadata {
  return {
    ...metadata,
    memberships: [
      ...metadata.memberships.filter((item) => item.categorySlug !== categorySlug),
      { categorySlug, groupId, order: 9999 },
    ],
  };
}
```

- [ ] **Step 3: Add the metadata unit tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignCategoryToGroup,
  ensureFallbackGroup,
} from '../lib/source-library-metadata';

test('ensureFallbackGroup injects an Ungrouped group exactly once', () => {
  const first = ensureFallbackGroup({ groups: [], memberships: [] });
  const second = ensureFallbackGroup(first);

  assert.equal(first.groups[0]?.id, 'ungrouped');
  assert.equal(second.groups.filter((group) => group.id === 'ungrouped').length, 1);
});

test('assignCategoryToGroup replaces previous membership without changing source files', () => {
  const next = assignCategoryToGroup(
    {
      groups: [{ id: 'ungrouped', label: 'Ungrouped', order: 9999 }],
      memberships: [{ categorySlug: 'unsw-math-2089', groupId: 'ungrouped', order: 9999 }],
    },
    'unsw-math-2089',
    'math',
  );

  assert.deepEqual(next.memberships, [
    { categorySlug: 'unsw-math-2089', groupId: 'math', order: 9999 },
  ]);
});
```

- [ ] **Step 4: Run the metadata tests**

Run:

```bash
node --import tsx --test tests/source-library-metadata.test.ts
```

Expected: pass

- [ ] **Step 5: Commit the metadata layer**

```bash
git add lib/source-library-metadata.ts lib/knowledge-types.ts tests/source-library-metadata.test.ts
git commit -m "feat: add atlas source library metadata layer"
```

---

### Task 3: Expose Group CRUD and Membership Reassignment Routes

**Files:**
- Create: `app/api/source-library/groups/route.ts`
- Create: `app/api/source-library/membership/route.ts`
- Test: `tests/source-library-api.test.ts`

- [ ] **Step 1: Add the group CRUD route**

```ts
import {
  ensureFallbackGroup,
  readSourceLibraryMetadata,
  writeSourceLibraryMetadata,
} from '../../../../lib/source-library-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await readSourceLibraryMetadata());
}

export async function POST(req: Request) {
  const body = await req.json();
  const label = String(body?.label ?? '').trim();
  if (!label) return Response.json({ error: 'label is required' }, { status: 400 });

  const current = ensureFallbackGroup(await readSourceLibraryMetadata());
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
  const next = {
    ...current,
    groups: [...current.groups, { id, label, order: current.groups.length + 1 }],
  };
  await writeSourceLibraryMetadata(next);
  return Response.json(next);
}
```

- [ ] **Step 2: Add rename and delete behavior**

```ts
export async function PATCH(req: Request) {
  const body = await req.json();
  const id = String(body?.id ?? '').trim();
  const label = String(body?.label ?? '').trim();
  if (!id || !label) return Response.json({ error: 'id and label are required' }, { status: 400 });

  const current = ensureFallbackGroup(await readSourceLibraryMetadata());
  const next = {
    ...current,
    groups: current.groups.map((group) => group.id === id ? { ...group, label } : group),
  };
  await writeSourceLibraryMetadata(next);
  return Response.json(next);
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const id = String(body?.id ?? '').trim();
  if (!id || id === 'ungrouped') {
    return Response.json({ error: 'a removable group id is required' }, { status: 400 });
  }

  const current = ensureFallbackGroup(await readSourceLibraryMetadata());
  const next = {
    groups: current.groups.filter((group) => group.id !== id),
    memberships: current.memberships.map((item) =>
      item.groupId === id ? { ...item, groupId: 'ungrouped' } : item,
    ),
  };
  await writeSourceLibraryMetadata(next);
  return Response.json(next);
}
```

- [ ] **Step 3: Add membership reassignment route**

```ts
import {
  readSourceLibraryMetadata,
  writeSourceLibraryMetadata,
  assignCategoryToGroup,
} from '../../../../lib/source-library-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  const body = await req.json();
  const categorySlug = String(body?.categorySlug ?? '').trim();
  const groupId = String(body?.groupId ?? '').trim();
  if (!categorySlug || !groupId) {
    return Response.json({ error: 'categorySlug and groupId are required' }, { status: 400 });
  }

  const current = await readSourceLibraryMetadata();
  const next = assignCategoryToGroup(current, categorySlug, groupId);
  await writeSourceLibraryMetadata(next);
  return Response.json(next);
}
```

- [ ] **Step 4: Run the route contract test**

Run:

```bash
node --import tsx --test tests/source-library-api.test.ts
```

Expected: pass

- [ ] **Step 5: Commit the API routes**

```bash
git add app/api/source-library/groups/route.ts app/api/source-library/membership/route.ts tests/source-library-api.test.ts
git commit -m "feat: add atlas source library group APIs"
```

---

### Task 4: Split Sidebar Navigation into Raw Source Library and LLM Wiki

**Files:**
- Modify: `lib/use-knowledge-nav.ts`
- Modify: `components/Sidebar.tsx`
- Test: `tests/sidebar-source-library-ia.test.tsx`

- [ ] **Step 1: Change the knowledge nav hook shape**

```ts
type SourceLibraryGroupView = {
  id: string;
  label: string;
  categories: KnowledgeCategory[];
};

type KnowledgeNavPayload = {
  knowledgeCategories: KnowledgeCategory[];
  knowledgeTotal: number;
  sourceLibraryGroups: SourceLibraryGroupView[];
};
```

- [ ] **Step 2: Render source-library groups in the Atlas section**

```tsx
<Section title="The Atlas" open={knowOpen} onToggle={() => setKnowOpen((o) => !o)} trailing={<NewTopicButton ... />}>
  {sourceLibraryGroups.map((group) => (
    <SourceLibraryGroupRow
      key={group.id}
      group={group}
      activePath={pathname}
      onNav={() => setOpen(false)}
    />
  ))}
</Section>
```

- [ ] **Step 3: Rename the fixed reference section**

```tsx
<Section title="LLM Wiki" open={llmOpen} onToggle={() => setLlmOpen((o) => !o)}>
```

- [ ] **Step 4: Run the sidebar IA test**

Run:

```bash
node --import tsx --test tests/sidebar-source-library-ia.test.tsx
```

Expected: pass

- [ ] **Step 5: Commit the sidebar split**

```bash
git add lib/use-knowledge-nav.ts components/Sidebar.tsx tests/sidebar-source-library-ia.test.tsx
git commit -m "feat: split atlas and llm wiki navigation"
```

---

### Task 5: Render `/knowledge` as the Raw Source Library

**Files:**
- Modify: `app/knowledge/page.tsx`
- Modify: `app/knowledge/KnowledgeHomeClient.tsx`
- Modify: `app/knowledge/KnowledgeHomeStatic.tsx`
- Test: `tests/knowledge-home-source-library.test.tsx`

- [ ] **Step 1: Replace path-derived top groups with metadata-backed groups**

```ts
const sourceLibraryGroups = await getSourceLibraryGroups();

return (
  <KnowledgeHomeClient
    groups={sourceLibraryGroups}
    totalCollections={knowledgeCategories.length}
    totalDocs={knowledgeTotal}
  />
);
```

- [ ] **Step 2: Add the first visible group management affordances**

```tsx
<header>
  <WorkEyebrow subtle>{group.label}</WorkEyebrow>
  <div style={{ display: 'flex', gap: 8 }}>
    <button type="button">Rename group</button>
    <button type="button">Delete group</button>
  </div>
</header>

<button type="button">Add group</button>
```

- [ ] **Step 3: Keep semantics aligned with source immutability**

```tsx
<div className="t-caption2" style={{ color: 'var(--muted)' }}>
  Grouping changes affect Loom metadata only. Original source files stay unchanged.
</div>
```

- [ ] **Step 4: Run the knowledge-home IA test**

Run:

```bash
node --import tsx --test tests/knowledge-home-source-library.test.tsx
```

Expected: pass

- [ ] **Step 5: Commit the `/knowledge` source-library home**

```bash
git add app/knowledge/page.tsx app/knowledge/KnowledgeHomeClient.tsx app/knowledge/KnowledgeHomeStatic.tsx tests/knowledge-home-source-library.test.tsx
git commit -m "feat: render atlas as raw source library"
```

---

### Task 6: Split Shuttle and Final Verification

**Files:**
- Modify: `components/QuickSwitcher.tsx`
- Test: `tests/sidebar-source-library-ia.test.tsx`
- Test: `tests/knowledge-home-source-library.test.tsx`
- Test: `tests/source-library-api.test.ts`
- Test: `tests/source-library-metadata.test.ts`

- [ ] **Step 1: Separate Shuttle families**

```tsx
{renderGroup('Source Library', grouped.collections)}
{renderGroup('LLM Wiki', grouped.docs.filter((item) => item.href.startsWith('/wiki/')))}
```

- [ ] **Step 2: Run the focused IA test set**

Run:

```bash
node --import tsx --test \
  tests/source-library-metadata.test.ts \
  tests/source-library-api.test.ts \
  tests/sidebar-source-library-ia.test.tsx \
  tests/knowledge-home-source-library.test.tsx
```

Expected: pass

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code `0`

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: exit code `0`

- [ ] **Step 5: Manual verification**

Manual checklist:

```text
1. Open the sidebar
2. Confirm Atlas raw-source groups are separate from LLM Wiki
3. Confirm LLM Reference is now labelled LLM Wiki
4. Add a source group
5. Rename it
6. Move one category into it
7. Delete the group
8. Confirm the category falls back to Ungrouped
9. Confirm no source file paths or filenames changed
```

- [ ] **Step 6: Commit the final IA slice**

```bash
git add components/QuickSwitcher.tsx
git commit -m "feat: separate raw source library from llm wiki"
```

---

## Plan Self-Review

### Spec Coverage

- Raw Source Library vs LLM Wiki split: covered by Tasks 4–6
- Immutable source rule: covered by Tasks 2, 3, and 5
- Loom-uploaded files as immutable originals: covered by Task 3 and Task 5 semantics
- Human-owned grouping with AI only advisory: covered by metadata layer and CRUD routes in Tasks 2–3
- Delete / rename / regroup semantics: covered by Task 3

### Placeholder Scan

- No `TBD`, `TODO`, or vague "handle appropriately" steps remain
- Each task names exact files and concrete commands
- Code-changing steps include explicit code blocks

### Type Consistency

- `SourceLibraryMetadata`, `SourceLibraryGroup`, and `SourceLibraryMembership` are introduced once and reused consistently
- Route names are stable: `groups/route.ts`, `membership/route.ts`
- Sidebar and knowledge-home both consume `sourceLibraryGroups`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-atlas-source-library-ia.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
