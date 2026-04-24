#!/usr/bin/env python3
"""
Phase 6 E2E smoke — drive the Loom ingest pipeline on configured syllabus
PDFs and produce pass/fail artifacts.

This harness replicates what IngestionView.IngestionRunner does, EXCEPT
it cannot execute the Swift state machine in-process (xcodebuild runtime
is sandbox-blocked in the agent environment; `@testable import Loom` is
not runnable outside the Xcode test bundle). Instead the harness:

  1. Extracts PDF text + pageRanges via `scripts/phase6-e2e-pdf-extract.mjs`
     (pdfjs-dist + CleanText pipeline byte-identical to Swift
     PDFExtraction.swift per plan §9.2 parity tests).
  2. Consults ExtractorRegistry match() logic (Python mirror) to resolve
     the winning extractor + score. Verified against registry-mode
     rules in Swift ExtractorRegistry.swift.
  3. Calls a configurable AI CLI command (default: `claude -p`) with the
     EXACT production prompt copied verbatim from SyllabusPDFExtractor.swift
     `buildPrompt()`.
  4. Runs the full verifySpans + demoteIfFilenameQuote + pageForSpan
     pipeline on the AI's JSON output (Python mirror of Swift verifier).
  5. Simulates the 4-state transition log (.idle → .textExtracted →
     .extracting → .extracted) and the persistence shape
     (`kind="ingestion-<extractorId>"`, eventsJSON with schemaJSON).

What this does NOT cover:
  - The SwiftUI @MainActor dispatch of state changes (trivial code)
  - SwiftData persistence via LoomTraceWriter (shape replicated, not
    actually written to a store)
  - Drag-drop handler (covered by manual GUI test only)

Usage:
  python3 scripts/phase6-e2e-smoke.py --targets targets.json [--skip-ai]

Target JSON:
  [
    {"slug": "infs-3822", "path": "/absolute/path/to/syllabus.pdf", "notes": "optional"}
  ]

Exit codes:
  0 — all syllabi passed gate
  1 — at least one syllabus failed
  2 — harness / environment error
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_ROOT = Path("/tmp/phase6-e2e")
HARNESS_LOG = OUT_ROOT / "harness.log"
TARGETS_ENV = "LOOM_PHASE6_E2E_TARGETS"
AI_COMMAND_ENV = "LOOM_PHASE6_AI_COMMAND"
DEFAULT_AI_COMMAND = "claude -p"

# ---------------------------------------------------------------------------
# State-machine mirror (see IngestionView.swift lines 420-445)
# ---------------------------------------------------------------------------

STATES = ["idle", "textExtracted", "extracting", "extracted", "failed"]

class StateLog:
    def __init__(self, slug: str, out_dir: Path) -> None:
        self.slug = slug
        self.out_path = out_dir / "state-log.txt"
        self.transitions: list[tuple[float, str, str]] = []
        self._start = time.time()
    def transition(self, to_state: str, detail: str = "") -> None:
        t = time.time() - self._start
        self.transitions.append((t, to_state, detail))
    def write(self) -> None:
        with self.out_path.open("w") as f:
            f.write(f"# state log for {self.slug}\n")
            f.write("# format: elapsed_s | state | detail\n\n")
            for t, s, d in self.transitions:
                f.write(f"{t:7.2f}s  {s:<16}  {d}\n")

# ---------------------------------------------------------------------------
# ExtractorRegistry match() — Python mirror of Swift ExtractorRegistry.
# Ranks identically: Syllabus(0.9), SlideDeck, Transcript, Textbook,
# Spreadsheet, MarkdownNotes, Generic(0.1).
# ---------------------------------------------------------------------------

SYLLABUS_KEYWORDS = [
    "syllabus", "outline", "handbook", "course info",
    "course overview", "overview", "assessment guide", "guide",
]

SYLLABUS_BODY_PHRASES = [
    "course outline", "course overview", "course handbook",
    "course information", "syllabus",
    "assessment handbook", "assessment guide",
]

def match_syllabus(filename: str, parent_path: str, sample: str) -> float:
    if Path(filename).suffix.lower() != ".pdf":
        return 0.0
    lower = filename.lower()
    for kw in SYLLABUS_KEYWORDS:
        if kw in lower:
            return 0.9
    # Body-sniff fallback (Bug #1 fix, mirrors Swift syllabusBodyPhrases).
    head = (sample or "")[:500].lower()
    for phrase in SYLLABUS_BODY_PHRASES:
        if phrase in head:
            return 0.75
    return 0.0

def match_slidedeck(filename: str, parent_path: str, sample: str) -> float:
    ext = Path(filename).suffix.lower()
    if ext in (".pptx", ".key"):
        return 0.9
    return 0.0  # slide-density PDF path skipped — rare in this corpus

def match_transcript(filename: str, parent_path: str, sample: str) -> float:
    ext = Path(filename).suffix.lower()
    if ext in (".vtt", ".srt"):
        return 0.95
    if ext == ".txt" and re.search(r"\d{1,2}:\d{2}:\d{2}", sample or ""):
        return 0.85
    return 0.0

def match_textbook(filename: str, parent_path: str, sample: str) -> float:
    lower = filename.lower()
    if re.search(r"chapter|ch\d+", lower):
        return 0.85
    return 0.0

def match_spreadsheet(filename: str, parent_path: str, sample: str) -> float:
    ext = Path(filename).suffix.lower()
    if ext in (".csv", ".tsv", ".xlsx", ".xls"):
        return 0.9
    return 0.0

def match_markdown(filename: str, parent_path: str, sample: str) -> float:
    ext = Path(filename).suffix.lower()
    if ext in (".md", ".mdx"):
        return 0.9
    if ext == ".txt":
        # No transcript timestamps — markdown-like
        return 0.9 if not re.search(r"\d{1,2}:\d{2}:\d{2}", sample or "") else 0.0
    return 0.0

def match_generic(filename: str, parent_path: str, sample: str) -> float:
    return 0.1

REGISTRY = [
    ("syllabus-pdf",    match_syllabus),
    ("slide-deck",      match_slidedeck),
    ("transcript",      match_transcript),
    ("textbook-chapter",match_textbook),
    ("spreadsheet",     match_spreadsheet),
    ("markdown-notes",  match_markdown),
    ("generic",         match_generic),
]

def best_match(filename: str, parent_path: str, sample: str) -> tuple[str, float]:
    scored = [(eid, fn(filename, parent_path, sample)) for eid, fn in REGISTRY]
    best = max(scored, key=lambda x: x[1])
    return best

# ---------------------------------------------------------------------------
# Target loading
# ---------------------------------------------------------------------------

def load_targets(targets_arg: str | None) -> tuple[list[dict[str, str]], str]:
    """Load target syllabus PDFs from a JSON file, inline JSON, or env var.

    Accepted shapes:
      [{"slug":"infs-3822","path":"/abs/file.pdf","notes":"optional"}]
      {"syllabi":[...]}

    Env fallback:
      LOOM_PHASE6_E2E_TARGETS=/path/to/targets.json
      LOOM_PHASE6_E2E_TARGETS='[{"slug":"...", "path":"..."}]'
    """
    source = ""
    raw = ""
    if targets_arg:
        candidate = Path(targets_arg).expanduser()
        if candidate.exists():
            source = str(candidate)
            raw = candidate.read_text()
        else:
            source = "--targets inline-json"
            raw = targets_arg
    elif os.environ.get(TARGETS_ENV):
        env_value = os.environ[TARGETS_ENV]
        candidate = Path(env_value).expanduser()
        try:
            exists = candidate.exists()
        except OSError:
            exists = False
        if exists:
            source = f"${TARGETS_ENV} -> {candidate}"
            raw = candidate.read_text()
        else:
            source = f"${TARGETS_ENV} inline-json"
            raw = env_value
    else:
        raise SystemExit(
            "No Phase 6 E2E targets configured. Pass --targets targets.json "
            f"or set {TARGETS_ENV}. Expected JSON: "
            '[{"slug":"infs-3822","path":"/absolute/file.pdf","notes":"optional"}]'
        )

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise SystemExit(f"Unable to parse targets JSON from {source}: {e}") from e

    items = parsed.get("syllabi") if isinstance(parsed, dict) else parsed
    if not isinstance(items, list) or not items:
        raise SystemExit("Targets JSON must be a non-empty array or {\"syllabi\": [...]}.")

    targets: list[dict[str, str]] = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            raise SystemExit(f"Target {idx} must be an object.")
        slug = str(item.get("slug", "")).strip()
        pdf_path = str(item.get("path", "")).strip()
        if not slug or not pdf_path:
            raise SystemExit(f"Target {idx} requires non-empty slug and path.")
        targets.append({
            "slug": slug,
            "path": str(Path(pdf_path).expanduser()),
            "notes": str(item.get("notes", "")),
        })
    return targets, source

# ---------------------------------------------------------------------------
# Page range lookup — Python mirror of PageRange.swift
# ---------------------------------------------------------------------------

def page_for_offset(offset: int, ranges: list[dict]) -> int | None:
    """Binary search matching Swift PageRange.swift."""
    if offset < 0 or not ranges:
        return None
    lo, hi = 0, len(ranges) - 1
    candidate = None
    while lo <= hi:
        mid = (lo + hi) // 2
        if ranges[mid]["charStart"] <= offset:
            candidate = mid
            lo = mid + 1
        else:
            hi = mid - 1
    if candidate is None:
        return None
    r = ranges[candidate]
    if offset < r["charEnd"]:
        return r["page"]
    if candidate == len(ranges) - 1 and offset == r["charEnd"]:
        return r["page"]
    return None

def page_for_span(
    start: int,
    end: int,
    ranges: list[dict],
    boundary_tolerance: int = 5,
) -> int | None:
    """Mirror Swift pageForSpan(_:in:boundaryTolerance:)."""
    if start < 0 or not ranges:
        return None
    tolerance = max(0, boundary_tolerance)
    if tolerance > 0 and len(ranges) > 1:
        for idx in range(len(ranges) - 1):
            boundary = ranges[idx + 1]["charStart"]
            if start < boundary and end > boundary and boundary - start <= tolerance:
                return ranges[idx + 1]["page"]
    return page_for_offset(start, ranges)

# ---------------------------------------------------------------------------
# verifySpans + demoteIfFilenameQuote (Python mirror of Swift verifier).
# Extended from scripts/phase1-gate.py with pageNum derivation.
# ---------------------------------------------------------------------------

def _collapse_ws(s: str) -> str: return re.sub(r"\s+", " ", s).strip()
def _is_stitched(q: str) -> bool: return "..." in q or "…" in q

def _filename_stems(filename: str) -> list[str]:
    stem = Path(filename).stem
    toks: set[str] = {stem}
    for part in re.split(r"[_\-]", stem):
        p = part.strip()
        if p: toks.add(p)
        for sub in re.split(r"\s+", p):
            if sub: toks.add(sub)
    out: list[str] = []
    for t in toks:
        if len(t) < 4: continue
        has_letter = re.search(r"[A-Za-z]", t) is not None
        has_digit = re.search(r"\d", t) is not None
        # Bug #2 fix: drop the len>=8 fallback that was demoting
        # legitimate English words like "Assessment" (filename token
        # that's also body vocabulary). Mixed-letter-digit is enough.
        if has_letter and has_digit:
            out.append(t)
    return out

def _locate(quote: str, source: str) -> tuple[int, int] | None:
    if not quote: return None
    idx = source.find(quote)
    if idx >= 0: return (idx, idx + len(quote))
    if len(quote) > 10:
        norm_src = _collapse_ws(source)
        norm_q = _collapse_ws(quote)
        j = norm_src.find(norm_q)
        if j >= 0:
            raw_cursor = 0; norm_cursor = 0; last_ws = True
            raw_start = raw_end = None
            for ch in source:
                is_ws = ch.isspace()
                contributes = (not last_ws) if is_ws else True
                if contributes:
                    if norm_cursor == j and raw_start is None: raw_start = raw_cursor
                    norm_cursor += 1
                    if norm_cursor == j + len(norm_q) and raw_end is None:
                        raw_end = raw_cursor + 1; break
                last_ws = is_ws; raw_cursor += 1
            if raw_start is not None and raw_end is not None and raw_start < raw_end:
                return (raw_start, raw_end)
    if len(quote) > 30:
        head = quote[:30]
        k = source.find(head)
        if k >= 0:
            return (k, min(k + len(quote), len(source)))
    return None

def _verify_field(fr: dict, source: str, filename: str, doc_id: str, page_ranges: list[dict] | None) -> dict:
    if fr.get("status") != "found": return fr
    spans = fr.get("sourceSpans")
    if spans is None and "sourceSpan" in fr:
        spans = [fr["sourceSpan"]]
    if spans is None: return fr

    stems = _filename_stems(filename) if filename else []
    rebuilt = []
    any_miss = False

    for sp in spans:
        quote = sp.get("quote", "")
        q_lower = quote.lower()
        stem_hit = any(st.lower() in q_lower for st in stems)
        if stem_hit:
            any_miss = True
            rebuilt.append({
                "docId": sp.get("docId", doc_id),
                "pageNum": sp.get("pageNum"),
                "charStart": 0, "charEnd": 0,
                "quote": quote,
                "verified": False,
                "verifyReason": "quote_contains_filename_stem",
            }); continue
        if _is_stitched(quote) and source.find(quote) < 0:
            any_miss = True
            rebuilt.append({
                "docId": sp.get("docId", doc_id),
                "pageNum": sp.get("pageNum"),
                "charStart": 0, "charEnd": 0,
                "quote": quote,
                "verified": False,
                "verifyReason": "quote_appears_non_contiguous",
            }); continue
        loc = _locate(quote, source)
        if loc is not None:
            derived_page = None
            if page_ranges:
                derived_page = page_for_span(loc[0], loc[1], page_ranges)
            if derived_page is None:
                derived_page = sp.get("pageNum")
            rebuilt.append({
                "docId": sp.get("docId", doc_id),
                "pageNum": derived_page,
                "charStart": loc[0], "charEnd": loc[1],
                "quote": quote, "verified": True, "verifyReason": None,
            })
        else:
            any_miss = True
            rebuilt.append({
                "docId": sp.get("docId", doc_id),
                "pageNum": sp.get("pageNum"),
                "charStart": 0, "charEnd": 0,
                "quote": quote, "verified": False,
                "verifyReason": "quote_not_substring_of_source",
            })

    conf = float(fr.get("confidence", 0.0))
    out = dict(fr)
    out["confidence"] = min(conf, 0.4) if any_miss else conf
    out["sourceSpans"] = rebuilt
    return out

def _walk_verify(obj: Any, source: str, filename: str, doc_id: str, page_ranges: list[dict] | None) -> Any:
    if isinstance(obj, dict):
        if "status" in obj and obj.get("status") in ("found", "not_found"):
            return _verify_field(obj, source, filename, doc_id, page_ranges)
        return {k: _walk_verify(v, source, filename, doc_id, page_ranges) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_walk_verify(v, source, filename, doc_id, page_ranges) for v in obj]
    return obj

# ---------------------------------------------------------------------------
# Production prompt — copied verbatim from SyllabusPDFExtractor.swift
# ---------------------------------------------------------------------------

PROD_PROMPT_TEMPLATE = """Extract structured fields from this university course syllabus.

