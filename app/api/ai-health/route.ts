import { probeAllLocalRuntimes } from '../../../lib/ai-runtime/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const providers = await probeAllLocalRuntimes();
  return Response.json({ providers });
}
