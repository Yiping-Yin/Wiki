import type { AiCliKind } from '../ai-cli';
import { describeCliIssue, type CliHealth } from '../ai-provider-health';
import { runCli } from '../claude-cli';

const CACHE_TTL_MS = 30_000;
export const CODEX_HEALTH_TIMEOUT_MS = 45_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 20_000;
const cache = new Map<AiCliKind, { expiresAt: number; value: CliHealth }>();

export async function probeLocalRuntime(cli: AiCliKind): Promise<CliHealth> {
  const now = Date.now();
  const cached = cache.get(cli);
  if (cached && cached.expiresAt > now) return cached.value;

  let value: CliHealth;

  try {
    await runCli('Reply with exactly: ok', {
      cli,
      timeoutMs: cli === 'codex' ? CODEX_HEALTH_TIMEOUT_MS : DEFAULT_HEALTH_TIMEOUT_MS,
    });
    value = {
      cli,
      ok: true,
      code: 'ok',
      summary: cli === 'codex' ? 'Codex CLI is available.' : 'Claude CLI is available.',
      action: '',
      checkedAt: now,
    };
  } catch (error: any) {
    const issue = describeCliIssue(cli, error?.message ?? String(error));
    value = {
      cli,
      ok: false,
      code: issue.code,
      summary: issue.summary,
      action: issue.action,
      checkedAt: now,
    };
  }

  cache.set(cli, {
    expiresAt: now + CACHE_TTL_MS,
    value,
  });

  return value;
}

export async function probeLocalRuntimesInOrder(
  probe: (cli: AiCliKind) => Promise<CliHealth> = probeLocalRuntime,
): Promise<CliHealth[]> {
  const results: CliHealth[] = [];
  for (const cli of ['codex', 'claude'] as const) {
    results.push(await probe(cli));
  }
  return results;
}

export async function probeAllLocalRuntimes(): Promise<CliHealth[]> {
  return probeLocalRuntimesInOrder();
}
