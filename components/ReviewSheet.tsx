'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useRemoveEvents } from '../lib/trace';
import { contextFromPathname } from '../lib/doc-context';
import { NoteRenderer } from './NoteRenderer';
import { locateAnchorElement, type ThoughtAnchorView, useReadingThoughtAnchors } from './thought-anchor-model';

const REVIEW_SCROLL_EVENT = 'loom:review:scroll-to-anchor';

export function ReviewSheet({ active }: { active: boolean }) {
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const { thoughtItems } = useReadingThoughtAnchors(ctx.isFree ? null : ctx.docId);
  const removeEvents = useRemoveEvents();
  const [items, setItems] = useState<ThoughtAnchorView[]>([]);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || thoughtItems.length === 0) {
      setItems([]);
      return;
    }
    setItems(thoughtItems);
  }, [active, thoughtItems]);

  useEffect(() => {
    if (!active || !sheetRef.current || items.length === 0) return;
    const root = sheetRef.current;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-review-anchor-id]'));
    if (sections.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const anchorId = (visible.target as HTMLElement).dataset.reviewAnchorId;
        if (anchorId) {
          window.dispatchEvent(new CustomEvent('loom:review:active-anchor', { detail: { anchorId } }));
        }
      },
      { root, threshold: [0.3, 0.6, 0.85] },
    );

    sections.forEach((section) => obs.observe(section));
    return () => {
      obs.disconnect();
      window.dispatchEvent(new CustomEvent('loom:review:active-anchor', { detail: { anchorId: null } }));
    };
  }, [active, items]);

  useEffect(() => {
    if (!active || !sheetRef.current) return;
    const onScrollToAnchor = (e: Event) => {
      const anchorId = (e as CustomEvent).detail?.anchorId as string | undefined;
      if (!anchorId) return;
      const target = sheetRef.current?.querySelector<HTMLElement>(`[data-review-anchor-id="${anchorId}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener(REVIEW_SCROLL_EVENT, onScrollToAnchor);
    return () => window.removeEventListener(REVIEW_SCROLL_EVENT, onScrollToAnchor);
  }, [active]);

  if (!active || ctx.isFree) return null;

  return (
    <div
      ref={sheetRef}
      className="loom-review-sheet"
      style={{
        position: 'fixed',
        top: '4rem',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(var(--stage-width), calc(100vw - 48px))',
        maxHeight: 'calc(100vh - 6rem)',
        overflowY: 'auto',
        zIndex: 75,
        pointerEvents: 'auto',
        borderRadius: 22,
        background: 'var(--mat-thick-bg)',
        backdropFilter: 'var(--mat-blur-thick)',
        WebkitBackdropFilter: 'var(--mat-blur-thick)',
        border: '0.5px solid var(--mat-border)',
        boxShadow: 'var(--shadow-3)',
        padding: '1.1rem 1.25rem 1.2rem',
        animation: 'reviewSheetIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 700,
          }}
        >
          Live Note
        </span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
        <span
          className="t-caption2"
          style={{
            color: 'var(--accent)',
            letterSpacing: '0.08em',
            fontWeight: 700,
          }}
        >
          {items.length}
        </span>
      </div>

      <div
        style={{
          color: 'var(--fg)',
          fontFamily: 'var(--display)',
          fontSize: '1.45rem',
          fontWeight: 650,
          letterSpacing: '-0.02em',
          marginBottom: items.length > 0 ? 14 : 8,
        }}
      >
        {ctx.sourceTitle}
      </div>

      {items.length === 0 ? (
        <div style={{ color: 'var(--fg-secondary)', fontSize: '0.92rem', lineHeight: 1.6 }}>
          No anchored notes yet. Ask about a passage and commit ✓, then return
          here to review what you have woven.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {items.map((item) => (
            <section
              key={item.anchorId}
              data-review-anchor-id={item.anchorId}
              style={{
                paddingBottom: 14,
                borderBottom: '0.5px solid var(--mat-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => locateAnchorElement(item.anchorId, item.anchorBlockId, item.anchorBlockText)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  style={{
                    background: 'transparent',
                    border: 0,
                    padding: 0,
                    margin: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    flex: 1,
                  }}
                >
                  <div
                    className="t-caption2"
                    style={{
                      color: 'var(--accent)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                  >
                    ◆ {item.section}
                  </div>
                  <div
                    style={{
                      color: 'var(--fg)',
                      fontSize: '1.02rem',
                      fontWeight: 600,
                      lineHeight: 1.5,
                      marginBottom: item.quote ? 8 : 0,
                    }}
                  >
                    {item.summary}
                  </div>
                </button>
                {item.traceId && (
                  <button
                    onClick={() => removeEvents(item.traceId, (e) => e.kind === 'thought-anchor' && e.anchorId === item.anchorId && e.at === item.at)}
                    aria-label="Delete this anchored note"
                    title="Delete this anchored note"
                    style={{
                      background: 'transparent',
                      border: 0,
                      cursor: 'pointer',
                      color: 'var(--muted)',
                      fontSize: '0.92rem',
                      lineHeight: 1,
                      padding: '0 4px',
                      opacity: 0.42,
                      marginTop: 1,
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLButtonElement;
                      el.style.opacity = '1';
                      el.style.color = 'var(--tint-red)';
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLButtonElement;
                      el.style.opacity = '0.42';
                      el.style.color = 'var(--muted)';
                    }}
                  >×</button>
                )}
              </div>

              {item.quote ? (
                <div
                  style={{
                    color: 'var(--fg-secondary)',
                    fontSize: '0.82rem',
                    fontStyle: 'italic',
                    lineHeight: 1.5,
                    marginBottom: 10,
                  }}
                >
                  &ldquo;{item.quote}&rdquo;
                </div>
              ) : null}

              <div className="note-rendered" style={{ color: 'var(--fg-secondary)' }}>
                <NoteRenderer source={item.content} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
