# Ship Audit · 2026-04-15

Status: release candidate audit  
Updated: 2026-04-15

This audit checks the current Loom build from the user's point of view, not only the object model.

## 1. Scope

Surfaces checked:

- `Home`
- `Sidebar`
- `Shuttle`
- `/today`
- `/atlas`
- `/patterns`
- `/graph`
- `review`
- `/help`
- `/about`

Checks performed:

- entry hierarchy clarity
- user-visible naming consistency
- stage width / breakpoint consistency
- scheduler / work-session wording consistency
- release-path validation (`typecheck`, `build`, `smoke`)

## 2. Result

Release candidate is acceptable.

The product now reads as one system:

- `Sidebar` is primary navigation
- `Shuttle` is the fast path inside the product shell, with minimal work state kept in the shell
- `Home` is the quiet desktop start surface
- `Today` is the active scheduler surface
- `Atlas` is the collection layer
- `Patterns` is the settled pattern habitat

## 3. Corrections Made In This Audit

- Promoted `/patterns` to the formal product route and kept `/kesi` only as a legacy redirect.
- Corrected `/atlas` to redirect to the actual Atlas entry at `/knowledge`.
- Removed remaining user-facing `Kesi` labels from active UI paths.
- Unified `Patterns / Atlas / Observation Deck` wording across help, about, sidebar, quick switcher, review, and settled panel surfaces.
- Replaced the scene-driven Home with a quiet desktop start surface.
- Added shared stage width and breakpoint contracts for working / archive / map surfaces.
- Promoted desktop entry roles into the active canon and stabilization freeze docs.
- Aligned help and process copy to the local CLI AI runtime model: Codex CLI as the default and Claude CLI as the fallback.

## 4. Residual Non-Blocking Issues

- Historical design documents still refer to `/kesi` and `kesi` as the product surface. These are archival and metaphor documents, not current operating docs.
- Some implementation comments still mention the `kesi` craft when describing the weaving metaphor. This is acceptable because it is metaphor source material, not UI naming.
- `typecheck` still performs an automatic self-heal build whenever `.next-build/types` is stale. This is noisy but currently functional.

## 5. Validation

Validated serially:

- `npm run typecheck`
- `npm run build`
- `npm run smoke`

All passed on this release candidate.
