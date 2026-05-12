import { getKnowledgeNav, getSourceLibraryGroups } from '../../../lib/knowledge-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [nav, sourceLibraryGroups] = await Promise.all([
    getKnowledgeNav(),
    getSourceLibraryGroups(),
  ]);

  return Response.json({ ...nav, sourceLibraryGroups }, {
    headers: {
      'cache-control': 'no-store',
    },
  });
}
