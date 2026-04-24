/**
 * Central fetch for the MiniSearch index used across the app
 * (LinkPreview, SearchBox, wikilinks resolver, quiz/note/highlight
 * metadata pages, active retrieval, home workbench).
 *
 * Native mode: reads `loom://bundle/search-index.json` — the static
 * copy staged into the app bundle by `scripts/build-static-export.mjs`.
 * Dev mode: reads `/api/search-index` — the dynamic Next.js route that
 * rebuilds the index from scratch when stale.
 *
 * Eight callers use this today. Keeping the URL choice in one place
 * so the Phase 5 deletion of `/api/search-index` only touches this
 * file, not the call sites.
 */
import { isNativeMode } from './is-native-mode';

export function fetchSearchIndex(): Promise<Response> {
  const url = isNativeMode()
    ? 'loom://bundle/search-index.json'
    : '/api/search-index';
  return fetch(url);
}
