// Capture reader wheel-batcher contract — pins the 2026-05-02 fix for
// "scroll stuck" on saved captures with tall video/canvas regions.
// Root cause was twofold:
//   1. Prefilter `if (Math.abs(event.deltaY) < 1) return` let fractional
//      deltaY events (macOS precision trackpad with momentum tail) bypass
//      the batcher entirely; native scroll then saw them get consumed by
//      the video element underneath.
//   2. Inside flushScroll, `if (...< 0.5) { pendingDy = 0; return }` reset
//      the accumulator, silently discarding sub-pixel motion; combined
//      with #1 this could stall the page.
// The fix removes the prefilter, drops the reset, and adds proper
// `cancelAnimationFrame` on cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8');
}

test('reader wheel handler does NOT prefilter fractional deltaY events', () => {
  const source = read('app/loom-render/capture/page.tsx');
  const handlerStart = source.indexOf('const onWheel = (event: WheelEvent)');
  const handlerEnd = source.indexOf("window.addEventListener('wheel', onWheel", handlerStart);
  assert.ok(handlerStart > 0 && handlerEnd > handlerStart, 'wheel handler block missing');
  const handler = source.slice(handlerStart, handlerEnd);
  assert.doesNotMatch(handler, /if\s*\(\s*Math\.abs\(\s*event\.deltaY\s*\)\s*<\s*1\s*\)\s*return/);
});

test('flushScroll preserves sub-pixel accumulation across below-threshold ticks', () => {
  const source = read('app/loom-render/capture/page.tsx');
  const flushStart = source.indexOf('const flushScroll = () => {');
  assert.ok(flushStart > 0, 'flushScroll definition missing');
  const flushEnd = source.indexOf('};', flushStart) + 2;
  const flushBody = source.slice(flushStart, flushEnd);
  assert.doesNotMatch(flushBody, /<\s*0\.5\s*\)\s*\{[^}]*pendingDy\s*=\s*0/);
  assert.match(flushBody, /window\.scrollBy\(/);
});

test('cleanup uses cancelAnimationFrame to avoid leaked RAF on unmount', () => {
  const source = read('app/loom-render/capture/page.tsx');
  const cleanupStart = source.indexOf("window.removeEventListener('wheel'");
  assert.ok(cleanupStart > 0, 'cleanup block missing');
  const cleanupEnd = source.indexOf('};', cleanupStart) + 2;
  const cleanupBody = source.slice(cleanupStart, cleanupEnd);
  assert.match(cleanupBody, /cancelAnimationFrame\(/);
});

test('wheel listener still uses { capture: true, passive: false }', () => {
  const source = read('app/loom-render/capture/page.tsx');
  assert.match(
    source,
    /window\.addEventListener\(\s*['"]wheel['"]\s*,\s*onWheel\s*,\s*\{\s*capture:\s*true\s*,\s*passive:\s*false\s*\}\s*\)/,
  );
});
