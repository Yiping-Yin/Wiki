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
  // Locate the wheel handler block (between `const onWheel =` and
  // `window.addEventListener('wheel', onWheel`).
  const handlerStart = source.indexOf('const onWheel = (event: WheelEvent)');
  const handlerEnd = source.indexOf("window.addEventListener('wheel', onWheel", handlerStart);
  assert.ok(handlerStart > 0 && handlerEnd > handlerStart, 'wheel handler block missing');
  const handler = source.slice(handlerStart, handlerEnd);
  // The deltaY-< 1 prefilter must NOT exist — it caused the consumed-by-
  // media regression.
  assert.doesNotMatch(handler, /if\s*\(\s*Math\.abs\(\s*event\.deltaY\s*\)\s*<\s*1\s*\)\s*return/);
});

test('flushScroll preserves sub-pixel accumulation across below-threshold ticks', () => {
  const source = read('app/loom-render/capture/page.tsx');
  const flushStart = source.indexOf('const flushScroll = () => {');
  assert.ok(flushStart > 0, 'flushScroll definition missing');
  const flushEnd = source.indexOf('};', flushStart) + 2;
  const flushBody = source.slice(flushStart, flushEnd);
  // Below-threshold flushes must NOT reset pendingDy; resetting silently
  // discards sub-pixel motion accumulated across multiple wheel events.
  assert.doesNotMatch(flushBody, /<\s*0\.5\s*\)\s*\{[^}]*pendingDy\s*=\s*0/);
  // The scroll-and-reset path must still happen on actual scroll.
  assert.match(flushBody, /window\.scrollBy\(/);
});

test('wheel batcher cleanup calls cancelAnimationFrame', () => {
  const source = read('app/loom-render/capture/page.tsx');
  // Locate the effect's cleanup block — starts after the addEventListener
  // line, ends at `}, []);` for the empty-deps array.
  const addListenerIdx = source.indexOf("window.addEventListener('wheel', onWheel");
  const effectEndIdx = source.indexOf('}, []);', addListenerIdx);
  assert.ok(effectEndIdx > addListenerIdx, 'wheel effect cleanup block missing');
  const cleanupRegion = source.slice(addListenerIdx, effectEndIdx);
  assert.match(cleanupRegion, /cancelAnimationFrame\(rafId\)/);
});

test('wheel listener still uses capture phase + passive:false (preventDefault must work)', () => {
  const source = read('app/loom-render/capture/page.tsx');
  assert.match(
    source,
    /window\.addEventListener\('wheel',\s*onWheel,\s*\{\s*capture:\s*true,\s*passive:\s*false\s*\}\s*\)/,
  );
});
