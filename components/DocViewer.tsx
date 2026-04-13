'use client';
/**
 * Universal document viewer for knowledge docs.
 * Detects file type and renders the most useful representation:
 *   - .pdf       → embedded iframe (Apple-style frame)
 *   - .csv .tsv  → table preview (first 50 rows)
 *   - .json      → pretty syntax-highlighted tree
 *   - .ipynb     → notebook viewer (cells)
 *   - .md .txt   → plain text
 *   - .docx .pptx → "open original" link (binary)
 *
 * For text formats, the body is supplied by the page (already cleaned).
 */
import { useEffect, useMemo, useRef, useState } from 'react';

export function DocViewer({
  ext,
  sourceUrl,
  body,
  title,
}: {
  ext: string;
  sourceUrl: string;
  body: string;
  title: string;
}) {
  const e = ext.toLowerCase();

  if (e === '.pdf') return <PdfWithText src={sourceUrl} title={title} body={body} />;
  if (e === '.csv' || e === '.tsv') return <CsvTable url={sourceUrl} sep={e === '.tsv' ? '\t' : ','} />;
  if (e === '.json') return <JsonView url={sourceUrl} />;
  if (e === '.ipynb') return <NotebookView url={sourceUrl} />;
  if (e === '.md' || e === '.txt') return <TextView body={body} />;
  if (e === '.xlsx' || e === '.xls') return <BinaryEmbed ext={ext} sourceUrl={sourceUrl} title={title} body={body} kind="spreadsheet" />;
  if (e === '.docx' || e === '.doc') return <BinaryEmbed ext={ext} sourceUrl={sourceUrl} title={title} body={body} kind="document" />;
  if (e === '.pptx' || e === '.ppt') return <BinaryEmbed ext={ext} sourceUrl={sourceUrl} title={title} body={body} kind="slides" />;

  // Generic fallback
  return <BinaryEmbed ext={ext} sourceUrl={sourceUrl} title={title} body={body} kind="file" />;
}

const KIND_META: Record<string, { icon: string; tint: string; label: string }> = {
  spreadsheet: { icon: '▦', tint: 'var(--tint-green)',  label: 'Spreadsheet' },
  document:    { icon: '¶', tint: 'var(--tint-blue)',   label: 'Document' },
  slides:      { icon: '◧', tint: 'var(--tint-orange)', label: 'Slides' },
  file:        { icon: '◆', tint: 'var(--tint-purple)', label: 'File' },
};

function BinaryEmbed({
  ext, sourceUrl, title, body, kind,
}: { ext: string; sourceUrl: string; title: string; body: string; kind: string }) {
  const meta = KIND_META[kind] ?? KIND_META.file;
  const hasExtracted = body && body.length > 30 && !body.startsWith('[Binary');
  return (
    <figure style={{ margin: '1.4rem 0' }}>
      <div className="material-thick" style={{
        borderRadius: 'var(--r-3)',
        padding: '1.6rem 1.6rem 1.4rem',
        display: 'flex', gap: '1.2rem', alignItems: 'flex-start',
      }}>
        <div style={{
          width: 64, height: 80, flexShrink: 0,
          borderRadius: 'var(--r-2)',
          background: `linear-gradient(160deg, ${meta.tint}, ${meta.tint}aa)`,
          color: '#fff', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontSize: '1.7rem', fontWeight: 700,
          boxShadow: 'var(--shadow-2), inset 0 0.5px 0 rgba(255,255,255,0.5)',
        }}>
          {meta.icon}
          <span style={{ fontSize: '0.55rem', letterSpacing: '0.06em', marginTop: 2, opacity: 0.95 }}>
            {ext.slice(1).toUpperCase()}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-caption" style={{
            color: 'var(--muted)', textTransform: 'uppercase',
            letterSpacing: '0.08em', fontWeight: 700,
          }}>{meta.label}</div>
          <div className="t-title3" style={{
            marginTop: 4, color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{title}</div>
          <div className="t-footnote" style={{ marginTop: 8, color: 'var(--muted)' }}>
            {hasExtracted
              ? 'Original preserved · text extracted below for search & review'
              : 'Original preserved · open in the native app to view'}
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href={sourceUrl} target="_blank" rel="noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: '#fff',
              padding: '0.5rem 1rem', borderRadius: 999,
              textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600,
              boxShadow: 'var(--shadow-1)',
            }}>Open original</a>
            <a href={sourceUrl} download style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-2)', color: 'var(--fg)',
              padding: '0.5rem 1rem', borderRadius: 999,
              textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600,
              border: '0.5px solid var(--mat-border)',
            }}>Download</a>
          </div>
        </div>
      </div>
      {hasExtracted && (
        <div style={{ marginTop: '1.2rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 14,
          }}>
            <span aria-hidden style={{ width: 18, height: 1, background: 'var(--accent)', opacity: 0.55 }} />
            <span className="t-caption2" style={{
              color: 'var(--muted)', textTransform: 'uppercase',
              letterSpacing: '0.10em', fontWeight: 700,
            }}>Source</span>
            <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
          </div>
          <TextView body={body} />
        </div>
      )}
    </figure>
  );
}

