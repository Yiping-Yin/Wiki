#!/usr/bin/env python3
"""
Phase 1 gate — Python mirror of the Swift acceptance run.

Reads fixtures from macos-app/Loom/Tests/fixtures/{syllabus,red-team}/ and
runs two batteries of checks against the plan's §9 success criteria:

  1. Corpus battery
     For each `<slug>.input.txt` + `<slug>.expected.json`:
       - Build the hardened prompt (SyllabusPDFExtractor.buildPrompt) with
         filename deliberately omitted.
       - Invoke `claude -p` to produce a SyllabusSchema JSON (--skip-ai
         skips this and reads cached `<slug>.schema.json` if present).
       - Run the Python mirror of `verifySpans` + filename-stem demote.
       - Diff against expected.json → per-field PASS/MISS/HALLUCINATION.

  2. Red-team battery
     For each `<slug>.schema.json` in fixtures/red-team/:
       - Feed the synthetic schema + corresponding `<fixture>.input.txt`
         (via the companion `<slug>.filename.txt`) into the verifier
         pipeline.
       - Assert the expected-verdict: verified=false, confidence<=0.4,
         and one of the accepted verifyReasons.

Usage:
  # Full run (requires claude CLI + network, writes JSON per fixture)
  python3 scripts/phase1-gate.py

  # Dry-run against cached schemas only (no AI call; red-team still runs)
  python3 scripts/phase1-gate.py --skip-ai

  # Filter syllabus fixtures
  python3 scripts/phase1-gate.py --only fins-3640,fins-3635

  # Use a different provider (forwarded to the `claude -p --model ...`)
  python3 scripts/phase1-gate.py --provider openai
  python3 scripts/phase1-gate.py --provider anthropic

  # Parity check: same fixtures under 2+ providers, diff the results
  python3 scripts/phase1-gate.py --parity anthropic,openai

Exit codes:
  0 — all gates pass
  1 — at least one gate failed
  2 — fixture / IO problem
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES_SYLLABUS = REPO_ROOT / "macos-app" / "Loom" / "Tests" / "fixtures" / "syllabus"
FIXTURES_REDTEAM = REPO_ROOT / "macos-app" / "Loom" / "Tests" / "fixtures" / "red-team"

# Thresholds from plan §9 / task §4.4
THRESH_FOUND_WHEN_EXPECTED = 0.80       # % of expected-found fields that come back .found
THRESH_NOT_FOUND_WHEN_EXPECTED = 0.80   # % of expected-not_found fields that come back .not_found
REDTEAM_PASS_RATE_TARGET = 1.0          # 100% — red-team is non-negotiable


# ---------------------------------------------------------------------------
# Python mirror of Swift `verifySpans` + `demoteIfFilenameQuote` (see
# macos-app/Loom/Sources/Ingest/{IngestExtractor,SyllabusPDFExtractor}.swift).
# Updated for LIST-form sourceSpans (plan §3.7). Fallback: accept legacy
# singleton `sourceSpan` key for forward-compat with older AI output.
# ---------------------------------------------------------------------------

def _collapse_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _locate(quote: str, source: str) -> tuple[int, int] | None:
    if not quote:
        return None
    # Tier 1: exact substring
    idx = source.find(quote)
    if idx >= 0:
        return (idx, idx + len(quote))
    # Tier 2: whitespace-normalized
    if len(quote) > 10:
        norm_src = _collapse_ws(source)
        norm_q = _collapse_ws(quote)
        j = norm_src.find(norm_q)
        if j >= 0:
            # Walk raw source to find the range — mirrors Swift
            # mapNormalizedRangeToSource exactly enough for PDF text.
            raw_cursor, norm_cursor = 0, 0
            last_ws = True  # mirror leading-trim in collapsingWhitespace
            raw_start = raw_end = None
            for ch in source:
                is_ws = ch.isspace()
                contributes = (not last_ws) if is_ws else True
                if contributes:
                    if norm_cursor == j and raw_start is None:
                        raw_start = raw_cursor
                    norm_cursor += 1
                    if norm_cursor == j + len(norm_q) and raw_end is None:
                        raw_end = raw_cursor + 1
                        break
                last_ws = is_ws
                raw_cursor += 1
            if raw_start is not None and raw_end is not None and raw_start < raw_end:
                return (raw_start, raw_end)
    # Tier 3: 30-char prefix
    if len(quote) > 30:
        head = quote[:30]
        k = source.find(head)
        if k >= 0:
            return (k, min(k + len(quote), len(source)))
    return None


def _is_stitched(quote: str) -> bool:
    return "..." in quote or "…" in quote


def _filename_stems(filename: str) -> list[str]:
    stem = Path(filename).stem
    toks: set[str] = {stem}
    for part in re.split(r"[_\-]", stem):
        p = part.strip()
        if p:
            toks.add(p)
        for sub in re.split(r"\s+", p):
            if sub:
                toks.add(sub)
    out: list[str] = []
    for t in toks:
        if len(t) < 4:
            continue
        has_letter = re.search(r"[A-Za-z]", t) is not None
        has_digit = re.search(r"\d", t) is not None
        if (has_letter and has_digit) or len(t) >= 8:
            out.append(t)
    return out


def _verify_field(fr: dict, source: str, filename: str, doc_id: str, path: str) -> tuple[dict, list[str]]:
    """Return (updated_fr, reasons). reasons is list of verifyReason strings
    observed on spans that failed to verify."""
    reasons: list[str] = []
    if fr.get("status") != "found":
        return fr, reasons

    # Accept both list-form sourceSpans and legacy singleton sourceSpan.
    spans = fr.get("sourceSpans")
    if spans is None and "sourceSpan" in fr:
        spans = [fr["sourceSpan"]]
    if spans is None:
        # Legacy MVP shape: top-level `quote` / `charSpan`
        if "quote" in fr:
            spans = [{
                "docId": doc_id,
                "charStart": (fr.get("charSpan") or [0, 0])[0],
                "charEnd": (fr.get("charSpan") or [0, 0])[1],
                "quote": fr["quote"],
            }]
        else:
            return fr, reasons

    stems = _filename_stems(filename) if filename else []
    rebuilt: list[dict] = []
    any_miss = False

    for sp in spans:
        quote = sp.get("quote", "")
        # Filename-stem guard first (defense-in-depth)
        q_lower = quote.lower()
        stem_hit = any(stem.lower() in q_lower for stem in stems)
        if stem_hit:
            any_miss = True
            reasons.append("quote_contains_filename_stem")
            rebuilt.append({
                "docId": sp.get("docId", doc_id),
                "pageNum": sp.get("pageNum"),
                "charStart": 0, "charEnd": 0,
                "quote": quote,
                "verified": False,
                "verifyReason": "quote_contains_filename_stem",
            })
            continue

        # Stitched-quote guard (only demotes when the full quote is ALSO
        # not a substring — mirrors Swift isLikelyStitchedQuote branch).
        if _is_stitched(quote) and source.find(quote) < 0:
            any_miss = True
            reasons.append("quote_appears_non_contiguous")
            rebuilt.append({
                "docId": sp.get("docId", doc_id),
                "pageNum": sp.get("pageNum"),
                "charStart": 0, "charEnd": 0,
                "quote": quote,
                "verified": False,
                "verifyReason": "quote_appears_non_contiguous",
            })
            continue

        loc = _locate(quote, source)
        if loc is not None:
            rebuilt.append({
                "docId": sp.get("docId", doc_id),
                "pageNum": sp.get("pageNum"),
                "charStart": loc[0], "charEnd": loc[1],
                "quote": quote,
                "verified": True,
                "verifyReason": None,
            })
        else:
            any_miss = True
            reasons.append("quote_not_substring_of_source")
            rebuilt.append({
                "docId": sp.get("docId", doc_id),
                "pageNum": sp.get("pageNum"),
                "charStart": 0, "charEnd": 0,
                "quote": quote,
                "verified": False,
                "verifyReason": "quote_not_substring_of_source",
            })

    conf = float(fr.get("confidence", 0.0))
    eff = min(conf, 0.4) if any_miss else conf
    out = dict(fr)
    out["confidence"] = eff
    out["sourceSpans"] = rebuilt
    return out, reasons


def _walk_verify(obj: Any, source: str, filename: str, doc_id: str, path: str = "$") -> Any:
    """Recurse over a SyllabusSchema-shaped JSON running verifier on every
    FieldResult. Returns a new structure."""
    if isinstance(obj, dict):
        if "status" in obj and obj.get("status") in ("found", "not_found"):
            updated, _reasons = _verify_field(obj, source, filename, doc_id, path)
            return updated
        return {k: _walk_verify(v, source, filename, doc_id, f"{path}.{k}") for k, v in obj.items()}
    if isinstance(obj, list):
        return [_walk_verify(v, source, filename, doc_id, f"{path}[{i}]") for i, v in enumerate(obj)]
    return obj


# ---------------------------------------------------------------------------
# Corpus gate — per-syllabus diff vs expected
# ---------------------------------------------------------------------------

SIMPLE_FIELDS = ("courseCode", "courseName", "term", "institution", "officeHours", "textbook")
LIST_OF_FR_FIELDS = ("learningObjectives",)
LIST_OF_OBJ_FIELDS = ("teachers", "assessmentItems", "weekTopics")


@dataclass
class FieldVerdict:
    path: str
    outcome: str       # "PASS_FOUND", "PASS_NOT_FOUND", "MISS_EXPECTED_FOUND",
                       # "HALLUC_EXPECTED_NOT_FOUND", "SKIP"
    detail: str = ""


@dataclass
class CorpusSampleResult:
    slug: str
    verdicts: list[FieldVerdict] = field(default_factory=list)
    unverified_spans: int = 0
    total_found_fields: int = 0

    @property
    def expected_found_hits(self) -> int:
        return sum(1 for v in self.verdicts if v.outcome == "PASS_FOUND")

    @property
    def expected_found_total(self) -> int:
        return sum(1 for v in self.verdicts if v.outcome in ("PASS_FOUND", "MISS_EXPECTED_FOUND"))

    @property
    def expected_notfound_hits(self) -> int:
        return sum(1 for v in self.verdicts if v.outcome == "PASS_NOT_FOUND")

    @property
    def expected_notfound_total(self) -> int:
        return sum(1 for v in self.verdicts if v.outcome in ("PASS_NOT_FOUND", "HALLUC_EXPECTED_NOT_FOUND"))


def _status_of(fr: Any) -> str:
    if isinstance(fr, dict) and "status" in fr:
        return fr["status"]
    return "found"


def _compare_simple_field(path: str, ai: dict | None, exp: dict | None) -> FieldVerdict:
    """Compare a single FieldResult (from AI) against the expected marker."""
    if exp is None:
        return FieldVerdict(path=path, outcome="SKIP", detail="no expectation")

    # Expected as FieldResult-style: {"status": "not_found"} or direct value
    exp_status = exp.get("status") if isinstance(exp, dict) else None
    if exp_status == "not_found":
        # AI should return not_found
        if ai is None:
            return FieldVerdict(path, "PASS_NOT_FOUND", "AI also omitted field")
        if _status_of(ai) == "not_found":
            return FieldVerdict(path, "PASS_NOT_FOUND", "AI said not_found as expected")
        return FieldVerdict(path, "HALLUC_EXPECTED_NOT_FOUND",
                            f"AI said found='{(ai or {}).get('value')}' but source doesn't support it")
    else:
        # Expected found (either plain value or {status: found, value: ...})
        exp_value = exp.get("value") if isinstance(exp, dict) else exp
        if ai is None:
            return FieldVerdict(path, "MISS_EXPECTED_FOUND", f"AI omitted; expected '{exp_value}'")
        if _status_of(ai) != "found":
            return FieldVerdict(path, "MISS_EXPECTED_FOUND", f"AI said not_found; expected '{exp_value}'")
        # Field is found; we accept as PASS_FOUND regardless of exact value
        # match (gate is about presence, not literal-string equality —
        # syllabi vary in how the same fact is expressed).
        return FieldVerdict(path, "PASS_FOUND", f"AI found='{ai.get('value')}'")


def _list_expected_as_notfound(exp: Any) -> bool:
    return isinstance(exp, dict) and exp.get("status") == "not_found"


def _compare_list_of_objects(path: str, ai_list: list, exp: Any) -> list[FieldVerdict]:
    verdicts: list[FieldVerdict] = []
    if _list_expected_as_notfound(exp):
        # Expect zero items in AI list (or all children not_found)
        if not ai_list:
            verdicts.append(FieldVerdict(path, "PASS_NOT_FOUND", "AI returned empty list"))
        else:
            # Count how many children are actually found. If ALL are
            # not_found we accept. Otherwise hallucination.
            any_found = any(
                any(_status_of(v) == "found" for v in child.values())
                for child in ai_list if isinstance(child, dict)
            )
            if not any_found:
                verdicts.append(FieldVerdict(path, "PASS_NOT_FOUND", f"{len(ai_list)} rows but all subfields not_found"))
            else:
                verdicts.append(FieldVerdict(path, "HALLUC_EXPECTED_NOT_FOUND",
                                             f"expected none; AI returned {len(ai_list)} items"))
        return verdicts

    # Expect non-empty list
    if not isinstance(exp, list):
        return [FieldVerdict(path, "SKIP", "unexpected expected shape")]
    exp_count = len(exp)
    ai_count = len(ai_list)
    if ai_count == 0 and exp_count > 0:
        return [FieldVerdict(path, "MISS_EXPECTED_FOUND", f"expected {exp_count} items; AI returned 0")]

    # Per-index child field verdicts: only check subfields that are
    # listed in the expected file.
    pairs = min(ai_count, exp_count)
    for i in range(pairs):
        exp_row = exp[i]
        ai_row = ai_list[i] if i < ai_count else {}
        if not isinstance(exp_row, dict):
            continue
        for subkey, exp_sub in exp_row.items():
            if subkey.startswith("_"):
                continue
            ai_sub = ai_row.get(subkey) if isinstance(ai_row, dict) else None
            # If expected is a scalar (non-dict), wrap as found-style
            if not isinstance(exp_sub, dict):
                exp_sub = {"value": exp_sub}
            verdicts.append(_compare_simple_field(f"{path}[{i}].{subkey}", ai_sub, exp_sub))

    # Extra / missing list rows
    if ai_count < exp_count:
        verdicts.append(FieldVerdict(path, "MISS_EXPECTED_FOUND",
                                      f"expected {exp_count} items, AI returned {ai_count}"))
    elif ai_count > exp_count:
        # Soft warning — extra items are still treated as skip
        verdicts.append(FieldVerdict(path, "SKIP",
                                      f"AI returned {ai_count} items, expected {exp_count} (extras ignored)"))
    return verdicts


def _compare_list_of_fieldresult(path: str, ai_list: list, exp: Any) -> list[FieldVerdict]:
    verdicts: list[FieldVerdict] = []
    if _list_expected_as_notfound(exp):
        if not ai_list or all(_status_of(x) == "not_found" for x in ai_list):
            verdicts.append(FieldVerdict(path, "PASS_NOT_FOUND", "AI list empty or all not_found"))
        else:
            verdicts.append(FieldVerdict(path, "HALLUC_EXPECTED_NOT_FOUND",
                                          f"expected none; AI returned {sum(1 for x in ai_list if _status_of(x) == 'found')} items"))
        return verdicts
    if not isinstance(exp, list):
        return [FieldVerdict(path, "SKIP", "unexpected expected shape")]
    exp_count = len(exp)
    found = sum(1 for x in ai_list if _status_of(x) == "found")
    if found >= max(1, exp_count - 1):
        # Allow off-by-one slack (e.g. a single LO rephrased)
        verdicts.append(FieldVerdict(path, "PASS_FOUND", f"AI found {found}/{exp_count} LOs"))
    else:
        verdicts.append(FieldVerdict(path, "MISS_EXPECTED_FOUND",
                                      f"expected ~{exp_count} LOs; AI found {found}"))
    return verdicts


def compare_sample(slug: str, ai_schema: dict, expected: dict) -> CorpusSampleResult:
    res = CorpusSampleResult(slug=slug)

    # Count unverified spans for diagnostics
    def _collect_unverified(obj):
        if isinstance(obj, dict):
            if obj.get("status") == "found":
                res.total_found_fields += 1
                for sp in (obj.get("sourceSpans") or []):
                    if not sp.get("verified"):
                        res.unverified_spans += 1
            for v in obj.values():
                _collect_unverified(v)
        elif isinstance(obj, list):
            for v in obj:
                _collect_unverified(v)
    _collect_unverified(ai_schema)

    for k in SIMPLE_FIELDS:
        if k not in expected:
            continue
        res.verdicts.append(_compare_simple_field(f"$.{k}", ai_schema.get(k), expected[k]))

    for k in LIST_OF_FR_FIELDS:
        if k not in expected:
            continue
        res.verdicts.extend(_compare_list_of_fieldresult(f"$.{k}", ai_schema.get(k, []), expected[k]))

    for k in LIST_OF_OBJ_FIELDS:
        if k not in expected:
            continue
        res.verdicts.extend(_compare_list_of_objects(f"$.{k}", ai_schema.get(k, []), expected[k]))

    return res


# ---------------------------------------------------------------------------
# Red-team gate
# ---------------------------------------------------------------------------

@dataclass
class RedteamVerdict:
    case: str
    field_path: str
    passed: bool
    detail: str


def _find_fieldresult_at(path: str, obj: Any) -> dict | None:
    """Walk a simple '$.field[idx].sub' path into `obj`."""
    if path.startswith("$."):
        path = path[2:]
    parts = re.split(r"\.(?![^\[]*\])", path)
    cur = obj
    for part in parts:
        m = re.match(r"([^\[]+)((?:\[\d+\])*)", part)
        if not m:
            return None
        key = m.group(1)
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
        for idx_match in re.finditer(r"\[(\d+)\]", m.group(2)):
            if not isinstance(cur, list):
                return None
            i = int(idx_match.group(1))
            if i >= len(cur):
                return None
            cur = cur[i]
    if isinstance(cur, dict) and "status" in cur:
        return cur
    return None


def run_redteam_battery() -> tuple[list[RedteamVerdict], int, int]:
    verdicts: list[RedteamVerdict] = []
    schema_files = sorted(FIXTURES_REDTEAM.glob("*.schema.json"))
    total = 0
    passed = 0
    for schema_path in schema_files:
        case = schema_path.stem.replace(".schema", "")
        try:
            schema = json.loads(schema_path.read_text())
        except Exception as e:
            verdicts.append(RedteamVerdict(case, "$", False, f"schema unreadable: {e}"))
            continue
        verdict_path = FIXTURES_REDTEAM / f"{case}.expected-verdict.json"
        filename_path = FIXTURES_REDTEAM / f"{case}.filename.txt"
        if not verdict_path.exists():
            verdicts.append(RedteamVerdict(case, "$", False, "missing expected-verdict.json"))
            continue
        v = json.loads(verdict_path.read_text())
        filename = filename_path.read_text().strip() if filename_path.exists() else v.get("filename", "")
        src_slug = v.get("sourceFixture")
        if not src_slug:
            verdicts.append(RedteamVerdict(case, "$", False, "missing sourceFixture in verdict"))
            continue
        source = (FIXTURES_SYLLABUS / f"{src_slug}.input.txt").read_text()

        # Apply verifier
        verified = _walk_verify(schema, source, filename, doc_id=src_slug)

        # Single-field or multi-field verdict form
        exp_fields = v.get("fields") or [v]
        for ev in exp_fields:
            if "field" not in ev:
                continue
            total += 1
            fpath = ev["field"]
            if not fpath.startswith("$"):
                fpath = "$." + fpath
            got = _find_fieldresult_at(fpath, verified)
            if got is None:
                verdicts.append(RedteamVerdict(case, fpath, False, "field not present in schema"))
                continue

            # Evaluate
            spans = got.get("sourceSpans") or []
            all_unverified = bool(spans) and all(not sp.get("verified") for sp in spans)
            conf_ok = float(got.get("confidence", 1.0)) <= float(ev.get("expectedConfidenceMax", 0.4)) + 1e-9
            reasons = [sp.get("verifyReason") for sp in spans if not sp.get("verified")]
            accepted = {ev.get("expectedReason")} | set(ev.get("alternateAcceptedReasons", []))
            reason_ok = any(r in accepted for r in reasons) if reasons else False

            ok = (ev.get("expectedVerified", False) == False) and all_unverified and conf_ok and reason_ok
            detail = (
                f"verified_all={all_unverified} conf={got.get('confidence')} "
                f"reasons={reasons} accepted={sorted(x for x in accepted if x)}"
            )
            verdicts.append(RedteamVerdict(case, fpath, ok, detail))
            if ok:
                passed += 1
    return verdicts, passed, total


# ---------------------------------------------------------------------------
# AI invocation (optional)
# ---------------------------------------------------------------------------

PROMPT_TEMPLATE = """Extract structured fields from this university course syllabus.

