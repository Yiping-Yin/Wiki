import { readLoomMirror } from './loom-mirror-store';
import { fetchNativeJson } from './loom-native-json';

export type LoomWeaveRecord = {
  id?: string;
  from?: string;
  to?: string;
  kind?: string;
  rationale?: string;
  at?: number;
};

export const WEAVE_RECORDS_KEY = 'loom.weaves.v1';
const NATIVE_WEAVES_URL = 'loom://native/weaves.json';

function coerceWeaveRecords(raw: unknown): LoomWeaveRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is LoomWeaveRecord => !!item && typeof item === 'object');
}

export function readStoredWeaveRecords(): LoomWeaveRecord[] {
  return readLoomMirror(
    WEAVE_RECORDS_KEY,
    (raw) => coerceWeaveRecords(raw),
    [],
  );
}

export async function loadWeaveRecords(): Promise<LoomWeaveRecord[]> {
  const native = await fetchNativeJson<unknown>(NATIVE_WEAVES_URL);
  if (native !== null) return coerceWeaveRecords(native);
  return readStoredWeaveRecords();
}
