export function YouTube({ id, title }: { id: string; title?: string }) {
  return (
    <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, margin: '1.2rem 0', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <iframe
        src={`https://www.youtube.com/embed/${id}`}
        title={title ?? 'YouTube video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  );
}
