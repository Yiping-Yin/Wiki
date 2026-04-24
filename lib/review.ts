/**
 * Review · Loom's live-note vellum overlay (M5).
 *
 * When the reader presses ⌘/ on a page, a floating vellum-paper card
 * materialises centred over the source. It shows the "live note" — an
 * accumulating trail of thoughts the AI has offered during Interlace
 * (M2) for this particular page — and three italic actions:
 *
 *   Crystallize · Keep asking · Let go
 *
 * • Crystallize — dispatches `loom:crystallize` with the trail so a
 *   downstream listener can settle it into a Panel (SwiftData).
 * • Keep asking — closes Review and hands off to Interlace's
 *   follow-up input, if an Interlace is still attached.
 * • Let go — closes + clears the trail.
 *
 * The data trail lives at `window.__loomReview` and is also kept in
 * localStorage under `loom:review:<pathname>`, capped to 5 thoughts per
 * section. `lib/interlace.ts` records every finished streaming response
 * via `addThought`.
 *
 * Dependency-free (vanilla DOM) so it survives route changes and can be
 * called from Swift just like Interlace.
 */

type ReviewRecord = {
  section: string;
  thoughts: string[];
};

type LoomReviewAPI = {
  getCurrent(): ReviewRecord;
  addThought(text: string, section?: string): void;
  clear(): void;
  open(): boolean;
  close(): void;
  isOpen(): boolean;
};

type ReviewWindow = Window & {
  __loomReview?: LoomReviewAPI;
  __loomInterlace?: {
    open?: (opts?: { selection?: string; sourceTitle?: string }) => boolean;
    close?: () => void;
    isOpen?: () => boolean;
    keepAsking?: (seed?: string) => void;
  };
};

const MAX_THOUGHTS = 5;
const LS_PREFIX = 'loom:review:';

// ── Storage ───────────────────────────────────────────────────────────────

function currentPathname(): string {
  if (typeof window === 'undefined') return '/';
  try {
    return window.location.pathname || '/';
  } catch {
    return '/';
  }
}

function storageKey(pathname: string): string {
  return `${LS_PREFIX}${pathname}`;
}

function readFromStorage(pathname: string): ReviewRecord | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(pathname));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviewRecord;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.thoughts)) return null;
    return {
      section: typeof parsed.section === 'string' ? parsed.section : '',
      thoughts: parsed.thoughts.filter((t): t is string => typeof t === 'string'),
    };
  } catch {
    return null;
  }
}

function writeToStorage(pathname: string, record: ReviewRecord): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(pathname), JSON.stringify(record));
  } catch {
    // quota / disabled storage — fail silently, memory still holds it
  }
}

function clearStorage(pathname: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(pathname));
  } catch {}
}

// ── In-memory state ───────────────────────────────────────────────────────

let currentPath: string = '/';
let currentRecord: ReviewRecord = { section: '', thoughts: [] };

function hydrate(pathname: string): void {
  currentPath = pathname;
  const loaded = readFromStorage(pathname);
  currentRecord = loaded ?? { section: '', thoughts: [] };
}

function ensureHydrated(): void {
  const p = currentPathname();
  if (p !== currentPath) hydrate(p);
}

function resolveSection(explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim();
  if (typeof document === 'undefined') return '';
  const h1 = document.querySelector('.prose-notion h1');
  const fromH1 = h1?.textContent?.trim();
  if (fromH1) return fromH1;
  const title = document.title.replace(/\s*·.*$/, '').trim();
  return title;
}

// ── Overlay DOM ───────────────────────────────────────────────────────────

type ActiveOverlay = {
  backdrop: HTMLElement;
  vellum: HTMLElement;
  keyHandler: (e: KeyboardEvent) => void;
  outsideHandler: (e: MouseEvent) => void;
  routeHandler: () => void;
  closed: boolean;
};

let overlay: ActiveOverlay | null = null;