RULES:
1. Return ONLY valid JSON matching the schema. No prose before or after.
2. For every field, return either:
   - {{"status": "found", "value": <value>, "confidence": 0.0-1.0, "sourceSpans": [{{"quote": "<verbatim substring>"}}]}}
   - {{"status": "not_found", "tried": ["<location you checked>", "<another location>"]}}
3. `quote` MUST be a contiguous substring of the source text below. If the value is scattered across multiple sentences, return a LIST of quotes in `sourceSpans` — one quote per contiguous fragment. NEVER join fragments with ellipses (`...`, `...`), semicolons, or other connectors.
4. NEVER invent values. If a field is not clearly supported by the source text, return status "not_found" with a non-empty `tried` array.
5. Do NOT quote document titles, filenames, or file paths — they are metadata, not source content.

SCHEMA:
{{
  "courseCode": FieldResult<string>,
  "courseName": FieldResult<string>,
  "term": FieldResult<string>,
  "institution": FieldResult<string>,
  "teachers": [{{"role": FieldResult<string>, "name": FieldResult<string>, "email": FieldResult<string>}}],
  "officeHours": FieldResult<string>,
  "textbook": FieldResult<string>,
  "assessmentItems": [{{"name": FieldResult<string>, "weightPercent": FieldResult<number>, "dueDate": FieldResult<string>, "format": FieldResult<string>}}],
  "learningObjectives": [FieldResult<string>],
  "weekTopics": [{{"weekRange": FieldResult<string>, "topic": FieldResult<string>}}]
}}

