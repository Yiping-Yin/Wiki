# Commit Message Drafts

These drafts match the buckets in [COMMIT_PLAN.md](/Users/yinyiping/Desktop/Wiki/COMMIT_PLAN.md:1).

## 1. Generated Public Removals

### Subject

```text
chore: stop tracking generated public knowledge artifacts
```

### Body

```text
- remove generated knowledge doc bodies from public/knowledge/docs
- remove generated search/rag/related/atlas artifacts from public/
- keep runtime behavior intact by reading from knowledge/.cache instead
```

## 2. Knowledge Runtime Infra

### Subject

```text
refactor: move knowledge manifests and indexes to runtime cache
```

### Body

```text
- add runtime cache readers for knowledge docs, manifests, and derived indexes
- route client search/nav access through API endpoints instead of tracked public/lib files
- update ingest/search/rag/prune scripts to write into knowledge/.cache
- add refresh/verify helpers and bucket staging utilities
```

## 3. PWA Runtime

### Subject

```text
feat: add runtime PWA assets and offline precache support
```

### Body

```text
- add web manifest and service worker assets
- precache offline page for navigation fallback
- keep PWA runtime files isolated from knowledge cache changes
```

## 4. Note Trace Runtime

### Subject

```text
refactor: expand note and trace runtime primitives
```

### Body

```text
- add note/trace support modules used by the new capture and review flows
- keep state and runtime helpers separate from UI changes
- preserve existing behavior while preparing for higher-level product changes
```

## 5. Product UI

### Subject

```text
feat: ship capture-first review UI refactor
```

### Body

```text
- replace canvas-oriented review work with capture-first wide thought map editing
- update selection, review, sidebar, quick switcher, and knowledge UI flows
- simplify chrome and remove superseded components
```

## 6. macOS Shell

### Subject

```text
feat: update macOS shell app integration
```

### Body

```text
- refresh native shell commands and dev server behavior
- align the macOS wrapper with the current web runtime model
- keep native app changes isolated from web app review
```

## 7. Docs Specs

### Subject

```text
docs: add current design memory and capture specs
```

### Body

```text
- add updated design memory and capture specification docs
- preserve superseded canvas spec for history
- document the current product and logo direction
```

## Recommended Sequence

```text
1. chore: stop tracking generated public knowledge artifacts
2. refactor: move knowledge manifests and indexes to runtime cache
3. refactor: expand note and trace runtime primitives
4. feat: ship capture-first review UI refactor
5. feat: update macOS shell app integration
6. docs: add current design memory and capture specs
```

If you want fewer commits, merge 2 and 3.