function buildVellum(record: ReviewRecord): {
  backdrop: HTMLElement;
  vellum: HTMLElement;
} {
  const backdrop = document.createElement('div');
  backdrop.className = 'loom-review-backdrop';

  const vellum = document.createElement('div');
  vellum.className = 'loom-review-vellum';
  vellum.setAttribute('role', 'dialog');
  vellum.setAttribute('aria-live', 'polite');
  vellum.setAttribute('aria-label', 'Live note');

  // Header — eyebrow with small diamond glyph
  const header = document.createElement('div');
  header.className = 'loom-review-header';

  const diamond = document.createElement('span');
  diamond.className = 'loom-review-diamond';
  diamond.setAttribute('aria-hidden', 'true');
  header.appendChild(diamond);

  const headerText = document.createElement('span');
  const sectionLabel = record.section ? record.section : 'this page';
  headerText.textContent = `Live note · ${sectionLabel}`;
  header.appendChild(headerText);
  vellum.appendChild(header);

  // Body — prior thoughts (muted) + latest (emphasised)
  const body = document.createElement('div');
  body.className = 'loom-review-body';
  const trail = record.thoughts;
  trail.forEach((t) => {
    const p = document.createElement('p');
    p.textContent = t;
    body.appendChild(p);
  });
  vellum.appendChild(body);

  // Footer actions
  const actions = document.createElement('div');
  actions.className = 'loom-review-actions';

  const crystallize = document.createElement('button');
  crystallize.type = 'button';
  crystallize.className = 'loom-review-action loom-review-action--primary';
  crystallize.dataset.loomReview = 'crystallize';
  crystallize.textContent = 'Crystallize';
  actions.appendChild(crystallize);

  const keep = document.createElement('button');
  keep.type = 'button';
  keep.className = 'loom-review-action';
  keep.dataset.loomReview = 'keep';
  keep.textContent = 'Keep asking';
  actions.appendChild(keep);

  const letgo = document.createElement('button');
  letgo.type = 'button';
  letgo.className = 'loom-review-action';
  letgo.dataset.loomReview = 'letgo';
  letgo.textContent = 'Let go';
  actions.appendChild(letgo);

  vellum.appendChild(actions);

  return { backdrop, vellum };
}

function open(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  ensureHydrated();
  if (currentRecord.thoughts.length === 0) return false;
  if (overlay) return true; // already open — no-op

  const { backdrop, vellum } = buildVellum(currentRecord);
  document.body.appendChild(backdrop);
  document.body.appendChild(vellum);

  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
      // Pressing ⌘/ again dismisses.
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'textarea' || tag === 'input') return;
      e.preventDefault();
      crystallize();
    }
  };
  const outsideHandler = (e: MouseEvent) => {
    if (!overlay) return;
    const t = e.target as Node;
    if (vellum.contains(t)) return;
    close();
  };
  const routeHandler = () => close();

  window.addEventListener('keydown', keyHandler, true);
  // Delay outside-click by one tick so the ⌘/ spawn doesn't dismiss it.
  window.setTimeout(() => {
    if (!overlay) return;
    document.addEventListener('mousedown', outsideHandler, true);
  }, 0);
  window.addEventListener('popstate', routeHandler);
  window.addEventListener('loom:route:change', routeHandler);

  overlay = {
    backdrop,
    vellum,
    keyHandler,
    outsideHandler,
    routeHandler,
    closed: false,
  };

  // Wire action buttons.
  const crystallizeBtn = vellum.querySelector<HTMLButtonElement>(
    '[data-loom-review="crystallize"]',
  );
  const keepBtn = vellum.querySelector<HTMLButtonElement>(
    '[data-loom-review="keep"]',
  );
  const letgoBtn = vellum.querySelector<HTMLButtonElement>(
    '[data-loom-review="letgo"]',
  );
  crystallizeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    crystallize();
  });
  keepBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    keepAsking();
  });
  letgoBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    letGo();
  });

  return true;
}

function tearDown(inst: ActiveOverlay) {
  inst.closed = true;
  window.removeEventListener('keydown', inst.keyHandler, true);
  document.removeEventListener('mousedown', inst.outsideHandler, true);
  window.removeEventListener('popstate', inst.routeHandler);
  window.removeEventListener('loom:route:change', inst.routeHandler);
  try { inst.backdrop.remove(); } catch {}
  try { inst.vellum.remove(); } catch {}
}

function close(): void {
  const inst = overlay;
  if (!inst) return;
  overlay = null;
  // Scale-out animation
  inst.vellum.style.animation = 'loom-review-scale-out 180ms var(--ease-exit) forwards';
  inst.backdrop.style.transition = 'opacity 180ms var(--ease-exit)';
  inst.backdrop.style.opacity = '0';
  window.setTimeout(() => tearDown(inst), 190);
}

