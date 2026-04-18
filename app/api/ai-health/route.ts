import { probeAllLocalRuntimes, probePreferredLocalRuntimes } from '../../../lib/ai-runtime/health';
import type { AiCliKind } from '../../../lib/ai-cli';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const preferred = url.searchParams.get('preferred');
  const providers = preferred === 'codex' || preferred === 'claude'
    ? await probePreferredLocalRuntimes(preferred as AiCliKind)
    : await probeAllLocalRuntimes();
  return Response.json({ providers });
}