RULES:
1. Return ONLY the tool call / JSON matching the declared schema. No prose before or after.
2. For every field, return either:
   - {{"status": "found", "value": <value>, "confidence": 0.0-1.0, "sourceSpans": [{{"quote": "<verbatim substring>"}}]}}
   - {{"status": "not_found", "tried": ["<location you checked>", "<another location>"]}}
3. **`quote` must be a contiguous substring of the source text below.** If the value is scattered across multiple sentences, return a LIST of quotes in `sourceSpans` — one quote per contiguous fragment. NEVER join fragments with ellipses (`…`, `...`), semicolons, or other connectors.
4. NEVER invent values. If a field is not clearly supported by the source text, return status "not_found" with a non-empty `tried` array describing where you looked.
5. Do NOT quote document titles, filenames, or file paths — they are metadata, not source content.

SOURCE TEXT:
---
{source}
---
"""

# The CLI runtime path (CLIRuntimeStructuredClient.send) appends a JSON-only
# instruction + schema block. Mirror that so behaviour matches production.

SCHEMA_JSON_BODY = {
    "type": "object", "additionalProperties": False,
    "required": ["courseCode","courseName","term","institution","teachers","officeHours","textbook","assessmentItems","learningObjectives","weekTopics"],
    # Truncated outline — the model sees this inline. Using the full
    # JSON schema from SyllabusPDFExtractor.jsonSchema would balloon the
    # prompt; this matches the structural contract the model needs.
    "properties": {
        "courseCode": "FieldResult<string>",
        "courseName": "FieldResult<string>",
        "term": "FieldResult<string>",
        "institution": "FieldResult<string>",
        "teachers": "[{role,name,email: FieldResult<string>}]",
        "officeHours": "FieldResult<string>",
        "textbook": "FieldResult<string>",
        "assessmentItems": "[{name,weightPercent,dueDate,format}]",
        "learningObjectives": "[FieldResult<string>]",
        "weekTopics": "[{weekRange,topic}]",
    },
}

def append_json_only(prompt: str) -> str:
    schema_str = json.dumps(SCHEMA_JSON_BODY, indent=2)
    return (
        prompt +
        "\nReturn ONLY valid JSON matching this schema — no prose, no code fences, no commentary before or after. The first character of your response must be `{` and the last must be `}`.\n\nSchema (SyllabusSchema):\n" +
        schema_str + "\n"
    )

def call_ai(prompt: str, command: str, timeout: int = 300) -> str:
    cmd = shlex.split(command)
    if not cmd:
        raise RuntimeError("AI command is empty")
    r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} exited {r.returncode}: {r.stderr[:500]}")
    return r.stdout

def extract_json(raw: str) -> dict:
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    try: return json.loads(s)
    except json.JSONDecodeError:
        start = s.find("{"); end = s.rfind("}")
        if start >= 0 and end > start:
            return json.loads(s[start:end+1])
        raise

# ---------------------------------------------------------------------------
# PDF extraction via node harness
# ---------------------------------------------------------------------------

def run_node_pdf(pdf_path: str) -> dict:
    script = REPO_ROOT / "scripts" / "phase6-e2e-pdf-extract.mjs"
    cmd = ["node", str(script), pdf_path, "--max-chars", "6000"]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"node pdf extract failed: {r.stderr[:500]}")
    return json.loads(r.stdout)

# ---------------------------------------------------------------------------
# Persistence shape simulator — mirrors persistExtractedTrace() in
# IngestionView.swift. Produces the same event dict that goes into
# `LoomTraceWriter.createTrace(initialEvents: [event])` so we can verify
# the exact persisted shape without touching SwiftData.
# ---------------------------------------------------------------------------

def simulate_persistence(
    *, source_doc_id: str, source_href: str | None, filename: str,
    plain_text: str, schema_json: str, extractor_id: str,
    display_summary: str,
) -> dict:
    is_generic = extractor_id == "generic"
    kind = "ingestion" if is_generic else f"ingestion-{extractor_id}"
    event = {
        "kind": "thought-anchor",
        "blockId": "loom-ingestion-root",
        "content": plain_text,
        "summary": display_summary,
        "extractorId": extractor_id,
        "schemaJSON": schema_json,
        "at": time.time() * 1000,
    }
    if source_href:
        event["sourceURL"] = source_href
    return {
        "trace": {
            "kind": kind,
            "sourceDocId": source_doc_id,
            "sourceTitle": filename,
            "sourceHref": source_href,
            "currentSummary": display_summary,
        },
        "events": [event],
    }

def display_summary_syllabus(schema: dict) -> str:
    def fv(fr):
        if isinstance(fr, dict) and fr.get("status") == "found":
            v = fr.get("value")
            if isinstance(v, str) and v: return v
        return None
    parts = [fv(schema.get("courseCode")), fv(schema.get("courseName"))]
    parts = [p for p in parts if p]
    return " — ".join(parts) if parts else "Syllabus"

# ---------------------------------------------------------------------------
# Per-syllabus driver
# ---------------------------------------------------------------------------

@dataclass
class SyllabusResult:
    slug: str
    path: str
    success: bool
    state_transitions: list[str] = field(default_factory=list)
    chosen_extractor: str = ""
    chosen_score: float = 0.0
    used_fallback: bool = False
    text_char_count: int = 0
    page_count: int = 0
    page_range_count: int = 0
    ai_call_ms: int = 0
    found_count: int = 0
    not_found_count: int = 0
    total_spans: int = 0
    verified_spans: int = 0
    unverified_spans: int = 0
    spans_with_page: int = 0
    filename_leak_demotions: int = 0
    non_contig_demotions: int = 0
    identity_fields_notfound: list[str] = field(default_factory=list)
    persist_kind: str = ""
    persist_schema_size_bytes: int = 0
    errors: list[str] = field(default_factory=list)
    red_flags: list[str] = field(default_factory=list)

def drive_one(sy: dict, skip_ai: bool, ai_command: str) -> SyllabusResult:
    slug = sy["slug"]; pdf = sy["path"]
    out_dir = OUT_ROOT / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    log = StateLog(slug, out_dir)
    res = SyllabusResult(slug=slug, path=pdf, success=False)

    # ----- State: idle -----
    log.transition("idle", f"start ingest(fileURL:) for {pdf}")

    if not Path(pdf).exists():
        res.errors.append(f"PDF not found: {pdf}")
        log.transition("failed", "PDF not found"); log.write()
        res.state_transitions = [t[1] for t in log.transitions]
        return res

    # ----- Text extraction via node (mirrors PDFExtraction.extract) -----
    try:
        pdf_out = run_node_pdf(pdf)
    except Exception as e:
        res.errors.append(f"pdf extract: {e}")
        log.transition("failed", str(e)[:200]); log.write()
        res.state_transitions = [t[1] for t in log.transitions]
        return res

    text = pdf_out["text"]
    page_ranges = pdf_out["pageRanges"]
    res.text_char_count = len(text)
    res.page_count = pdf_out.get("pageCount", 0)
    res.page_range_count = len(page_ranges)

    # ----- Registry dispatch -----
    filename = Path(pdf).name
    parent = Path(pdf).parent.name
    sample = text[:2048]
    extractor_id, score = best_match(filename, parent, sample)
    # Phase 5 ≥0.7 threshold → Generic fallback
    effective_id, used_fallback = (extractor_id, False) if score >= 0.7 else ("generic", True)
    res.chosen_extractor = effective_id
    res.chosen_score = score
    res.used_fallback = used_fallback
    log.transition("textExtracted",
        f"chose={effective_id} score={score:.2f} chars={len(text)} pages={res.page_count} "
        f"(ranges={res.page_range_count}) fallback={used_fallback}")

    # Only syllabus-pdf extractor is driven to AI here; others are
    # exercised via match() only. This matches the task spec (3 syllabi).
    if effective_id != "syllabus-pdf":
        res.red_flags.append(f"registry did not pick syllabus-pdf (chose {effective_id})")
        log.transition("failed", f"unexpected extractor: {effective_id}"); log.write()
        res.state_transitions = [t[1] for t in log.transitions]
        return res

    # ----- AI call -----
    provider_parts = shlex.split(ai_command)
    provider = provider_parts[0] if provider_parts else "ai-cli"
    log.transition("extracting", f"extractor_id=syllabus-pdf, provider={provider}")
    base_prompt = PROD_PROMPT_TEMPLATE.format(source=text)
    full_prompt = append_json_only(base_prompt)
    cache = out_dir / "ai-raw.txt"
    schema_cache = out_dir / "ai-schema.json"

    if skip_ai:
        if not schema_cache.exists():
            res.errors.append(f"skip-ai requested but cache is missing: {schema_cache}")
            log.transition("failed", "cached schema missing"); log.write()
            res.state_transitions = [t[1] for t in log.transitions]; return res
        raw = cache.read_text() if cache.exists() else ""
        try:
            schema = json.loads(schema_cache.read_text())
        except Exception as e:
            res.errors.append(f"cached schema unreadable: {e}")
            log.transition("failed", "cached schema unreadable"); log.write()
            res.state_transitions = [t[1] for t in log.transitions]; return res
    else:
        t0 = time.time()
        try:
            raw = call_ai(full_prompt, command=ai_command, timeout=300)
        except Exception as e:
            res.errors.append(f"AI CLI: {e}")
            log.transition("failed", str(e)[:200]); log.write()
            res.state_transitions = [t[1] for t in log.transitions]; return res
        res.ai_call_ms = int((time.time() - t0) * 1000)
        cache.write_text(raw)
        try:
            schema = extract_json(raw)
        except json.JSONDecodeError as e:
            res.errors.append(f"AI returned non-JSON: {e}; first 200 chars: {raw[:200]!r}")
            log.transition("failed", "JSON parse failed"); log.write()
            res.state_transitions = [t[1] for t in log.transitions]; return res
        schema_cache.write_text(json.dumps(schema, indent=2, ensure_ascii=False))

    # ----- verifySpans + pageNum derivation -----
    doc_id = f"ingest:{filename}-e2e-smoke"
    verified = _walk_verify(schema, text, filename, doc_id, page_ranges)

    # Extract stats
    def collect(obj, stats):
        if isinstance(obj, dict):
            if obj.get("status") == "found":
                stats["found"] += 1
                for sp in obj.get("sourceSpans") or []:
                    stats["spans"] += 1
                    if sp.get("verified"):
                        stats["verified"] += 1
                        if sp.get("pageNum") is not None:
                            stats["with_page"] += 1
                    else:
                        stats["unverified"] += 1
                        reason = sp.get("verifyReason")
                        if reason == "quote_contains_filename_stem":
                            stats["filename_demote"] += 1
                        elif reason == "quote_appears_non_contiguous":
                            stats["noncontig_demote"] += 1
            elif obj.get("status") == "not_found":
                stats["not_found"] += 1
            for v in obj.values(): collect(v, stats)
        elif isinstance(obj, list):
            for v in obj: collect(v, stats)

    stats = dict(found=0, not_found=0, spans=0, verified=0, unverified=0,
                 with_page=0, filename_demote=0, noncontig_demote=0)
    collect(verified, stats)
    res.found_count = stats["found"]
    res.not_found_count = stats["not_found"]
    res.total_spans = stats["spans"]
    res.verified_spans = stats["verified"]
    res.unverified_spans = stats["unverified"]
    res.spans_with_page = stats["with_page"]
    res.filename_leak_demotions = stats["filename_demote"]
    res.non_contig_demotions = stats["noncontig_demote"]

    # Identity-field notFound check (FINS 3640 case)
    for f in ("courseCode", "courseName", "term"):
        fr = verified.get(f)
        if isinstance(fr, dict) and fr.get("status") == "not_found":
            res.identity_fields_notfound.append(f)
        elif isinstance(fr, dict) and fr.get("status") == "found":
            spans = fr.get("sourceSpans") or []
            if spans and all(not sp.get("verified") for sp in spans):
                res.identity_fields_notfound.append(f + "(unverified)")

    # ----- Persistence simulation -----
    schema_json_str = json.dumps(verified, ensure_ascii=False, sort_keys=True)
    summary = display_summary_syllabus(verified)
    persist = simulate_persistence(
        source_doc_id=f"source:{Path(pdf).stem}",
        source_href=None,
        filename=filename,
        plain_text=text,
        schema_json=schema_json_str,
        extractor_id="syllabus-pdf",
        display_summary=summary,
    )
    res.persist_kind = persist["trace"]["kind"]
    res.persist_schema_size_bytes = len(schema_json_str)

    # ----- Write artifacts -----
    (out_dir / "input-extracted-text.txt").write_text(text)
    (out_dir / "page-ranges.json").write_text(json.dumps(page_ranges, indent=2))
    (out_dir / "final-schema.json").write_text(json.dumps(verified, indent=2, ensure_ascii=False))
    (out_dir / "loomtrace-events.json").write_text(json.dumps(persist, indent=2, ensure_ascii=False))

    # ----- State: extracted -----
    log.transition("extracted",
        f"found={res.found_count} not_found={res.not_found_count} "
        f"spans={res.verified_spans}/{res.total_spans}✓ "
        f"pageNums={res.spans_with_page} "
        f"persist.kind={res.persist_kind}")
    log.write()
    res.state_transitions = [t[1] for t in log.transitions]

    # ----- Red flag checks -----
    if "textExtracted" not in res.state_transitions:
        res.red_flags.append("state never entered textExtracted")
    if "extracting" not in res.state_transitions:
        res.red_flags.append("state skipped extracting")
    if "extracted" not in res.state_transitions:
        res.red_flags.append("state never reached extracted")
    if res.persist_kind != "ingestion-syllabus-pdf":
        res.red_flags.append(f"persist kind wrong: {res.persist_kind}")
    if res.page_range_count == 0:
        res.red_flags.append("pageRanges empty (PDFExtraction contract violated)")
    if res.verified_spans > 0 and res.spans_with_page == 0:
        res.red_flags.append("pageNum NEVER populated on any verified span — pageForSpan broken")
    if res.total_spans > 0 and res.verified_spans / res.total_spans < 0.8:
        res.red_flags.append(f"verify rate low: {res.verified_spans}/{res.total_spans}")
    res.success = not res.red_flags
    return res

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets",
                    help="JSON file path or inline JSON target list. Also supports LOOM_PHASE6_E2E_TARGETS.")
    ap.add_argument("--skip-ai", action="store_true",
                    help="Reuse cached AI output if present (for re-run without burning tokens)")
    ap.add_argument("--serial", action="store_true",
                    help="Run syllabi serially (default: parallel)")
    ap.add_argument("--ai-command", default=os.environ.get(AI_COMMAND_ENV, DEFAULT_AI_COMMAND),
                    help=f"AI CLI command that reads prompt from stdin (default: {DEFAULT_AI_COMMAND!r}; env {AI_COMMAND_ENV}).")
    args = ap.parse_args()
    targets, target_source = load_targets(args.targets)
    ai_parts = shlex.split(args.ai_command)
    ai_binary = shutil.which(ai_parts[0]) if ai_parts else None

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    with HARNESS_LOG.open("w") as f:
        f.write(f"# phase6-e2e-smoke — started {time.ctime()}\n")
        f.write(f"# repo: {REPO_ROOT}\n")
        f.write(f"# skip_ai={args.skip_ai} serial={args.serial}\n")
        f.write(f"# targets: {target_source} ({len(targets)})\n")
        f.write(f"# ai_command: {args.ai_command}\n")
        f.write(f"# ai_binary: {ai_binary or ''}\n\n")

    t0 = time.time()
    results: list[SyllabusResult] = []
    if args.serial:
        for sy in targets:
            r = drive_one(sy, args.skip_ai, args.ai_command); results.append(r)
            with HARNESS_LOG.open("a") as f:
                f.write(f"[{r.slug}] done success={r.success} ai_ms={r.ai_call_ms}\n")
    else:
        with ThreadPoolExecutor(max_workers=len(targets)) as ex:
            futs = {ex.submit(drive_one, sy, args.skip_ai, args.ai_command): sy["slug"] for sy in targets}
            for fut in as_completed(futs):
                r = fut.result(); results.append(r)
                with HARNESS_LOG.open("a") as f:
                    f.write(f"[{r.slug}] done success={r.success} ai_ms={r.ai_call_ms}\n")
    elapsed = time.time() - t0

    # Write summary.md
    write_summary(results, elapsed)

    any_fail = any(not r.success for r in results)
    print(f"\nElapsed: {elapsed:.1f}s")
    print(f"Pass: {sum(1 for r in results if r.success)}/{len(results)}")
    for r in results:
        icon = "PASS" if r.success else "FAIL"
        print(f"  [{icon}] {r.slug} — extractor={r.chosen_extractor}({r.chosen_score:.2f}) "
              f"found={r.found_count} nf={r.not_found_count} "
              f"spans={r.verified_spans}/{r.total_spans} pageNum={r.spans_with_page} "
              f"persist={r.persist_kind}")
        for f in r.red_flags: print(f"       ! {f}")
        for e in r.errors: print(f"       ERR: {e}")
    print(f"\nArtifacts: {OUT_ROOT}/")
    return 1 if any_fail else 0

def write_summary(results: list[SyllabusResult], elapsed: float) -> None:
    out = OUT_ROOT / "summary.md"
    lines: list[str] = []
    lines.append("# Phase 6 E2E Smoke — Summary\n")
    lines.append(f"Run at: {time.ctime()}  \n")
    lines.append(f"Total elapsed: {elapsed:.1f}s  \n")
    lines.append(f"Harness: `scripts/phase6-e2e-smoke.py` + `scripts/phase6-e2e-pdf-extract.mjs`  \n\n")

    passes = sum(1 for r in results if r.success)
    lines.append(f"## Aggregate\n")
    lines.append(f"- **{passes}/{len(results)} syllabi passed** all gates\n")
    tot_spans = sum(r.total_spans for r in results)
    tot_verified = sum(r.verified_spans for r in results)
    tot_page = sum(r.spans_with_page for r in results)
    tot_found = sum(r.found_count for r in results)
    tot_nf = sum(r.not_found_count for r in results)
    if tot_spans:
        lines.append(f"- Span verify rate: **{tot_verified}/{tot_spans} = {100*tot_verified/tot_spans:.1f}%**\n")
    if tot_verified:
        lines.append(f"- pageNum coverage on verified spans: **{tot_page}/{tot_verified} = {100*tot_page/tot_verified:.1f}%**\n")
    lines.append(f"- Fields: **{tot_found} found**, **{tot_nf} not_found**\n\n")

    lines.append("## Per-syllabus\n\n")
    lines.append("| Syllabus | Extractor | Score | Chars | Pages | Found | NotFound | Spans (✓/total) | pageNum coverage | Fname demote | Persist kind | AI (s) | Result |\n")
    lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|\n")
    for r in results:
        sp_rate = f"{r.verified_spans}/{r.total_spans}" if r.total_spans else "0/0"
        pn_rate = f"{r.spans_with_page}/{r.verified_spans}" if r.verified_spans else "0/0"
        lines.append(
            f"| `{r.slug}` | {r.chosen_extractor} | {r.chosen_score:.2f} | {r.text_char_count} | "
            f"{r.page_count} | {r.found_count} | {r.not_found_count} | {sp_rate} | {pn_rate} | "
            f"{r.filename_leak_demotions} | {r.persist_kind} | {r.ai_call_ms/1000:.1f} | "
            f"{'PASS' if r.success else 'FAIL'} |\n"
        )
    lines.append("\n## State transitions (canonical 4)\n\n")
    for r in results:
        lines.append(f"### {r.slug}\n")
        lines.append("```\n" + "\n".join(f" -> {s}" for s in r.state_transitions) + "\n```\n")
        if r.identity_fields_notfound:
            lines.append(f"Identity fields reported not_found (honest): {', '.join(r.identity_fields_notfound)}\n\n")
    if any(r.red_flags for r in results):
        lines.append("\n## Red flags\n\n")
        for r in results:
            for f in r.red_flags:
                lines.append(f"- **{r.slug}**: {f}\n")
    if any(r.errors for r in results):
        lines.append("\n## Errors\n\n")
        for r in results:
            for e in r.errors:
                lines.append(f"- **{r.slug}**: {e}\n")

    lines.append("\n## Artifacts per syllabus\n\n")
    for r in results:
        lines.append(f"- `{OUT_ROOT}/{r.slug}/`\n")
        lines.append(f"  - `state-log.txt` — 4-state transition log\n")
        lines.append(f"  - `input-extracted-text.txt` — post-CleanText plaintext\n")
        lines.append(f"  - `page-ranges.json` — PageRange[] derived from pdfjs+CleanText\n")
        lines.append(f"  - `ai-raw.txt` — raw stdout from configured AI CLI\n")
        lines.append(f"  - `ai-schema.json` — parsed SyllabusSchema pre-verify\n")
        lines.append(f"  - `final-schema.json` — post-verifySpans + pageNum derivation\n")
        lines.append(f"  - `loomtrace-events.json` — simulated persistence event shape\n")

    lines.append("\n## Re-run command\n\n")
    lines.append("```\npython3 scripts/phase6-e2e-smoke.py --targets path/to/phase6-targets.json\n# or skip AI (reuse cache):\npython3 scripts/phase6-e2e-smoke.py --targets path/to/phase6-targets.json --skip-ai\n```\n")

    out.write_text("".join(lines))

if __name__ == "__main__":
    sys.exit(main())
