import { isAnthropicConfigured } from '../../../lib/anthropic-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reports whether the HTTPS AI path has a usable API key. Does NOT return the
 * key itself (server-side only check of env presence). Consumed by the
 * first-run banner to decide whether to nudge the user into Settings.
 */
export async function GET() {
  return Response.json({
    anthropic: isAnthropicConfigured() ? 'set' : 'unset',
  });
}
