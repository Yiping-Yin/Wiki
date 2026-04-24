import { readLoomMirror } from './loom-mirror-store';
import { fetchNativeJson } from './loom-native-json';

export type LoomSoanPayload = {
  cards: unknown[];
  edges: unknown[];
};

export const SOAN_RECORDS_KEY = 'loom.soan.v1';
const NATIVE_SOAN_URL = 'loom://native/soan.json';

function coerceSoanPayload(raw: unknown): LoomSoanPayload {
  if (!raw || typeof raw !== 'object') return { cards: [], edges: [] };
  const record = raw as { cards?: unknown; edges?: unknown };
  return {
    cards: Array.isArray(record.cards) ? record.cards : [],
    edges: Array.isArray(record.edges) ? record.edges : [],
  };
}

export function readStoredSoanPayload(): LoomSoanPayload {
  return readLoomMirror(
    SOAN_RECORDS_KEY,
    (raw) => coerceSoanPayload(raw),
    { cards: [], edges: [] },
  );
}

export async function loadSoanPayload(): Promise<LoomSoanPayload> {
  const native = await fetchNativeJson<unknown>(NATIVE_SOAN_URL);
  if (native !== null) return coerceSoanPayload(native);
  return readStoredSoanPayload();
}
