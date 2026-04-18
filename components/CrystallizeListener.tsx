'use client';
/**
 * CrystallizeListener · when AI Examiner passes a doc, marks it as
 * crystallized at the trace level.
 *
 * Crystallized = verified knowledge. The event must land in the reading
 * trace so /patterns and all trace-derived surfaces can see it as a true panel
 * transition, not just a local UI hint.
 */
import { useEffect } from 'react';
import { appendEventForDoc } from '../lib/trace/source-bound';
import { dispatchCrystallized } from '../lib/crystallize-events';
import { derivePanelFromTraces, emitPanelChange, panelStore } from '../lib/panel';
import { traceStore } from '../lib/trace';

const LS_KEY = 'loom:crystallized';

export function getCrystallizedDocs(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function isDocCrystallized(docId: string): boolean {
  return getCrystallizedDocs().has(docId);
}

export function CrystallizeListener() {
  useEffect(() => {
    const handler = (e: Event) => {
      const docId = (e as CustomEvent).detail?.docId;
      if (!docId) return;
      void (async () => {
        try {
          const set = getCrystallizedDocs();
          set.add(docId);
          localStorage.setItem(LS_KEY, JSON.stringify([...set]));

          await appendEventForDoc(
            {
              docId,
              href: docHrefFromDocId(docId),
              sourceTitle: docTitleFromDocId(docId),
            },
            {
              kind: 'crystallize',
              summary: 'Examiner verified',
              at: Date.now(),
            },
          );
          const traceSet = (await traceStore.getByDoc(docId))
            .filter((trace) => trace.kind === 'reading' && !trace.parentId);
          const existing = await panelStore.getCanonicalByDoc(docId);
          const derived = derivePanelFromTraces({ docId, traces: traceSet, existing });
          if (derived) {
            await panelStore.put(derived);
            emitPanelChange({ docIds: [docId], reason: 'crystallize-listener' });
          }
          dispatchCrystallized({
            docId,
            href: docHrefFromDocId(docId),
            summary: 'Examiner verified',
          });
        } catch {}
      })();
    };
    window.addEventListener('loom:crystallize', handler);
    return () => window.removeEventListener('loom:crystallize', handler);
  }, []);

  return null;
}

function docHrefFromDocId(docId: string): string {
  if (docId.startsWith('wiki/')) return `/wiki/${docId.slice(5)}`;
  if (docId.startsWith('upload/')) return `/uploads/${encodeURIComponent(docId.slice(7))}`;
  if (docId.startsWith('know/')) {
    const rest = docId.slice(5);
    const [category, slug] = rest.split('__');
    if (category && slug) return `/knowledge/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`;
  }
  return '/';
}

function docTitleFromDocId(docId: string): string {
  if (docId.startsWith('wiki/')) {
    return docId
      .slice(5)
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  if (docId.startsWith('upload/')) return docId.slice(7);
  if (docId.startsWith('know/')) {
    const rest = docId.slice(5);
    const [, slug] = rest.split('__');
    if (slug) return slug.replace(/-/g, ' ');
  }
  return docId;
}
