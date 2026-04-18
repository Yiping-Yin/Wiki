import { writeKnowledgeDocBody } from '../../../../lib/knowledge-doc-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const docId = body?.docId;
  const content = body?.body;

  if (!docId || typeof docId !== 'string') {
    return Response.json({ error: 'docId is required' }, { status: 400 });
  }
  if (!content || typeof content !== 'string') {
    return Response.json({ error: 'body is required' }, { status: 400 });
  }

  try {
    const result = await writeKnowledgeDocBody({ docId, body: content });
    return Response.json({ ok: true, ...result });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
