# LOOM Project Map

Status: working map
Purpose: keep the renamed LOOM workspace organized without moving build-critical source directories.

The repository is now rooted at:

```text
/Users/yinyiping/Desktop/LOOM
```

The code layout stays conventional so Next.js, tests, scripts, and the macOS app keep working. Project classification lives in `docs/projects/`.

## Source Layout

- `app/` - Next.js routes and product surfaces.
- `components/` - shared React components and UI primitives.
- `lib/` - runtime, data, AI, trace, panel, weave, and domain logic.
- `macos-app/` - native Loom macOS shell.
- `tests/` - Node and React tests.
- `scripts/` - build, export, indexing, app packaging, and dev scripts.
- `docs/` - design, process, project planning, specs, audits, and research.
- `knowledge/` - local knowledge corpus and uploaded source material.
- `public/` - static assets, brand assets, generated export assets, and support pages.

## Project Areas

- Web Product Surfaces - Home, Desk, Sources, Reading, Panels, Patterns, Weaves, Coworks.
- macOS Native Shell - sidebar, window chrome, native settings, bridge handlers, packaged app.
- AI Runtime - Claude/OpenAI/Ollama/custom transports, streaming, provider health, runtime policy.
- Knowledge Data Layer - source library, ingestion, search index, traces, panels, weaves, persistence.
- Brand and Design - Loom visual grammar, material luxury research, typography, icons, App Store imagery.
- Release and Quality - tests, smoke scripts, App Store preflight, export, packaging, CI.
- Research and Docs - specs, plans, audits, design memory, process notes.

## Management Rule

Do not reorganize `app/`, `components/`, `lib/`, `macos-app/`, `tests/`, or `scripts/` into category folders unless the build system is explicitly updated at the same time.

Use `docs/projects/` to classify work and keep the source tree stable.
