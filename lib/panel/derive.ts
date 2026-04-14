'use client';

import { passagePositionKey } from '../passage-locator';
import type { Trace } from '../trace/types';
import { buildPanelContract } from './contract';
import type { Panel, PanelSection, PanelSnapshotInput } from './types';
import { newPanelId } from './types';

export function derivePanelFromTraces(input: PanelSnapshotInput): Panel | null {
  const { docId, traces, existing } = input;
  if (traces.length === 0) return null;

  const representative = traces
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0];
  if (!representative?.source?.href) return null;

  let crystallizedAt = 0;
  let crystallizedSummary = '';
  let reopenedAt = 0;
  const latestByPosition = new Map<string, PanelSection>();

  for (const trace of traces) {
    for (const event of trace.events) {
      if (event.kind === 'crystallize' && !event.anchorId && event.at > crystallizedAt) {
        crystallizedAt = event.at;
        crystallizedSummary = event.summary;
      }
      if (event.kind === 'panel-reopen' && event.at > reopenedAt) {
        reopenedAt = event.at;
      }
      if (event.kind !== 'thought-anchor') continue;
      const key = passagePositionKey({
        anchorId: event.anchorId,
        blockId: event.anchorBlockId,
        blockText: event.anchorBlockText,
        charStart: event.anchorCharStart,
        charEnd: event.anchorCharEnd,
        target: docId,
      });
      const prev = latestByPosition.get(key);
      if (!prev || event.at > prev.at) {
        latestByPosition.set(key, {
          key,
          anchorId: event.anchorId,
          summary: event.summary,
          quote: event.quote,
          thoughtType: event.thoughtType,
          at: event.at,
        });
      }
    }
  }

  const sections = Array.from(latestByPosition.values()).sort((a, b) => a.at - b.at);
  if (sections.length === 0) return null;
  const latestAnchorId = sections.at(-1)?.anchorId ?? null;
  const sourceDocIds = [docId];
  const anchorIds = sections.map((section) => section.anchorId);

  const derivedContract = buildPanelContract({
    title: representative.source.sourceTitle ?? representative.title,
    latestArtifact: crystallizedSummary,
    sections,
  });
  const crystallizedContract = existing?.contractSource === 'crystallized'
    ? {
        summary: existing.summary,
        centralClaim: existing.centralClaim,
        keyDistinctions: existing.keyDistinctions,
        openTensions: existing.openTensions,
        contractSource: existing.contractSource,
        contractUpdatedAt: existing.contractUpdatedAt,
      }
    : null;

  const createdAt = Math.min(
    ...traces.map((trace) => trace.createdAt),
    ...sections.map((section) => section.at),
    crystallizedAt,
  );
  const updatedAt = Math.max(
    ...traces.map((trace) => trace.updatedAt),
    crystallizedAt || 0,
  );

  const latestSectionAt = Math.max(...sections.map((section) => section.at));
  const status =
    crystallizedAt === 0
      ? 'provisional'
      : reopenedAt > crystallizedAt || latestSectionAt > crystallizedAt || derivedContract.openTensions.length > 0
        ? 'contested'
        : 'settled';

  return {
    id: newPanelId(docId),
    docId,
    href: representative.source.href,
    title: representative.source.sourceTitle ?? representative.title,
    sourceDocIds,
    traceIds: traces.map((trace) => trace.id),
    anchorIds,
    latestAnchorId,
    summary: crystallizedContract?.summary ?? derivedContract.summary,
    centralClaim: crystallizedContract?.centralClaim ?? derivedContract.centralClaim,
    keyDistinctions: crystallizedContract?.keyDistinctions ?? derivedContract.keyDistinctions,
    openTensions: crystallizedContract?.openTensions ?? derivedContract.openTensions,
    contractSource: crystallizedContract?.contractSource ?? 'derived',
    contractUpdatedAt: crystallizedContract?.contractUpdatedAt ?? (crystallizedAt || updatedAt),
    status,
    createdAt,
    updatedAt,
    crystallizedAt,
    sections,
  };
}
