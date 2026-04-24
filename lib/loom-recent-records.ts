import { readLoomMirror } from './loom-mirror-store';
import { fetchNativeJson } from './loom-native-json';

export type LoomRecentRecord = {
  href: string;
  title: string;
  at?: number | string;
};

export const RECENT_RECORDS_KEY = 'loom.sidebar.recentRecords.v2';
const NATIVE_RECENTS_URL = 'loom://native/recents.json';

function coerceRecentRecords(raw: unknown): LoomRecentRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: LoomRecentRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Partial<LoomRecentRecord>;
    if (typeof entry.href !== 'string' || typeof entry.title !== 'string') continue;
    out.push({ href: entry.href, title: entry.title, at: entry.at });
  }
  return out;
}

export function readStoredRecentRecords(): LoomRecentRecord[] {
  return readLoomMirror(
    RECENT_RECORDS_KEY,
    (raw) => coerceRecentRecords(raw),
    [],
  );
}

export async function loadRecentRecords(): Promise<LoomRecentRecord[]> {
  const native = await fetchNativeJson<unknown>(NATIVE_RECENTS_URL);
  if (native) return coerceRecentRecords(native);
  return readStoredRecentRecords();
}

export function readLatestRecentRecord(): LoomRecentRecord | null {
  return readStoredRecentRecords()[0] ?? null;
}

export async function loadLatestRecentRecord(): Promise<LoomRecentRecord | null> {
  return (await loadRecentRecords())[0] ?? null;
}
