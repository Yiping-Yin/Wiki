# User Data Convention

**Established 2026-04-20 after `source-library-metadata` manifest-wipe
incident.**

## Rule

User-persistent state never lives inside the runtime bundle. It lives at
`~/Library/Application Support/Loom/user-data/`.

## Why

`scripts/stage-loom-runtime.mjs` atomically replaces the runtime root
(`~/Library/Application Support/Loom/runtime/<buildId>/`) on every
`npm run app:user`. Anything inside that root is wiped. Any future
feature that stores user decisions must live elsewhere.

## The path helpers (lib/paths.ts)

```ts
loomAppSupportRoot()        // ~/Library/Application Support/Loom
loomUserDataRoot()          // ~/Library/Application Support/Loom/user-data  (override: LOOM_USER_DATA_ROOT)
loomRuntimeRegistryPath()   // ~/.../Loom/runtime
loomActivationRecordPath()  // ~/.../Loom/runtime/current.json   (pipeline-owned)
loomContentRootConfigPath() // ~/.../Loom/content-root.json      (pipeline-owned)
```

## Storage inventory (as of 2026-04-20)

| What | Where | Notes |
|---|---|---|
| Source-library manifest (groups / memberships / hides) | `user-data/knowledge/manifest/source-library-groups.json` | Migrated from runtime 2026-04-20. |
| Traces | IndexedDB `loom` / `traces` | Browser-local, survives rebuilds. |
| Panels | IndexedDB `loom` / `panels` | Browser-local. |
| Weaves | IndexedDB `loom-weaves` / `weaves` | Browser-local. |
| Note embeddings | IndexedDB `loom-embeddings` / `vectors` | Browser-local. |
| AI CLI preference | `localStorage` | Browser-local. |
| Overlay session resume | `sessionStorage` | Ephemeral. |

## The checklist for any NEW persistent user state

Before writing to disk, answer these:

1. **Is this user data or build output?** Build output is regenerable
   (indexes, generated summaries, compiled assets). Anything a user would
   be upset to lose on rebuild is user data.

2. **For user data: does the path derive from `loomUserDataRoot()` or
   `LOOM_USER_DATA_ROOT`?** If not, reject.

3. **For build output: does the stage/install pipeline regenerate it?**
   If not, it should move to user data.

4. **Schema versioning: if this is IndexedDB, will the next schema change
   include an `onupgradeneeded` migration?** Silent version mismatches
   orphan user data.

## How to add a new user-data location

```ts
// lib/my-feature/storage.ts
import path from 'node:path';
import { loomUserDataRoot } from '../paths';

function myFeatureRoot() {
  return path.join(loomUserDataRoot(), 'my-feature');
}
```

## How to verify a feature respects this convention

Grep for any `process.cwd()` in storage paths. Grep for any
`knowledge/.cache/` writes (those are build output, not user data).
Grep for any direct `path.join(homedir(), 'Library', 'Application Support', 'Loom', 'runtime'`
(that's runtime-owned, hands off).
