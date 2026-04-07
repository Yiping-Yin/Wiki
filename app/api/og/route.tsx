import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title') ?? 'LLM Wiki';
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #0f1115 0%, #1e293b 100%)',
          color: '#fff', padding: 60, justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.7 }}>📚 LLM Wiki</div>
        <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 22, opacity: 0.6 }}>Karpathy LLM101n · Notion-style knowledge base</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
