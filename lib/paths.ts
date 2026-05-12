/**
 * Loom path conventions — single source of truth for file locations.
 *
 * Division of responsibility:
 *
 * 1. **Build artifacts** live inside the repo (`~/Desktop/LOOM/.next-build/`)
 *    and inside the runtime bundle
 *    (`~/Library/Application Support/Loom/runtime/<buildId>/...`).
 *    The stage/install pipeline (scripts/stage-loom-runtime.mjs) assumes
 *    FULL ownership of the runtime bundle — it atomically replaces it on
 *    every `npm run app:user`. **Never write user data into the runtime.**
 *
 * 2. **User data** lives in a stable location OUTSIDE the runtime:
 *    `~/Library/Application Support/Loom/user-data/`
 *    This directory is never touched by stage/install. Any future
 *    user-persistent state must live here, not inside the bundle.
 *    Overridable via `LOOM_USER_DATA_ROOT` for tests.
 *
 * 3. **Managed runtime state** (activation pointer, content-root pointer)
 *    lives at the app-support root:
 *    `~/Library/Application Support/Loom/runtime/current.json`
 *    `~/Library/Application Support/Loom/content-root.json`
 *    These are pipeline-owned pointers, not user data.
 *
 * 4. **Derived caches** built from user-picked source folders live at:
 *    `~/Library/Application Support/Loom/derived/`
 *    This includes knowledge manifests, extracted doc cache, and search
 *    indexes. The selected source folder is read-only.
 *
 * Rule of thumb: if losing it on rebuild would surprise the user, it
 * belongs under `user-data/`.
 */

import { homedir } from 'node:os';
import path from 'node:path';

export function loomAppSupportRoot(): string {
  return path.join(homedir(), 'Library', 'Application Support', 'Loom');
}

export function loomUserDataRoot(): string {
  const override = process.env.LOOM_USER_DATA_ROOT?.trim();
  if (override) return override;
  return path.join(loomAppSupportRoot(), 'user-data');
}

export function loomDerivedDataRoot(): string {
  const override = process.env.LOOM_DERIVED_DATA_ROOT?.trim();
  if (override) return override;
  return path.join(loomAppSupportRoot(), 'derived');
}

export function knowledgeDerivedCacheRoot(): string {
  return path.join(loomDerivedDataRoot(), 'knowledge', '.cache');
}

export function knowledgeUserDataRoot(): string {
  return path.join(loomUserDataRoot(), 'knowledge');
}

export function knowledgeUploadRoot(): string {
  return path.join(knowledgeUserDataRoot(), 'uploads');
}

export function loomRuntimeRegistryPath(): string {
  return path.join(loomAppSupportRoot(), 'runtime');
}

export function loomActivationRecordPath(): string {
  return path.join(loomRuntimeRegistryPath(), 'current.json');
}

export function loomContentRootConfigPath(): string {
  return path.join(loomAppSupportRoot(), 'content-root.json');
}
