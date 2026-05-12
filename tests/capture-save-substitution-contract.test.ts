// Capture save-substitution contract — pins the V7 invariants that
// emerged from the 2026-05-02 flipdisc.io bug report. The user observed
// a saved capture body containing `<video src="loom://media/pwxg78n9">`
// (transient capture-pipeline URL) that the reader silently downgraded
// to an "Animation unavailable" card with no recovery action. Root cause
// is in Swift CaptureSheet.swift's `writeMediaAttachments` policy:
// "Media write failures are non-fatal: a missing attachment leaves the
// placeholder URL in the body." V7 forbids silent failures.
//
// This test does NOT yet assert against the Swift fix (deferred to
// Codex); it pins the reader-side mitigation and the explicit comment
// markers that flag the policy as a known V7 violation pending fix.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8');
}

test('reader distinguishes transient-URL save failure from playback failure for canvas recordings', () => {
  const source = read('app/loom-render/capture/page.tsx');

  // Detection — reader recognises `loom://media/` as the transient case.
  assert.match(source, /const\s+isTransientRef\s*=\s*href\.startsWith\('loom:\/\/media\/'\)/);

  // Diagnostic — V7 requires loud signal. Reader logs a distinct
  // console.warn naming substitution as the failed pass.
  assert.match(
    source,
    /console\.warn\(\s*['"`]\[Loom capture render\] transient loom:\/\/media\/ URL persisted to body/,
  );

  // Two-mode messaging — the Re-capture CTA only appears on the
  // recoverable failure (transient URL); the recording-quality failure
  // keeps the existing "Animation unavailable" copy.
  assert.match(source, /Recording was not saved/);
  assert.match(source, /Use the Re-capture button at the top of this page to retry/);
  assert.match(source, /Animation unavailable/);
});

test('reader downgrade card includes an action span only for the transient-URL recovery case', () => {
  const source = read('app/loom-render/capture/page.tsx');

  // The action span is conditionally pushed only when the failure is
  // recoverable. If a future change moves "Use the Re-capture button"
  // into the unconditional parts array, the user would see a stale CTA
  // on real recording failures (where re-capture won't help).
  assert.match(
    source,
    /if\s*\(action\)\s*parts\.push\(`<span class="loom-media-fallback-action">/,
  );
});

test('Swift save policy comment flags the silent-substitution-failure as a known V7 gap', () => {
  // Pin the EXISTING Swift comment so anyone editing the policy must
  // also update the V7 contract. If the comment is removed without
  // also fixing the silent-fail behavior, this test breaks loud.
  const captureSheet = read('macos-app/Loom/Sources/CaptureSheet.swift');

  assert.match(
    captureSheet,
    /Media write failures are non-fatal: a missing[\s\S]*attachment leaves the placeholder URL in the body/,
  );

  // The substitution call must run BEFORE renderEntry. Pin the call
  // ordering — moving renderEntry above writeMediaAttachments would
  // serialize transient URLs into the rendered markdown.
  const renderEntryIdx = captureSheet.indexOf('let entry = renderEntry(working)');
  const writeMediaIdx = captureSheet.indexOf('try writeMediaAttachments(payload: &working');
  assert.ok(writeMediaIdx > 0, 'writeMediaAttachments call must exist');
  assert.ok(renderEntryIdx > 0, 'renderEntry call must exist');
  assert.ok(
    writeMediaIdx < renderEntryIdx,
    'writeMediaAttachments must run BEFORE renderEntry so substitution mutates the working payload first',
  );
});
