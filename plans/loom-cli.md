# Loom CLI — External AI Integration Spec

**Status:** M1 thesis filed 2026-05-02. **MVP shipped 2026-05-02 (Node version)** — `scripts/loom-cli.ts` + `bin/loom` wrapper. Swift binary remains v4.2 work.

**Owner:** Claude (initial spec + Node MVP). Swift implementation TBD.

**MVP scope (shipped):**
- ✓ `loom open <file>` — opens Loom.app to file (via macOS `open -a Loom`)
- ✓ `loom search "<query>"` — ripgrep-based search across LoomFileStore + knowledge dir; supports `--limit N`, `--format json`
- ✓ `loom write <path>` — writes markdown to LoomFileStore with auto-frontmatter; supports `--content`, `--overwrite`, stdin pipe
- ✓ `loom version` — prints version + paths
- ✓ `loom help` — usage
- ⚠ `loom render <file>` — STUB (raw HTML wrapper; full compile pipeline integration deferred)
- ⚠ `loom related <file>` — STUB (returns empty; embeddings-based search deferred to v4.2 wiki-scale)
- ⚠ `loom capture <url>` — STUB (programmatic capture not wired; suggests user use extension)

**MVP installation:**
```
ln -s /Users/yinyiping/Desktop/LOOM/bin/loom /usr/local/bin/loom
# OR alias loom='/Users/yinyiping/Desktop/LOOM/bin/loom'
```
Then `loom <command>` works from anywhere.

**Smoke test verified 2026-05-02:**
```
$ echo "# Test" | loom write drafts/test.md
wrote: ~/Library/Application Support/Loom/user-data/drafts/test.md
$ loom search "Test" --limit 3
1 match(es) found
```

**Path conventions (uses `lib/paths.ts`):**
- LoomFileStore = `~/Library/Application Support/Loom/user-data/`
- Search roots = LoomFileStore + knowledge dir
- Sandbox enforcement: `loom write` rejects paths escaping LoomFileStore

**Cross-references:**

