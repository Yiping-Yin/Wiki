/**
 * Phase 5 cleanup — stub (2026-04-22).
 *
 * The architecture inversion retired the bundled Node runtime: the app
 * now ships as a static export (`.next-export/`) staged into the .app
 * bundle's `Resources/web/` by the Xcode preBuildScript. The Swift
 * runtime reads `loom://bundle/*` directly, never launches Node, and
 * never consults `~/Library/Application Support/Loom/runtime/`.
 *
 * `install-loom-app.mjs` and `package-loom-app.mjs` still call
 * `stageRuntimeBundle` via their legacy flow — this stub keeps that
 * contract (same export shape, same return-null semantics) so the
 * install/package pipelines run without the multi-minute rsync cost
 * they used to pay. Net effect: runtime staging is a no-op; rollback
 * paths in callers see `stagedRuntimeRoot = null` and skip cleanup.
 *
 * Keeping the stub rather than deleting the file preserves the
 * existing import graph (`import { stageRuntimeBundle } from …`), so
 * no call-site edits are needed. Delete the whole file + unwind call
 * sites once a post-sandbox-flip e2e install smoke test confirms the
 * stub path stays clean across every mode (user / system / auto).
 */

/**
 * @typedef {object} StageRuntimeBundleOptions
 * @property {string} [repoRoot]
 * @property {string} [homeOverride]
 * @property {string} [runtimeBaseOverride]
 */

/**
 * @param {StageRuntimeBundleOptions} [_options]
 * @returns {Promise<null>}
 */
export async function stageRuntimeBundle(_options) {
  return null;
}

// Legacy helper kept for the test file that targets it directly; no
// consumer calls it.
export function runtimeBaseDir() {
  return null;
}
