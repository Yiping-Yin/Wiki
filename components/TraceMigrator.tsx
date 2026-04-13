'use client';
/**
 * One-time migration runner.
 *
 * On first mount, scans legacy localStorage keys and creates corresponding
 * Traces in IndexedDB. Idempotent: skips if already done.
 *
 * Mounted in the root layout so it runs at most once per browser session.
 * Has no visible UI.
 */
import { useEffect } from 'react';
import { migrateLegacyData } from '../lib/trace';

export function TraceMigrator() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await migrateLegacyData();
      if (cancelled) return;
      if (result.migrated && result.created > 0) {
        // eslint-disable-next-line no-console
        console.info(`[Loom] Migrated ${result.created} legacy doc(s) into Traces.`);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}
