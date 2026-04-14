'use client';
/**
 * AnchorLayer · §38 · renders all ◆ dots for the current document.
 *
 * Reads thought-anchor events from the trace and renders an AnchorDot
 * for each one. Mounted once per doc page (in ChapterShell and knowledge
 * doc page). This is the Layer 1 + Layer 2 of the three-layer system.
 *
 * Layer 3 (full study mode) is handled by a global CSS class toggled
 * by ⌘/ — when active, all AnchorCards become visible simultaneously.
 */
import { AnchorDot, type AnchorDotProps } from './AnchorDot';
import { useReadingThoughtAnchors } from './thought-anchor-model';

export function AnchorLayer({ docId }: { docId: string }) {
  const { thoughtItems, loading } = useReadingThoughtAnchors(docId);

  if (loading) return null;

  const anchors: AnchorDotProps[] = thoughtItems.map((e) => ({
    anchorId: e.anchorId,
    anchorType: e.anchorType,
    anchorBlockId: e.anchorBlockId,
    anchorBlockText: e.anchorBlockText,
    anchorOffsetPx: e.anchorOffsetPx,
    anchorCharStart: e.anchorCharStart,
    anchorCharEnd: e.anchorCharEnd,
    rangeStartId: e.rangeStartId,
    rangeStartText: e.rangeStartText,
    rangeEndId: e.rangeEndId,
    rangeEndText: e.rangeEndText,
    summary: e.summary,
    content: e.content,
    quote: e.quote,
    thoughtType: e.thoughtType,
    at: e.at,
  }));

  const grouped = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const anchor of anchors) {
    const key = `${anchor.anchorBlockId ?? anchor.anchorId}:${Math.round((anchor.anchorOffsetPx ?? 0) / 8)}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const clustered = anchors.map((anchor) => {
    const key = `${anchor.anchorBlockId ?? anchor.anchorId}:${Math.round((anchor.anchorOffsetPx ?? 0) / 8)}`;
    const index = grouped.get(key) ?? 0;
    grouped.set(key, index + 1);
    return {
      ...anchor,
      clusterIndex: index,
      clusterCount: totals.get(key) ?? 1,
    };
  });

  if (clustered.length === 0) return null;

  return (
    <>
      {clustered.map((a, i) => (
        <AnchorDot key={`${a.anchorId}-${a.at}`} {...a} />
      ))}
    </>
  );
}
