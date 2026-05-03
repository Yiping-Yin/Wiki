// Capture save-substitution contract — pins the V7 invariants that
// emerged from the 2026-05-02 flipdisc.io bug report. The user observed
// a saved capture body containing `<video src="loom://media/pwxg78n9">`
// (transient capture-pipeline URL) that the reader silently downgraded
// to an "Animation unavailable" card with no recovery action. Root cause
// is in Swift CaptureSheet.swift's `writeMediaAttachments` policy:
// "Media write failures are non-fatal: a missing attachment leaves the
// placeholder URL in the body." V7 forbids silent failures.
//
// This test pins the reader-side mitigation: detection, console.warn
// diagnostic, and two-mode messaging that surfaces the recoverable
// transient-URL case distinctly from the legacy "Animation unavailable"
// copy reserved for genuine recording-quality failures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8');
}

test('reader detects the transient loom://media/ case via isTransientRef', () => {
  const source = read('app/loom-render/capture/page.tsx');
  assert.match(source, /const\s+isTransientRef\s*=\s*href\.startsWith\(['"]loom:\/\/media\/['"]\)/);
});

test('reader emits a V7 console.warn naming substitution as the failed pass', () => {
  const source = read('app/loom-render/capture/page.tsx');
  assert.match(
    source,
    /console\.warn\(\s*['"`]\[Loom capture render\] transient loom:\/\/media\/ URL persisted to body/,
  );
});

test('reader uses two-mode messaging — recoverable transient case vs genuine recording failure', () => {
  const source = read('app/loom-render/capture/page.tsx');
  // Transient case copy.
  assert.match(source, /Recording was not saved/);
  assert.match(source, /Use the Re-capture button at the top of this page to retry/);
  // Genuine recording-quality failure copy stays distinct.
  assert.match(source, /Animation unavailable/);
});

test('action span is conditionally appended (only when an action exists)', () => {
  const source = read('app/loom-render/capture/page.tsx');
  // The action span must NOT be unconditionally pushed — otherwise the
  // genuine recording-quality "Animation unavailable" card grows a stale
  // CTA. Conditional gate must exist around the action push.
  assert.match(
    source,
    /if\s*\(action\)\s*parts\.push\(`<span class="loom-media-fallback-action">/,
  );
});
