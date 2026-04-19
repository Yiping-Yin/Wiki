import path from 'node:path';
import { CONTENT_ROOT } from './server-config';

export type GeneratedCacheKind = 'summaries' | 'structures' | 'quizzes';

const ROOT = CONTENT_ROOT;
const RUNTIME_CACHE_ROOT = path.join(ROOT, 'knowledge', '.cache', 'generated');
const LEGACY_PUBLIC_ROOT = path.join(ROOT, 'public', 'knowledge');

function normalizeId(kind: GeneratedCacheKind, id: string) {
  return kind === 'quizzes' ? id.replace(/\//g, '__') : id;
}

export function runtimeCacheDir(kind: GeneratedCacheKind) {
  return path.join(RUNTIME_CACHE_ROOT, kind);
}

export function runtimeCachePath(kind: GeneratedCacheKind, id: string) {
  return path.join(runtimeCacheDir(kind), `${normalizeId(kind, id)}.json`);
}

export function legacyPublicCachePath(kind: GeneratedCacheKind, id: string) {
  return path.join(LEGACY_PUBLIC_ROOT, kind, `${normalizeId(kind, id)}.json`);
}
