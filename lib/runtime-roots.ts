import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

type ProcessEnvLike = NodeJS.ProcessEnv;

export type RuntimeActivationRecord = {
  buildId?: string;
  runtimeRoot?: string;
};

type ResolveContentRootOptions = {
  env?: ProcessEnvLike;
  fallbackContentRoot?: string;
};

type ResolveActiveRuntimeRootOptions = {
  env?: ProcessEnvLike;
};

function homeFrom(env: ProcessEnvLike = process.env) {
  return env.HOME ?? env.USERPROFILE ?? homedir();
}

function trimValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
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

  const persisted = readJsonIfExists<{ contentRoot?: string }>(contentRootConfigPath(env));
  const contentRoot = trimValue(persisted?.contentRoot);
  if (contentRoot) return contentRoot;

  return fallbackContentRoot ?? path.resolve(process.cwd());
}

export function resolveActiveRuntimeRoot({ env = process.env }: ResolveActiveRuntimeRootOptions = {}) {
  const activation = readJsonIfExists<RuntimeActivationRecord>(runtimeActivationPath(env));
  const runtimeRoot = trimValue(activation?.runtimeRoot);
  if (runtimeRoot) return runtimeRoot;

  const buildId = trimValue(activation?.buildId);
  if (buildId) return path.join(runtimeBaseDir(env), buildId);

  return null;
}
