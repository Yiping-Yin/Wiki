'use client';

import { useMemo, useState } from 'react';
import { selectDuePanels, useAllPanels, type Panel } from '../../lib/panel';
import { isRenderablePanel } from '../../lib/panel';
import { BlindRecall } from './BlindRecall';

const MAX_DUE_SHOWN = 3;

function formatDays(delta: number): string {
  const days = Math.round(delta / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day overdue';
  return `${days} days overdue`;
}

export function DueForReview() {
  const { panels, loading } = useAllPanels();
  const [active, setActive] = useState<Panel | null>(null);
  const now = Date.now();

  const due = useMemo(() => {
    const renderable = panels.filter(isRenderablePanel);
    return selectDuePanels(renderable, MAX_DUE_SHOWN, now);
  }, [panels, now]);

  if (loading) return null;
  if (due.length === 0) return null;

  return (
    <>
      <section
        style={{
          marginBottom: 20,
          padding: '0.9rem 1.05rem',
          background: 'var(--mat-reg-bg)',
          border: '0.5px solid var(--mat-border)',
          borderRadius: 'var(--r-3)',
        }}
      >
        <div
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          Due for review
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {due.map((panel) => {
            const nextAt = panel.srs?.nextReviewAt ?? now;
            const overdue = Math.max(0, now - nextAt);
            return (
              <button
                key={panel.id}
                type="button"
                onClick={() => setActive(panel)}
                style={{
                  appearance: 'none',
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: 'var(--display)',
                    fontSize: '0.94rem',
                    fontWeight: 600,
                    letterSpacing: '-0.015em',
                    color: 'var(--fg)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {panel.title}
                </span>
                <span
                  className="t-caption2"
                  style={{
                    color: 'var(--muted)',
                    fontSize: '0.7rem',
                    letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatDays(overdue)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {active && (
        <BlindRecall panel={active} onClose={() => setActive(null)} />
      )}
    </>
  );
}
