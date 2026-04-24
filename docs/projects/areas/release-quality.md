# Release and Quality

Owns verification, packaging, smoke checks, and release readiness.

Primary responsibilities:

- lint and build checks
- runtime smoke tests
- App Store preflight
- static export
- packaging
- CI and local release gates
- generated artifact hygiene

Key folders:

- `tests/`
- `scripts/`
- `.github/workflows/`
- `.app-store/`
- `docs/process/`

Design rule:

Verification should cover the real product surface, not only static code paths.
