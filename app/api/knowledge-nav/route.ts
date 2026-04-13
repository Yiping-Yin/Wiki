import { getKnowledgeNav } from '../../../lib/knowledge-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await getKnowledgeNav(), {
    headers: {
      'cache-control': 'public, max-age=300',
    },
  });
}
