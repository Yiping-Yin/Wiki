# Knowledge Data Layer

Owns sources, ingestion, search, traces, panels, weaves, and persistence.

Primary responsibilities:

- source library metadata
- local knowledge root
- ingestion and uploads
- search index
- document cache
- trace store
- panel store
- weave store
- native mirror and sync boundaries

Key folders:

- `knowledge/`
- `lib/knowledge-store.ts`
- `lib/source-library-metadata.ts`
- `lib/knowledge-ingest.ts`
- `lib/search-index-client.ts`
- `lib/trace/`
- `lib/panel/`
- `lib/weave/`
- `lib/loom-mirror-store.ts`
- `app/api/knowledge-*`
- `app/api/source-*`

Design rule:

Data should preserve provenance. A source or panel should always be able to explain where it came from and what transformed it.
