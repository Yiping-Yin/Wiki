import { readLoomMirror } from './loom-mirror-store';
import { fetchNativeJson } from './loom-native-json';

export type LoomPanelRecord = {
  id?: string;
  docId?: string;
  title?: string;
  sub?: string;
  subtitle?: string;
  color?: string;
  at?: number;
  body?: string;
  thoughts?: unknown;
  thoughtEvents?: unknown;
  revisions?: unknown;
  big?: boolean;
  glyph?: string;
};

export const PANEL_RECORDS_KEY = 'loom.panels.v1';
const NATIVE_PANELS_URL = 'loom://native/panels.json';

function coercePanelRecords(raw: unknown): LoomPanelRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is LoomPanelRecord => !!item && typeof item === 'object');
}

export function readStoredPanelRecords(): LoomPanelRecord[] {
  return readLoomMirror(
    PANEL_RECORDS_KEY,
    (raw) => coercePanelRecords(raw),
    [],
  );
}

export async function loadPanelRecords(): Promise<LoomPanelRecord[]> {
  const native = await fetchNativeJson<unknown>(NATIVE_PANELS_URL);
  if (native !== null) return coercePanelRecords(native);
  return readStoredPanelRecords();
}
