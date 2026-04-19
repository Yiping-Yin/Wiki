import fs from 'node:fs';
import path from 'node:path';
import { resolveContentRoot } from './runtime-roots';

export type CliKind = 'claude' | 'codex';
const CWD_ROOT = process.cwd();

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '';

function fromHome(...parts: string[]) {
  return HOME ? path.join(HOME, ...parts) : null;
}

function fallbackContentRoot() {
  return path.resolve(CWD_ROOT);
}

function loadContentRoot() {
  try {
    return {
      contentRoot: resolveContentRoot({
        fallbackContentRoot: fallbackContentRoot(),
      }),
      error: null,
    };
  } catch (error) {
    return {
      contentRoot: fallbackContentRoot(),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

const CONTENT_ROOT_STATE = loadContentRoot();

export const CONTENT_ROOT = CONTENT_ROOT_STATE.contentRoot;
export const CONTENT_ROOT_CONFIG_ERROR = CONTENT_ROOT_STATE.error;

function hasIngestScript(root: string) {
  return fs.existsSync(path.join(root, 'scripts', 'ingest-knowledge.ts'));
}

function loadExecutionRoot() {
  const override = process.env.LOOM_EXECUTION_ROOT?.trim();
  if (override) return path.resolve(override);
  if (hasIngestScript(CWD_ROOT)) return path.resolve(CWD_ROOT);
  if (hasIngestScript(CONTENT_ROOT)) return path.resolve(CONTENT_ROOT);
  return path.resolve(CWD_ROOT);
}

export const EXECUTION_ROOT = loadExecutionRoot();

export const KNOWLEDGE_ROOT =
  process.env.LOOM_KNOWLEDGE_ROOT?.trim()
  || fromHome('Desktop', 'Knowledge system')
  || path.resolve(EXECUTION_ROOT, '..', 'Knowledge system');

export const CLAUDE_BIN =
  process.env.CLAUDE_BIN?.trim()
  || fromHome('.local', 'bin', 'claude')
  || 'claude';

export const CODEX_BIN =
  process.env.CODEX_BIN?.trim()
  || (process.env.HOMEBREW_PREFIX ? path.join(process.env.HOMEBREW_PREFIX, 'bin', 'codex') : null)
  || 'codex';

export const DEFAULT_CLI: CliKind =
  process.env.LOOM_AI_CLI_DEFAULT === 'claude' ? 'claude' : 'codex';

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
