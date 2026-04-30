import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('capture renderer does not ship temporary scroll debug UI', () => {
  const source = read('app/loom-render/capture/page.tsx');

  assert.doesNotMatch(source, /LOOM-DEBUG/);
  assert.doesNotMatch(source, /DISABLED FOR DIAGNOSIS/);
  assert.doesNotMatch(source, /_loomDebug/);
  assert.doesNotMatch(source, /zIndex:\s*99999/);
  assert.doesNotMatch(source, /\(window as any\)\.scroll(To|By)?\s*=/);
  assert.doesNotMatch(source, /Object\.defineProperty\(Element\.prototype,\s*'scrollTop'/);
  assert.match(source, /const activeSlug = useActiveSection\(slugs\);/);
  assert.match(source, /setReadProgress\(pct\);/);
});

test('capture reader owns document scroll and forwards media wheel gestures', () => {
  const source = read('app/loom-render/capture/page.tsx');

  // Reader-scroll classes still mounted on root + body so the reader
  // route owns document scrolling instead of nested webview chrome.
  assert.match(source, /loom-capture-reader-scroll/);
  assert.match(source, /classList\.add\('loom-capture-reader-scroll'\)/);

  // Wheel listener still registered with capture+non-passive so we can
  // preventDefault on media-targeted wheels.
  assert.match(source, /window\.addEventListener\('wheel', onWheel, \{ capture: true, passive: false \}\)/);

  // Listener still narrows to media elements only (so prose scroll is
  // native; only video / iframe / canvas / fallback cards trigger the
  // forwarding path).
  assert.match(source, /target\.closest\(/);
  assert.match(source, /video, audio, iframe, canvas, \.loom-embed-card, \.loom-provider-embed-frame, \.loom-media-fallback/);

  // Wheel deltaMode normalization: page / line / pixel still distinguished.
  assert.match(source, /event\.deltaMode === WheelEvent\.DOM_DELTA_PAGE/);
  assert.match(source, /event\.deltaMode === WheelEvent\.DOM_DELTA_LINE/);

  // Forwarding now uses RAF-batched scrollBy (per peer-chat msg-036
  // fix to "scroll-jitter on macOS trackpad due to per-event instant
  // scrollTo destroying native momentum smoothing"). Assertion shape
  // matches the new implementation: deltas accumulate into pendingDy,
  // a single requestAnimationFrame schedules a flushScroll that calls
  // window.scrollBy once per frame.
  assert.match(source, /pendingDy/);
  assert.match(source, /requestAnimationFrame\(flushScroll\)/);
  assert.match(source, /window\.scrollBy\(\{ top: pendingDy, left: 0 \}\)/);
  assert.match(source, /event\.preventDefault\(\)/);

  // Reader-route layout glue + class plumbing unchanged.
  assert.match(source, /html\.loom-capture-reader-scroll body \.layout/);
  assert.match(source, /overflow-y: auto !important/);
  assert.match(source, /className="loom-capture-reader-route"/);
  assert.match(source, /\.loom-capture-reader-route \{/);
});

test('snapshot renderer expands full-page captures into parent scroll flow', () => {
  const source = read('app/loom-render/snapshot/page.tsx');

  assert.match(source, /const \[snapshotHeight, setSnapshotHeight\] = useState<number \| null>\(null\)/);
  assert.match(source, /function measureSnapshotFrameHeight/);
  assert.match(source, /Math\.max\([^)]*documentElement\.scrollHeight/);
  assert.match(source, /setSnapshotHeight\(nextHeight\)/);
  assert.match(source, /requestAnimationFrame\(measureSnapshotFrameHeight\)/);
  assert.match(source, /window\.setTimeout\(measureSnapshotFrameHeight, 120\)/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /className=\{`snapshot-frame-wrap \$\{fullscreen \? 'constrained' : 'auto-height'\}`\}/);
  assert.match(source, /style=\{!fullscreen && snapshotHeight/);
  assert.match(source, /\.snapshot-frame-wrap\.auto-height/);
  assert.match(source, /\.snapshot-frame-wrap\.constrained/);
  assert.match(source, /overflow: visible/);
});

test('snapshot renderer does not expose or persist side-by-side comparison UI', () => {
  const source = read('app/loom-render/snapshot/page.tsx');

  assert.doesNotMatch(source, /loom\.snapshot\.sideBySide/);
  assert.doesNotMatch(source, /loom\.snapshot\.splitRatio/);
  assert.doesNotMatch(source, /loom\.snapshot\.splitSwapped/);
  assert.doesNotMatch(source, /loom\.snapshot\.scrollLock/);
  assert.doesNotMatch(source, /Side by Side/);
  assert.doesNotMatch(source, /onToggleSideBySide/);
  assert.doesNotMatch(source, /setSideBySide/);
  assert.doesNotMatch(source, /setSplitRatio/);
  assert.doesNotMatch(source, /setSplitSwapped/);
});

test('capture reader exposes stored snapshots as auxiliary evidence, not comparison mode', () => {
  const source = read('app/loom-render/capture/page.tsx');

  assert.match(source, /title="Open stored source snapshot"/);
  assert.match(source, /aria-label="Open stored source snapshot"/);
  assert.match(source, /<span>Snapshot<\/span>/);
  assert.doesNotMatch(source, /Compare with stored snapshot/);
  assert.doesNotMatch(source, /Compare with snapshot/);
  assert.doesNotMatch(source, /<span>Compare<\/span>/);
});
