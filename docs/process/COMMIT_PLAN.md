# Commit Plan

Current worktree is best split into independent buckets instead of one large commit.

## Commands

Use these to inspect and dry-run staging:

```bash
npm run status:buckets
npm run stage:bucket -- generated-public-removals
npm run stage:bucket -- knowledge-runtime-infra
npm run stage:bucket -- note-trace-runtime
npm run stage:bucket -- product-ui
npm run stage:bucket -- macos-shell
npm run stage:bucket -- pwa-runtime
npm run stage:bucket -- docs-specs
```

To stage for real on a normal local terminal:

```bash
npm run stage:bucket -- <bucket> --apply
```

Note: in the current Codex session, writing `.git/index.lock` is denied, so `--apply` may fail here even though the dry-run output is correct.

## Suggested Order

### 1. `generated-public-removals`

Scope:
- Delete old tracked generated files from `public/`
- Includes `public/knowledge/docs/`, `public/search-index.json`, `public/rag-index.json`, `public/related.json`, `public/atlas.json`

Why first:
- Largest noise source
- Mechanically separate from product behavior
- Makes later commits readable

### 2. `knowledge-runtime-infra`

Scope:
- Runtime cache migration under `knowledge/.cache/`
- Search/nav APIs
- CLI/runtime config
- ingest/search/rag/prune/typecheck/smoke helper scripts
- deletion of legacy `lib/knowledge*.json|ts`

Why second:
- Explains why bucket 1 deletes are valid
- Establishes new source of truth

### 3. `pwa-runtime`

Scope:
- `public/manifest.webmanifest`
- `public/sw.js`

Why third:
- Small isolated runtime change
- Can be folded into bucket 2 if preferred

### 4. `note-trace-runtime`

Scope:
- `lib/trace/`
- `lib/note/`
- `lib/capture/`
- related helper modules under `lib/`

Why fourth:
- Lower-level behavior changes, but not part of the knowledge-cache migration itself

### 5. `product-ui`

Scope:
- `app/`
- `components/`
- `mdx-components.tsx`

Why fifth:
- This is the actual user-facing redesign/refactor
- Best reviewed once infra churn is already separated

### 6. `macos-shell`

Scope:
- `macos-app/Loom/**`

Why sixth:
- Native shell changes are a separate review axis

### 7. `docs-specs`

Scope:
- `docs/design/CANVAS_SPEC.md`
- `docs/design/CAPTURE_SPEC.md`
- `docs/design/DESIGN_MEMORY.md`
- `docs/design/LOGO_BRIEF.md`

Why last:
- Optional to keep separate as project memory / design documentation

## Practical Recommendation

If you want the cleanest history, use 5 commits:

1. generated public removals
2. knowledge runtime/cache migration + PWA runtime
3. note/trace/runtime support
4. product UI refactor
5. macOS shell + docs/specs

If you want fewer commits, merge buckets 2 and 3.
