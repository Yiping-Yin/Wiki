'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { useReadingThoughtAnchors } from './thought-anchor-model';

export function AnchorDebugOverlay() {
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const isLocal =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  const enabled = isLocal && !ctx.isFree && pathname !== '/dev/traces';
  const { thoughtItems } = useReadingThoughtAnchors(enabled ? ctx.docId : null);

  const rows = useMemo(
    () =>
      thoughtItems.map((item, index) => ({
        id: `${item.traceId}:${item.anchorId}:${item.at}`,
        label: `${index + 1}. ${item.anchorId}`,
        block: item.anchorBlockId ?? '—',
        chars: item.anchorCharStart != null || item.anchorCharEnd != null
          ? `${item.anchorCharStart ?? 0}-${item.anchorCharEnd ?? 0}`
          : '—',
        summary: item.summary,
      })),
    [thoughtItems],
  );

  if (!enabled || rows.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 160,
        width: 360,
        maxHeight: '42vh',
        overflowY: 'auto',
        padding: '10px 12px',
        borderRadius: 12,
        background: 'rgba(0,0,0,0.78)',
        color: '#fff',
        fontSize: 11,
        lineHeight: 1.4,
        fontFamily: 'var(--mono)',
        boxShadow: 'var(--shadow-3)',
      }}
    >
      <div style={{ marginBottom: 8, opacity: 0.8 }}>anchor debug · {rows.length}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row) => (
          <div key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
            <div style={{ color: 'var(--tint-blue)' }}>{row.label}</div>
            <div>block: {row.block}</div>
            <div>chars: {row.chars}</div>
            <div style={{ color: 'rgba(255,255,255,0.74)' }}>{row.summary.slice(0, 72)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
