'use client';
/**
 * Phase 2 of architecture inversion · IndexedDB → SwiftData one-way migration.
 *
 * Exports every row from the IndexedDB stores (`traces`, `panels`, `weaves`)
 * as a JSON blob. Swift reads this via a WKScriptMessageHandler on first
 * launch after the SwiftData store is introduced, hydrates its own tables,
 * and never writes back (web becomes read-only on IDB during the transition,
 * then reads from Swift via the data bridge added in Phase 2b).
 *
 * Versioning: the exported blob carries a schema version. Swift rejects any
 * version it doesn't know, surfaces an upgrade prompt, and leaves IDB alone
 * so the user can downgrade without data loss.
 */

export const MIGRATION_EXPORT_VERSION = 1;

export type MigrationExportPayload = {
  version: number;
  exportedAt: number;
  traces: unknown[];
  panels: unknown[];
  weaves: unknown[];
};

const DB_NAME = 'loom';

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IDB upgrade blocked'));
  });
}

function readAll(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(store)) {
      resolve([]);
      return;
    }
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Snapshot every IDB store into a plain JSON-safe object. Returns null
 * when running server-side or when IDB isn't available. Never mutates the
 * DB — this is a read-only export.
 */
export async function exportAllToJSON(): Promise<MigrationExportPayload | null> {
  if (!isClient()) return null;
  try {
    const db = await openDB();
    try {
      const [traces, panels, weaves] = await Promise.all([
        readAll(db, 'traces'),
        readAll(db, 'panels'),
        readAll(db, 'weaves'),
      ]);
      return {
        version: MIGRATION_EXPORT_VERSION,
        exportedAt: Date.now(),
        traces,
        panels,
        weaves,
      };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/**
 * Handler that the Swift side attaches via `WKUserContentController.add(_:name:)`
 * under the name `loomMigrationExport`. When Swift posts an empty message
 * the webview runs `exportAllToJSON()` and ships the payload back via
 * `window.__loomMigration.onExport(json)`.
 *
 * Set up at module load time so the handler is registered before Swift
 * sends its first request.
 */
type MigrationWindow = Window & {
  __loomMigration?: {
    request: () => Promise<void>;
  };
};

export function installMigrationSide(): void {
  if (typeof window === 'undefined') return;
  const w = window as MigrationWindow;
  if (w.__loomMigration) return;
  w.__loomMigration = {
    async request() {
      const payload = await exportAllToJSON();
      try {
        const webkit = (window as unknown as {
          webkit?: { messageHandlers?: { loomMigrationExport?: { postMessage: (msg: unknown) => void } } };
        }).webkit;
        webkit?.messageHandlers?.loomMigrationExport?.postMessage(payload ?? { empty: true });
      } catch {}
    },
  };
}

// Auto-install on module load so Swift can call window.__loomMigration.request()
// as soon as the webview is done loading. Harmless outside the Loom app shell.
installMigrationSide();
