#!/usr/bin/env tsx
/**
 * Loom CLI — v4.1 M8 MVP (Node-based; Swift binary planned for v4.2+).
 *
 * Per `plans/loom-cli.md`, this CLI exposes substrate operations to
 * external AI agents (Codex, Claude Code, Cursor) and the user's shell.
 *
 * Six commands:
 *   loom capture <url>              — trigger web capture (STUB v4.1; needs extension bridge)
 *   loom search "<query>"           — full-text search across Loom corpus (MVP via ripgrep)
 *   loom open <file>                — open Loom UI to specific file
 *   loom related <file>             — find related Loom documents (STUB v4.1; needs embeddings)
 *   loom render <file>              — render markdown to paper canon HTML (STUB v4.1)
 *   loom write <path>               — write artifact to LoomFileStore
 *
 * Conventions:
 *   - Read-only by default; --overwrite needed for destructive ops
 *   - Source folder is sacred: CLI never writes there
 *   - All writes go through loomUserDataRoot() (sandbox)
 *   - JSON output via --format json
 *   - Exit codes follow Unix conventions (0=success, 1+=error)
 *
 * Usage: `npx tsx scripts/loom-cli.ts <command> [args]`
 *        OR `bin/loom <command> [args]` (after first-run install)
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { loomAppSupportRoot, loomUserDataRoot, knowledgeUserDataRoot } from '../lib/paths.js';

// ---------- Shared helpers ----------

const CLI_VERSION = '0.1.0-mvp';

function log(...args: unknown[]) {
  if (process.env.LOOM_QUIET !== '1') console.error('[loom]', ...args);
}

function output(data: unknown, format: 'human' | 'json' = 'human') {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    if (typeof data === 'string') console.log(data);
    else console.log(JSON.stringify(data, null, 2));
  }
}

function fail(msg: string, exitCode = 1): never {
  console.error(`[loom] ERROR: ${msg}`);
  process.exit(exitCode);
}

function parseFlags(argv: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function getFormat(flags: Record<string, string | boolean>): 'human' | 'json' {
  return flags.format === 'json' ? 'json' : 'human';
}

// ---------- Path resolution ----------

/** Absolute path to LoomFileStore root (where Loom user artifacts live). */
function loomFileStoreRoot(): string {
  return loomUserDataRoot();
}

/** Resolve a possibly-relative path against current cwd. */
function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

/** Sanitize a path to ensure it stays inside LoomFileStore (no escape). */
function safeFileStorePath(relPath: string): string {
  if (path.isAbsolute(relPath)) {
    fail(`path must be relative to LoomFileStore root: ${relPath}`);
  }
  const abs = path.join(loomFileStoreRoot(), relPath);
  const resolved = path.resolve(abs);
  const root = path.resolve(loomFileStoreRoot());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    fail(`path escapes LoomFileStore: ${relPath}`);
  }
  return resolved;
}

// ---------- Commands ----------

/// `loom open <file>`
async function cmdOpen(args: string[]) {
  const { positional } = parseFlags(args);
  const file = positional[0];
  if (!file) fail('usage: loom open <file>');
  const abs = resolvePath(file);
  if (!existsSync(abs)) fail(`file not found: ${abs}`, 1);

  // Open with Loom.app explicitly. Falls back to default app if Loom not installed.
  const result = spawnSync('open', ['-a', 'Loom', abs], { stdio: 'inherit' });
  if (result.status !== 0) {
    log('Loom.app not registered, falling back to default app');
    spawnSync('open', [abs], { stdio: 'inherit' });
  }
  output(`opened: ${abs}`);
}

/// `loom search "<query>"`
async function cmdSearch(args: string[]) {
  const { positional, flags } = parseFlags(args);
  const query = positional.join(' ');
  if (!query) fail('usage: loom search "<query>" [--limit N] [--format json]');
  const limit = parseInt((flags.limit as string) || '10', 10);
  const format = getFormat(flags);

  // MVP: ripgrep across LoomFileStore + knowledge folder
  const searchRoots = [loomFileStoreRoot(), knowledgeUserDataRoot()].filter(existsSync);
  if (searchRoots.length === 0) {
    output(format === 'json' ? { results: [], message: 'no Loom data dirs found' } : 'no Loom data dirs found', format);
    return;
  }

  const results: Array<{ file: string; line: number; snippet: string }> = [];
  for (const root of searchRoots) {
    const rg = spawnSync(
      'rg',
      ['--no-heading', '--line-number', '--max-count', String(limit), '--type', 'md', query, root],
      { encoding: 'utf-8' },
    );
    if (rg.status === 0 && rg.stdout) {
      for (const line of rg.stdout.split('\n')) {
        if (!line.trim()) continue;
        const m = line.match(/^(.+?):(\d+):(.*)$/);
        if (m) {
          results.push({ file: m[1], line: parseInt(m[2], 10), snippet: m[3] });
        }
        if (results.length >= limit) break;
      }
    }
    if (results.length >= limit) break;
  }

  if (format === 'json') {
    output({ query, count: results.length, results }, 'json');
  } else {
    if (results.length === 0) {
      output(`no matches for: ${query}`);
    } else {
      output(`${results.length} match(es) for "${query}":\n`);
      for (const r of results) {
        console.log(`  ${r.file}:${r.line}`);
        console.log(`    ${r.snippet.slice(0, 120)}`);
      }
    }
  }
}

