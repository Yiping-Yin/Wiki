'use client';

import { useEffect, useMemo, useState, Suspense, useCallback, useRef } from 'react';
import { StageShell } from '../../../components/StageShell';
import { QuietScene } from '../../../components/QuietScene';
import { PageFrame } from '../../../components/PageFrame';
import { CollapseSection } from '../../../components/CollapseSection';
import { Eyebrow } from '../../../components/loom';

// Phase C M2 / magazine landing — replaces the SwiftUI flat row stack
// for `Captures` with a sectioned magazine view + pivot bar. Two-axis
// info architecture:
//   - Magazine sections (default axis): time-based grouping
//     Today / Yesterday / This Week / Earlier This Month / Older
//   - Pivot bar (orthogonal axis): one-click filter switch:
//     All / Today / This Week / Starred / Inbox / Web / [domain chips] / [tag chips]
// Both axes use CollapseSection so the user can scan headers and
// expand only what they care about.
//
// Persisted state (sandbox-backed v1, localStorage fallback):
//   Primary:   loom://native/capture-metadata{,-all}.json — sidecar
//              JSON next to each Loom.md, schema documented in
//              LoomURLSchemeHandler.swift (handleCaptureMetadataRequest +
//              buildCaptureMetadataAllPayload).
//   Fallback:  loom:starred:{stableKey}        → "1" | "0"
//              loom:tags:{stableKey}           → JSON array of tag strings
//              loom:read-progress:{stableKey}  → "0".."100"
//              loom:last-visited:{stableKey}   → ms since epoch
//
// On first load we hydrate from the bridge. If the bridge succeeds and
// returns no entries while localStorage has some, we import them once
// (writing each into the bridge) and set `loom:metadata-imported:1` so
// we don't re-import on subsequent loads. localStorage is still mirrored
// on every write so the page stays usable when the bridge is missing
// (e.g. the captures landing opened in a stock browser for debugging).

interface CaptureEntry {
  id: string;
  rootID: string;
  rootLabel: string;
  kind: 'inbox' | 'web' | 'page' | 'passage' | 'other';
  subPath: string;
  domain: string;
  title: string;
  eyebrow: string;
  snippet: string;
  timestamp?: string;
  timestampEpoch?: number;
  // Phase D — newest Loom-snapshot-*.html in the entry's directory,
  // when present. Surfaces a "Snapshot" affordance in the row actions.
  snapshotFilename?: string;
}

type PivotKey =
  | { kind: 'all' }
  | { kind: 'today' }
  | { kind: 'thisWeek' }
  | { kind: 'starred' }
  | { kind: 'anchor'; anchor: 'inbox' | 'web' | 'page' | 'passage' }
  | { kind: 'domain'; domain: string }
  | { kind: 'tag'; tag: string };

function pivotEq(a: PivotKey, b: PivotKey): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'anchor' && b.kind === 'anchor') return a.anchor === b.anchor;
  if (a.kind === 'domain' && b.kind === 'domain') return a.domain === b.domain;
  if (a.kind === 'tag' && b.kind === 'tag') return a.tag === b.tag;
  return true;
}

// Stable per-entry key for localStorage. Mirrors the bridge's notion of
// identity (rootID + title + eyebrow) without the directory path, so the
// star/tag state survives folder shuffles.
function stableKeyOf(e: { rootID: string; title: string; eyebrow: string }): string {
  return `${e.rootID}:${e.title}:${e.eyebrow}`;
}

// GroupingMode controls the *section axis* (rows are grouped within
// these). Independent from the pivot bar (which filters).
//   - 'date'  → Today / Yesterday / This Week / …  (default, original)
//   - 'topic' → cluster by extracted keyword (TF-style, see clusterByTopic)
//   - 'domain'→ group by web domain
type GroupingMode = 'date' | 'topic' | 'domain';

// Deterministic small palette for tag chips. Pick from 5 muted tints in
// the Vellum range (bronze/sage/rose/ink-blue/clay) so two tags that
// contain the same string always render the same hue across the app.
const TAG_PALETTE: { bg: string; border: string; fg: string }[] = [
  // bronze
  { bg: 'color-mix(in srgb, var(--thread) 12%, transparent)', border: 'color-mix(in srgb, var(--thread) 45%, transparent)', fg: 'var(--thread)' },
  // sage
  { bg: 'color-mix(in srgb, #6a8c5a 12%, transparent)', border: 'color-mix(in srgb, #6a8c5a 45%, transparent)', fg: '#5a7a4a' },
  // rose
  { bg: 'color-mix(in srgb, #b06a72 12%, transparent)', border: 'color-mix(in srgb, #b06a72 45%, transparent)', fg: '#a05a62' },
  // ink-blue
  { bg: 'color-mix(in srgb, #5a7a9a 12%, transparent)', border: 'color-mix(in srgb, #5a7a9a 45%, transparent)', fg: '#4a6a8a' },
  // clay
  { bg: 'color-mix(in srgb, #a07a5a 12%, transparent)', border: 'color-mix(in srgb, #a07a5a 45%, transparent)', fg: '#90683f' },
];

// FNV-1a hash → palette index. Stable across runs, no deps.
function tagColorIndex(tag: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % TAG_PALETTE.length;
}

// Tokenize for topic clustering. Lowercase, strip punctuation, drop
// stopwords + tokens shorter than 3 chars. We keep token count small
// (top-12) per entry to bound the cost.
const STOPWORDS = new Set([
  'the','and','for','are','but','not','you','your','our','have','has','had','was','were','this','that','with','from','what','when','where','which','will','would','could','should','about','into','they','them','their','there','also','other','than','then','some','such','these','those','more','most','very','much','just','only','over','under','after','before','between','through','being','been','here','its','it\'s','i\'m','can','cant','can\'t','don','don\'t','isn','isn\'t','one','two','three','four','five','six','seven','eight','nine','ten','many','any','all','as','at','be','by','do','if','in','is','it','of','on','or','so','to','up','we','an','a','i'
]);

