import type { AiCliKind } from '../ai-cli';
import { describeCliIssue, type CliHealth } from '../ai-provider-health';
import { runCli } from '../claude-cli';

const CACHE_TTL_MS = 30_000;
export const TIMEOUT_CACHE_TTL_MS = 5_000;
export const CODEX_HEALTH_TIMEOUT_MS = 15_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 20_000;
const cache = new Map<AiCliKind, { expiresAt: number; value: CliHealth }>();

export function clearLocalRuntimeHealthCache() {
  cache.clear();
}

function ttlForHealth(value: CliHealth) {
  return value.code === 'timeout' ? TIMEOUT_CACHE_TTL_MS : CACHE_TTL_MS;
}

function cacheLocalRuntimeHealth(value: CliHealth) {
  cache.set(value.cli, {
    expiresAt: value.checkedAt + ttlForHealth(value),
    value,
  });
}

export function markLocalRuntimeHealthy(cli: AiCliKind) {
  const checkedAt = Date.now();
  cacheLocalRuntimeHealth({
    cli,
    ok: true,
    code: 'ok',
    summary: cli === 'codex' ? 'Codex CLI is available.' : 'Claude CLI is available.',
    action: '',
    checkedAt,
  });
}

export async function probeLocalRuntime(
  cli: AiCliKind,
  options: {
    runCliImpl?: typeof runCli;
  } = {},
): Promise<CliHealth> {
  const now = Date.now();
  const cached = cache.get(cli);
  if (cached && cached.expiresAt > now) return cached.value;
  const runCliImpl = options.runCliImpl ?? runCli;

  let value: CliHealth;

  try {
    await runCliImpl('Reply with exactly: ok', {
      cli,
      timeoutMs: cli === 'codex' ? CODEX_HEALTH_TIMEOUT_MS : DEFAULT_HEALTH_TIMEOUT_MS,
      codexConfigOverrides: cli === 'codex' ? ['model_reasoning_effort="medium"'] : undefined,
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

  cacheLocalRuntimeHealth(value);

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

export async function probePreferredLocalRuntimes(
  preferred: AiCliKind,
  probe: (cli: AiCliKind) => Promise<CliHealth> = probeLocalRuntime,
): Promise<CliHealth[]> {
  const primary = await probe(preferred);
  if (primary.ok) return [primary];

  const alternate: AiCliKind = preferred === 'claude' ? 'codex' : 'claude';
  const fallback = await probe(alternate);
  return [primary, fallback];
}
