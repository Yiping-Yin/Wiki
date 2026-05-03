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

test('capture reader owns document scroll natively (Tier 2 retires the wheel batcher)', () => {
  const source = read('app/loom-render/capture/page.tsx');

  // Reader-scroll classes still mounted on root + body so the reader
  // route owns document scrolling instead of nested webview chrome.
  assert.match(source, /loom-capture-reader-scroll/);
  assert.match(source, /classList\.add\('loom-capture-reader-scroll'\)/);

  // Tier 2 (2026-05-02) retired the custom wheel batcher entirely.
  // The wheel batcher existed to prevent inline media (video/audio)
  // from eating wheel events; per-block CSS containment plus
  // click-to-mount video make that wheel-eating problem moot at the
  // architecture level. Re-introducing a custom wheel handler would
  // recreate the very oscillation Tier 2 fixed. (We allow the
  // diagnostic `onWheelTrace` passive logger to remain — it does
  // not preventDefault and merely records first-N events for
  // bisecting; the negation matches the active batcher only.)
  assert.doesNotMatch(source, /const onWheel = \(event: WheelEvent\)/);
  assert.doesNotMatch(source, /window\.addEventListener\('wheel', onWheel,\s*\{\s*capture:\s*true,\s*passive:\s*false/);
  assert.doesNotMatch(source, /requestAnimationFrame\(flushScroll\)/);
  assert.doesNotMatch(source, /window\.scrollBy\(\{ top: pendingDy/);

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

test('capture reader offers a Reader/Snapshot toggle (snapshot is the default surface)', () => {
  const source = read('app/loom-render/capture/page.tsx');

  // 2026-05-02: snapshot view (full original-page layout in a
  // sandboxed iframe) is now the primary capture surface. Reader
  // (Tier 2 prose blocks) is the secondary view, accessed via the
  // toolbar toggle. The legacy "Open stored source snapshot" link
  // (which navigated away to the snapshot route) is gone — the
  // toggle now switches the inline render in-place.
  assert.match(source, /Switch to snapshot view/);
  assert.match(source, /Switch to reader view/);
  assert.match(source, /loom-capture-snapshot-frame/);
  assert.match(source, /loom-capture-snapshot-iframe/);
  assert.match(source, /effectiveViewMode === 'snapshot' && hasSnapshot/);
  // Default view mode is `snapshot` — the user's explicit ask
  // ("complete original page layout including styles + interactive
  // elements"); reader is preserved as the secondary surface. The
  // default does NOT read from localStorage because any stale value
  // from earlier sessions would silently override the default and
  // trap users in reader mode.
  assert.match(source, /useState<CaptureViewMode>\('snapshot'\)/);
  // Side-by-side comparison UI was previously removed and stays
  // out — snapshot is one mode, reader is another, never both at
  // once.
  assert.doesNotMatch(source, /Compare with stored snapshot/);
  assert.doesNotMatch(source, /Compare with snapshot/);
  assert.doesNotMatch(source, /<span>Compare<\/span>/);
});
