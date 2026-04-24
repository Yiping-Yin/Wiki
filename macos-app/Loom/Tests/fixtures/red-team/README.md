# Red-team fixtures

Synthetic `SyllabusSchema` fragments that the verifier (`verifySpans` +
hardening guards) MUST reject or demote. Each case is a pair:

- `<slug>.schema.json` — pre-verifier schema (what AI would emit)
- `<slug>.expected-verdict.json` — what the Phase 1 gate asserts the verifier did
- `<slug>.source.txt` — the source text to verify against
- `<slug>.filename.txt` — the original filename (single line, no newline)

All red-team cases use input text copied from the syllabus corpus so the
fixtures are self-contained (no cross-file resolution required).

Verdict fields:
- `expectedVerified: bool` — the top-level FieldResult's `sourceSpan.verified`
  (for list of spans, all must match).
- `expectedConfidenceMax: float` — max allowed confidence after demotion.
- `expectedReason: string` — one of
  `"quote_not_substring_of_source"`,
  `"quote_contains_filename_stem"`,
  `"quote_appears_non_contiguous"` (ellipsis / semicolon stitching).
  `alternateAcceptedReasons` covers compat variants.
