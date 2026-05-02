#!/usr/bin/env node
// Contract-aware CSS dead-class scanner for app/globals.css.
//
// This walks app/, components/, lib/, tests/, macos-app/Loom/Sources/, and
// knowledge/ to extract every plausible class-name reference, including:
//   * Literal className="..." in TSX/JSX
//   * Template literal `${classBase}--${variant}` constructions (recorded as
//     wildcard live prefixes — anything matching the prefix is preserved)
//   * Class tokens that appear inside test regex contracts (assert.match /.../)
//   * Class tokens inside Swift literal strings (loom-… prefix)
//   * Class tokens inside MDX/markdown content
//
// It also parses app/globals.css to enumerate every class selector defined,
// then computes the dead set: defined classes with no live reference and not
// covered by any wildcard prefix or test contract.
//
// Output: /tmp/css-class-scan.json with literal/dynamic_prefixes/test_contracts/
// globals_css_classes/dead_classes plus a heuristic of dead rule blocks.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SCAN_ROOTS = [
  { dir: 'app', exts: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx'] },
  { dir: 'components', exts: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx'] },
  { dir: 'lib', exts: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx'] },
  { dir: 'tests', exts: ['.ts', '.tsx', '.mts', '.mjs'] },
  { dir: 'macos-app/Loom/Sources', exts: ['.swift'] },
  { dir: 'macos-app/Loom/Tests', exts: ['.swift'] },
  { dir: 'knowledge', exts: ['.md', '.mdx', '.json'] },
  { dir: 'docs', exts: ['.md', '.mdx'] },
  { dir: 'plans', exts: ['.md', '.mdx'] },
  { dir: 'mdx-components.tsx', exts: null }, // single file
  { dir: 'tailwind.config.ts', exts: null },
];

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.next-build', 'build', '.git']);

function* walk(rootRel, exts) {
  const root = path.join(repoRoot, rootRel);
  if (!fs.existsSync(root)) return;
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    yield root;
    return;
  }
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        if (!exts) {
          yield full;
        } else if (exts.some((e) => entry.name.endsWith(e))) {
          yield full;
        }
      }
    }
  }
}

// ---- Class-name tokenization ----
// Class name characters: letters, digits, hyphen, underscore. We refuse
// "all numeric" tokens to avoid noise.
const CLASS_TOKEN_RE = /[a-zA-Z_][a-zA-Z0-9_-]*/g;

function tokenizeClassish(s) {
  if (!s) return [];
  const out = [];
  for (const m of s.matchAll(CLASS_TOKEN_RE)) {
    const t = m[0];
    if (t.length < 2) continue;
    out.push(t);
  }
  return out;
}

// ---- Per-file extractors ----