**Cross-references:**
- `LOOM.md` §1.5 — substrate positioning (canonical)
- `LOOM.md` §6.7 — input surface + AI passes (peer)
- `LOOM_RULES.md` §7.5 — operating rules (binding; rule #11 covers external AI integration)
- `plans/loom-ai-passes.md` — internal AI passes (peer)
- `tmp/loom-correction-log.md` entry-007 — substrate reframe context

---

## Why this plan exists

v4.0/v4.1 establish that external AI (Codex / Claude Code / Cursor / future X) integrates with Loom via **files + CLI**, not via Loom-specific API or plugin system. This plan specs the CLI: command surface, conventions, error handling, distribution. **MVP shipped 2026-05-02 commit `f65cc67`.**

## What this plan does NOT do

- Does NOT add a Loom plugin SDK / extension API. External AI uses standard Unix interfaces.
- Does NOT add an MCP server in v4.1 (consider for v4.2+ if user demand).
- Does NOT modify how the Loom Mac app behaves; CLI is independent.
- Does NOT touch editable render or AI passes; complementary surfaces.

---

## Design principles

1. **Unix philosophy** — each command does one thing well; commands compose via stdout/stdin
2. **No proprietary protocols** — markdown + JSON output (`--format json` flag)
3. **Read-only by default** — destructive operations require explicit flags
4. **Source folder is sacred** — CLI never writes to user's source folder; only to LoomFileStore (sandbox)
5. **Idempotent where possible** — running same command twice yields same result
6. **Discoverable** — `loom --help` and `loom <cmd> --help` are first-class
7. **Compatible with shell scripting** — exit codes, machine-readable output, no interactive prompts unless `--interactive` flag

---

## Command surface (v4.0/v4.1 — 6 commands; MVP `f65cc67` ships open/search/write functional, render/related/capture stubbed)

### `loom capture <url>`

**Purpose:** Trigger web capture from CLI (same as Loom extension's capture, but headless).

**Behavior:**
- Fetches the URL
- Runs Loom's capture pipeline (extract + structure + media handling)
- Writes resulting `.md` + sidecars to LoomFileStore
- Outputs the path of the captured file

**Flags:**
- `--folder <path>` — write to specific subfolder
- `--quiet` — suppress progress output
- `--format json` — output `{capturePath, sourceUrl, capturedAt, mediaCount}`

**Exit codes:**
- 0: success
- 1: URL fetch failed
- 2: extraction failed
- 3: write failed

**Example:**
```bash
loom capture https://flipdisc.io
# → /Users/x/Library/.../LoomFileStore/captures/2026-05-02/flipdisc-io.md
```

### `loom search "<query>"`

**Purpose:** Full-text + embedding search across user's Loom corpus.

**Behavior:**
- Searches across all LoomFileStore docs + indexed source folder
- Returns top-N matches with score + snippet
- Default N=10; configurable via `--limit N`

**Flags:**
- `--limit N` — max results
- `--folder <path>` — restrict search to subfolder
- `--type <captures|drafts|wiki|all>` — restrict to artifact type
- `--format json` — machine-readable output

**Example:**
```bash
loom search "flipdisc display technology"
# → top 10 matches across captures + drafts, with snippets
```

### `loom open <file>`

**Purpose:** Open Loom UI to a specific file.

**Behavior:**
- If Loom is running, focuses it and navigates to the file
- If Loom isn't running, launches it and opens the file
- Does NOT read/write the file; just brings UI focus

**Flags:**
- `--no-launch` — fail if Loom isn't already running

**Exit codes:**
- 0: opened
- 1: file doesn't exist
- 2: Loom failed to launch (when launch needed)

### `loom related <file>`

**Purpose:** Find Loom documents related to the given file (cross-reference candidates).

**Behavior:**
- Computes embedding for `<file>` content
- Searches Loom corpus for high-similarity docs
- Returns top-N with similarity score

**Flags:**
- `--limit N` — max results
- `--threshold T` — min similarity (0.0-1.0)
- `--format json` — machine-readable

**Use case:** External AI building cross-document understanding can call this to find related context.

### `loom render <file>`

**Purpose:** Headless render markdown to paper canon HTML.

**Behavior:**
- Reads markdown file
- Runs Loom's renderer (paper canon CSS + 5 shape detection)
- Outputs HTML to stdout
- Useful for: external preview, export to other tools, automated screenshot pipelines

**Flags:**
- `--style standalone` — include all CSS inline (default: external CSS link)
- `--shape <article|list|passage|conversation|syllabus>` — force shape (default: auto-detect)
- `--width <px>` — viewport width for responsive rendering

**Exit codes:**
- 0: rendered
- 1: file doesn't exist
- 2: render failed

### `loom write <path>`

**Purpose:** Write a markdown artifact to LoomFileStore.

**Behavior:**
- Reads content from stdin (or `--content "<text>"` flag)
- Adds standard frontmatter (id, createdAt, source: "external-cli")
- Writes to LoomFileStore at relative `<path>`
- Triggers Loom's auto-watcher (if Loom running, document appears immediately)

**Flags:**
- `--content "<text>"` — content from CLI arg instead of stdin
- `--format <article|list|...>` — hint for shape detection
- `--frontmatter <json>` — additional frontmatter as JSON
- `--overwrite` — replace existing file (default: error if exists)

**Constraints:**
- `<path>` must be relative; CLI prepends LoomFileStore base
- CLI rejects writes outside sandbox (e.g., `../source/x.md` → error)

**Example:**
```bash
echo "# Today's thought\n\nContent..." | loom write drafts/2026-05-02-thought.md
# → wrote LoomFileStore/drafts/2026-05-02-thought.md, Loom UI auto-refreshed
```

### Future commands (v4.2+, NOT in v4.0/v4.1 MVP)

- `loom embed <file>` — return embedding vector for content (used by external AI for own indexing)
- `loom diff <file-a> <file-b>` — semantic diff between two Loom docs
- `loom merge <file-a> <file-b>` — propose merge of related docs (wiki-scale)
- `loom serve` — start MCP server for tool-protocol clients

---

## Frontmatter conventions (for AI-written files)

External AI writing via `loom write` should include:

```yaml
---
id: <uuid or slug>
createdAt: <ISO8601>
updatedAt: <ISO8601>
source: external-cli  # or "external-codex", "external-claude-code", etc.
sourceAgent: <agent-name>  # e.g., "codex-cli-2026-05"
shape: <article|list|passage|conversation|syllabus|auto>
title: <string>
tags: [<list>]
---
```

CLI auto-fills `id`, `createdAt`, `updatedAt`, `source`, `sourceAgent` if not provided.

User-edited files should NEVER lose these fields; Loom's editor preserves them.

---

## Distribution

### Bundling
CLI ships as part of the Loom Mac app bundle:
```
Loom.app/Contents/MacOS/loom-cli
```

### Installation
First-run experience adds a symlink to user's `$PATH`:
```
/usr/local/bin/loom -> /Applications/Loom.app/Contents/MacOS/loom-cli
```
Or asks user to add to PATH manually.

### Versioning
CLI version matches Loom app version. `loom --version` prints both.

### Permissions
CLI inherits Loom app's sandbox permissions. Source folder access requires Loom app to have been granted access (security-scoped bookmarks).

---

## Codex / Claude Code integration

CLI is invokable from any agent that can run shell commands:

### Codex example
```
User: "Find all my captures about flip-disc displays from last month"
Codex internal call: loom search "flip disc display" --limit 20 --format json
Codex parses JSON, presents to user
```

### Claude Code example
```
User: "Write a draft summarizing my flipdisc captures"
Claude Code:
  1. loom search "flipdisc" --format json
  2. (reads top N capture files via filesystem)
  3. (composes summary)
  4. echo "<summary md>" | loom write drafts/flipdisc-summary.md
  5. loom open drafts/flipdisc-summary.md
```

### MCP server (v4.2+ consideration)
If Codex/Claude Code adopt MCP for tool definition, `loom serve` could expose CLI commands as MCP tools. Defer until MCP adoption is clearer.

---

## Implementation notes

### Tech stack
- Swift CLI binary (consistent with Loom Mac app)
- Reuses existing Swift code: LoomFileStore, EmbeddingStore, capture pipeline, render pipeline
- ~3-5 days engineering for v4.0/v4.1 scope (6 commands; MVP shipped `f65cc67`)

### Code location
```
macos-app/Loom/Sources/CLI/
  ├── LoomCLI.swift  (entry point, command parsing)
  ├── CaptureCommand.swift
  ├── SearchCommand.swift
  ├── OpenCommand.swift
  ├── RelatedCommand.swift
  ├── RenderCommand.swift
  └── WriteCommand.swift
```

### Testing
```
macos-app/Loom/Tests/CLITests/
  └── (one test file per command)
```

### Build target
`project.yml` adds new `loom-cli` target alongside `Loom` and `LoomWebExtension`. Output binary goes into `.app/Contents/MacOS/`.

---

## Failure modes + handling

### File not found
Exit 1, message to stderr.

### Sandbox permission denied
Exit 4, message: "Loom needs source-folder access. Open Loom and grant access in Settings."

### Loom app not running (for `loom open`)
Default: launch Loom + open file. With `--no-launch`: exit 2.

### Network failure (for `loom capture`)
Exit 1, message to stderr. Doesn't write partial files.

### Concurrent CLI invocations
Each command is independent; LoomFileStore writes are atomic. Concurrent `loom capture` calls write to different files (timestamp-based naming).

### CLI vs Loom UI conflict
If CLI writes a file while user is editing it in Loom UI: Loom's MD↔DOM watcher reconciles. If conflict, last-write-wins for now (better strategy is v4.2+ work).

---

## M6 milestone scope (parallelizable with C.M4)

When triggered (any time after C.M1, doesn't depend on editable render):

- Implement 6 commands above
- Bundle into Loom.app
- First-run installer for `/usr/local/bin/loom` symlink
- Help text + man pages
- Basic tests per command
- README in `docs/cli/README.md`

**Estimated time:** 3-5 days, single agent.

---

## Out of scope (defer to v4.2+ or later)

- ❌ MCP server (`loom serve`)
- ❌ Wiki-scale operations (`loom merge`, `loom cluster`)
- ❌ Plugin SDK / extension API
- ❌ CLI-driven AI passes (those are internal to Loom UI; CLI exposes substrate ops only)
- ❌ Cross-CLI synchronization protocols (single-machine only in v4.0/v4.1)

---

## Update protocol

- When M6 ships: update this file with implementation commit refs
- When external AI agents adopt the CLI: log usage patterns
- When new commands are needed: add via changelog with version bump
