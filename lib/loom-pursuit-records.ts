import { readLoomMirror } from './loom-mirror-store';
import { fetchNativeJson } from './loom-native-json';

export type LoomPursuitRecord = {
  id?: string;
  question?: string;
  weight?: string;
  sources?: number;
  panels?: number;
  season?: string;
  sourceItems?: unknown;
  panelItems?: unknown;
  at?: number;
  settledAt?: number;
};

export const PURSUIT_RECORDS_KEY = 'loom.pursuits.v1';
const NATIVE_PURSUITS_URL = 'loom://native/pursuits.json';

function coercePursuitRecords(raw: unknown): LoomPursuitRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is LoomPursuitRecord => !!item && typeof item === 'object');
}

export function readStoredPursuitRecords(): LoomPursuitRecord[] {
  return readLoomMirror(
    PURSUIT_RECORDS_KEY,
    (raw) => coercePursuitRecords(raw),
    [],
  );
}

export async function loadPursuitRecords(): Promise<LoomPursuitRecord[]> {
  const native = await fetchNativeJson<unknown>(NATIVE_PURSUITS_URL);
  if (native !== null) return coercePursuitRecords(native);
  return readStoredPursuitRecords();
}