/**
 * PDF with selectable extracted text below the iframe.
 * The PDF iframe is for visual reading; the text below is for
 * SelectionWarp interaction (select → ask AI). This is the bridge
 * that makes 69% of knowledge docs (PDFs) usable with the core loop.
 */
function PdfWithText({ src, title, body }: { src: string; title: string; body: string }) {
  const hasText = body && body.length > 30 && !body.startsWith('[Binary');
  // Split extracted text into paragraphs and filter empties, capped for perf
  const paragraphs = hasText
    ? body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).slice(0, 200)
    : [];
  return (
    <div>
      <PdfFrame src={src} title={title} />
      {hasText && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 14,
          }}>
            <span aria-hidden style={{ width: 18, height: 1, background: 'var(--accent)', opacity: 0.55 }} />
            <span className="t-caption2" style={{
              color: 'var(--muted)', textTransform: 'uppercase',
              letterSpacing: '0.10em', fontWeight: 700,
            }}>Source</span>
            <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
          </div>
          {/*
           * §X · PDF ✦ workaround: wrap the extracted text in a NESTED
           * `.loom-source-prose` container AND render paragraphs inline as
           * DIRECT children. This matters because SelectionWarp's block walk
           * looks for "the element whose parent is the proseContainer". With
           * paragraphs inside a TextView wrapper div, that block collapses to
           * the wrapper; with paragraphs as direct children, each <p> is its
           * own block → character offsets become meaningful per paragraph →
           * Thought Map section detection and version chains work correctly.
           */}
          <div className="loom-source-prose">
            {paragraphs.map((p, i) => (
              <p key={i} style={{ fontSize: '0.95rem', lineHeight: 1.65, margin: '0 0 0.9rem' }}>
                {p}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PdfFrame({ src, title }: { src: string; title: string }) {
  const [zoom, setZoom] = useState<'page-fit' | 'page-width' | 100 | 125 | 150 | 200>('page-width');
  const [fullscreen, setFullscreen] = useState(false);

  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    if (fullscreen) window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [fullscreen]);

  const zoomParam = typeof zoom === 'number' ? zoom : zoom;
  // toolbar=0 + navpanes=0 = hide PDF.js's own UI; only the document remains.
  // statusbar=0 hides the bottom info strip in Chromium PDF viewer.
  const iframeSrc = `${src}#toolbar=0&navpanes=0&statusbar=0&view=FitH&zoom=${zoomParam}`;

  const frame = (
    <iframe
      ref={ref}
      src={iframeSrc}
      title={title}
      key={iframeSrc}
      className="loom-pdf-frame"
      style={{
        width: '100%',
        height: fullscreen ? '100vh' : '92vh',
        border: 0, display: 'block',
        background: 'var(--surface-2)',
      }}
    />
  );

  if (fullscreen) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div className="material-thick" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0.55rem 0.85rem',
          borderRadius: 0,
          borderBottom: '0.5px solid var(--mat-border)',
        }}>
          <button
            onClick={() => setFullscreen(false)}
            aria-label="Exit fullscreen"
            style={{
              width: 12, height: 12, borderRadius: '50%',
              background: '#ff5f57', border: '0.5px solid rgba(0,0,0,0.18)',
              cursor: 'pointer', padding: 0,
            }}
          />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e', border: '0.5px solid rgba(0,0,0,0.18)' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840', border: '0.5px solid rgba(0,0,0,0.18)' }} />
          <div style={{ flex: 1, textAlign: 'center' }} className="t-footnote">
            <span style={{ fontWeight: 600, color: 'var(--fg-secondary)' }}>{title}</span>
          </div>
          <ZoomControl zoom={zoom} setZoom={setZoom} />
          <span className="t-caption2" style={{
            color: 'var(--muted)', fontFamily: 'var(--mono)',
            border: '0.5px solid var(--mat-border)', borderRadius: 4,
            padding: '2px 6px',
          }}>esc</span>
        </div>
        {frame}
      </div>
    );
  }

  // PDFs carry their own visual container (the page itself), so we skip the
  // ViewerFrame chrome and render the iframe bleed — no border, no radius, no
  // margin — to maximize visible content. Controls float over the top and
  // fade in on hover, just like ViewerFrame.
  return (
    <div className="loom-pdf-bleed" style={{ position: 'relative', margin: 0 }}>
      {/* Floating controls — absolute, fade in on hover */}
      <div className="loom-pdf-chrome material-thick" style={{
        position: 'absolute',
        top: 12, right: 12,
        zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px',
        borderRadius: 999,
        opacity: 0,
        transition: 'opacity 0.22s var(--ease)',
        pointerEvents: 'none',
      }}>
        <ZoomControl zoom={zoom} setZoom={setZoom} />
        <button
          onClick={() => setFullscreen(true)}
          title="Fullscreen"
          aria-label="Fullscreen"
          style={iconBtn}
        >⛶</button>
        <a href={src} target="_blank" rel="noreferrer" className="t-caption2" style={{
          color: 'var(--accent)', textDecoration: 'none', fontWeight: 700,
          padding: '2px 6px',
        }}>Open</a>
      </div>

      {/* Floating title — absolute top-left, also fade in */}
      <div className="loom-pdf-title material-thick" style={{
        position: 'absolute',
        top: 12, left: 12,
        zIndex: 5,
        padding: '4px 11px',
        borderRadius: 999,
        opacity: 0,
        transition: 'opacity 0.22s var(--ease)',
        pointerEvents: 'none',
        maxWidth: 'calc(100% - 260px)',
      }}>
        <span className="t-caption2" style={{
          color: 'var(--fg-secondary)', fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'block',
        }}>
          {title} <span style={{ color: 'var(--muted)', marginLeft: 4 }}>· PDF</span>
        </span>
      </div>

      {frame}

      <style>{`
        .loom-pdf-bleed:hover .loom-pdf-chrome,
        .loom-pdf-bleed:hover .loom-pdf-title {
          opacity: 1;
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 0, cursor: 'pointer',
  padding: '4px 7px', borderRadius: 6,
  color: 'var(--fg-secondary)', fontSize: '0.92rem',
  lineHeight: 1, fontFamily: 'var(--mono)',
  flexShrink: 0,
};

function ZoomControl({
  zoom, setZoom,
}: {
  zoom: 'page-fit' | 'page-width' | 100 | 125 | 150 | 200;
  setZoom: (z: 'page-fit' | 'page-width' | 100 | 125 | 150 | 200) => void;
}) {
  const order: Array<'page-fit' | 'page-width' | 100 | 125 | 150 | 200> = ['page-fit', 'page-width', 100, 125, 150, 200];
  const idx = order.indexOf(zoom);
  const dec = () => setZoom(order[Math.max(0, idx - 1)]);
  const inc = () => setZoom(order[Math.min(order.length - 1, idx + 1)]);
  const label = zoom === 'page-fit' ? 'Fit' : zoom === 'page-width' ? 'Width' : `${zoom}%`;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      border: '0.5px solid var(--mat-border)',
      borderRadius: 999,
      background: 'var(--bg-elevated)',
      flexShrink: 0,
    }}>
      <button onClick={dec} aria-label="Zoom out" style={{ ...iconBtn, padding: '2px 9px' }}>−</button>
      <span className="t-caption2" style={{
        color: 'var(--fg-secondary)', fontWeight: 700,
        minWidth: 38, textAlign: 'center',
        fontFamily: 'var(--mono)',
        fontVariantNumeric: 'tabular-nums',
      }}>{label}</span>
      <button onClick={inc} aria-label="Zoom in" style={{ ...iconBtn, padding: '2px 9px' }}>+</button>
    </div>
  );
}

/* ─────────── Shared viewer chrome ─────────── */

function ViewerFrame({
  title, subtitle, openHref, children, flush, extra,
}: {
  title: string;
  subtitle: string;
  openHref?: string;
  children: React.ReactNode;
  /** Render body flush against title bar with no inner padding (for iframes). */
  flush?: boolean;
  /** Optional toolbar content (e.g. zoom + fullscreen) inserted before "Open ↗". */
  extra?: React.ReactNode;
}) {
  // Stealth chrome · the controls are absolute-positioned and only visible
  // on hover. The document is the host; the chrome is a guest that withdraws.
  return (
    <figure className="loom-viewer-frame" style={{
      margin: '1.4rem 0',
      borderRadius: 'var(--r-3)',
      overflow: 'hidden',
      background: 'var(--bg-elevated)',
      border: '0.5px solid var(--mat-border)',
      position: 'relative',
    }}>
      {/* Floating controls — absolute, fade in on hover */}
      <div className="loom-viewer-chrome material-thick" style={{
        position: 'absolute',
        top: 12, right: 12,
        zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px',
        borderRadius: 999,
        opacity: 0,
        transition: 'opacity 0.22s var(--ease)',
        pointerEvents: 'none',
      }}>
        {extra}
        {openHref && (
          <a href={openHref} target="_blank" rel="noreferrer" className="t-caption2" style={{
            color: 'var(--accent)', textDecoration: 'none', fontWeight: 700,
            padding: '2px 6px',
          }}>Open</a>
        )}
      </div>

      {/* Floating title — absolute top-left, also fade in */}
      <div className="loom-viewer-title material-thick" style={{
        position: 'absolute',
        top: 12, left: 12,
        zIndex: 5,
        padding: '4px 11px',
        borderRadius: 999,
        opacity: 0,
        transition: 'opacity 0.22s var(--ease)',
        pointerEvents: 'none',
        maxWidth: 'calc(100% - 240px)',
      }}>
        <span className="t-caption2" style={{
          color: 'var(--fg-secondary)', fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'block',
        }}>
          {title} <span style={{ color: 'var(--muted)', marginLeft: 4 }}>· {subtitle}</span>
        </span>
      </div>

      <div style={flush ? {} : { background: 'var(--bg-elevated)' }}>
        {children}
      </div>

      <style>{`
        .loom-viewer-frame:hover .loom-viewer-chrome,
        .loom-viewer-frame:hover .loom-viewer-title {
          opacity: 1;
          pointer-events: auto;
        }
      `}</style>
    </figure>
  );
}

function LoadingPane({ label }: { label: string }) {
  return (
    <div style={{
      margin: '1.4rem 0', padding: '1.2rem 1.4rem',
      borderRadius: 'var(--r-3)',
      border: '0.5px solid var(--mat-border)',
      background: 'var(--bg-elevated)',
      boxShadow: 'var(--shadow-1)',
      color: 'var(--muted)',
      display: 'flex', alignItems: 'center', gap: 12,
    }} className="t-footnote">
      <WeftShuttle width={64} />
      <span>{label}</span>
    </div>
  );
}

/** Weft shuttle progress · kesi-native loading indicator. Used everywhere a spinner would have been. */
export function WeftShuttle({ width = 64, height = 14 }: { width?: number; height?: number }) {
  return (
    <div style={{
      position: 'relative',
      width, height,
      borderRadius: 999,
      background: 'transparent',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        backgroundImage: `repeating-linear-gradient(90deg,
          var(--muted) 0,
          var(--muted) 0.5px,
          transparent 0.5px,
          transparent 5px
        )`,
        opacity: 0.36,
      }} />
      <div className="loom-shuttle-pane" style={{
        position: 'absolute',
        top: 'calc(50% - 1.5px)',
        width: Math.max(12, width * 0.22), height: 3,
        borderRadius: 999,
        background: 'var(--accent)',
      }} />
      <style>{`
        .loom-shuttle-pane {
          animation: shuttleSlidePane 1.5s cubic-bezier(0.55, 0, 0.45, 1) infinite alternate;
        }
        @keyframes shuttleSlidePane {
          from { left: 2px; }
          to   { left: calc(100% - ${Math.max(12, width * 0.22)}px - 2px); }
        }
      `}</style>
    </div>
  );
}

/**
 * Actionable error pane. Follows the UX standard's error tier-3 rule:
 * every error reaching the user must answer what/where/how. `what` is the
 * summary (first line, red). `how` is the guidance (second line, muted).
 * Raw engine messages (`raw`) are hidden behind a "details" toggle because
 * they're actionable only for developers, not users.
 */
function ErrorPane({ what, how, raw, openHref }: {
  what: string;
  how?: string;
  raw?: string;
  openHref?: string;
}) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div style={{
      margin: '1.4rem 0', padding: '1rem 1.2rem',
      borderRadius: 'var(--r-2)',
      border: '0.5px solid var(--mat-border)',
      background: 'var(--bg-elevated)',
      boxShadow: 'var(--shadow-1)',
    }} className="t-footnote">
      <div style={{ color: 'var(--tint-red)', fontWeight: 600, marginBottom: how ? 6 : 0 }}>
        ⚠ {what}
      </div>
      {how && (
        <div style={{ color: 'var(--fg-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
          {how}
          {openHref && (
            <>
              {' '}
              <a href={openHref} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                Open original
              </a>
            </>
          )}
        </div>
      )}
      {raw && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: 'var(--muted)', fontSize: '0.72rem', padding: 0,
              fontFamily: 'var(--mono)', letterSpacing: '0.04em',
            }}
          >
            {showRaw ? '− hide details' : '+ show details'}
          </button>
          {showRaw && (
            <pre style={{
              marginTop: 6, padding: '8px 10px',
              background: 'var(--code-bg)',
              borderRadius: 'var(--r-1)',
              color: 'var(--muted)',
              fontSize: '0.72rem',
              fontFamily: 'var(--mono)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>{raw}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function TextView({ body }: { body: string }) {
  if (!body || body.length < 5) {
    return <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '1rem 0' }}>(empty)</div>;
  }
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).slice(0, 200);
  return (
    <div style={{ marginTop: '1rem' }}>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ fontSize: '0.95rem', lineHeight: 1.65 }}>{p}</p>
      ))}
    </div>
  );
}

function CsvTable({ url, sep }: { url: string; sep: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(url).then((r) => r.text()).then((text) => {
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const parsed = lines.slice(0, 51).map((l) => parseLine(l, sep));
      setRows(parsed);
    }).catch((e) => setError(e.message));
  }, [url, sep]);

  if (error) return (
    <ErrorPane
      what="Couldn't load this CSV file."
      how="The file may have moved, been renamed, or the network dropped during fetch. Try refreshing, or open the original in Numbers / Excel to check it's intact."
      raw={error}
      openHref={url}
    />
  );
  if (!rows) return <LoadingPane label="" />;

  const [header, ...data] = rows;
  return (
    <ViewerFrame title={`${data.length} rows · ${header.length} columns`} subtitle="CSV">
      <div style={{ overflowX: 'auto', maxHeight: '62vh' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              {header.map((h, i) => (
                <th key={i} style={{
                  padding: '0.55rem 0.85rem', textAlign: 'left',
                  background: 'var(--bg-elevated)',
                  borderBottom: '0.5px solid var(--mat-border)',
                  fontWeight: 700, position: 'sticky', top: 0, zIndex: 1,
                  whiteSpace: 'nowrap', color: 'var(--fg)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} style={{
                borderBottom: '0.5px solid var(--mat-border)',
                background: ri % 2 === 0 ? 'transparent' : 'var(--surface-2)',
              }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '0.4rem 0.85rem', whiteSpace: 'nowrap',
                    color: 'var(--fg)',
                    fontFamily: isNumeric(cell) ? 'var(--mono)' : 'inherit',
                    textAlign: isNumeric(cell) ? 'right' : 'left',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ViewerFrame>
  );
}

function JsonView({ url }: { url: string }) {
  const [text, setText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(url).then((r) => r.text()).then((t) => {
      try {
        setText(JSON.stringify(JSON.parse(t), null, 2));
      } catch {
        setText(t);
      }
    }).catch((e) => setError(e.message));
  }, [url]);

  if (error) return (
    <ErrorPane
      what="Couldn't load this JSON file."
      how="The file may have moved or the network dropped. Try refreshing, or open the original file directly."
      raw={error}
      openHref={url}
    />
  );
  return (
    <ViewerFrame title="Pretty-printed" subtitle="JSON">
      <pre style={{
        margin: 0, padding: '1.2rem 1.4rem',
        background: 'var(--code-bg)',
        overflow: 'auto', maxHeight: '70vh',
        fontSize: '0.82rem', fontFamily: 'var(--mono)', lineHeight: 1.6,
        color: 'var(--fg)',
      }}>{text || ''}</pre>
    </ViewerFrame>
  );
}

function NotebookView({ url }: { url: string }) {
  const [cells, setCells] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(url).then((r) => r.text()).then((t) => {
      try {
        const nb = JSON.parse(t);
        setCells(nb.cells ?? []);
      } catch (e: any) {
        setError(`parse: ${e.message}`);
      }
    }).catch((e) => setError(`fetch: ${e.message}`));
  }, [url]);

  if (error) {
    const isParse = error.startsWith('parse:');
    return (
      <ErrorPane
        what={isParse ? "This notebook file isn't valid Jupyter JSON." : "Couldn't load this notebook."}
        how={
          isParse
            ? 'The .ipynb file may be corrupted or saved in an unexpected format. Open it in Jupyter / VS Code to verify and re-save.'
            : 'The file may have moved or the network dropped during fetch. Try refreshing, or open the original directly.'
        }
        raw={error.replace(/^(parse|fetch): /, '')}
        openHref={url}
      />
    );
  }
  if (!cells) return <LoadingPane label="" />;

  const codeCells = cells.filter((c) => c.cell_type === 'code').length;
  const mdCells = cells.filter((c) => c.cell_type === 'markdown').length;

  return (
    <ViewerFrame
      title={`${codeCells} code · ${mdCells} markdown`}
      subtitle="Jupyter Notebook"
    >
      <div style={{
        padding: '1rem 1.2rem',
        display: 'flex', flexDirection: 'column', gap: '0.85rem',
        background: 'var(--bg)',
        maxHeight: '76vh', overflow: 'auto',
      }}>
        {cells.map((cell, i) => {
          const src = Array.isArray(cell.source) ? cell.source.join('') : cell.source ?? '';
          if (cell.cell_type === 'markdown') {
            return (
              <div key={i} style={{
                padding: '0.75rem 1.05rem',
                borderLeft: '3px solid var(--accent)',
                background: 'var(--accent-soft)',
                borderRadius: '0 var(--r-1) var(--r-1) 0',
                color: 'var(--fg)',
              }} className="t-footnote">
                {src}
              </div>
            );
          }
          if (cell.cell_type === 'code') {
            return (
              <div key={i} style={{
                borderRadius: 'var(--r-1)',
                border: '0.5px solid var(--mat-border)',
                background: 'var(--code-bg)',
                overflow: 'hidden',
              }}>
                <div className="t-caption2" style={{
                  padding: '4px 12px',
                  background: 'var(--surface-2)',
                  borderBottom: '0.5px solid var(--mat-border)',
                  color: 'var(--muted)',
                  fontFamily: 'var(--mono)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  fontWeight: 700,
                }}>In [{i + 1}]</div>
                <pre style={{
                  margin: 0, padding: '0.85rem 1.1rem',
                  fontSize: '0.82rem', fontFamily: 'var(--mono)',
                  overflow: 'auto', color: 'var(--fg)', lineHeight: 1.55,
                }}>
                  <code>{src}</code>
                </pre>
                {cell.outputs && cell.outputs.length > 0 && (
                  <div style={{
                    padding: '0.7rem 1.1rem',
                    background: 'var(--accent-soft)',
                    borderTop: '0.5px solid var(--mat-border)',
                    fontSize: '0.78rem', fontFamily: 'var(--mono)',
                    color: 'var(--fg)',
                    maxHeight: 220, overflow: 'auto',
                  }}>
                    {cell.outputs.map((out: any, j: number) => {
                      const outText = out.text ?? out.data?.['text/plain'] ?? '';
                      return <div key={j}>{Array.isArray(outText) ? outText.join('') : outText}</div>;
                    })}
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>
    </ViewerFrame>
  );
}

function parseLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === sep && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function isNumeric(s: string) {
  return /^-?\d+(\.\d+)?$/.test(s.trim());
}
