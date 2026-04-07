export function PDF({ src, title, height = 600 }: { src: string; title?: string; height?: number }) {
  return (
    <div style={{ margin: '1.2rem 0', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '0.5rem 0.8rem', background: 'var(--code-bg)', fontSize: '0.85rem', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
        📄 {title ?? src} · <a href={src} target="_blank" rel="noreferrer">open</a>
      </div>
      <iframe src={src} title={title ?? 'PDF'} style={{ width: '100%', height, border: 0 }} />
    </div>
  );
}
