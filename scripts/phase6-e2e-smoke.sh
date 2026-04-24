#!/usr/bin/env bash
# Phase 6 E2E smoke — thin shell wrapper around the Python driver.
#
# The Python script is the actual harness; this wrapper exists so the
# command in summary.md / CI is a single path that doesn't need to know
# about python3 vs python. Re-run after any change to:
#   - macos-app/Loom/Sources/Ingest/SyllabusPDFExtractor.swift
#   - macos-app/Loom/Sources/Ingest/IngestExtractor.swift (verifySpans)
#   - macos-app/Loom/Sources/Ingest/PageRange.swift
#   - macos-app/Loom/Sources/Ingest/PDFExtraction.swift
#   - macos-app/Loom/Sources/IngestionView.swift (IngestionRunner/persist)
#
# Env:
#   SKIP_AI=1  — reuse /tmp/phase6-e2e/*/ai-raw.txt instead of spending tokens
#   SERIAL=1   — run syllabi serially (default: parallel)
#
# Usage:
#   bash scripts/phase6-e2e-smoke.sh --targets path/to/targets.json
#   SKIP_AI=1 bash scripts/phase6-e2e-smoke.sh --targets path/to/targets.json

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRIVER="$REPO_ROOT/scripts/phase6-e2e-smoke.py"

ARGS=("$@")
if [[ "${SKIP_AI:-0}" == "1" ]]; then ARGS+=("--skip-ai"); fi
if [[ "${SERIAL:-0}"  == "1" ]]; then ARGS+=("--serial"); fi

exec python3 "$DRIVER" "${ARGS[@]}"
