# Syllabus fixture corpus

Source corpus for the Phase 1 gate (`scripts/phase1-gate.py` +
`scripts/phase1-gate.sh`). Each syllabus has up to four files:

- `<slug>.input.txt` — extracted plaintext (via `scripts/phase1-corpus-extract.mjs`
  which reuses `lib/pdf-extract.ts` + the `cleanText()` port from
  `scripts/ingest-knowledge.ts`). **Load-bearing fixture** — committed.
- `<slug>.meta.json` — sourcePath, discipline, fileSize, pageCount,
  extractedLength. Committed.
- `<slug>.expected.json` — **hand-verified** golden file: per-field
  expected outcome (`found` with value, or `not_found`). Committed.
- `<slug>.schema.json` — cached AI output from a prior `phase1-gate.py`
  run (used by `--skip-ai`). Regenerated on each run; for the original 4
  the content is the Phase-0 MVP output (singleton `quote`/`charSpan`
  shape — verifier supports legacy shape). Typically **not** committed,
  but OK to check in for reproducible regression baselines.
- `<slug>.schema-verified.json` — post-verifier snapshot. Generated with
  `--write-verified`. Not committed.

## Slugs + discipline + page count

| Slug                       | Discipline   | Pages | Chars |
|----------------------------|--------------|------:|------:|
| fins-3640                  | finance      |    13 |  5779 |
| comm-3030                  | commerce     |    22 |  8000 |
| infs-3822                  | infosys      |    37 |  8000 |
| fins-3635                  | finance      |    12 |  4320 |
| fins-3646                  | finance      |    13 |  8000 |
| fins-3666-assessment       | finance      |    15 |  8000 |
| math-1241                  | mathematics  |    25 |  8000 |
| fins-3666-group-project    | finance      |     8 |  8000 |
| fins-3666-activity-1       | finance      |     3 |  4360 |
| infs-3822-rubrics          | infosys      |    19 |  8000 |
| fins-3616-assessment       | finance      |    11 |  4539 |

All fixtures truncate to 8000 chars to match the current prompt window.

## Regenerating

```sh
node /Users/yinyiping/Desktop/LOOM/scripts/phase1-corpus-extract.mjs
```

Adds new syllabi by editing the `TARGETS` list in the script.
