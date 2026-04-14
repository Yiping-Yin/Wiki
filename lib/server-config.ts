import path from 'node:path';

export type CliKind = 'claude' | 'codex';

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '';

function fromHome(...parts: string[]) {
  return HOME ? path.join(HOME, ...parts) : null;
}

export const KNOWLEDGE_ROOT =
  process.env.LOOM_KNOWLEDGE_ROOT?.trim()
  || fromHome('Desktop', 'Knowledge system')
  || path.resolve(process.cwd(), '..', 'Knowledge system');

export const CLAUDE_BIN =
  process.env.CLAUDE_BIN?.trim()
  || fromHome('.local', 'bin', 'claude')
  || 'claude';

export const CODEX_BIN =
  process.env.CODEX_BIN?.trim()
  || (process.env.HOMEBREW_PREFIX ? path.join(process.env.HOMEBREW_PREFIX, 'bin', 'codex') : null)
  || 'codex';

export const DEFAULT_CLI: CliKind =
  process.env.LOOM_AI_CLI_DEFAULT === 'codex' ? 'codex' : 'claude';

const KNOWLEDGE_ROOT_BASENAME = path.basename(KNOWLEDGE_ROOT);

function normalizeSlashes(value: string) {
  return value.replace(/\\/g, '/');
}

export function toKnowledgeRelativePath(sourcePath: string): string {
  if (!sourcePath) return sourcePath;

  const normalizedSource = normalizeSlashes(sourcePath).replace(/^\.\/+/, '');
  const normalizedRoot = normalizeSlashes(KNOWLEDGE_ROOT).replace(/\/+$/, '');

  if (!path.isAbsolute(sourcePath)) {
    return normalizedSource.replace(/^\/+/, '');
  }

  if (normalizedSource === normalizedRoot) {
    return '';
  }

  if (normalizedSource.startsWith(normalizedRoot + '/')) {
    return normalizedSource.slice(normalizedRoot.length + 1);
  }

  const parts = normalizedSource.split('/').filter(Boolean);
  const markerIndex = parts.lastIndexOf(KNOWLEDGE_ROOT_BASENAME);
  if (markerIndex >= 0) {
    return parts.slice(markerIndex + 1).join('/');
  }

  return normalizedSource;
}

export function resolveKnowledgePath(sourcePath: string): string {
  return path.resolve(KNOWLEDGE_ROOT, toKnowledgeRelativePath(sourcePath));
}