SOURCE TEXT:
---
{source}
---

Return the JSON now.
"""


def call_claude(prompt: str, provider: str | None = None, timeout: int = 300) -> str:
    cmd = ["claude", "-p"]
    if provider:
        cmd += ["--model", provider]
    try:
        r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as e:
        raise RuntimeError(f"claude CLI not on PATH: {e}") from e
    if r.returncode != 0:
        raise RuntimeError(f"claude exited {r.returncode}: {r.stderr[:500]}")
    return r.stdout


def extract_json_from_output(raw: str) -> dict:
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    # Find the first `{` and last `}` for leniency
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        m_start = s.find("{")
        m_end = s.rfind("}")
        if m_start >= 0 and m_end > m_start:
            return json.loads(s[m_start:m_end + 1])
        raise


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _load_fixture_slugs(only: list[str] | None) -> list[str]:
    slugs = sorted({p.stem.replace(".input", "")
                    for p in FIXTURES_SYLLABUS.glob("*.input.txt")})
    if only:
        slugs = [s for s in slugs if s in only]
    return slugs


def _print_sample_verdicts(r: CorpusSampleResult) -> None:
    print(f"\n[{r.slug}]  total_found_fields={r.total_found_fields}  unverified_spans={r.unverified_spans}")
    for v in r.verdicts:
        icon = {
            "PASS_FOUND": "  ✓",
            "PASS_NOT_FOUND": "  ✓",
            "MISS_EXPECTED_FOUND": "  ✗",
            "HALLUC_EXPECTED_NOT_FOUND": "  ✗",
            "SKIP": "  ·",
        }.get(v.outcome, "  ?")
        print(f"{icon} [{v.outcome:<26}] {v.path:<40} {v.detail}")


def run_corpus_battery(slugs: list[str], skip_ai: bool, provider: str | None,
                       write_verified: bool) -> tuple[list[CorpusSampleResult], int, int]:
    results: list[CorpusSampleResult] = []
    all_pass_found = 0
    all_expected_found = 0
    all_pass_notfound = 0
    all_expected_notfound = 0

    for slug in slugs:
        input_path = FIXTURES_SYLLABUS / f"{slug}.input.txt"
        expected_path = FIXTURES_SYLLABUS / f"{slug}.expected.json"
        meta_path = FIXTURES_SYLLABUS / f"{slug}.meta.json"
        schema_cache = FIXTURES_SYLLABUS / f"{slug}.schema.json"
        verified_cache = FIXTURES_SYLLABUS / f"{slug}.schema-verified.json"

        if not input_path.exists() or not expected_path.exists():
            print(f"[SKIP] {slug}: missing input or expected")
            continue

        source = input_path.read_text()
        expected = json.loads(expected_path.read_text())
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        filename = Path(meta.get("sourcePath", slug)).name

        # Get AI schema
        ai_schema: dict | None = None
        if skip_ai:
            if schema_cache.exists():
                try:
                    ai_schema = json.loads(schema_cache.read_text())
                except Exception:
                    ai_schema = None
        else:
            prompt = PROMPT_TEMPLATE.format(source=source)
            try:
                raw = call_claude(prompt, provider=provider)
                ai_schema = extract_json_from_output(raw)
                schema_cache.write_text(json.dumps(ai_schema, indent=2))
            except Exception as e:
                print(f"[AI-ERR] {slug}: {e}")

        if ai_schema is None:
            # Produce a degenerate verdict — everything MISS / SKIP
            res = CorpusSampleResult(slug=slug)
            for k in SIMPLE_FIELDS:
                if k not in expected:
                    continue
                if _list_expected_as_notfound(expected[k]):
                    res.verdicts.append(FieldVerdict(f"$.{k}", "PASS_NOT_FOUND", "no AI; vacuously not_found"))
                else:
                    res.verdicts.append(FieldVerdict(f"$.{k}", "MISS_EXPECTED_FOUND", "no AI schema cached"))
            results.append(res)
            continue

        # Verify (runs Python verifySpans port)
        verified = _walk_verify(ai_schema, source, filename, doc_id=slug)
        if write_verified:
            verified_cache.write_text(json.dumps(verified, indent=2, ensure_ascii=False))

        # Diff vs expected
        r = compare_sample(slug, verified, expected)
        results.append(r)
        all_pass_found += r.expected_found_hits
        all_expected_found += r.expected_found_total
        all_pass_notfound += r.expected_notfound_hits
        all_expected_notfound += r.expected_notfound_total
        _print_sample_verdicts(r)

    return results, all_pass_found, all_expected_found


def run_parity(slugs: list[str], providers: list[str]) -> None:
    """Compare `status` per field across providers. Reports diff rate."""
    per_provider: dict[str, dict[str, dict]] = {p: {} for p in providers}
    for p in providers:
        print(f"\n== provider: {p} ==")
        for slug in slugs:
            cache = FIXTURES_SYLLABUS / f"{slug}.schema.{p}.json"
            source = (FIXTURES_SYLLABUS / f"{slug}.input.txt").read_text()
            meta = FIXTURES_SYLLABUS / f"{slug}.meta.json"
            filename = ""
            if meta.exists():
                filename = Path(json.loads(meta.read_text()).get("sourcePath", slug)).name
            if cache.exists():
                per_provider[p][slug] = _walk_verify(json.loads(cache.read_text()), source, filename, slug)
                continue
            prompt = PROMPT_TEMPLATE.format(source=source)
            try:
                raw = call_claude(prompt, provider=p)
                schema = extract_json_from_output(raw)
                cache.write_text(json.dumps(schema, indent=2))
                per_provider[p][slug] = _walk_verify(schema, source, filename, slug)
            except Exception as e:
                print(f"[ERR] {p} {slug}: {e}")
                per_provider[p][slug] = {}

    # Per-field status diff
    print("\n== parity diff ==")
    base = providers[0]
    for slug in slugs:
        base_schema = per_provider[base].get(slug, {})
        for p in providers[1:]:
            other = per_provider[p].get(slug, {})
            diffs = []
            for k in list(SIMPLE_FIELDS) + list(LIST_OF_FR_FIELDS) + list(LIST_OF_OBJ_FIELDS):
                a = base_schema.get(k)
                b = other.get(k)
                sa = _status_of(a) if isinstance(a, dict) else "list"
                sb = _status_of(b) if isinstance(b, dict) else "list"
                if sa != sb:
                    diffs.append(f"{k}: {base}={sa}  {p}={sb}")
            print(f"  {slug}: {len(diffs)} field-status diffs vs {base}"
                  + (" · " + "; ".join(diffs[:4]) if diffs else ""))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-ai", action="store_true", help="Skip AI call, read cached schema if present")
    ap.add_argument("--only", default="", help="Comma-separated slugs to include")
    ap.add_argument("--provider", default=None, help="Pass to claude --model")
    ap.add_argument("--parity", default="", help="Comma-separated providers for parity run")
    ap.add_argument("--write-verified", action="store_true", help="Write .schema-verified.json per fixture")
    ap.add_argument("--redteam-only", action="store_true")
    args = ap.parse_args()

    only = [s.strip() for s in args.only.split(",") if s.strip()] or None
    slugs = _load_fixture_slugs(only)
    print(f"Phase 1 gate · {len(slugs)} syllabus fixtures · skip_ai={args.skip_ai}")

    # 1. Red-team
    print("\n================ RED-TEAM BATTERY ================")
    rt, rt_passed, rt_total = run_redteam_battery()
    for v in rt:
        icon = "  ✓" if v.passed else "  ✗"
        print(f"{icon} [{v.case}] {v.field_path} — {v.detail}")
    rt_rate = rt_passed / rt_total if rt_total else 0.0
    print(f"\nred-team: {rt_passed}/{rt_total} passed ({rt_rate:.0%}; target {REDTEAM_PASS_RATE_TARGET:.0%})")

    if args.redteam_only:
        return 0 if rt_rate >= REDTEAM_PASS_RATE_TARGET else 1

    # 2. Corpus
    print("\n================ CORPUS BATTERY ================")
    if args.parity:
        providers = [p.strip() for p in args.parity.split(",") if p.strip()]
        run_parity(slugs, providers)
        return 0

    corpus, pf, ef = run_corpus_battery(slugs, skip_ai=args.skip_ai, provider=args.provider,
                                         write_verified=args.write_verified)

    pnf = sum(r.expected_notfound_hits for r in corpus)
    enf = sum(r.expected_notfound_total for r in corpus)
    found_rate = pf / ef if ef else 0.0
    nf_rate = pnf / enf if enf else 0.0

    print("\n================ SUMMARY ================")
    print(f"  Fields expected-found:     {pf}/{ef} = {found_rate:.0%}  (target {THRESH_FOUND_WHEN_EXPECTED:.0%})")
    print(f"  Fields expected-not_found: {pnf}/{enf} = {nf_rate:.0%}  (target {THRESH_NOT_FOUND_WHEN_EXPECTED:.0%})")
    print(f"  Red-team rejection:        {rt_passed}/{rt_total} = {rt_rate:.0%}  (target {REDTEAM_PASS_RATE_TARGET:.0%})")

    # Exit codes
    if rt_rate < REDTEAM_PASS_RATE_TARGET:
        print("FAIL: red-team below 100%")
        return 1
    if not args.skip_ai and found_rate < THRESH_FOUND_WHEN_EXPECTED:
        print("FAIL: found-when-expected below threshold")
        return 1
    if not args.skip_ai and nf_rate < THRESH_NOT_FOUND_WHEN_EXPECTED:
        print("FAIL: not_found-when-expected below threshold")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
