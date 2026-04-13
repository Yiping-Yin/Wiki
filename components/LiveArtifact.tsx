'use client';
/**
 * LiveArtifact · §8 Two surfaces, one trace
 *
 * On document pages, the Live Note is the ordered weave of committed
 * thought-anchors. It is not a chat log and not a separate panel model;
 * it is the document's current understanding, derived from anchored notes.
 *
 * On free surfaces (home, today, etc.), there is no source-shaped anchor
 * system, so the old recompile-based free note still applies. In that mode
 * this component listens for `loom:artifact:stream` and renders the latest
 * free-thinking artifact version.
 *
 * §1 — Empty state renders nothing. The space below the source stays
 * empty until the user has actually started thinking with AI.
 */
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRemoveEvents, useAppendEvent, useBacklinksForDoc, useAllTraces } from '../lib/trace';
import { LOOM_CRYSTALLIZED_EVENT, type CrystallizedDetail, dispatchCrystallized } from '../lib/crystallize-events';
import { openPanelReview } from '../lib/panel-resume';
import { useReadingThoughtAnchors } from './thought-anchor-model';
import { VersionedAnchorCard } from './VersionedAnchorCard';

const NoteRenderer = dynamic(() => import('./NoteRenderer').then((m) => m.NoteRenderer), { ssr: false });

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
  if (cleanUrl === docHref) return true;
  if (cleanUrl.endsWith(docHref)) return true;
  if (cleanUrl.endsWith(docHref.replace(/^\//, ''))) return true;
  return false;
}

export function LiveArtifact({ docId }: { docId: string }) {
  const { readingTraces, primaryReadingTrace: readingTrace, thoughtItems, loading } = useReadingThoughtAnchors(docId);
  const router = useRouter();
  const { traces } = useAllTraces();
  // Backlinks: anchors in OTHER docs that reference this doc via markdown link
  const docHref = readingTrace?.source?.href ?? null;
  const backlinks = useBacklinksForDoc(docId, docHref);
  const removeEvents = useRemoveEvents();
  const append = useAppendEvent();
  const [streamBuf, setStreamBuf] = useState<string | null>(null);
  const [streamingDocId, setStreamingDocId] = useState<string | null>(null);
  const [viewVersion, setViewVersion] = useState<number | null>(null); // null = latest
  const [showHistory, setShowHistory] = useState(false);
  const [activeAnchorId, setActiveAnchorId] = useState<string>('');
  const [settledPulse, setSettledPulse] = useState(false);
  const [settledSummary, setSettledSummary] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  const openBacklinkReview = (href: string, anchorId: string) => {
    openPanelReview(router, { href, anchorId });
  };

  // Free-mode still streams a recompiled artifact; doc-mode is derived from
  // committed thought-anchors and does not need this path.
  useEffect(() => {
    const onTok = (e: Event) => {
      const detail = (e as CustomEvent).detail as { docId: string; content: string };
      if (detail.docId !== docId) return;
      setStreamBuf(detail.content);
      setStreamingDocId(detail.docId);
    };
    window.addEventListener('loom:artifact:stream', onTok);
    return () => {
      window.removeEventListener('loom:artifact:stream', onTok);
    };
  }, [docId]);

  // Smooth scroll-follow during streaming — only nudge if user is already
  // near the bottom, to avoid hijacking when they scroll up to read.
  useEffect(() => {
    if (!streamBuf || !bodyRef.current) return;
    const el = bodyRef.current;
    const rect = el.getBoundingClientRect();
    const fromBottom = rect.bottom - window.innerHeight;
    if (fromBottom > -120) {
      window.scrollBy({ top: Math.min(fromBottom + 80, 60), behavior: 'smooth' });
    }
  }, [streamBuf]);

  // Free-mode recompile history. Doc-mode uses committed thought-anchors.
  const docBound = !docId.startsWith('free/');
  const versions: { content: string; at: number }[] = readingTrace
    ? readingTrace.events
        .filter((e): e is Extract<typeof e, { kind: 'recompile' }> => e.kind === 'recompile')
        .map((e) => ({ content: e.content, at: e.at }))
    : [];

  // Delete a single recompile version by its event timestamp.
  const deleteVersion = async (at: number) => {
    if (!readingTrace) return;
    await removeEvents(readingTrace.id, (e) => e.kind === 'recompile' && e.at === at);
    // After delete, fall back to "latest" view so we don't try to render a
    // version index that no longer exists.
    setViewVersion(null);
  };

  // Delete every recompile version (start the artifact over).
  const deleteAllVersions = async () => {
    if (!readingTrace) return;
    await removeEvents(readingTrace.id, (e) => e.kind === 'recompile');
    setViewVersion(null);
    setShowHistory(false);
  };

  // §7 + X · Crystallize: mark this panel as a finished piece of the kesi.
  // Appends a `kind: 'crystallize'` event whose summary is the current
  // artifact's first heading or first sentence. This is what /kesi reads
  // as "the user has woven this." Idempotent — calling on an already-
  // crystallized panel is a no-op (the meta strip hides the button).
  const isCrystallized = readingTrace
    ? readingTrace.events.some((e) => e.kind === 'crystallize')
    : false;
  const crystallize = async () => {
    if (!readingTrace || isCrystallized) return;
    const latest = thoughtItems.length > 0
      ? thoughtItems.map((it) => it.summary).join(' · ')
      : versions[versions.length - 1]?.content ?? '';
    const summary = deriveSummary(latest) ?? readingTrace.title;
    await append(readingTrace.id, {
      kind: 'crystallize',
      summary,
      at: Date.now(),
    });
    dispatchCrystallized({
      docId,
      href: readingTrace.source?.href,
      summary,
    });
  };
  const uncrystallize = async () => {
    if (!readingTrace) return;
    await removeEvents(readingTrace.id, (e) => e.kind === 'crystallize');
  };

  const totalVersions = versions.length;
  const latestArtifact = versions[totalVersions - 1]?.content ?? '';
  const outgoingDocThreads = useMemo(() => {
    const refs = new Set<string>();
    const ownHref = readingTrace?.source?.href ?? '';
    for (const thought of thoughtItems) {
      for (const url of extractMarkdownLinkUrls(thought.content)) {
        const clean = url.split('#')[0].split('?')[0];
        if (!clean || clean === ownHref) continue;
        refs.add(clean);
      }
    }
    return refs.size;
  }, [readingTrace?.source?.href, thoughtItems]);
  const incomingDocThreads = useMemo(
    () => new Set(backlinks.map((backlink) => backlink.fromDocId)).size,
    [backlinks],
  );
  const relationPreview = useMemo(() => {
    const incoming = new Map<string, { docId: string; title: string }>();
    for (const backlink of backlinks) {
      if (!incoming.has(backlink.fromDocId)) {
        incoming.set(backlink.fromDocId, {
          docId: backlink.fromDocId,
          title: backlink.fromDocTitle,
        });
      }
    }

    const traceByDocId = new Map(
      traces
        .filter((trace) => trace.kind === 'reading' && !trace.parentId && trace.source?.docId && trace.source?.href)
        .map((trace) => [
          trace.source!.docId,
          {
            href: trace.source!.href,
            title: trace.source!.sourceTitle ?? trace.title,
          },
        ] as const),
    );

    const outgoing = new Map<string, { docId: string; title: string }>();
    const ownHref = readingTrace?.source?.href ?? '';
    for (const thought of thoughtItems) {
      for (const url of extractMarkdownLinkUrls(thought.content)) {
        const target = Array.from(traceByDocId.entries()).find(([, meta]) => urlReferencesDoc(url, meta.href));
        if (!target) continue;
        const [targetDocId, meta] = target;
        if (targetDocId === docId || meta.href === ownHref) continue;
        if (!outgoing.has(targetDocId)) {
          outgoing.set(targetDocId, {
            docId: targetDocId,
            title: meta.title,
          });
        }
      }
    }

    return {
      incoming: Array.from(incoming.values()),
      outgoing: Array.from(outgoing.values()),
    };
  }, [backlinks, docId, readingTrace?.source?.href, thoughtItems, traces]);

  // §22 race fix: when the trace's latest recompile event matches our
  // in-flight stream buffer, the new permanent version has landed —
  // clear streamBuf so the trace becomes the truth. This prevents the
  // one-frame flicker that would occur if QuickBar cleared streamBuf
  // before our async refetch returned.
  useEffect(() => {
    if (streamBuf !== null && latestArtifact && latestArtifact === streamBuf) {
      setStreamBuf(null);
      setStreamingDocId(null);
    }
  }, [latestArtifact, streamBuf]);

  useEffect(() => {
    const onActive = (e: Event) => {
      const anchorId = (e as CustomEvent).detail?.anchorId as string | null | undefined;
      setActiveAnchorId(anchorId ?? '');
    };
    window.addEventListener('loom:review:active-anchor', onActive);
    return () => window.removeEventListener('loom:review:active-anchor', onActive);
  }, []);

  useEffect(() => {
    let timeoutId: number | null = null;
    const onCrystallized = (e: Event) => {
      const detail = (e as CustomEvent<CrystallizedDetail>).detail;
      if (!detail?.docId || detail.docId !== docId) return;
      setSettledSummary(detail.summary ?? '');
      setSettledPulse(true);
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setSettledPulse(false);
        timeoutId = null;
      }, 2600);
    };
    window.addEventListener(LOOM_CRYSTALLIZED_EVENT, onCrystallized);
    return () => {
      window.removeEventListener(LOOM_CRYSTALLIZED_EVENT, onCrystallized);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [docId]);

  if (loading) return null;

  if (docBound && thoughtItems.length > 0) {
    const focusThought = thoughtItems.find((item) => item.anchorId === activeAnchorId) ?? thoughtItems[0] ?? null;

    return (
      <section
        aria-label="Live note"
        style={{ margin: '2.4rem 0 1.6rem', position: 'relative' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span aria-hidden style={{ width: 18, height: 1, background: 'var(--accent)', opacity: 0.55, flexShrink: 0 }} />
          <span className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.10em', fontWeight: 700 }}>
            Live note · {thoughtItems.length}
          </span>
          <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
          {!isCrystallized && readingTrace && (
            <button
              onClick={crystallize}
              aria-label="Crystallize this panel into your kesi"
              title="Crystallize · settle this panel into your kesi"
              style={{
                background: 'transparent', border: 0, cursor: 'pointer',
                color: 'var(--muted)', padding: '0 6px',
                fontSize: '0.9rem', lineHeight: 1, opacity: 0.55,
                transition: 'opacity 0.18s var(--ease), color 0.18s var(--ease)',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.opacity = '1';
                el.style.color = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.opacity = '0.55';
                el.style.color = 'var(--muted)';
              }}
            >✦</button>
          )}
        </div>

        {isCrystallized && (
          <div
            style={{
              padding: '0.8rem 0',
              borderTop: '0.5px solid var(--accent)',
              borderBottom: '0.5px solid var(--mat-border)',
              boxShadow: settledPulse ? '0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent)' : 'none',
              marginBottom: 16,
              background: 'transparent',
              transition: 'background 0.28s var(--ease), box-shadow 0.28s var(--ease)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span
                className="t-caption2"
                style={{
                  color: 'var(--accent)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                }}
              >
                Settled into Kesi
              </span>
              <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
              <button
                type="button"
                onClick={() => router.push(`/kesi?focus=${encodeURIComponent(docId)}`)}
                style={{
                  appearance: 'none',
                  border: 0,
                  background: 'transparent',
                  color: 'var(--fg-secondary)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                Open this panel in Kesi
              </button>
              <button
                type="button"
                onClick={() => void uncrystallize()}
                style={{
                  appearance: 'none',
                  border: 0,
                  background: 'transparent',
                  color: 'var(--fg-secondary)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                Uncrystallize
              </button>
            </div>
            <div
              style={{
                color: 'var(--fg-secondary)',
                fontSize: '0.86rem',
                lineHeight: 1.5,
                marginBottom: incomingDocThreads + outgoingDocThreads > 0 ? 8 : 0,
              }}
            >
              {settledSummary || readingTrace?.crystallizedSummary || 'This panel is no longer provisional. It now lives in your kesi.'}
            </div>
            {incomingDocThreads + outgoingDocThreads > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div
                  className="t-caption2"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    color: 'var(--muted)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {incomingDocThreads > 0 && <span>{incomingDocThreads} incoming threads</span>}
                  {incomingDocThreads > 0 && outgoingDocThreads > 0 && <span aria-hidden>·</span>}
                  {outgoingDocThreads > 0 && <span>{outgoingDocThreads} outgoing threads</span>}
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    onClick={() => router.push(`/graph?focus=${encodeURIComponent(docId)}`)}
                    style={{
                      appearance: 'none',
                      border: 0,
                      background: 'transparent',
                      color: 'var(--fg-secondary)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    Relations
                  </button>
                </div>
                {relationPreview.incoming.length > 0 && (
                  <div
                    className="t-caption2"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      color: 'var(--muted)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    <span>Referenced by</span>
                    {relationPreview.incoming.slice(0, 2).map((item, index) => (
                      <button
                        key={item.docId}
                        type="button"
                        onClick={() => router.push(`/graph?focus=${encodeURIComponent(item.docId)}`)}
                        style={settledRelationLinkStyle}
                      >
                        {item.title}
                        {index < Math.min(relationPreview.incoming.length, 2) - 1 ? (
                          <span style={{ color: 'var(--muted)' }}> · </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
                {relationPreview.outgoing.length > 0 && (
                  <div
                    className="t-caption2"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      color: 'var(--muted)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    <span>Points to</span>
                    {relationPreview.outgoing.slice(0, 2).map((item, index) => (
                      <button
                        key={item.docId}
                        type="button"
                        onClick={() => router.push(`/graph?focus=${encodeURIComponent(item.docId)}`)}
                        style={settledRelationLinkStyle}
                      >
                        {item.title}
                        {index < Math.min(relationPreview.outgoing.length, 2) - 1 ? (
                          <span style={{ color: 'var(--muted)' }}> · </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {focusThought && (
          <div
            style={{
              padding: '0.1rem 0 1rem',
              borderBottom: '0.5px solid var(--mat-border)',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span
                className="t-caption2"
                style={{
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                Settling now
              </span>
              <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
              <span className="t-caption2" style={{ color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {focusThought.sectionNumber ? `${String(focusThought.sectionNumber).padStart(2, '0')} · ` : ''}{focusThought.section}
              </span>
            </div>

            <div
              style={{
                fontFamily: 'var(--display)',
                fontSize: '1rem',
                fontWeight: 600,
                letterSpacing: '-0.016em',
                lineHeight: 1.38,
                marginBottom: focusThought.quote ? 8 : 0,
                color: 'var(--fg)',
              }}
            >
              {focusThought.summary || focusThought.content || 'This weave is still taking shape.'}
            </div>

            {focusThought.quote ? (
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--muted)',
                  fontStyle: 'italic',
                  lineHeight: 1.5,
                  paddingLeft: 10,
                  borderLeft: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
                  marginBottom: 10,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {focusThought.quote}
              </div>
            ) : null}

            <div
              className="t-caption2"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                color: 'var(--muted)',
                letterSpacing: '0.04em',
              }}
            >
              <span>{focusThought.versionCount > 1 ? `${focusThought.versionCount} versions` : 'first weave'}</span>
              <span aria-hidden>·</span>
              <span>{focusThought.isCrystallized ? 'crystallized' : 'open'}</span>
            </div>
          </div>
        )}

        {backlinks.length > 0 && (
          <div
            style={{
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: '0.5px dashed var(--mat-border)',
            }}
          >
            <div
              className="t-caption2"
              style={{
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Referenced by · {backlinks.length}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {backlinks.slice(0, 10).map((b) => (
                <li key={`${b.fromTraceId}-${b.fromAnchorId}`}>
                  <button
                    type="button"
                    onClick={() => openBacklinkReview(b.fromDocHref, b.fromAnchorId)}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      padding: '4px 6px',
                      borderRadius: 6,
                      color: 'var(--fg-secondary)',
                      fontSize: '0.82rem',
                      lineHeight: 1.45,
                      textDecoration: 'none',
                      appearance: 'none',
                      border: 0,
                      background: 'transparent',
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ color: 'var(--accent)', flexShrink: 0, fontWeight: 600 }}>
                      {b.fromDocTitle}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        color: 'var(--muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      — {b.fromAnchorSummary}
                    </span>
                  </button>
                </li>
              ))}
              {backlinks.length > 10 && (
                <li
                  className="t-caption2"
                  style={{
                    color: 'var(--muted)',
                    padding: '4px 6px',
                    fontFamily: 'var(--mono)',
                    fontSize: '0.68rem',
                  }}
                >
                  + {backlinks.length - 10} more
                </li>
              )}
            </ul>
          </div>
        )}

        <div ref={bodyRef} className="prose-notion live-artifact-body" style={{ color: 'var(--fg)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {thoughtItems.map((item) => (
            <VersionedAnchorCard
              key={item.containerKey}
              item={item}
              emphasized={item.anchorId === activeAnchorId}
            />
          ))}
        </div>
      </section>
    );
  }

  // streamBuf wins. otherwise viewVersion (1-indexed) or latest.
  const pickedVersion = viewVersion ?? totalVersions;
  const pickedContent = versions[pickedVersion - 1]?.content ?? '';
  const visible = streamBuf ?? pickedContent ?? latestArtifact;
  if (!visible) return null;
  const isViewingHistory = !streamBuf && viewVersion !== null && viewVersion < totalVersions;

  return (
    <section
      aria-label="Live note"
      style={{
        margin: '2.4rem 0 1.6rem',
        position: 'relative',
      }}
    >
      {/* Hairline meta strip — version + accent thread.
          §1 · 润物细无声 — only present when there is content. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 12,
      }}>
        <span aria-hidden style={{
          width: 18, height: 1,
          background: 'var(--accent)',
          opacity: 0.55,
          flexShrink: 0,
        }} />
        <span className="t-caption2" style={{
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.10em',
          fontWeight: 700,
        }}>
          Live note
          {streamingDocId
            ? ''
            : totalVersions > 1
              ? ` · v${pickedVersion}${isViewingHistory ? ` of ${totalVersions}` : ''}`
              : ''}
        </span>
        {totalVersions > 1 && !streamingDocId && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Show version history"
            title="Version history"
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: 'var(--muted)', padding: '0 4px',
              fontSize: '0.78rem', lineHeight: 1,
              fontFamily: 'var(--mono)',
            }}
          >↶</button>
        )}
        {isViewingHistory && (
          <button
            onClick={() => { setViewVersion(null); setShowHistory(false); }}
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: 'var(--accent)', padding: '0 4px',
              fontSize: '0.7rem', fontFamily: 'var(--display)',
              fontWeight: 600,
            }}
          >back to latest</button>
        )}
        <span aria-hidden style={{
          flex: 1, height: 1,
          background: 'var(--mat-border)',
        }} />
        {/* Crystallize: mark this panel as a finished piece of the kesi.
            Once crystallized, the ✓ becomes filled accent and clicking it
            again uncrystallizes. The /kesi page reads only crystallized
            panels for its portfolio view. */}
        {!streamingDocId && totalVersions > 0 && (
          <button
            onClick={() => (isCrystallized ? uncrystallize() : crystallize())}
            aria-label={isCrystallized ? 'Uncrystallize this panel' : 'Crystallize this panel into your kesi'}
            title={isCrystallized
              ? 'Crystallized — click to undo'
              : 'Crystallize · settle this panel into your kesi'}
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: isCrystallized ? 'var(--accent)' : 'var(--muted)',
              padding: '0 6px',
              fontSize: '0.9rem', lineHeight: 1,
              opacity: isCrystallized ? 1 : 0.55,
              transition: 'opacity 0.18s var(--ease), color 0.18s var(--ease)',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.opacity = '1';
              if (!isCrystallized) el.style.color = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.opacity = isCrystallized ? '1' : '0.55';
              el.style.color = isCrystallized ? 'var(--accent)' : 'var(--muted)';
            }}
          >✦</button>
        )}
        {/* Delete current version. Cascades: deleting v1 of 1 removes the
            entire artifact and the section disappears. The default action
            is destructive but reversible by re-asking the AI. */}
        {!streamingDocId && totalVersions > 0 && (
          <button
            onClick={() => {
              const targetAt = versions[pickedVersion - 1]?.at;
              if (targetAt) deleteVersion(targetAt);
            }}
            aria-label="Delete this version of the live note"
            title={pickedVersion === totalVersions
              ? 'Delete this version'
              : `Delete v${pickedVersion}`}
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: 'var(--muted)', padding: '0 4px',
              fontSize: '0.95rem', lineHeight: 1,
              opacity: 0.55,
              transition: 'opacity 0.18s var(--ease), color 0.18s var(--ease)',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.opacity = '1';
              el.style.color = 'var(--tint-red)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.opacity = '0.55';
              el.style.color = 'var(--muted)';
            }}
          >×</button>
        )}
      </div>

      {showHistory && totalVersions > 1 && !streamingDocId && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          marginBottom: 14,
          alignItems: 'center',
        }}>
          {versions.map((v, i) => {
            const ver = i + 1;
            const isCurrent = ver === pickedVersion;
            return (
              <span
                key={v.at}
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: isCurrent ? 'var(--accent-soft)' : 'transparent',
                  border: '0.5px solid var(--mat-border)',
                  borderRadius: 999,
                }}
              >
                <button
                  onClick={() => setViewVersion(ver === totalVersions ? null : ver)}
                  title={new Date(v.at).toLocaleString()}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: isCurrent ? 'var(--accent)' : 'var(--muted)',
                    padding: '2px 4px 2px 9px',
                    fontSize: '0.7rem',
                    fontFamily: 'var(--mono)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >v{ver}</button>
                <button
                  onClick={() => deleteVersion(v.at)}
                  aria-label={`Delete v${ver}`}
                  title={`Delete v${ver}`}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--muted)',
                    padding: '0 7px 0 2px',
                    fontSize: '0.85rem',
                    lineHeight: 1,
                    cursor: 'pointer',
                    opacity: 0.5,
                    transition: 'opacity 0.18s, color 0.18s',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.opacity = '1';
                    el.style.color = 'var(--tint-red)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.opacity = '0.5';
                    el.style.color = 'var(--muted)';
                  }}
                >×</button>
              </span>
            );
          })}
          <button
            onClick={deleteAllVersions}
            title="Delete every version"
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: 'var(--muted)', padding: '2px 6px',
              fontSize: '0.66rem',
              fontFamily: 'var(--display)',
              opacity: 0.55,
              transition: 'opacity 0.18s, color 0.18s',
              marginLeft: 4,
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.opacity = '1';
              el.style.color = 'var(--tint-red)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.opacity = '0.55';
              el.style.color = 'var(--muted)';
            }}
          >clear all</button>
        </div>
      )}

      <div ref={bodyRef} className="prose-notion live-artifact-body" style={{
        color: 'var(--fg)',
        opacity: isViewingHistory ? 0.78 : 1,
        transition: 'opacity 0.2s var(--ease)',
        // The artifact body inherits the host page's typography.
        // No box, no border, no background — it reads like the natural
        // continuation of the document above it.
      }}>
        <NoteRenderer source={visible} />
      </div>
    </section>
  );
}

const settledRelationLinkStyle: React.CSSProperties = {
  appearance: 'none',
  border: 0,
  background: 'transparent',
  color: 'var(--accent)',
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.02em',
  padding: 0,
  cursor: 'pointer',
};

/** Extract a short summary from artifact markdown — first heading or sentence. */
function deriveSummary(md: string): string | null {
  if (!md) return null;
  const lines = md.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.+?)\s*#*$/);
    if (h) {
      const t = h[1].replace(/[*`_]/g, '').trim();
      if (t.length >= 2) return t.length > 80 ? t.slice(0, 77) + '…' : t;
    }
  }
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('>') || line.startsWith('```')) continue;
    const plain = line.replace(/[*`_\[\]()]/g, '').trim();
    if (plain.length < 6) continue;
    const sentence = plain.split(/(?<=[.!?。!?])\s/)[0];
    if (sentence.length >= 6) {
      return sentence.length > 80 ? sentence.slice(0, 77) + '…' : sentence;
    }
  }
  return null;
}