function extractFromTsx(text) {
  const literal = new Set();
  const dynamicPrefixes = new Set();

  // className="..." or className='...'
  const classNameLiteralRe = /\bclassName\s*=\s*(['"])([^'"]+)\1/g;
  let m;
  while ((m = classNameLiteralRe.exec(text))) {
    for (const t of tokenizeClassish(m[2])) literal.add(t);
  }

  // className={'...'} or className={"..."}
  const classNameBracedStringRe = /\bclassName\s*=\s*\{\s*(['"])([^'"]+)\1\s*\}/g;
  while ((m = classNameBracedStringRe.exec(text))) {
    for (const t of tokenizeClassish(m[2])) literal.add(t);
  }

  // className={`... ${x} ... ${y} ...`} — pull static fragments + record any
  // base--${var} dynamic prefix.
  const classNameTemplateRe = /\bclassName\s*=\s*\{\s*`([^`]+)`/g;
  while ((m = classNameTemplateRe.exec(text))) {
    extractTemplatePieces(m[1], literal, dynamicPrefixes);
  }

  // any backtick that contains class-name-shaped tokens followed by --${...}
  const baseDashDashVarRe = /([A-Za-z][A-Za-z0-9_-]+)--\$\{[^}]+\}/g;
  while ((m = baseDashDashVarRe.exec(text))) {
    dynamicPrefixes.add(`${m[1]}--`);
  }

  // clsx(...) / cn(...) / classNames(...) / twMerge(...) — pull all string args
  const helperRe = /\b(?:clsx|cn|classNames|twMerge)\s*\(([\s\S]*?)\)/g;
  while ((m = helperRe.exec(text))) {
    const args = m[1];
    // string literals inside
    const strRe = /(['"])([^'"]+)\1/g;
    let s;
    while ((s = strRe.exec(args))) {
      for (const t of tokenizeClassish(s[2])) literal.add(t);
    }
    // template literals inside
    const tplRe = /`([^`]+)`/g;
    while ((s = tplRe.exec(args))) {
      extractTemplatePieces(s[1], literal, dynamicPrefixes);
    }
  }

  // class="..." (vanilla HTML in MDX, JSX prop typo, .innerHTML strings)
  const classAttrRe = /\bclass\s*=\s*(['"])([^'"]+)\1/g;
  while ((m = classAttrRe.exec(text))) {
    for (const t of tokenizeClassish(m[2])) literal.add(t);
  }

  // classList.add/remove/toggle/contains('foo' [, 'bar' ...])
  const classListRe = /\bclassList\s*\.\s*(?:add|remove|toggle|contains|replace)\s*\(([^)]+)\)/g;
  while ((m = classListRe.exec(text))) {
    const args = m[1];
    const strRe = /(['"])([^'"]+)\1/g;
    let s;
    while ((s = strRe.exec(args))) {
      for (const t of tokenizeClassish(s[2])) literal.add(t);
    }
  }

  // querySelector / querySelectorAll / matches / closest with .foo or [class*="foo"]
  const selectorMethodRe = /\.\s*(?:querySelector(?:All)?|matches|closest)\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;
  while ((m = selectorMethodRe.exec(text))) {
    const sel = m[2];
    // Pull `.foo` and [class*="foo"] tokens
    const dotRe = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
    let dm;
    while ((dm = dotRe.exec(sel))) literal.add(dm[1]);
    const attrRe = /\[class\*?=["']([^"']+)["']\]/g;
    while ((dm = attrRe.exec(sel))) {
      for (const t of tokenizeClassish(dm[1])) literal.add(t);
    }
  }

  // .className.includes('foo') / .className === 'foo' / .className.startsWith('foo')
  const classNameMatchRe = /\.\s*className\s*\.\s*(?:includes|startsWith|endsWith)\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  while ((m = classNameMatchRe.exec(text))) {
    for (const t of tokenizeClassish(m[2])) literal.add(t);
  }

  // Plain string literals containing recognizable Loom class prefixes —
  // anything that pattern-matches "loom-…", "sidebar-…", "material-…", "toc",
  // "doc-…", "weave-…", "atlas-…", "panel-…", "shell-…" tokens. We harvest
  // generously here because these strings can be passed to setAttribute,
  // template substitution, etc.
  const PREFIX_RES = [
    /\bloom-[a-zA-Z0-9_-]+/g,
    /\bsidebar-[a-zA-Z0-9_-]+/g,
    /\bmaterial-[a-zA-Z0-9_-]+/g,
    /\bweave-[a-zA-Z0-9_-]+/g,
    /\batlas-[a-zA-Z0-9_-]+/g,
    /\bpanel-[a-zA-Z0-9_-]+/g,
    /\blayout-[a-zA-Z0-9_-]+/g,
    /\bshell-[a-zA-Z0-9_-]+/g,
    /\btoc[a-zA-Z0-9_-]*/g,
    /\bdoc-[a-zA-Z0-9_-]+/g,
    /\bnote-[a-zA-Z0-9_-]+/g,
    /\bchapter-[a-zA-Z0-9_-]+/g,
    /\bdesk-[a-zA-Z0-9_-]+/g,
    /\bbrowse-[a-zA-Z0-9_-]+/g,
    /\bquiet-[a-zA-Z0-9_-]+/g,
    /\bvellum-[a-zA-Z0-9_-]+/g,
    /\bglass\b/g,
    /\bt-[a-z]+\d*/g,
    /\bmobile-[a-zA-Z0-9_-]+/g,
    /\bcollection-[a-zA-Z0-9_-]+/g,
    /\bsource-[a-zA-Z0-9_-]+/g,
    /\bshuttle-[a-zA-Z0-9_-]+/g,
    /\bmaterial-[a-zA-Z0-9_-]+/g,
    /\bfocus-[a-zA-Z0-9_-]+/g,
    // Common state-flag classes (added at runtime via classList or template).
    /(?<![a-zA-Z0-9_-])is-[a-zA-Z0-9_-]+/g,
    /(?<![a-zA-Z0-9_-])has-[a-zA-Z0-9_-]+/g,
  ];
  for (const re of PREFIX_RES) {
    let mm;
    while ((mm = re.exec(text))) {
      literal.add(mm[0]);
    }
  }

  return { literal, dynamicPrefixes };
}

function extractTemplatePieces(tplBody, literal, dynamicPrefixes) {
  // Split by ${...}. The placeholder positions can precede or follow '--'
  // to form BEM modifiers.
  // We:
  //   1. Pull all class-shaped tokens from static fragments (literal).
  //   2. Detect "base--${var}" or "${var}-base" and add wildcard prefixes.

  const placeholderRe = /\$\{[^}]+\}/g;
  // For dynamic-prefix detection, work on full body
  const tokensWithPlaceholders = tplBody;

  // base--${var}  (case A)
  const caseA = /([A-Za-z][A-Za-z0-9_-]+)--\$\{[^}]+\}/g;
  let m;
  while ((m = caseA.exec(tokensWithPlaceholders))) {
    dynamicPrefixes.add(`${m[1]}--`);
  }
  // base-${var}-suffix    (case B) – conservative: only if base looks Loom-y
  const caseB = /([A-Za-z][A-Za-z0-9_-]+)-\$\{[^}]+\}/g;
  while ((m = caseB.exec(tokensWithPlaceholders))) {
    if (/^(loom|sidebar|atlas|weave|panel|note|desk|browse|quiet|vellum|chapter|shuttle|source|collection|material|t)-/.test(
        m[1] + '-')) {
      // record as wildcard prefix without --, double-flagged
      dynamicPrefixes.add(`${m[1]}-`);
    }
  }

  // Also pull literal tokens from each static fragment.
  const fragments = tplBody.split(placeholderRe);
  for (const frag of fragments) {
    for (const t of tokenizeClassish(frag)) {
      literal.add(t);
    }
  }
}

function extractFromTestFile(text, file) {
  const literal = new Set();
  const dynamicPrefixes = new Set();
  const contracts = [];

  // Reuse JSX/TSX extractor first (test files do read CSS, do build JSX)
  const tsx = extractFromTsx(text);
  for (const t of tsx.literal) literal.add(t);
  for (const p of tsx.dynamicPrefixes) dynamicPrefixes.add(p);

  // Then walk assert.match( …, /regex/ ) and assert.doesNotMatch(…, /regex/)
  // and pull class-name tokens out of the regex source. Conservative: any
  // class-name-shaped substring is a contract.
  const matchCallRe = /assert\.(?:match|doesNotMatch)\s*\(\s*[^,]+,\s*\/((?:\\\/|[^/])+)\/[a-z]*\s*[,)]/g;
  let m;
  let lineFor = (idx) => text.slice(0, idx).split('\n').length;
  while ((m = matchCallRe.exec(text))) {
    const regexSrc = m[1];
    // Within regex source, extract class-name tokens (ignore regex escapes
    // on \. \/ \\ etc).
    // Strip backslash-escapes
    const stripped = regexSrc.replace(/\\([\\/.{}*+?^$|()\[\]])/g, '$1');
    const tokens = tokenizeClassish(stripped);
    const line = lineFor(m.index);
    for (const t of tokens) {
      literal.add(t);
      contracts.push({
        selector: t,
        test_file: path.relative(repoRoot, file),
        line,
        kind: 'assert.match-or-doesNotMatch',
      });
    }
  }

  return { literal, dynamicPrefixes, contracts };
}

function extractFromSwift(text) {
  const literal = new Set();
  // Conservatively: any "loom-…" / "sidebar-…" / "material-…" / "glass" / etc.
  // appearing inside Swift source (likely string literal but we don't insist).
  const PREFIX_RES = [
    /\bloom-[a-zA-Z0-9_-]+/g,
    /\bsidebar-[a-zA-Z0-9_-]+/g,
    /\bmaterial-[a-zA-Z0-9_-]+/g,
    /\bweave-[a-zA-Z0-9_-]+/g,
    /\batlas-[a-zA-Z0-9_-]+/g,
    /\bpanel-[a-zA-Z0-9_-]+/g,
    /\blayout-[a-zA-Z0-9_-]+/g,
    /\bshell-[a-zA-Z0-9_-]+/g,
    /\btoc[a-zA-Z0-9_-]*/g,
    /\bdoc-[a-zA-Z0-9_-]+/g,
    /\bglass\b/g,
    /\bt-[a-z]+\d*/g,
    /\bquiet-[a-zA-Z0-9_-]+/g,
    /\bvellum-[a-zA-Z0-9_-]+/g,
    /\bnote-[a-zA-Z0-9_-]+/g,
  ];
  for (const re of PREFIX_RES) {
    let m;
    while ((m = re.exec(text))) {
      literal.add(m[0]);
    }
  }
  return { literal, dynamicPrefixes: new Set() };
}

function extractFromMdx(text) {
  return extractFromTsx(text); // MDX supports JSX-shape attrs; same logic OK
}

// ---- globals.css selector enumeration ----

function parseGlobalsCss(text) {
  const classes = new Set();
  // Strip /* … */ comments first to avoid false hits, but keep position info
  // approximately by replacing with same-length spaces.
  // Strip /* ... */ comments while preserving newlines (line counting depends on it).
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (s) =>
    s.replace(/[^\n]/g, ' '),
  );

  // Match selector run before each "{". Selectors end at "{" or ";" (for
  // at-rules), but we only care about rule blocks with "{".
  // Simpler: a class selector token is ".[A-Za-z_][A-Za-z0-9_-]*". Just
  // extract every token that matches that, ignoring those inside strings.
  // (globals.css contains url("...") attrs but no class-shaped strings.)

  // We also collect rule blocks: each top-level "{ … }" pair, with the
  // selector text immediately preceding the "{".
  const blocks = []; // { selectors: [...], classes: Set, line_start, line_end }

  // Tokenize @-rules and rule blocks at depth 0/1. We need balanced-brace
  // tracking because @media/@supports nest blocks.
  const len = stripped.length;
  let i = 0;
  let depth = 0;
  let blockStart = -1;
  let selectorStart = 0;
  // We'll emit an "outer rule" each time depth goes 0 -> 1 with the preceding
  // text as its selector, and close it when depth returns to 0.
  // For nested @media etc., we still want the inner classes captured but the
  // *block boundaries* tracked are top-level (depth 0->1).
  let outerSelectorText = '';
  let outerStartLine = 0;
  let outerStartIdx = 0;

  function lineOf(idx) {
    return stripped.slice(0, idx).split('\n').length;
  }

  while (i < len) {
    const ch = stripped[i];
    if (ch === '{') {
      if (depth === 0) {
        outerSelectorText = stripped.slice(selectorStart, i).trim();
        outerStartIdx = selectorStart;
        outerStartLine = lineOf(selectorStart);
      }
      depth++;
      i++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        const blockEndIdx = i;
        const endLine = lineOf(blockEndIdx);
        // Pull classes that appear within the entire block (selector + body)
        const blockText = stripped.slice(outerStartIdx, blockEndIdx + 1);
        const classRe = /\.([A-Za-z_][A-Za-z0-9_-]*)/g;
        const blockClasses = new Set();
        let cm;
        while ((cm = classRe.exec(blockText))) {
          blockClasses.add(cm[1]);
          classes.add(cm[1]);
        }
        // Also in the selector itself
        const selectorClasses = new Set();
        let sm;
        const selRe = /\.([A-Za-z_][A-Za-z0-9_-]*)/g;
        while ((sm = selRe.exec(outerSelectorText))) {
          selectorClasses.add(sm[1]);
        }
        blocks.push({
          selectorText: outerSelectorText,
          startLine: outerStartLine,
          endLine,
          startIdx: outerStartIdx,
          endIdx: blockEndIdx + 1,
          selectorClasses: [...selectorClasses],
          allClasses: [...blockClasses],
        });
        selectorStart = i + 1;
      }
      i++;
      continue;
    }
    if (ch === ';' && depth === 0) {
      // bare at-rule like @charset; — reset selector start
      selectorStart = i + 1;
    }
    i++;
  }

  return { classes: [...classes], blocks };
}

// ---- Main ----

const literal = new Set();
const dynamicPrefixes = new Set();
const contracts = [];
let scannedFiles = 0;
const start = Date.now();

for (const root of SCAN_ROOTS) {
  for (const file of walk(root.dir, root.exts)) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    scannedFiles++;
    const isTest = /\.test\.(?:ts|tsx|mts|mjs)$/.test(file);
    const isSwift = file.endsWith('.swift');
    const isMd = file.endsWith('.md') || file.endsWith('.mdx');

    if (isTest) {
      const r = extractFromTestFile(text, file);
      for (const t of r.literal) literal.add(t);
      for (const p of r.dynamicPrefixes) dynamicPrefixes.add(p);
      contracts.push(...r.contracts);
    } else if (isSwift) {
      const r = extractFromSwift(text);
      for (const t of r.literal) literal.add(t);
    } else if (isMd) {
      const r = extractFromMdx(text);
      for (const t of r.literal) literal.add(t);
      for (const p of r.dynamicPrefixes) dynamicPrefixes.add(p);
    } else {
      const r = extractFromTsx(text);
      for (const t of r.literal) literal.add(t);
      for (const p of r.dynamicPrefixes) dynamicPrefixes.add(p);
    }
  }
}

// Parse globals.css
const globalsCssPath = path.join(repoRoot, 'app/globals.css');
const globalsCssText = fs.readFileSync(globalsCssPath, 'utf8');
const { classes: globalsCssClasses, blocks } = parseGlobalsCss(globalsCssText);

// Compute dead set
const FROZEN_CONTRACT_CLASSES = new Set([
  // From tests/globals-compatibility.test.ts:
  'loom-highlight-passage',
  'note-rendered',
  'dark',
  'light',
  'layout-shell__main',
  'sidebar-pinned',
  'sidebar-shell__inner',
  'sidebar-section__body',
  'toc',
  'doc-outline',
  'loom-doc-nav',
  'loom-study-mode',
  'reading-mode',
  'glass',
  'material-thick',
  't-caption2',
  't-footnote',
  'loom-grain',
  // From tests/quiet-horizon-layout.test.tsx
  'loom-quiet-scene',
  'loom-quiet-scene--atlas',
  'loom-quiet-scene__column',
  'loom-today',
  'loom-today--embedded',
  'loom-patterns',
  // From tests/sidebar-accessibility.test.ts
  'mobile-menu-btn',
]);

// Hard-limit prefixes that must NEVER be flagged dead, per task constraints.
const FROZEN_PREFIXES = [
  'sidebar-shell__',
  'sidebar-shell--',
  'sidebar-shell',
  'sidebar-section__',
  'sidebar-section--',
  'sidebar-section',
  'layout-shell__',
  'layout-shell--',
  'layout-shell',
];

function isAlive(cls) {
  if (FROZEN_CONTRACT_CLASSES.has(cls)) return true;
  for (const p of FROZEN_PREFIXES) {
    if (cls === p || cls.startsWith(p)) return true;
  }
  if (literal.has(cls)) return true;
  for (const prefix of dynamicPrefixes) {
    if (cls.startsWith(prefix) && cls.length > prefix.length) return true;
    if (cls === prefix.replace(/--?$/, '')) return true;
  }
  // Also check if cls contains '--', the BEM base might be alive
  // (e.g. "loom-soan-card--thesis" — base "loom-soan-card" is alive).
  const dashDashIdx = cls.indexOf('--');
  if (dashDashIdx > 0) {
    const base = cls.slice(0, dashDashIdx);
    if (literal.has(base)) return true;
  }
  // Underscore-underscore (BEM element) — preserve if base is alive
  const underscoreIdx = cls.indexOf('__');
  if (underscoreIdx > 0) {
    const base = cls.slice(0, underscoreIdx);
    if (literal.has(base)) return true;
    if (FROZEN_CONTRACT_CLASSES.has(base)) return true;
  }
  return false;
}

const deadClasses = globalsCssClasses.filter((c) => !isAlive(c)).sort();

// Identify dead rule blocks: blocks where every class in selectorText is dead
// AND the selector is purely class-based (no element/pseudo-class outside
// known patterns).
const deadBlocks = [];
for (const b of blocks) {
  // skip non-class selectors entirely (`:root`, `html`, `body`, `*`, etc.)
  // and at-rules (selectorText starts with '@')
  const sel = b.selectorText;
  if (!sel) continue;
  if (sel.startsWith('@')) continue;
  // Must have at least one class and the WHOLE selector must reference only
  // classes (plus pseudo-modifiers like :hover, ::before). Compound selectors
  // separated by ',' are split and each must be class-rooted dead.
  const parts = sel.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) continue;
  let allPartsDead = true;
  let anyClass = false;
  for (const p of parts) {
    // collect class tokens in this part
    const partClasses = [...p.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => m[1]);
    if (!partClasses.length) {
      allPartsDead = false;
      break;
    }
    // Selector must START with '.' (no element type prefix like 'body.x')
    if (!p.trim().startsWith('.')) {
      allPartsDead = false;
      break;
    }
    anyClass = true;
    for (const c of partClasses) {
      if (isAlive(c)) {
        allPartsDead = false;
        break;
      }
    }
    if (!allPartsDead) break;
  }
  if (allPartsDead && anyClass) {
    deadBlocks.push({
      selectorText: sel.replace(/\s+/g, ' ').slice(0, 240),
      startLine: b.startLine,
      endLine: b.endLine,
      startIdx: b.startIdx,
      endIdx: b.endIdx,
      classes: b.selectorClasses,
    });
  }
}

const elapsed = Date.now() - start;

const report = {
  meta: {
    scanned_files: scannedFiles,
    elapsed_ms: elapsed,
    repo_root: repoRoot,
    globals_css_path: path.relative(repoRoot, globalsCssPath),
    globals_css_lines: globalsCssText.split('\n').length,
  },
  literal: [...literal].sort(),
  dynamic_prefixes: [...dynamicPrefixes].sort(),
  test_contracts: contracts,
  globals_css_classes: globalsCssClasses.sort(),
  dead_classes: deadClasses,
  dead_blocks: deadBlocks,
};

const outPath = '/tmp/css-class-scan.json';
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(`Scanned ${scannedFiles} files in ${elapsed}ms`);
console.log(`Literal class tokens harvested: ${literal.size}`);
console.log(`Dynamic prefixes (wildcard live): ${dynamicPrefixes.size}`);
console.log(`Test-contract entries: ${contracts.length}`);
console.log(`globals.css classes defined: ${globalsCssClasses.length}`);
console.log(`Dead classes (candidates): ${deadClasses.length}`);
console.log(`Dead rule blocks (candidates): ${deadBlocks.length}`);
console.log(`Wrote ${outPath}`);