function tokenizeFor(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ一-鿿\s'-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-']|[-']$/g, ''))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

// Format byte/sec time deltas as "Xh ago" / "just now". Slightly more
// terse than the row-meta variant.
function shortAgo(epochSec?: number): string | null {
  if (!epochSec) return null;
  const diff = Date.now() / 1000 - epochSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return null;
}

// Native bridge helper. Persists per-capture metadata (starred / tags /
// readProgress / lastVisited) to a JSON sidecar next to each Loom.md.
// Mirrors writes to localStorage so the page degrades gracefully when
// the bridge is unavailable (e.g. opened in a stock browser for
// debugging). On read failure (404 / network error / non-JSON) the
// caller falls back to localStorage.
//
// stableKey shape: `${rootID}:${title}:${eyebrow}` — same as
// `stableKeyOf` above.
type MetadataValue = {
  starred: boolean;
  tags: string[];
  readProgress: number;
  lastVisited: number;
};

type MetadataPatch = Partial<MetadataValue>;

function emptyMetadata(): MetadataValue {
  return { starred: false, tags: [], readProgress: 0, lastVisited: 0 };
}

// Bulk-fetch every entry's metadata via the bridge. Empty record on
// failure so the caller can fall back to localStorage.
async function fetchAllMetadata(): Promise<Record<string, MetadataValue>> {
  try {
    const r = await fetch('loom://native/capture-metadata-all.json');
    if (!r.ok) return {};
    const d = await r.json();
    const out: Record<string, MetadataValue> = {};
    const entries = (d && d.entries) || {};
    for (const k of Object.keys(entries)) {
      const v = entries[k] || {};
      out[k] = {
        starred: !!v.starred,
        tags: Array.isArray(v.tags) ? v.tags.filter((t: unknown) => typeof t === 'string') : [],
        readProgress: typeof v.readProgress === 'number' ? v.readProgress : 0,
        lastVisited: typeof v.lastVisited === 'number' ? v.lastVisited : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

// Single-entry write. Patches whatever fields are present and leaves
// the rest untouched on the sidecar. Returns true on success.
async function writeMetadata(
  entry: { rootID: string; subPath: string; title: string; eyebrow: string },
  patch: MetadataPatch,
): Promise<boolean> {
  const params = new URLSearchParams();
  params.set('root', entry.rootID);
  // The bridge expects the `sub` arg without a leading slash; align
  // with capture-content.json's contract so all read/write paths share
  // the same encoding.
  params.set('sub', entry.subPath || '');
  params.set('title', entry.title);
  params.set('eyebrow', entry.eyebrow || '');
  params.set('op', 'set');
  if (patch.starred !== undefined) params.set('starred', patch.starred ? '1' : '0');
  if (patch.tags !== undefined) params.set('tags', patch.tags.join(','));
  if (patch.readProgress !== undefined) params.set('readProgress', String(patch.readProgress));
  if (patch.lastVisited !== undefined) params.set('lastVisited', String(patch.lastVisited));
  try {
    const r = await fetch(`loom://native/capture-metadata.json?${params.toString()}`);
    if (!r.ok) return false;
    const d = await r.json();
    return !!d.ok;
  } catch {
    return false;
  }
}

function CapturesLandingInner() {
  const [entries, setEntries] = useState<CaptureEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshRequestRef = useRef(0);
  const appliedRefreshRef = useRef(0);
  const hasLoadedCapturesRef = useRef(false);
  const [pivot, setPivot] = useState<PivotKey>({ kind: 'all' });
  const [query, setQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  // Section axis (independent of pivot/filter axis).
  const [groupBy, setGroupBy] = useState<GroupingMode>('date');
  // Local star + tag state, hydrated from localStorage on first mount.
  // We keep them in component state so the UI updates synchronously when
  // the user toggles, then mirror to localStorage as a side-effect.
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [tags, setTags] = useState<Record<string, string[]>>({});
  // Reading progress + last-visited (Agent C piggyback). Both are
  // localStorage-backed; values default to absent (treated as 0 / null).
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [lastVisited, setLastVisited] = useState<Record<string, number>>({});
  // Bulk-select mode
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const loadCapturesList = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    const requestID = ++refreshRequestRef.current;
    try {
      const r = await fetch('loom://native/captures-list.json');
      if (!r.ok) throw new Error(`captures-list.json returned ${r.status}`);
      const d = await r.json();
      if (requestID <= appliedRefreshRef.current) return;
      appliedRefreshRef.current = requestID;
      hasLoadedCapturesRef.current = true;
      setEntries(Array.isArray(d?.entries) ? d.entries : []);
      setError(null);
    } catch (err) {
      if (requestID <= appliedRefreshRef.current) return;
      if (mode === 'initial' || !hasLoadedCapturesRef.current) setError(String(err));
    }
  }, []);

  const refreshCapturesList = useCallback(() => {
    void loadCapturesList('refresh');
  }, [loadCapturesList]);

  useEffect(() => {
    void loadCapturesList('initial');
  }, [loadCapturesList]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refreshCapturesList();
    };
    const refreshOnPageShow = () => refreshCapturesList();
    const refreshOnFocus = () => refreshIfVisible();

    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('pageshow', refreshOnPageShow);
    window.addEventListener('loom:capture-saved', refreshCapturesList);
    window.addEventListener('loom:captures:refresh', refreshCapturesList);
    document.addEventListener('visibilitychange', refreshIfVisible);

    const pollID = window.setInterval(refreshIfVisible, 15000);

    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('pageshow', refreshOnPageShow);
      window.removeEventListener('loom:capture-saved', refreshCapturesList);
      window.removeEventListener('loom:captures:refresh', refreshCapturesList);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.clearInterval(pollID);
    };
  }, [refreshCapturesList]);

  // Debounce search 150ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 150);
    return () => clearTimeout(t);
  }, [query]);

  // Hydrate stars / tags / progress / last-visited.
  //
  // Order:
  //   1. Try the bridge (`capture-metadata-all.json`) — the source of
  //      truth, sandbox-backed file alongside each Loom.md.
  //   2. If the bridge is unreachable OR returns an empty index, fall
  //      back to localStorage and (when bridge IS reachable) run the
  //      one-time import: every localStorage row writes back to the
  //      bridge, then `loom:metadata-imported:1` flag suppresses
  //      future imports.
  //   3. Last-visited stored in localStorage as ms-since-epoch but the
  //      view expects seconds-since-epoch — convert on read so the
  //      "viewed Xh ago" math stays correct.
  useEffect(() => {
    if (!entries || typeof window === 'undefined') return;
    let cancelled = false;

    const lsHydrate = (): { s: Record<string, boolean>; t: Record<string, string[]>; p: Record<string, number>; v: Record<string, number> } => {
      const s: Record<string, boolean> = {};
      const t: Record<string, string[]> = {};
      const p: Record<string, number> = {};
      const v: Record<string, number> = {};
      try {
        for (const e of entries) {
          const k = stableKeyOf(e);
          const sv = window.localStorage.getItem(`loom:starred:${k}`);
          if (sv === '1') s[k] = true;
          const tv = window.localStorage.getItem(`loom:tags:${k}`);
          if (tv) {
            try {
              const arr = JSON.parse(tv);
              if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
                t[k] = arr;
              }
            } catch { /* ignore corrupted tag json */ }
          }
          const pv = window.localStorage.getItem(`loom:read-progress:${k}`);
          if (pv) {
            const n = parseFloat(pv);
            if (!Number.isNaN(n) && n > 0) p[k] = Math.min(100, Math.max(0, n));
          }
          // localStorage last-visited is ms; bridge reports ms; the
          // view normalizes to seconds further down.
          const lv = window.localStorage.getItem(`loom:last-visited:${k}`);
          if (lv) {
            const n = parseFloat(lv);
            if (!Number.isNaN(n) && n > 0) v[k] = n / 1000;
          }
        }
      } catch { /* localStorage unavailable */ }
      return { s, t, p, v };
    };

    (async () => {
      const bridgeMap = await fetchAllMetadata();
      if (cancelled) return;
      const haveBridgeData = Object.keys(bridgeMap).length > 0;

      if (haveBridgeData) {
        const s: Record<string, boolean> = {};
        const t: Record<string, string[]> = {};
        const p: Record<string, number> = {};
        const v: Record<string, number> = {};
        for (const e of entries) {
          const k = stableKeyOf(e);
          const m = bridgeMap[k];
          if (!m) continue;
          if (m.starred) s[k] = true;
          if (m.tags.length) t[k] = m.tags;
          if (m.readProgress > 0) p[k] = m.readProgress;
          if (m.lastVisited > 0) v[k] = m.lastVisited / 1000; // ms → s for the view
        }
        setStarred(s);
        setTags(t);
        setProgress(p);
        setLastVisited(v);
        return;
      }

      // Bridge returned nothing — either bridge missing OR sidecar
      // empty. Fall back to localStorage so the page still renders
      // user state.
      const fallback = lsHydrate();
      if (cancelled) return;
      setStarred(fallback.s);
      setTags(fallback.t);
      setProgress(fallback.p);
      setLastVisited(fallback.v);

      // Import-once: only attempt if (a) we haven't done it before,
      // (b) localStorage actually has rows worth importing, and (c)
      // the bridge appears reachable enough to write — we test
      // reachability with a single ok write attempt; failures are
      // silent so a stock-browser preview never tries forever.
      try {
        if (window.localStorage.getItem('loom:metadata-imported') === '1') return;
        const hasAny = Object.keys(fallback.s).length + Object.keys(fallback.t).length +
                       Object.keys(fallback.p).length + Object.keys(fallback.v).length > 0;
        if (!hasAny) {
          // Nothing to import — still set the flag so we don't keep
          // probing on every subsequent load.
          window.localStorage.setItem('loom:metadata-imported', '1');
          return;
        }
        const byKey: Record<string, { entry: CaptureEntry; patch: MetadataPatch }> = {};
        const upsert = (k: string, entry: CaptureEntry, patch: MetadataPatch) => {
          if (!byKey[k]) byKey[k] = { entry, patch: {} };
          Object.assign(byKey[k].patch, patch);
        };
        for (const e of entries) {
          const k = stableKeyOf(e);
          if (fallback.s[k]) upsert(k, e, { starred: true });
          if (fallback.t[k] && fallback.t[k].length) upsert(k, e, { tags: fallback.t[k] });
          if (fallback.p[k]) upsert(k, e, { readProgress: fallback.p[k] });
          if (fallback.v[k]) upsert(k, e, { lastVisited: fallback.v[k] * 1000 });
        }
        let anyOk = false;
        for (const k of Object.keys(byKey)) {
          const ok = await writeMetadata(byKey[k].entry, byKey[k].patch);
          if (cancelled) return;
          if (ok) anyOk = true;
        }
        if (anyOk) {
          // At least one write landed — bridge is functional. Mark
          // import done so we don't keep replaying.
          window.localStorage.setItem('loom:metadata-imported', '1');
        }
      } catch { /* import is best-effort */ }
    })();

    return () => { cancelled = true; };
  }, [entries]);

  const toggleStar = useCallback((entry: CaptureEntry) => {
    const k = stableKeyOf(entry);
    let nextStarred = false;
    setStarred((prev) => {
      const next = { ...prev };
      if (next[k]) {
        delete next[k];
        nextStarred = false;
        try { window.localStorage.removeItem(`loom:starred:${k}`); } catch { /* ignore */ }
      } else {
        next[k] = true;
        nextStarred = true;
        try { window.localStorage.setItem(`loom:starred:${k}`, '1'); } catch { /* ignore */ }
      }
      return next;
    });
    // Fire-and-forget bridge write. UI already updated optimistically;
    // a bridge failure leaves localStorage as the canonical record.
    void writeMetadata(entry, { starred: nextStarred });
  }, []);

  const addTag = useCallback((entry: CaptureEntry, tag: string) => {
    const t = tag.trim();
    if (!t) return;
    const k = stableKeyOf(entry);
    let after: string[] | null = null;
    setTags((prev) => {
      const cur = prev[k] || [];
      if (cur.includes(t)) { after = cur; return prev; }
      const merged = [...cur, t];
      after = merged;
      const next = { ...prev, [k]: merged };
      try { window.localStorage.setItem(`loom:tags:${k}`, JSON.stringify(merged)); } catch { /* ignore */ }
      return next;
    });
    if (after) void writeMetadata(entry, { tags: after });
  }, []);

  const removeTag = useCallback((entry: CaptureEntry, tag: string) => {
    const k = stableKeyOf(entry);
    let after: string[] = [];
    setTags((prev) => {
      const cur = prev[k] || [];
      const trimmed = cur.filter((x) => x !== tag);
      after = trimmed;
      const next = { ...prev };
      if (trimmed.length === 0) {
        delete next[k];
        try { window.localStorage.removeItem(`loom:tags:${k}`); } catch { /* ignore */ }
      } else {
        next[k] = trimmed;
        try { window.localStorage.setItem(`loom:tags:${k}`, JSON.stringify(trimmed)); } catch { /* ignore */ }
      }
      return next;
    });
    void writeMetadata(entry, { tags: after });
  }, []);

  // Derive available domains for pivot chips (web kind only, count ≥1).
  const domains = useMemo(() => {
    if (!entries) return [];
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.kind === 'web' && e.domain) {
        map.set(e.domain, (map.get(e.domain) || 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  // Derive available tag chips. Sorted by count desc, then alpha.
  const tagChips = useMemo(() => {
    if (!entries) return [];
    const map = new Map<string, number>();
    for (const e of entries) {
      const ts = tags[stableKeyOf(e)] || [];
      for (const t of ts) {
        map.set(t, (map.get(t) || 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [entries, tags]);


  const filtered = useMemo(() => {
    if (!entries) return [];
    const now = Date.now() / 1000;
    const dayStart = startOfDay(now);
    const weekStart = dayStart - 6 * 86400;
    return entries.filter((e) => {
      // Pivot axis
      let inPivot = true;
      switch (pivot.kind) {
        case 'all': inPivot = true; break;
        case 'today': inPivot = (e.timestampEpoch ?? 0) >= dayStart; break;
        case 'thisWeek': inPivot = (e.timestampEpoch ?? 0) >= weekStart; break;
        case 'starred': inPivot = !!starred[stableKeyOf(e)]; break;
        case 'anchor': inPivot = e.kind === pivot.anchor; break;
        case 'domain': inPivot = e.domain === pivot.domain; break;
        case 'tag': {
          const ts = tags[stableKeyOf(e)] || [];
          inPivot = ts.includes(pivot.tag);
          break;
        }
      }
      if (!inPivot) return false;

      // Search axis
      if (!debouncedQuery) return true;
      const q = debouncedQuery;
      return (
        (e.title || '').toLowerCase().includes(q) ||
        (e.snippet || '').toLowerCase().includes(q) ||
        (e.domain || '').toLowerCase().includes(q)
      );
    });
  }, [entries, pivot, starred, tags, debouncedQuery]);

  const grouped = useMemo(() => {
    if (groupBy === 'topic') return groupByTopic(filtered);
    if (groupBy === 'domain') return groupByDomain(filtered);
    return groupByTime(filtered);
  }, [filtered, groupBy]);

  // Bulk-select keyboard shortcuts
  const allSelectableIds = useMemo(() => filtered.map((e) => e.id), [filtered]);
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const selectedCount = selectedIds.length;

  useEffect(() => {
    if (!selectMode) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        setSelectMode(false);
        setSelected({});
      } else if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'a' || ev.key === 'A')) {
        // Avoid hijacking text-input ⌘A
        const t = ev.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        ev.preventDefault();
        const next: Record<string, boolean> = {};
        for (const id of allSelectableIds) next[id] = true;
        setSelected(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode, allSelectableIds]);

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected({});
  }, []);

  const performBulkDelete = useCallback(() => {
    if (!entries) return;
    const targets = entries.filter((e) => selected[e.id]);
    if (targets.length === 0) return;
    const ok = window.confirm(`Delete ${targets.length} capture${targets.length === 1 ? '' : 's'}? This rewrites Loom.md and removes only these entries.`);
    if (!ok) return;
    const w = window as unknown as { webkit?: { messageHandlers?: { loomCaptureDelete?: { postMessage: (msg: unknown) => void } } } };
    const handler = w.webkit?.messageHandlers?.loomCaptureDelete;
    if (handler) {
      for (const t of targets) {
        handler.postMessage({
          rootID: t.rootID,
          subPath: t.subPath,
          title: t.title,
          eyebrow: t.eyebrow,
        });
      }
    } else {
      console.warn('[Loom] delete bridge unavailable; running outside Loom?');
    }
    // Optimistically drop deleted from local view; the next bridge load
    // will reconcile.
    setEntries((prev) => (prev ? prev.filter((e) => !selected[e.id]) : prev));
    exitSelectMode();
  }, [entries, selected, exitSelectMode]);

  const performBulkStar = useCallback(() => {
    if (!entries) return;
    const targets = entries.filter((e) => selected[e.id]);
    if (targets.length === 0) return;
    // If every target is already starred, treat as un-star; else star all.
    const allStarred = targets.every((e) => !!starred[stableKeyOf(e)]);
    setStarred((prev) => {
      const next = { ...prev };
      for (const e of targets) {
        const k = stableKeyOf(e);
        if (allStarred) {
          delete next[k];
          try { window.localStorage.removeItem(`loom:starred:${k}`); } catch { /* ignore */ }
        } else {
          next[k] = true;
          try { window.localStorage.setItem(`loom:starred:${k}`, '1'); } catch { /* ignore */ }
        }
      }
      return next;
    });
    for (const e of targets) {
      void writeMetadata(e, { starred: !allStarred });
    }
  }, [entries, selected, starred]);

  const performBulkTag = useCallback(() => {
    if (!entries) return;
    const targets = entries.filter((e) => selected[e.id]);
    if (targets.length === 0) return;
    const raw = window.prompt(`Tag ${targets.length} capture${targets.length === 1 ? '' : 's'} with…`, '');
    if (!raw) return;
    const t = raw.trim();
    if (!t) return;
    const finalTags: Record<string, string[]> = {};
    setTags((prev) => {
      const next = { ...prev };
      for (const e of targets) {
        const k = stableKeyOf(e);
        const cur = next[k] || [];
        if (!cur.includes(t)) {
          const merged = [...cur, t];
          next[k] = merged;
          finalTags[k] = merged;
          try { window.localStorage.setItem(`loom:tags:${k}`, JSON.stringify(merged)); } catch { /* ignore */ }
        }
      }
      return next;
    });
    for (const e of targets) {
      const k = stableKeyOf(e);
      if (finalTags[k]) void writeMetadata(e, { tags: finalTags[k] });
    }
  }, [entries, selected]);

  if (error) {
    return (
      <main style={{ padding: 'var(--space-xl)', fontFamily: 'var(--serif)' }}>
        <h1 style={{ fontSize: 'var(--font-display-3)' }}>Couldn&apos;t load captures</h1>
        <pre style={{ marginTop: 'var(--space-md)', color: 'var(--muted)' }}>{error}</pre>
      </main>
    );
  }
  if (!entries) {
    return <main style={{ padding: 'var(--space-xl)', color: 'var(--muted)' }}>Loading…</main>;
  }

  const totalCount = entries.length;
  const matchingCount = filtered.length;
  const isEmpty = matchingCount === 0;
  const isFiltering = debouncedQuery.length > 0 || pivot.kind !== 'all';

  return (
    <main style={{ minHeight: '100vh' }}>
      <StageShell
        variant="archive"
        contentVariant="archive"
        innerStyle={{ minHeight: '100vh', paddingTop: 'var(--space-xl)', paddingBottom: selectMode && selectedCount > 0 ? 'var(--space-2xl)' : 'var(--space-xl)' }}
      >
        <QuietScene tone="atlas">
          <PageFrame
            eyebrow="Index"
            title="Captures"
            description={
              <span style={{ fontFamily: 'var(--serif)', fontSize: 'var(--font-caption)', color: 'var(--muted)' }}>
                {matchingCount.toLocaleString()} matching · {totalCount.toLocaleString()} total
              </span>
            }
          >
            {/* Top toolbar — search + grouping + select toggle */}
            <div className="loom-captures-toolbar">
              <style jsx>{`
                .loom-captures-toolbar {
                  display: flex;
                  gap: var(--space-sm);
                  align-items: center;
                  flex-wrap: wrap;
                  margin-top: var(--space-xs);
                  margin-bottom: var(--space-xs);
                }
                .search-wrap {
                  position: relative;
                  flex: 1 1 24rem;
                  min-width: 0;
                }
                .search-wrap :global(input.loom-captures-search) {
                  width: 100%;
                  height: 38px;
                  padding: 0 2.2rem 0 2.2rem;
                  border: 0.5px solid color-mix(in srgb, var(--fg) 14%, transparent);
                  border-radius: var(--radius-sm);
                  background: color-mix(in srgb, var(--mat-thin-bg) 22%, transparent);
                  color: var(--fg);
                  font-family: var(--serif);
                  font-size: var(--font-body);
                  outline: none;
                  transition: border-color var(--motion-fast), background var(--motion-fast);
                  box-sizing: border-box;
                }
                .search-wrap :global(input.loom-captures-search:focus) {
                  border-color: var(--thread);
                  background: color-mix(in srgb, var(--mat-thin-bg) 50%, transparent);
                }
                .search-wrap :global(input.loom-captures-search::placeholder) {
                  color: var(--muted);
                  font-style: italic;
                }
                .search-icon {
                  position: absolute;
                  left: var(--space-sm);
                  top: 50%;
                  transform: translateY(-50%);
                  color: var(--muted);
                  pointer-events: none;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                }
                .search-clear {
                  position: absolute;
                  right: var(--space-sm);
                  top: 50%;
                  transform: translateY(-50%);
                  width: 1.5rem;
                  height: 1.5rem;
                  border-radius: 999px;
                  border: none;
                  background: transparent;
                  color: var(--muted);
                  cursor: pointer;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  font-size: var(--font-body);
                  line-height: 1;
                  transition: color var(--motion-fast), background var(--motion-fast);
                }
                .search-clear:hover {
                  color: var(--thread);
                  background: color-mix(in srgb, var(--thread) 10%, transparent);
                }
                .select-toggle {
                  font-family: var(--serif);
                  font-size: var(--font-caption);
                  letter-spacing: 0.06em;
                  padding: 0 var(--space-sm);
                  height: 38px;
                  border-radius: var(--radius-sm);
                  border: 0.5px solid color-mix(in srgb, var(--fg) 14%, transparent);
                  background: transparent;
                  color: var(--fg-secondary);
                  cursor: pointer;
                  transition: border-color var(--motion-fast), color var(--motion-fast), background var(--motion-fast);
                  white-space: nowrap;
                  flex: 0 0 auto;
                  min-width: 4.4rem;
                }
                .select-toggle:hover {
                  border-color: color-mix(in srgb, var(--thread) 50%, transparent);
                  color: var(--fg);
                }
                .select-toggle.active {
                  border-color: var(--thread);
                  color: var(--thread);
                  background: color-mix(in srgb, var(--thread) 10%, transparent);
                }
                @media (max-width: 920px) {
                  .search-wrap {
                    flex-basis: 100%;
                  }
                }
              `}</style>
              <div className="search-wrap">
                <span className="search-icon" aria-hidden>
                  {/* Magnifying glass */}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
                    <line x1="11" y1="11" x2="14" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  className="loom-captures-search"
                  type="text"
                  value={query}
                  placeholder="Search title, snippet, domain…"
                  onChange={(e) => setQuery(e.target.value)}
                  spellCheck={false}
                  autoCorrect="off"
                  autoComplete="off"
                />
                {query && (
                  <button
                    type="button"
                    className="search-clear"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    title="Clear"
                  >
                    ✕
                  </button>
                )}
              </div>
              <GroupBySwitch value={groupBy} onChange={setGroupBy} />
              <button
                type="button"
                className={`select-toggle${selectMode ? ' active' : ''}`}
                onClick={() => {
                  if (selectMode) exitSelectMode(); else setSelectMode(true);
                }}
                aria-pressed={selectMode}
              >
                {selectMode ? 'Done' : 'Select'}
              </button>
            </div>

            <StickyPivotBar>
              <PivotBar
                pivot={pivot}
                setPivot={setPivot}
                domains={domains}
                tagChips={tagChips}
                counts={{
                  all: entries.length,
                  today: entries.filter((e) => (e.timestampEpoch ?? 0) >= startOfDay(Date.now() / 1000)).length,
                  thisWeek: entries.filter((e) => (e.timestampEpoch ?? 0) >= startOfDay(Date.now() / 1000) - 6 * 86400).length,
                  starred: entries.filter((e) => !!starred[stableKeyOf(e)]).length,
                  inbox: entries.filter((e) => e.kind === 'inbox').length,
                  web: entries.filter((e) => e.kind === 'web').length,
                  page: entries.filter((e) => e.kind === 'page').length,
                }}
              />
            </StickyPivotBar>

            {isEmpty ? (
              <EmptyState totalCount={totalCount} isFiltering={isFiltering} />
            ) : (
              <div style={{ marginTop: 'var(--space-lg)' }}>
                {grouped.map((group) => (
                  <CollapseSection
                    key={`${groupBy}:${pivot.kind}:${group.id}`}
                    id={`captures.layout.v2.${groupBy}.${pivot.kind === 'all' ? 'all' : JSON.stringify(pivot)}.${group.id}`}
                    eyebrow={group.eyebrow}
                    title={group.title}
                    count={group.entries.length}
                    meta={group.meta}
                    defaultOpen={group.defaultOpen}
                  >
                    <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
                      {group.entries.map((e) => (
                        <CaptureRow
                          key={e.id}
                          entry={e}
                          starred={!!starred[stableKeyOf(e)]}
                          tags={tags[stableKeyOf(e)] || []}
                          progress={progress[stableKeyOf(e)] || 0}
                          lastVisited={lastVisited[stableKeyOf(e)]}
                          allTagSuggestions={tagChips}
                          onToggleStar={() => toggleStar(e)}
                          onAddTag={(t) => addTag(e, t)}
                          onRemoveTag={(t) => removeTag(e, t)}
                          onClickTagChip={(t) => setPivot({ kind: 'tag', tag: t })}
                          selectMode={selectMode}
                          selected={!!selected[e.id]}
                          onToggleSelected={() => toggleSelected(e.id)}
                        />
                      ))}
                    </div>
                  </CollapseSection>
                ))}
                <StatsFooter
                  entries={entries}
                  starred={starred}
                  tags={tags}
                />
              </div>
            )}
          </PageFrame>
        </QuietScene>
      </StageShell>

      {selectMode && selectedCount > 0 && (
        <BulkToolbar
          count={selectedCount}
          onDelete={performBulkDelete}
          onStar={performBulkStar}
          onTag={performBulkTag}
          onCancel={exitSelectMode}
        />
      )}
    </main>
  );
}

// Sticky wrapper around the pivot bar. Backdrop-blur kicks in once the
// element is pinned to the top of the viewport. We use IntersectionObserver
// against a sentinel sibling to reliably detect the stuck state, since CSS
// :stuck is still pseudo and not standard.
function StickyPivotBar({ children }: { children: React.ReactNode }) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // KILLED the IntersectionObserver-driven `stuck` state. Toggling
  // a class with `backdrop-filter` + `box-shadow` caused layout
  // oscillation: sentinel goes out of view → setStuck(true) → CSS
  // changes shift sentinel back into view → setStuck(false) → loop.
  // The sticky position itself works without the visual flair.

  return (
    <>
      <style jsx>{`
        .pivot-sticky {
          position: sticky;
          top: 0;
          z-index: 5;
          margin-left: calc(-1 * var(--space-xs));
          margin-right: calc(-1 * var(--space-xs));
          padding-left: var(--space-xs);
          padding-right: var(--space-xs);
          transition: background var(--motion-normal), box-shadow var(--motion-normal);
        }
        .pivot-sticky.stuck {
          background: color-mix(in srgb, var(--bg) 78%, transparent);
          box-shadow: 0 0.5px 0 0 color-mix(in srgb, var(--fg) 10%, transparent);
        }
        .sentinel {
          height: 1px;
          width: 100%;
        }
      `}</style>
      <div ref={sentinelRef} className="sentinel" aria-hidden />
      <div className="pivot-sticky">{children}</div>
    </>
  );
}

function PivotBar({
  pivot,
  setPivot,
  domains,
  tagChips,
  counts,
}: {
  pivot: PivotKey;
  setPivot: (p: PivotKey) => void;
  domains: [string, number][];
  tagChips: [string, number][];
  counts: Record<string, number>;
}) {
  const fixed: { key: PivotKey; label: string; count?: number }[] = [
    { key: { kind: 'all' }, label: 'All', count: counts.all },
    { key: { kind: 'today' }, label: 'Today', count: counts.today },
    { key: { kind: 'thisWeek' }, label: 'This Week', count: counts.thisWeek },
    { key: { kind: 'starred' }, label: 'Starred', count: counts.starred },
    { key: { kind: 'anchor', anchor: 'inbox' }, label: 'Inbox', count: counts.inbox },
    { key: { kind: 'anchor', anchor: 'web' }, label: 'Web', count: counts.web },
    { key: { kind: 'anchor', anchor: 'page' }, label: 'Page', count: counts.page },
  ];
  return (
    <div className="loom-pivot-bar">
      <style jsx>{`
        .loom-pivot-bar {
          display: flex;
          gap: var(--space-sm) var(--space-md);
          flex-wrap: wrap;
          align-items: center;
          padding: var(--space-sm) 0 var(--space-md);
          margin-bottom: var(--space-xs);
        }
        .pivot-group {
          display: inline-flex;
          align-items: center;
          gap: var(--space-xs);
          flex-wrap: wrap;
          min-width: 0;
        }
        .pivot-group.dynamic {
          flex: 1 1 22rem;
        }
        .chip {
          font-family: var(--serif);
          font-size: var(--font-caption);
          padding: var(--space-xs) var(--space-sm);
          border-radius: 999px;
          border: 0.5px solid color-mix(in srgb, var(--fg) 14%, transparent);
          color: var(--fg-secondary);
          background: transparent;
          cursor: pointer;
          display: inline-flex;
          align-items: baseline;
          gap: var(--space-xs);
          transition: background var(--motion-fast), border-color var(--motion-fast), color var(--motion-fast);
          min-width: 0;
          max-width: min(100%, 18rem);
        }
        .chip-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chip:hover {
          border-color: color-mix(in srgb, var(--thread) 50%, transparent);
          color: var(--fg);
        }
        .chip.active {
          background: color-mix(in srgb, var(--thread) 14%, transparent);
          border-color: var(--thread);
          color: var(--thread);
        }
        .chip .n {
          font-feature-settings: "onum" 1, "tnum" 1;
          font-style: italic;
          font-size: var(--font-caption);
          color: var(--muted);
        }
        .chip.active .n {
          color: color-mix(in srgb, var(--thread) 80%, transparent);
        }
        .divider {
          width: 1px;
          height: 1.2rem;
          background: color-mix(in srgb, var(--fg) 12%, transparent);
          margin: 0 var(--space-xs);
        }
        .group-label {
          flex: 0 0 auto;
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
          margin: 0 var(--space-xs) 0 var(--space-xs);
        }
        @media (max-width: 720px) {
          .loom-pivot-bar {
            gap: var(--space-xs);
          }
          .pivot-group,
          .pivot-group.dynamic {
            flex: 1 1 100%;
          }
          .divider {
            display: none;
          }
        }
      `}</style>
      <span className="pivot-group" aria-label="Capture filters">
        {fixed.map((f) => (
          <button
            key={`${f.key.kind}-${('anchor' in f.key) ? f.key.anchor : ''}-${f.label}`}
            className={`chip${pivotEq(pivot, f.key) ? ' active' : ''}`}
            onClick={() => setPivot(f.key)}
            disabled={(f.count ?? 0) === 0 && f.key.kind !== 'all'}
          >
            <span className="chip-label">{f.label}</span>
            {typeof f.count === 'number' && f.count > 0 && <span className="n">{f.count}</span>}
          </button>
        ))}
      </span>
      {domains.length > 0 && (
        <>
          <span className="divider" aria-hidden />
          <span className="pivot-group dynamic" aria-label="Domain filters">
            <Eyebrow level="section" className="group-label">Domains</Eyebrow>
            {domains.map(([d, n]) => (
              <button
                key={`d-${d}`}
                className={`chip${pivotEq(pivot, { kind: 'domain', domain: d }) ? ' active' : ''}`}
                onClick={() => setPivot({ kind: 'domain', domain: d })}
                title={d}
              >
                <span className="chip-label">{d}</span>
                <span className="n">{n}</span>
              </button>
            ))}
          </span>
        </>
      )}
      {tagChips.length > 0 && (
        <>
          <span className="divider" aria-hidden />
          <span className="pivot-group dynamic" aria-label="Tag filters">
            <Eyebrow level="section" className="group-label">Tags</Eyebrow>
            {tagChips.map(([t, n]) => (
              <button
                key={`t-${t}`}
                className={`chip${pivotEq(pivot, { kind: 'tag', tag: t }) ? ' active' : ''}`}
                onClick={() => setPivot({ kind: 'tag', tag: t })}
                title={`#${t}`}
              >
                <span className="chip-label">#{t}</span>
                <span className="n">{n}</span>
              </button>
            ))}
          </span>
        </>
      )}
    </div>
  );
}

function CaptureRow({
  entry,
  starred,
  tags,
  progress,
  lastVisited,
  allTagSuggestions,
  onToggleStar,
  onAddTag,
  onRemoveTag,
  onClickTagChip,
  selectMode,
  selected,
  onToggleSelected,
}: {
  entry: CaptureEntry;
  starred: boolean;
  tags: string[];
  progress: number;
  lastVisited?: number;
  allTagSuggestions: [string, number][];
  onToggleStar: () => void;
  onAddTag: (t: string) => void;
  onRemoveTag: (t: string) => void;
  onClickTagChip: (t: string) => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const tagInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (tagInputOpen) tagInputRef.current?.focus();
  }, [tagInputOpen]);

  // Autocomplete suggestions: filter usage list by prefix-then-substring,
  // exclude tags this entry already has. Cap at 6 visible.
  const tagSuggestions = useMemo(() => {
    const draft = tagDraft.trim().toLowerCase();
    const have = new Set(tags);
    const candidates = allTagSuggestions.filter(([t]) => !have.has(t));
    if (!draft) return candidates.slice(0, 6);
    const pref = candidates.filter(([t]) => t.toLowerCase().startsWith(draft));
    const sub = candidates.filter(([t]) => !t.toLowerCase().startsWith(draft) && t.toLowerCase().includes(draft));
    return [...pref, ...sub].slice(0, 6);
  }, [tagDraft, tags, allTagSuggestions]);

  const showRecentDot = useMemo(() => {
    if (!lastVisited) return false;
    return Date.now() / 1000 - lastVisited < 86400;
  }, [lastVisited]);

  const showRead = progress >= 99;
  const showProgress = progress > 0 && progress < 99;
  const lastVisitedLabel = useMemo(() => {
    if (!lastVisited) return null;
    const ago = shortAgo(lastVisited);
    return ago ? `viewed ${ago}` : null;
  }, [lastVisited]);

  const cleanSub = useMemo(
    () => (entry.subPath.startsWith('sub/') ? entry.subPath.slice(4) : entry.subPath),
    [entry.subPath]
  );

  const readerHref = useMemo(() => {
    const params = new URLSearchParams({
      root: entry.rootID,
      sub: cleanSub,
      title: entry.title,
      eyebrow: entry.eyebrow,
    });
    return `loom://bundle/loom-render/capture/?${params.toString()}`;
  }, [entry, cleanSub]);

  // Snapshot/original source view is auxiliary: capture rows always open
  // the Loom reader first, with the stored source snapshot one click away.
  const snapshotHref = useMemo(() => {
    if (!entry.snapshotFilename) return null;
    const params = new URLSearchParams({
      root: entry.rootID,
      sub: cleanSub,
      filename: entry.snapshotFilename,
      title: entry.title,
      eyebrow: entry.eyebrow,
    });
    return `loom://bundle/loom-render/snapshot/?${params.toString()}`;
  }, [entry, cleanSub]);
  const primaryHref = readerHref;

  const onDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(`Delete "${entry.title || '(untitled)'}"? This rewrites the Loom.md and removes only this entry.`);
    if (!ok) return;
    // Bridge is registered by Swift CaptureWebView. In a regular
    // browser context (dev outside Loom) this path is undefined.
    const w = window as unknown as { webkit?: { messageHandlers?: { loomCaptureDelete?: { postMessage: (msg: unknown) => void } } } };
    const handler = w.webkit?.messageHandlers?.loomCaptureDelete;
    if (handler) {
      handler.postMessage({
        rootID: entry.rootID,
        subPath: entry.subPath,
        title: entry.title,
        eyebrow: entry.eyebrow,
      });
    } else {
      console.warn('[Loom] delete bridge unavailable; running outside Loom?');
    }
  };

  // Reading time estimate. Snippet is ~220 chars max in the bridge schema.
  // ~5 chars/word → 220wpm gives a coarse but honest "≤1m / ~Nm" rough.
  const readMinutes = useMemo(() => {
    const text = `${entry.title || ''} ${entry.snippet || ''}`;
    const chars = text.length;
    return Math.max(1, Math.round((chars / 5) / 220));
  }, [entry.title, entry.snippet]);

  // Click handler for the row. In selectMode, clicking toggles selection
  // instead of navigating. Outside selectMode the link works normally.
  const onRowClick = (e: React.MouseEvent) => {
    if (selectMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelected();
    }
  };

  const commitTag = (overrideValue?: string) => {
    const v = (overrideValue ?? tagDraft).trim();
    if (v) {
      onAddTag(v);
      setTagDraft('');
    }
    setTagInputOpen(false);
  };

  return (
    <div className={`loom-capture-row-wrap${selected ? ' selected' : ''}${selectMode ? ' selectable' : ''}`}>
      <style jsx>{`
        .loom-capture-row-wrap {
          position: relative;
        }
        /* hover lift removed — layout-shifty per design system rule 3 */
        .loom-capture-row-wrap:hover .row-actions {
          opacity: 1;
        }
        .loom-capture-row-wrap:hover .accent-bar {
          opacity: 1;
        }
        .loom-capture-row-wrap:hover :global(.tag-add) {
          opacity: 1;
        }
        .loom-capture-row-wrap.selected :global(.loom-capture-row) {
          background: color-mix(in srgb, var(--thread) 8%, transparent);
          border-color: color-mix(in srgb, var(--thread) 60%, transparent);
        }
        .loom-capture-row {
          position: relative;
          display: grid;
          grid-template-columns: ${selectMode ? 'auto fit-content(clamp(7rem, 15vw, 15rem)) minmax(0, 1fr) auto' : 'fit-content(clamp(7rem, 15vw, 15rem)) minmax(0, 1fr) auto'};
          column-gap: var(--space-md);
          row-gap: var(--space-xs);
          align-items: baseline;
          padding: var(--space-sm) var(--space-sm);
          padding-right: 2.6rem;
          border: 0.5px solid color-mix(in srgb, var(--fg) 10%, transparent);
          border-radius: var(--radius-sm);
          background: color-mix(in srgb, var(--mat-thin-bg) 22%, transparent);
          text-decoration: none;
          color: inherit;
          transition: border-color var(--motion-fast), background var(--motion-fast);
          cursor: ${selectMode ? 'pointer' : 'default'};
        }
        .loom-capture-row:hover {
          border-color: color-mix(in srgb, var(--thread) 50%, transparent);
          background: color-mix(in srgb, var(--mat-thin-bg) 50%, transparent);
        }
        .loom-capture-row:hover .title {
          color: var(--thread);
        }
        .checkbox {
          width: 1rem;
          height: 1rem;
          border: 0.5px solid color-mix(in srgb, var(--fg) 30%, transparent);
          border-radius: var(--radius-sm);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--bg) 50%, transparent);
          font-size: var(--font-eyebrow);
          line-height: 1;
          color: var(--thread);
          flex-shrink: 0;
          align-self: center;
        }
        .checkbox.checked {
          background: var(--thread);
          border-color: var(--thread);
          color: var(--bg);
        }
        .accent-bar {
          position: absolute;
          right: 0;
          top: 20%;
          height: 60%;
          width: 1px;
          background: var(--thread);
          opacity: 0;
          transition: opacity var(--motion-normal);
          pointer-events: none;
          border-radius: 1px;
        }
        .kind {
          display: block;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--thread);
          font-weight: 500;
        }
        .body {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
          min-width: 0;
        }
        .title-row {
          display: flex;
          align-items: baseline;
          gap: var(--space-xs);
          flex-wrap: wrap;
          min-width: 0;
        }
        .title {
          font-family: var(--display);
          font-size: var(--font-body);
          font-weight: 500;
          color: var(--fg);
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 0 1 auto;
          min-width: 0;
          max-width: 100%;
          transition: color var(--motion-normal);
        }
        .star-on {
          font-size: var(--font-caption);
          color: var(--thread);
          line-height: 1;
          transform: translateY(-0.05em);
        }
        :global(.tag-chip) {
          display: inline-flex;
          align-items: center;
          gap: var(--space-xs);
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-variant-caps: small-caps;
          padding: 0.05rem var(--space-xs);
          border: 0.5px solid color-mix(in srgb, var(--fg) 18%, transparent);
          border-radius: 999px;
          color: var(--fg-secondary);
          background: transparent;
          line-height: 1.5;
        }
        :global(.tag-chip.clickable) {
          cursor: pointer;
          transition: filter var(--motion-fast);
        }
        :global(.tag-chip.clickable:hover) {
          filter: brightness(1.1);
        }
        :global(.tag-input-wrap) {
          position: relative;
          display: inline-flex;
        }
        :global(.tag-suggest) {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          z-index: 20;
          display: flex;
          flex-direction: column;
          min-width: 11rem;
          background: color-mix(in srgb, var(--bg) 96%, transparent);
          border: 0.5px solid color-mix(in srgb, var(--fg) 18%, transparent);
          border-radius: var(--radius-sm);
          padding: var(--space-xs);
          box-shadow: 0 6px 18px -8px color-mix(in srgb, var(--fg) 26%, transparent);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        :global(.tag-suggest-item) {
          display: inline-flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-xs) var(--space-xs);
          border: 0;
          background: transparent;
          border-radius: var(--radius-sm);
          font-family: var(--serif);
          font-size: var(--font-caption);
          color: var(--fg);
          cursor: pointer;
          text-align: left;
          transition: background var(--motion-fast);
        }
        :global(.tag-suggest-item:hover) {
          background: color-mix(in srgb, var(--thread) 10%, transparent);
        }
        :global(.tag-suggest-swatch) {
          display: inline-block;
          width: 0.5rem;
          height: 0.5rem;
          border-radius: 999px;
          flex-shrink: 0;
        }
        :global(.tag-suggest-name) {
          flex: 1;
          font-feature-settings: "onum" 1, "pnum" 1;
        }
        :global(.tag-suggest-count) {
          font-style: italic;
          font-size: var(--font-eyebrow);
          color: var(--muted);
          font-feature-settings: "onum" 1, "tnum" 1;
        }
        .recent-dot {
          width: 0.42rem;
          height: 0.42rem;
          border-radius: 999px;
          background: var(--thread);
          flex-shrink: 0;
          align-self: center;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--thread) 18%, transparent);
        }
        .read-check {
          color: #5a7a4a;
          display: inline-flex;
          align-items: center;
          line-height: 1;
        }
        .progress-bar {
          position: absolute;
          left: var(--space-sm);
          right: 2.6rem;
          bottom: 0;
          height: 3px;
          background: color-mix(in srgb, var(--fg) 6%, transparent);
          border-radius: 0 0 2px 2px;
          overflow: hidden;
          pointer-events: none;
        }
        .progress-fill {
          display: block;
          height: 100%;
          background: var(--thread);
          opacity: 0.65;
          transition: width var(--motion-normal);
        }
        :global(.tag-chip button) {
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
          font-size: var(--font-eyebrow);
          line-height: 1;
          padding: 0;
        }
        :global(.tag-chip button:hover) {
          color: var(--alert);
        }
        :global(.tag-add) {
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          color: var(--muted);
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0 var(--space-xs);
          opacity: 0;
          transition: color var(--motion-fast), opacity var(--motion-fast);
        }
        :global(.tag-add:hover) {
          color: var(--thread);
        }
        :global(.tag-input) {
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          padding: var(--space-xs) var(--space-xs);
          border: 0.5px solid color-mix(in srgb, var(--thread) 50%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--mat-thin-bg) 50%, transparent);
          color: var(--fg);
          outline: none;
          width: 9rem;
        }
        .snippet {
          font-family: var(--serif);
          font-size: var(--font-caption);
          color: var(--fg-secondary);
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .meta {
          font-family: var(--serif);
          font-size: var(--font-caption);
          color: var(--muted);
          font-style: italic;
          font-feature-settings: "onum" 1, "pnum" 1;
          white-space: nowrap;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: var(--space-xs);
          min-width: max-content;
        }
        .meta .read {
          font-style: normal;
          font-size: var(--font-eyebrow);
          letter-spacing: 0.04em;
          color: var(--muted);
        }
        .row-actions {
          position: absolute;
          right: var(--space-sm);
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          gap: var(--space-xs);
          opacity: 0;
          transition: opacity var(--motion-fast);
        }
        .loom-capture-row-wrap.selectable .row-actions {
          opacity: 0;
          pointer-events: none;
        }
        .row-actions button,
        .row-actions a.snapshot-link {
          background: transparent;
          border: 0.5px solid color-mix(in srgb, var(--fg) 14%, transparent);
          border-radius: var(--radius-sm);
          width: 1.7rem;
          height: 1.7rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--muted);
          font-size: var(--font-body);
          text-decoration: none;
          transition: border-color var(--motion-fast), color var(--motion-fast), background var(--motion-fast);
        }
        .row-actions button:hover,
        .row-actions a.snapshot-link:hover {
          border-color: color-mix(in srgb, var(--thread) 60%, transparent);
          color: var(--thread);
          background: color-mix(in srgb, var(--thread) 8%, transparent);
        }
        .row-actions button.star-btn.on {
          color: var(--thread);
          border-color: color-mix(in srgb, var(--thread) 50%, transparent);
        }
        .row-actions button.danger:hover {
          border-color: var(--alert);
          color: var(--alert);
          background: color-mix(in srgb, var(--alert) 10%, transparent);
        }
        @media (max-width: 820px) {
          .loom-capture-row {
            grid-template-columns: ${selectMode ? 'auto minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto'};
            align-items: start;
          }
          .kind {
            grid-column: ${selectMode ? '2 / 3' : '1 / 2'};
            max-width: 100%;
          }
          .body {
            grid-column: ${selectMode ? '2 / 3' : '1 / 2'};
          }
          .meta {
            grid-column: ${selectMode ? '3 / 4' : '2 / 3'};
            grid-row: 1 / span 2;
          }
        }
      `}</style>

      <a
        className="loom-capture-row"
        href={primaryHref}
        onClick={onRowClick}
      >
        {selectMode && (
          <span className={`checkbox${selected ? ' checked' : ''}`} aria-hidden>
            {selected ? '✓' : ''}
          </span>
        )}
        <span className="kind">{kindLabel(entry)}</span>
        <span className="body">
          <span className="title-row">
            {showRecentDot && <span className="recent-dot" aria-label="Viewed recently" title="Viewed in the last 24 hours" />}
            <span className="title">{entry.title || '(untitled)'}</span>
            {showRead && (
              <span className="read-check" aria-label="Read" title="You've finished reading this capture">
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                  <path d="M2 6.5 L5 9 L10 3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
            {starred && <span className="star-on" aria-label="Starred">★</span>}
            {tags.map((t) => {
              const palette = TAG_PALETTE[tagColorIndex(t)];
              return (
                <span
                  key={t}
                  className="tag-chip clickable"
                  style={{ background: palette.bg, borderColor: palette.border, color: palette.fg }}
                  onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onClickTagChip(t); }}
                  title={`Filter by #${t}`}
                  role="button"
                  tabIndex={0}
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove tag ${t}`}
                    onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onRemoveTag(t); }}
                    title="Remove tag"
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {!selectMode && (tagInputOpen ? (
              <span className="tag-input-wrap">
                <input
                  ref={tagInputRef}
                  className="tag-input"
                  type="text"
                  value={tagDraft}
                  placeholder="tag…"
                  onChange={(ev) => setTagDraft(ev.target.value)}
                  onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); }}
                  onKeyDown={(ev) => {
                    ev.stopPropagation();
                    if (ev.key === 'Enter') {
                      ev.preventDefault();
                      commitTag();
                    } else if (ev.key === 'Escape') {
                      ev.preventDefault();
                      setTagDraft('');
                      setTagInputOpen(false);
                    }
                  }}
                  onBlur={() => {
                    // Defer so click on suggestion lands first.
                    window.setTimeout(() => commitTag(), 120);
                  }}
                  spellCheck={false}
                  autoCorrect="off"
                  autoComplete="off"
                />
                {tagSuggestions.length > 0 && (
                  <span className="tag-suggest" onMouseDown={(ev) => ev.preventDefault()}>
                    {tagSuggestions.map(([sug, n]) => {
                      const palette = TAG_PALETTE[tagColorIndex(sug)];
                      return (
                        <button
                          key={sug}
                          type="button"
                          className="tag-suggest-item"
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            commitTag(sug);
                          }}
                        >
                          <span className="tag-suggest-swatch" style={{ background: palette.fg }} />
                          <span className="tag-suggest-name">{sug}</span>
                          <span className="tag-suggest-count">{n}</span>
                        </button>
                      );
                    })}
                  </span>
                )}
              </span>
            ) : (
              <button
                type="button"
                className="tag-add"
                onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setTagInputOpen(true); }}
                aria-label="Add tag"
                title="Add a tag"
              >
                + Tag
              </button>
            ))}
          </span>
          {entry.snippet && <span className="snippet">{entry.snippet}</span>}
        </span>
        <span className="meta">
          <span>{relativeTime(entry.timestampEpoch)}</span>
          {lastVisitedLabel ? (
            <span className="read" title={`Last viewed ${lastVisitedLabel.replace('viewed ', '')}`}>{lastVisitedLabel}</span>
          ) : (
            <span className="read" title={`~${readMinutes} min read (estimate from snippet)`}>{`~${readMinutes}m`}</span>
          )}
        </span>
        {showProgress && (
          <span
            className="progress-bar"
            aria-label={`Reading progress: ${Math.round(progress)}%`}
            title={`${Math.round(progress)}% read`}
          >
            <span className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </span>
        )}
      </a>
      <span className="accent-bar" aria-hidden />
      {!selectMode && (
        <div className="row-actions">
          <button
            type="button"
            className={`star-btn${starred ? ' on' : ''}`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleStar(); }}
            aria-label={starred ? 'Unstar' : 'Star'}
            title={starred ? 'Unstar this capture' : 'Star this capture'}
          >
            {starred ? '★' : '☆'}
          </button>
          {snapshotHref && (
            <a
              href={snapshotHref}
              onClick={(e) => e.stopPropagation()}
              aria-label="Open source snapshot"
              title="Open the stored source snapshot"
              className="snapshot-link"
            >
              S
            </a>
          )}
          <button
            type="button"
            className="danger"
            onClick={onDelete}
            aria-label="Delete capture"
            title="Delete this capture from Loom.md"
          >
            ⌫
          </button>
        </div>
      )}
    </div>
  );
}

function BulkToolbar({
  count,
  onDelete,
  onStar,
  onTag,
  onCancel,
}: {
  count: number;
  onDelete: () => void;
  onStar: () => void;
  onTag: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="loom-bulk-toolbar" role="toolbar" aria-label="Bulk actions">
      <style jsx>{`
        .loom-bulk-toolbar {
          position: fixed;
          left: 50%;
          bottom: var(--space-md);
          transform: translateX(-50%);
          z-index: 30;
          display: inline-flex;
          align-items: center;
          gap: var(--space-xs);
          padding: var(--space-sm) var(--space-sm);
          border: 0.5px solid color-mix(in srgb, var(--fg) 16%, transparent);
          border-radius: 999px;
          /* solid bg + shadow only — no backdrop-filter on position:fixed (constitutional rule 1) */
          background: var(--paper-up, var(--bg));
          box-shadow: 0 6px 24px -10px color-mix(in srgb, var(--fg) 30%, transparent);
          font-family: var(--serif);
          font-size: var(--font-caption);
        }
        .count {
          color: var(--fg-secondary);
          padding: 0 var(--space-sm) 0 var(--space-xs);
          font-feature-settings: "onum" 1, "tnum" 1;
        }
        .count .n { color: var(--thread); font-style: italic; }
        .sep {
          width: 1px;
          height: 1.1rem;
          background: color-mix(in srgb, var(--fg) 14%, transparent);
        }
        button {
          font-family: var(--serif);
          font-size: var(--font-caption);
          letter-spacing: 0.04em;
          padding: var(--space-xs) var(--space-sm);
          border-radius: 999px;
          border: 0.5px solid transparent;
          background: transparent;
          color: var(--fg-secondary);
          cursor: pointer;
          transition: color var(--motion-fast), background var(--motion-fast), border-color var(--motion-fast);
        }
        button:hover {
          color: var(--thread);
          background: color-mix(in srgb, var(--thread) 8%, transparent);
          border-color: color-mix(in srgb, var(--thread) 30%, transparent);
        }
        button.danger:hover {
          color: var(--alert);
          background: color-mix(in srgb, var(--alert) 8%, transparent);
          border-color: color-mix(in srgb, var(--alert) 40%, transparent);
        }
      `}</style>
      <span className="count"><span className="n">{count}</span> selected</span>
      <span className="sep" />
      <button type="button" className="danger" onClick={onDelete}>Delete</button>
      <button type="button" onClick={onStar}>Star</button>
      <button type="button" onClick={onTag}>Tag</button>
      <span className="sep" />
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function EmptyState({ totalCount, isFiltering }: { totalCount: number; isFiltering: boolean }) {
  // Two flavours:
  //   1. Zero captures total → onboarding nudge to Web Capture setup.
  //   2. Zero matches → friendlier "filter caught nothing" line.
  const hasNothingAtAll = totalCount === 0;
  return (
    <div className="loom-captures-empty">
      <style jsx>{`
        .loom-captures-empty {
          margin-top: var(--space-xl);
          margin-bottom: var(--space-lg);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-sm);
          padding: var(--space-xl) var(--space-md);
          color: var(--fg-secondary);
          text-align: center;
        }
        .glyph {
          font-family: var(--display);
          font-style: italic;
          font-weight: 400;
          font-size: var(--font-display-1);
          color: color-mix(in srgb, var(--fg) 30%, transparent);
          line-height: 1;
          letter-spacing: 0.02em;
        }
        .head {
          font-family: var(--display);
          font-style: italic;
          font-weight: 500;
          font-size: var(--font-display-3);
          color: var(--fg);
        }
        .sub {
          font-family: var(--serif);
          font-size: var(--font-caption);
          color: var(--muted);
          max-width: 38ch;
          line-height: 1.5;
        }
        .setup {
          margin-top: var(--space-sm);
          font-family: var(--serif);
          font-size: var(--font-caption);
          color: var(--thread);
          text-decoration: none;
          border-bottom: 0.5px solid color-mix(in srgb, var(--thread) 60%, transparent);
          padding-bottom: 0.06rem;
        }
        .setup:hover {
          color: var(--thread);
          border-bottom-color: var(--thread);
        }
      `}</style>
      <span className="glyph" aria-hidden>~</span>
      {hasNothingAtAll ? (
        <>
          <span className="head">Nothing captured yet</span>
          <span className="sub">
            Install the Loom Web Capture browser extension and clip articles, passages, or whole pages — they&apos;ll land here, time-bucketed and searchable.
          </span>
          <a className="setup" href="loom://bundle/loom-render/web-capture-setup/">Set up Web Capture →</a>
        </>
      ) : isFiltering ? (
        <>
          <span className="head">Filter matches nothing</span>
          <span className="sub">No captures match this combination of pivot and search. Try clearing the search or picking a different chip.</span>
        </>
      ) : (
        <>
          <span className="head">Nothing here</span>
          <span className="sub">This bucket is empty. Capture a page or passage to fill it.</span>
        </>
      )}
    </div>
  );
}

function GroupBySwitch({ value, onChange }: { value: GroupingMode; onChange: (v: GroupingMode) => void }) {
  const options: { v: GroupingMode; label: string; title: string }[] = [
    { v: 'date', label: 'Date', title: 'Group sections by time bucket' },
    { v: 'domain', label: 'Domain', title: 'Group sections by web domain' },
    { v: 'topic', label: 'Topic', title: 'Cluster by frequent keyword in title + snippet' },
  ];
  return (
    <span className="loom-groupby-switch" role="group" aria-label="Section grouping mode">
      <style jsx>{`
        .loom-groupby-switch {
          display: inline-flex;
          height: 38px;
          align-items: stretch;
          border: 0.5px solid color-mix(in srgb, var(--fg) 14%, transparent);
          border-radius: var(--radius-sm);
          overflow: hidden;
          font-family: var(--serif);
          font-size: var(--font-caption);
          letter-spacing: 0.04em;
          background: transparent;
          flex-shrink: 0;
          max-width: 100%;
        }
        .gb-label {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 var(--space-sm);
          color: var(--muted);
          font-style: italic;
          border-right: 0.5px solid color-mix(in srgb, var(--fg) 10%, transparent);
          font-size: var(--font-eyebrow);
          letter-spacing: 0.06em;
          white-space: nowrap;
          min-width: 5.2rem;
        }
        .gb-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 0;
          padding: 0 var(--space-sm);
          color: var(--fg-secondary);
          cursor: pointer;
          font-family: var(--serif);
          font-size: var(--font-caption);
          transition: color var(--motion-fast), background var(--motion-fast);
          white-space: nowrap;
          min-width: 4.6rem;
        }
        .gb-btn + .gb-btn {
          border-left: 0.5px solid color-mix(in srgb, var(--fg) 8%, transparent);
        }
        .gb-btn:hover {
          color: var(--fg);
          background: color-mix(in srgb, var(--thread) 4%, transparent);
        }
        .gb-btn.active {
          color: var(--thread);
          background: color-mix(in srgb, var(--thread) 12%, transparent);
        }
        @media (max-width: 520px) {
          .loom-groupby-switch {
            width: 100%;
          }
          .gb-label {
            min-width: 4.8rem;
          }
          .gb-btn {
            flex: 1 1 0;
            min-width: 0;
            padding: 0 var(--space-xs);
          }
        }
      `}</style>
      <span className="gb-label">Group by</span>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          className={`gb-btn${value === o.v ? ' active' : ''}`}
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

// StatsFooter — total counts + 12-week × 7-day activity heatmap. Only
// renders when there are any entries; otherwise hidden so the empty
// state remains the focal point.
function StatsFooter({
  entries,
  starred,
  tags,
}: {
  entries: CaptureEntry[];
  starred: Record<string, boolean>;
  tags: Record<string, string[]>;
}) {
  const stats = useMemo(() => {
    const total = entries.length;
    const domainSet = new Set<string>();
    let starredCount = 0;
    let totalChars = 0;
    let tagCount = 0;
    for (const e of entries) {
      if (e.domain) domainSet.add(e.domain);
      const k = stableKeyOf(e);
      if (starred[k]) starredCount++;
      if (tags[k]) tagCount += tags[k].length;
      totalChars += (e.snippet || '').length + (e.title || '').length;
    }
    // ~5 chars/word, 220wpm → minutes; convert to hours.
    const totalMinutes = Math.round((totalChars / 5) / 220);
    const totalHours = totalMinutes / 60;
    return { total, domains: domainSet.size, starred: starredCount, tagCount, totalHours };
  }, [entries, starred, tags]);

  // Heatmap: 12 columns × 7 rows. Columns oldest-on-left, today right-most.
  // Rows = day of week (Sun..Sat).
  const heatmap = useMemo(() => {
    const cols = 12; // weeks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Snap "today" to end of its week (Saturday) so the rightmost column
    // contains today's row at its weekday.
    const dayOfWeek = today.getDay(); // 0..6, Sun=0
    const lastDayOfWindow = new Date(today);
    lastDayOfWindow.setDate(today.getDate() + (6 - dayOfWeek)); // saturday
    lastDayOfWindow.setHours(23, 59, 59, 999);
    const startEpoch = (lastDayOfWindow.getTime() - (cols * 7 - 1) * 86400000) / 1000;
    const endEpoch = lastDayOfWindow.getTime() / 1000;
    const grid: number[][] = Array.from({ length: 7 }, () => Array(cols).fill(0));
    let max = 0;
    for (const e of entries) {
      const ts = e.timestampEpoch ?? 0;
      if (ts < startEpoch || ts > endEpoch) continue;
      const d = new Date(ts * 1000);
      d.setHours(0, 0, 0, 0);
      const daysFromStart = Math.floor((d.getTime() - startEpoch * 1000) / 86400000);
      if (daysFromStart < 0 || daysFromStart >= cols * 7) continue;
      const col = Math.floor(daysFromStart / 7);
      const row = d.getDay();
      grid[row][col]++;
      if (grid[row][col] > max) max = grid[row][col];
    }
    return { grid, max, today: today.getTime() / 1000 };
  }, [entries]);

  if (entries.length === 0) return null;

  const fmtHours = (h: number) => {
    if (h < 1) return `~${Math.max(1, Math.round(h * 60))}m`;
    if (h < 10) return `~${h.toFixed(1)}h`;
    return `~${Math.round(h)}h`;
  };

  return (
    <div className="loom-stats-footer" aria-label="Capture stats">
      <style jsx>{`
        .loom-stats-footer {
          margin-top: var(--space-xl);
          padding: var(--space-md) var(--space-xs) var(--space-sm);
          border-top: 0.5px solid color-mix(in srgb, var(--fg) 12%, transparent);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-md);
          align-items: flex-start;
          justify-content: space-between;
        }
        .stats-eyebrow {
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
          margin: 0 0 var(--space-xs);
        }
        .stats-line {
          font-family: var(--serif);
          font-size: var(--font-caption);
          color: var(--fg-secondary);
          font-feature-settings: "onum" 1, "pnum" 1;
          line-height: 1.45;
        }
        .stats-line .n {
          color: var(--fg);
          font-style: italic;
          font-feature-settings: "onum" 1, "tnum" 1;
        }
        .stats-line .sep {
          color: var(--muted);
          opacity: 0.6;
          margin: 0 var(--space-xs);
        }
        .heatmap {
          display: inline-grid;
          grid-template-rows: repeat(7, 0.7rem);
          grid-auto-flow: column;
          grid-auto-columns: 0.7rem;
          gap: 2px;
          font-family: var(--serif);
        }
        .cell {
          background: color-mix(in srgb, var(--thread) 8%, transparent);
          border-radius: 1.5px;
          width: 0.7rem;
          height: 0.7rem;
        }
        .heatmap-wrap {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: var(--space-xs);
        }
        .heatmap-legend {
          display: inline-flex;
          align-items: center;
          gap: var(--space-xs);
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          color: var(--muted);
          font-style: italic;
        }
        .heatmap-legend .scale {
          display: inline-flex;
          gap: 2px;
        }
      `}</style>
      <div>
        <Eyebrow as="div" className="stats-eyebrow">Inventory</Eyebrow>
        <div className="stats-line">
          Total <span className="n">{stats.total.toLocaleString()}</span> captures
          <span className="sep">·</span>
          <span className="n">{stats.domains}</span> domain{stats.domains === 1 ? '' : 's'}
          <span className="sep">·</span>
          <span className="n">{stats.starred}</span> starred
          <span className="sep">·</span>
          <span className="n">{stats.tagCount}</span> tag{stats.tagCount === 1 ? '' : 's'}
          <span className="sep">·</span>
          <span className="n">{fmtHours(stats.totalHours)}</span> reading
        </div>
      </div>
      <div className="heatmap-wrap" aria-label="Activity over the last 12 weeks">
        <Eyebrow as="div" className="stats-eyebrow">Last 12 Weeks</Eyebrow>
        <div className="heatmap" role="grid">
          {heatmap.grid.flatMap((row, r) =>
            row.map((count, c) => {
              const ratio = heatmap.max ? count / heatmap.max : 0;
              const opacity = count === 0 ? 0.06 : 0.25 + ratio * 0.65;
              return (
                <span
                  key={`${r}-${c}`}
                  className="cell"
                  style={{ background: `color-mix(in srgb, var(--thread) ${Math.round(opacity * 100)}%, transparent)` }}
                  title={`${count} capture${count === 1 ? '' : 's'}`}
                  role="gridcell"
                />
              );
            })
          )}
        </div>
        <div className="heatmap-legend">
          <span>quieter</span>
          <span className="scale">
            <span className="cell" style={{ background: 'color-mix(in srgb, var(--thread) 8%, transparent)' }} />
            <span className="cell" style={{ background: 'color-mix(in srgb, var(--thread) 32%, transparent)' }} />
            <span className="cell" style={{ background: 'color-mix(in srgb, var(--thread) 56%, transparent)' }} />
            <span className="cell" style={{ background: 'color-mix(in srgb, var(--thread) 84%, transparent)' }} />
          </span>
          <span>busier</span>
        </div>
      </div>
    </div>
  );
}

function kindLabel(e: CaptureEntry): string {
  if (e.kind === 'web' && e.domain) return e.domain;
  return e.kind.toUpperCase();
}

function startOfDay(epochSec: number): number {
  const d = new Date(epochSec * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime() / 1000;
}

function relativeTime(epochSec?: number): string {
  if (!epochSec) return '';
  const now = Date.now() / 1000;
  const diff = now - epochSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  const d = new Date(epochSec * 1000);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface Group {
  id: string;
  eyebrow?: string;
  title: string;
  meta?: string;
  entries: CaptureEntry[];
  defaultOpen: boolean;
}

function groupByTime(entries: CaptureEntry[]): Group[] {
  if (entries.length === 0) return [];
  const now = Date.now() / 1000;
  const dayStart = startOfDay(now);
  const yesterdayStart = dayStart - 86400;
  const weekStart = dayStart - 6 * 86400;
  const monthStart = dayStart - 29 * 86400;

  const groups: { [k: string]: { title: string; eyebrow: string; entries: CaptureEntry[]; sortKey: number; open: boolean } } = {};
  function bucket(e: CaptureEntry): string {
    const t = e.timestampEpoch ?? 0;
    if (t === 0) return 'undated';
    if (t >= dayStart) return 'today';
    if (t >= yesterdayStart) return 'yesterday';
    if (t >= weekStart) return 'thisWeek';
    if (t >= monthStart) return 'thisMonth';
    return 'older';
  }
  const meta: Record<string, { title: string; eyebrow: string; sortKey: number; open: boolean }> = {
    today:     { title: 'Today',          eyebrow: 'TODAY',         sortKey: 0, open: true  },
    yesterday: { title: 'Yesterday',      eyebrow: 'YESTERDAY',     sortKey: 1, open: false },
    thisWeek:  { title: 'This Week',      eyebrow: 'THIS WEEK',     sortKey: 2, open: false },
    thisMonth: { title: 'Earlier This Month', eyebrow: 'THIS MONTH', sortKey: 3, open: false },
    older:     { title: 'Older',          eyebrow: 'OLDER',         sortKey: 4, open: false },
    undated:   { title: 'Undated',        eyebrow: 'UNDATED',       sortKey: 5, open: false },
  };
  for (const e of entries) {
    const b = bucket(e);
    if (!groups[b]) {
      groups[b] = { ...meta[b], entries: [] };
    }
    groups[b].entries.push(e);
  }
  return Object.entries(groups)
    .filter(([, g]) => g.entries.length > 0) // hide empty buckets after filtering
    .sort(([a], [b]) => meta[a].sortKey - meta[b].sortKey)
    .map(([id, g]) => {
      const domainCount = new Set(g.entries.map((e) => e.domain).filter(Boolean)).size;
      const newest = g.entries.reduce<number>((acc, e) => Math.max(acc, e.timestampEpoch ?? 0), 0);
      const lastBit = newest > 0 ? `last ${relativeTime(newest)}` : '';
      const domainBit = domainCount > 0 ? `${domainCount} domain${domainCount === 1 ? '' : 's'}` : '';
      const tail = [domainBit, lastBit].filter(Boolean).join(' · ');
      return {
        id,
        title: g.title,
        eyebrow: g.eyebrow,
        meta: tail,
        entries: g.entries.sort((a, b) => (b.timestampEpoch ?? 0) - (a.timestampEpoch ?? 0)),
        defaultOpen: g.open,
      } as Group;
    })
    .map((group, index) => ({
      ...group,
      defaultOpen: group.defaultOpen || index < 3,
    }));
}

// Group by topic — extract a primary keyword for each capture, then
// bucket by it. We pick the term with the highest local count weighted
// by inverse document frequency. The simplest visually-organized
// approach: each capture gets one primary keyword (its highest scoring
// non-stopword from title+snippet), then captures sharing the same
// primary keyword cluster together.
//
// Trade-off: ignores sub-topics (a capture about "transformers in NLP"
// only goes under one of those words, not both). But it stays
// deterministic, has no allocations beyond the entry list, and visually
// always groups by *something*. v0 simplest approach.
function groupByTopic(entries: CaptureEntry[]): Group[] {
  if (entries.length === 0) return [];

  // 1) Document frequency per term across all entries.
  const docFreq = new Map<string, number>();
  const perEntryTokens: { e: CaptureEntry; tokens: string[] }[] = [];
  for (const e of entries) {
    const text = `${e.title || ''} ${e.snippet || ''}`;
    const tokens = tokenizeFor(text);
    perEntryTokens.push({ e, tokens });
    const seen = new Set<string>();
    for (const t of tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    }
  }

  const N = entries.length;

  // 2) Pick primary keyword per entry: max(tf * log(N / df)).
  const buckets = new Map<string, CaptureEntry[]>();
  const noKeywordBucket: CaptureEntry[] = [];
  for (const { e, tokens } of perEntryTokens) {
    if (tokens.length === 0) {
      noKeywordBucket.push(e);
      continue;
    }
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const [t, count] of tf) {
      const df = docFreq.get(t) || 1;
      const idf = Math.log((N + 1) / df) + 1;
      const score = count * idf;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (!best) noKeywordBucket.push(e);
    else {
      const arr = buckets.get(best) || [];
      arr.push(e);
      buckets.set(best, arr);
    }
  }

  // 3) Sort buckets by size desc, then alpha. Singletons clustered into
  //    a single "miscellaneous" tail bucket so the UI doesn't fragment.
  const sized: { key: string; entries: CaptureEntry[] }[] = [];
  const singletonsTail: CaptureEntry[] = [];
  for (const [key, list] of buckets) {
    if (list.length === 1) singletonsTail.push(list[0]);
    else sized.push({ key, entries: list });
  }
  sized.sort((a, b) => b.entries.length - a.entries.length || a.key.localeCompare(b.key));

  const result: Group[] = sized.map((b, i) => {
    const newest = b.entries.reduce<number>((acc, e) => Math.max(acc, e.timestampEpoch ?? 0), 0);
    return {
      id: `topic-${b.key}`,
      eyebrow: 'TOPIC',
      title: b.key,
      meta: newest > 0 ? `last ${relativeTime(newest)}` : '',
      entries: b.entries.sort((a, b2) => (b2.timestampEpoch ?? 0) - (a.timestampEpoch ?? 0)),
      defaultOpen: i < 3,
    };
  });

  if (singletonsTail.length > 0) {
    result.push({
      id: 'topic-misc',
      eyebrow: 'OTHER',
      title: 'Miscellaneous',
      meta: `${singletonsTail.length} singleton${singletonsTail.length === 1 ? '' : 's'}`,
      entries: singletonsTail.sort((a, b) => (b.timestampEpoch ?? 0) - (a.timestampEpoch ?? 0)),
      defaultOpen: false,
    });
  }
  if (noKeywordBucket.length > 0) {
    result.push({
      id: 'topic-untyped',
      eyebrow: 'NO KEYWORD',
      title: 'Untyped',
      meta: '',
      entries: noKeywordBucket.sort((a, b) => (b.timestampEpoch ?? 0) - (a.timestampEpoch ?? 0)),
      defaultOpen: false,
    });
  }

  return result;
}

// Group by domain — straight `entry.domain` bucketing. Web captures
// without a domain (and other kinds) fall into a tail bucket.
function groupByDomain(entries: CaptureEntry[]): Group[] {
  if (entries.length === 0) return [];
  const buckets = new Map<string, CaptureEntry[]>();
  const fallback: CaptureEntry[] = [];
  for (const e of entries) {
    const d = e.domain || '';
    if (!d) {
      fallback.push(e);
      continue;
    }
    const arr = buckets.get(d) || [];
    arr.push(e);
    buckets.set(d, arr);
  }
  const sorted: Group[] = [...buckets.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([d, list], i) => {
      const newest = list.reduce<number>((acc, e) => Math.max(acc, e.timestampEpoch ?? 0), 0);
      return {
        id: `dom-${d}`,
        eyebrow: 'DOMAIN',
        title: d,
        meta: newest > 0 ? `last ${relativeTime(newest)}` : '',
        entries: list.sort((a, b) => (b.timestampEpoch ?? 0) - (a.timestampEpoch ?? 0)),
        defaultOpen: i < 3,
      };
    });
  if (fallback.length > 0) {
    sorted.push({
      id: 'dom-other',
      eyebrow: 'OTHER',
      title: 'No domain',
      meta: '',
      entries: fallback.sort((a, b) => (b.timestampEpoch ?? 0) - (a.timestampEpoch ?? 0)),
      defaultOpen: false,
    });
  }
  return sorted;
}

export default function CapturesLandingPage() {
  return (
    <Suspense fallback={<div style={{ padding: 'var(--space-xl)', color: 'var(--muted)' }}>Loading…</div>}>
      <CapturesLandingInner />
    </Suspense>
  );
}
