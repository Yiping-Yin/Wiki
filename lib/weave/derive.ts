'use client';

import type { Trace } from '../trace/types';
import type { Panel } from '../panel/types';
import type { Weave, WeaveEvidence } from './types';
import { newWeaveId } from './types';

function extractMarkdownLinkUrls(content: string): string[] {
  if (!content) return [];
  const urls: string[] = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const url = match[1].trim().split(/\s+/)[0];
    if (url) urls.push(url);
  }
  return urls;
}

function urlReferencesDoc(url: string, docHref: string): boolean {
  if (!url || !docHref) return false;
  const cleanUrl = url.split('#')[0].split('?')[0];
  return cleanUrl === docHref
    || cleanUrl.endsWith(docHref)
    || cleanUrl.endsWith(docHref.replace(/^\//, ''));
}

function snippetFor(summary: string, content: string) {
  const base = summary.trim() || content.trim();
  const single = base.replace(/\s+/g, ' ').trim();
  return single.length > 96 ? `${single.slice(0, 96)}…` : single;
}

export function deriveSuggestedWeaves({
  panels,
  tracesByDocId,
  existingWeaves,
}: {
  panels: Panel[];
  tracesByDocId: Map<string, Trace[]>;
  existingWeaves: Weave[];
}): Weave[] {
  const panelByHref = new Map(panels.map((panel) => [panel.href, panel] as const));
  const existingById = new Map(existingWeaves.map((weave) => [weave.id, weave] as const));
  const weaveCandidates = new Map<string, { fromPanelId: string; toPanelId: string; evidence: WeaveEvidence[] }>();

  for (const panel of panels) {
    const traceSet = tracesByDocId.get(panel.docId) ?? [];
    const latestByAnchor = new Map<string, { content: string; summary: string; at: number }>();
    for (const trace of traceSet) {
      for (const event of trace.events) {
        if (event.kind !== 'thought-anchor') continue;
        const prev = latestByAnchor.get(event.anchorId);
        if (!prev || event.at > prev.at) {
          latestByAnchor.set(event.anchorId, {
            content: event.content,
            summary: event.summary,
            at: event.at,
          });
        }
      }
    }

    for (const [anchorId, note] of latestByAnchor.entries()) {
      for (const url of extractMarkdownLinkUrls(note.content)) {
        const target = Array.from(panelByHref.values()).find((candidate) => (
          candidate.docId !== panel.docId && urlReferencesDoc(url, candidate.href)
        ));
        if (!target) continue;
        const id = newWeaveId(panel.docId, target.docId);
        const current = weaveCandidates.get(id) ?? {
          fromPanelId: panel.docId,
          toPanelId: target.docId,
          evidence: [],
        };
        current.evidence.push({
          anchorId,
          snippet: snippetFor(note.summary, note.content),
          at: note.at,
        });
        weaveCandidates.set(id, current);
      }
    }
  }

  const now = Date.now();
  const weaves: Weave[] = [];
  for (const [id, candidate] of weaveCandidates) {
    const existing = existingById.get(id);
    const deduped = Array.from(
      new Map(candidate.evidence.map((item) => [`${item.anchorId ?? 'none'}:${item.snippet}`, item] as const)).values(),
    ).sort((a, b) => b.at - a.at);
    const evidenceChanged =
      !existing
      || JSON.stringify(existing.evidence) !== JSON.stringify(deduped)
      || existing.status !== 'suggested';
    weaves.push({
      id,
      fromPanelId: candidate.fromPanelId,
      toPanelId: candidate.toPanelId,
      kind: 'references',
      status: existing?.status ?? 'suggested',
      evidence: deduped,
      createdAt: existing?.createdAt ?? now,
      updatedAt: evidenceChanged ? now : (existing?.updatedAt ?? now),
    });
  }

  for (const existing of existingWeaves) {
    if (!weaveCandidates.has(existing.id) && existing.status !== 'suggested') {
      weaves.push(existing);
    }
  }

  return weaves;
}
