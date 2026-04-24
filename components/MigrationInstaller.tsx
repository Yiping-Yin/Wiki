'use client';
/**
 * Side-effect-only component: imports `lib/migration-export` so its
 * auto-install side-effect runs, exposing `window.__loomMigration.request`
 * to the Swift shell. Mounted once at the root of the app — the webview
 * always has this handler available before Swift evaluates it.
 */
import { useEffect } from 'react';

export function MigrationInstaller() {
  useEffect(() => {
    // Dynamic import so the export code only loads on the client, keeping
    // it out of the initial SSR / static-export bundle when unused.
    void import('../lib/migration-export');
  }, []);
  return null;
}