// ── Actions ───────────────────────────────────────────────────────────────

function crystallize(): void {
  const inst = overlay;
  if (!inst) return;
  const payload = {
    section: currentRecord.section,
    thoughts: [...currentRecord.thoughts],
    source: currentPath,
    at: Date.now(),
  };
  try {
    window.dispatchEvent(
      new CustomEvent('loom:crystallize', { detail: payload }),
    );
  } catch {}

  // Wax-seal-like settle: scale down + fade + brief half-opacity hold.
  overlay = null;
  inst.vellum.style.transition =
    'opacity 260ms var(--ease-exit), transform 260ms var(--ease-exit)';
  inst.vellum.style.opacity = '0.5';
  inst.vellum.style.transform = 'translate(-50%, -50%) scale(0.85)';
  window.setTimeout(() => {
    inst.vellum.style.opacity = '0';
  }, 140);
  inst.backdrop.style.transition = 'opacity 260ms var(--ease-exit)';
  inst.backdrop.style.opacity = '0';
  window.setTimeout(() => {
    tearDown(inst);
    // Clear after crystallising — the trail has been settled.
    clear();
  }, 280);
}

function keepAsking(): void {
  const inst = overlay;
  if (!inst) return;
  const lastThought = currentRecord.thoughts[currentRecord.thoughts.length - 1] ?? '';
  close();
  const w = window as ReviewWindow;
  const api = w.__loomInterlace;
  // Prefer a dedicated keepAsking shortcut if Interlace exposes one.
  if (api?.keepAsking) {
    try {
      api.keepAsking(lastThought);
    } catch {}
    return;
  }
  // Fallback: open Interlace on the last thought as seed selection, if
  // possible. If no selection exists or Interlace rejects, this is a
  // no-op — the user has simply had Review closed.
  if (api?.open) {
    try {
      api.open({ selection: lastThought });
    } catch {}
  }
}

function letGo(): void {
  close();
  clear();
}

// ── Public API ────────────────────────────────────────────────────────────

function getCurrent(): ReviewRecord {
  ensureHydrated();
  return { section: currentRecord.section, thoughts: [...currentRecord.thoughts] };
}

function addThought(text: string, section?: string): void {
  if (!text || !text.trim()) return;
  ensureHydrated();
  const sec = resolveSection(section ?? currentRecord.section);
  const next: ReviewRecord = {
    section: sec,
    thoughts: [...currentRecord.thoughts, text.trim()],
  };
  if (next.thoughts.length > MAX_THOUGHTS) {
    next.thoughts = next.thoughts.slice(next.thoughts.length - MAX_THOUGHTS);
  }
  currentRecord = next;
  writeToStorage(currentPath, currentRecord);
}

function clear(): void {
  currentRecord = { section: '', thoughts: [] };
  clearStorage(currentPath);
}

// ── Registration ──────────────────────────────────────────────────────────

export function registerLoomReview(): void {
  if (typeof window === 'undefined') return;
  const w = window as ReviewWindow;
  if (w.__loomReview) return;

  hydrate(currentPathname());

  w.__loomReview = {
    getCurrent,
    addThought,
    clear,
    open,
    close,
    isOpen: () => overlay !== null,
  };

  // ⌘/ global handler — toggle the overlay.
  const handler = (e: KeyboardEvent) => {
    if (e.key !== '/') return;
    if (!(e.metaKey || e.ctrlKey)) return;
    // Ignore if typing in a field.
    const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    const editable = (e.target as HTMLElement | null)?.isContentEditable;
    if (editable) return;
    e.preventDefault();
    if (overlay) {
      close();
    } else {
      open();
    }
  };
  window.addEventListener('keydown', handler, true);

  // Route changes: Next.js fires `loom:route:change`; popstate catches
  // back/forward. Clear the in-memory pointer + overlay.
  const onRoute = () => {
    if (overlay) close();
    hydrate(currentPathname());
  };
  try {
    window.addEventListener('loom:route:change', onRoute);
    window.addEventListener('popstate', onRoute);
  } catch {}
}

export function closeLoomReview(): void {
  close();
}
