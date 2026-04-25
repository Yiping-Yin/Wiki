import { readLoomMirror } from './loom-mirror-store';
import { fetchNativeJson } from './loom-native-json';

/** Phase 7.2 · Provenance of a Pursuit auto-spawned from extracted
 * schema (e.g. `assessmentItems[0].name` of a SyllabusSchema). When
 * present, the pursuit was minted by `PursuitSpawner` rather than by
 * the user — UI surfaces this as a quiet "from syllabus" eyebrow on
 * the row. Absent on user-minted Pursuits. */
export type LoomPursuitSpawnMeta = {
  extractorId?: string;
  fieldPath?: string;
  sourceDocId?: string;
  sourceTraceId?: string;
  sourceTitle?: string;
  body?: string;
  at?: number;
};

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
  /** Phase 7.2 · `true` when the user has dismissed this Pursuit via
   * the per-pursuit hide affordance. Reversible — the row stays in
   * the data set and can be restored from the "hidden N · show"
   * disclosure. Filtering happens in the surface, not here. */
  hidden?: boolean;
  /** Phase 7.2 · Provenance metadata for auto-spawned Pursuits. */
  spawn?: LoomPursuitSpawnMeta;
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
