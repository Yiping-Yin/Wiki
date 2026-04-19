import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

type ProcessEnvLike = NodeJS.ProcessEnv;

export type RuntimeActivationRecord = {
  buildId?: string;
  runtimeRoot?: string;
};

export class RuntimeRootsConfigError extends Error {
  readonly path: string;

  constructor(message: string, filePath: string) {
    super(`${message}: ${filePath}`);
    this.name = 'RuntimeRootsConfigError';
    this.path = filePath;
  }
}

type ResolveContentRootOptions = {
  env?: ProcessEnvLike;
  fallbackContentRoot?: string;
};

type ResolveActiveRuntimeRootOptions = {
  env?: ProcessEnvLike;
};

function homeFrom(env: ProcessEnvLike = process.env) {
  return trimValue(env.HOME) ?? trimValue(env.USERPROFILE) ?? homedir();
}

function trimValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readJsonIfExists<T>(filePath: string, description: string): T | null {
  if (!existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as T;
    if (!parsed || typeof parsed !== 'object') {
      throw new RuntimeRootsConfigError(`Malformed ${description}`, filePath);
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new RuntimeRootsConfigError(`Malformed ${description}`, filePath);
    }
    throw error;
  }
}

function directoryExists(filePath: string) {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

export function runtimeBaseDir(env: ProcessEnvLike = process.env) {
  return path.join(homeFrom(env), 'Library', 'Application Support', 'Loom', 'runtime');
}

export function runtimeActivationPath(env: ProcessEnvLike = process.env) {
  return path.join(runtimeBaseDir(env), 'current.json');
}

export function contentRootConfigPath(env: ProcessEnvLike = process.env) {
  return path.join(homeFrom(env), 'Library', 'Application Support', 'Loom', 'content-root.json');
}

export function resolveContentRoot({ env = process.env, fallbackContentRoot }: ResolveContentRootOptions = {}) {
  const override = trimValue(env.LOOM_CONTENT_ROOT);
  if (override) return override;

  const persisted = readJsonIfExists<{ contentRoot?: string }>(contentRootConfigPath(env), 'content-root.json');
  const contentRoot = trimValue(persisted?.contentRoot);
  if (contentRoot) return contentRoot;

  return fallbackContentRoot ?? path.resolve(process.cwd());
}

export function resolveActiveRuntimeRoot({ env = process.env }: ResolveActiveRuntimeRootOptions = {}) {
  const activation = readJsonIfExists<RuntimeActivationRecord>(runtimeActivationPath(env), 'current.json');
  const runtimeRoot = trimValue(activation?.runtimeRoot);
  if (runtimeRoot && directoryExists(runtimeRoot)) return runtimeRoot;

  const buildId = trimValue(activation?.buildId);
  if (buildId) {
    const derivedRuntimeRoot = path.join(runtimeBaseDir(env), buildId);
    if (directoryExists(derivedRuntimeRoot)) return derivedRuntimeRoot;
  }

  return null;
}
