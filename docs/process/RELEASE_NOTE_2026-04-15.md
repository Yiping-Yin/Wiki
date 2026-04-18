# Release Note · 2026-04-15

Loom now ships as a more coherent desktop system.

## What changed

- `Patterns` is now the formal product surface for settled work.
- `Atlas` is now the formal collection entry.
- `Observation Deck` is now the quiet desktop start surface.
- `Home`, `Today`, `Review`, `Patterns`, and `Graph` now share one scheduler and change-resolution language.
- `Sidebar`, `Shuttle`, and `Home` now have distinct desktop roles instead of overlapping entry behavior.
- Main work surfaces now share a stage-width and breakpoint contract.

## What this means for users

- The product no longer feels like multiple adjacent tools.
- The next move is easier to find from Home and Today.
- Settled work now consistently lives in `Patterns`.
- Shuttle behaves like the fast path, not a second homepage.
- Review and graph surfaces now carry the same change-aware work language as the scheduler.

## Compatibility

- Existing `/kesi` links still work and redirect to `/patterns`.
- Existing `/atlas` links still work and redirect to the current Atlas entry.

## Validation

Validated with:

- `npm run typecheck`
- `npm run build`
- `npm run smoke`