/// `loom write <path>`
async function cmdWrite(args: string[]) {
  const { positional, flags } = parseFlags(args);
  const relPath = positional[0];
  if (!relPath) fail('usage: loom write <path> [--content "<text>"] [--overwrite]');

  const target = safeFileStorePath(relPath);
  if (existsSync(target) && !flags.overwrite) {
    fail(`file exists (use --overwrite): ${target}`, 2);
  }

  // Read content from --content flag OR stdin
  let content: string;
  if (typeof flags.content === 'string') {
    content = flags.content as string;
  } else {
    content = readFileSync(0, 'utf-8'); // stdin
  }

  // Add minimal frontmatter if not present
  if (!content.startsWith('---\n')) {
    const id = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    content = `---\nid: ${id}\ncreatedAt: ${now}\nupdatedAt: ${now}\nsource: loom-cli\nsourceAgent: ${process.env.LOOM_AGENT_ID || 'cli-mvp'}\n---\n\n${content}`;
  }

  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf-8');
  output(`wrote: ${target}`);
}

/// `loom render <file>` — STUB v4.1
async function cmdRender(args: string[]) {
  const { positional } = parseFlags(args);
  const file = positional[0];
  if (!file) fail('usage: loom render <file>');
  const abs = resolvePath(file);
  if (!existsSync(abs)) fail(`file not found: ${abs}`, 1);

  // STUB v4.1: outputs raw markdown wrapped in minimal HTML with link to paper-canon CSS.
  // Full implementation deferred to v4.2: needs to use Loom's compile pipeline (LOOM.md §7).
  const content = readFileSync(abs, 'utf-8');
  const stub = `<!DOCTYPE html>
<html><head>
<title>${path.basename(abs)}</title>
<link rel="stylesheet" href="loom://bundle/paper-canon.css">
<!-- STUB v4.1 — full render via Loom compile pipeline pending -->
</head><body>
<pre>${content.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)}</pre>
</body></html>`;
  output(stub);
}

/// `loom related <file>` — STUB v4.1
async function cmdRelated(args: string[]) {
  const { positional, flags } = parseFlags(args);
  const file = positional[0];
  if (!file) fail('usage: loom related <file> [--limit N] [--format json]');
  const format = getFormat(flags);

  // STUB v4.1: returns empty list. Full implementation deferred to v4.2:
  // needs EmbeddingStore + similarity ranking. For now, returns "related work pending".
  if (format === 'json') {
    output({ file, count: 0, results: [], note: 'STUB v4.1; embeddings-based search pending v4.2' }, 'json');
  } else {
    output('STUB v4.1: cross-document related search pending v4.2 wiki-scale work.');
    output(`Use 'loom search "<concept>"' for full-text matches in the meantime.`);
  }
}

/// `loom capture <url>` — STUB v4.1
async function cmdCapture(args: string[]) {
  const { positional } = parseFlags(args);
  const url = positional[0];
  if (!url) fail('usage: loom capture <url>');

  // STUB v4.1: opens URL in browser with hint that user should use Loom extension.
  // Full implementation deferred to v4.2: needs headless extension capture or
  // direct Swift capture pipeline invocation.
  output('STUB v4.1: programmatic capture not yet wired.');
  output(`Suggested: open "${url}" in browser, then use the Loom extension's capture button.`);
  output('Or: use Loom UI > Web Capture sidebar to enter URL manually.');
}

/// `loom version`
function cmdVersion() {
  console.log(`loom-cli v${CLI_VERSION} (Node MVP; Swift binary planned for v4.2)`);
  console.log(`LoomFileStore: ${loomFileStoreRoot()}`);
}

/// `loom help`
function cmdHelp() {
  console.log(`Loom CLI v${CLI_VERSION} — substrate operations for external AI

Commands:
  loom capture <url>          — trigger web capture (STUB v4.1)
  loom search "<query>"       — full-text search across Loom corpus
                                  --limit N      (default 10)
                                  --format json
  loom open <file>            — open Loom UI to specific file
  loom related <file>         — find related Loom documents (STUB v4.1)
                                  --limit N
                                  --format json
  loom render <file>          — render markdown to paper canon HTML (STUB v4.1)
  loom write <path>           — write artifact to LoomFileStore
                                  --content "<text>"  (or pipe stdin)
                                  --overwrite
  loom version                — print version + paths
  loom help                   — this text

Examples:
  loom open ~/Library/Application\\ Support/Loom/user-data/drafts/today.md
  loom search "behavioral economics" --limit 5
  echo "# My note" | loom write drafts/note-$(date +%s).md
  loom search "flipdisc" --format json | jq

Substrate operations only. AI work happens in Loom UI (⌘K palette / AskAI / background passes).
External AI (Codex, Claude Code) calls these commands as tools.

Spec: plans/loom-cli.md
`);
}

// ---------- Main dispatch ----------

async function main() {
  const [, , command, ...rest] = process.argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    cmdHelp();
    return;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    cmdVersion();
    return;
  }

  switch (command) {
    case 'open': await cmdOpen(rest); break;
    case 'search': await cmdSearch(rest); break;
    case 'write': await cmdWrite(rest); break;
    case 'render': await cmdRender(rest); break;
    case 'related': await cmdRelated(rest); break;
    case 'capture': await cmdCapture(rest); break;
    default:
      fail(`unknown command: ${command}. run 'loom help' for usage.`);
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
