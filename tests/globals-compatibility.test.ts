import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');
const globalsCss = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');

test('global CSS preserves shared compatibility contracts outside the home route', () => {
  const requiredContracts: Array<[label: string, pattern: RegExp]> = [
    ['overlay fade-in animation', /@keyframes\s+loom-overlay-fade-in\s*\{/],
    ['modal exit animation', /@keyframes\s+loom-modal-exit\s*\{/],
    ['pulse animation', /@keyframes\s+loomPulse\s*\{/],
    ['pin burst animation', /@keyframes\s+pinBurst\s*\{/],
    ['pin halo animation', /@keyframes\s+pinHalo\s*\{/],
    ['highlight passage utility', /\.loom-highlight-passage\s*\{/],
    ['highlight passage animation', /@keyframes\s+loom-highlight-passage\s*\{/],
    ['note-rendered KaTeX contract', /\.note-rendered\s+\.katex-display\s*\{/],
    ['note-rendered markdown contract', /\.note-rendered\s+h1\s*\{/],
    ['manual dark theme contract', /\.dark\s*\{[\s\S]*--bg:/],
    ['auto dark media query gated behind explicit light\/dark classes', /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*html:not\(\.light\):not\(\.dark\)\s*\{/],
    ['layout shell main contract', /\.layout-shell__main\s*\{[\s\S]*min-height:\s*100vh/],
    ['pinned sidebar layout offset', /body\.sidebar-pinned\s+\.layout-shell__main\s*\{[\s\S]*margin-left:\s*var\(--sidebar-shell-width\)/],
    ['sidebar shell contract', /\.sidebar-shell__inner\s*\{/],
    ['sidebar section contract', /\.sidebar-section__body\s*\{/],
    ['toc contract', /\.toc\s*\{/],
    ['doc outline contract', /\.doc-outline\b|\.loom-doc-nav\s*\{/],
    ['study mode toc hiding contract', /body\.loom-study-mode\s+\.toc\b/],
    ['reading mode doc chrome hiding contract', /body\.reading-mode\s+\.doc-outline\b/],
    ['glass utility', /\.glass\s*\{/],
    ['material thick utility contract', /\.material-thick\s*\{[\s\S]*background:\s*var\(--mat-thick-bg\)[\s\S]*backdrop-filter:\s*var\(--mat-blur-thick\)[\s\S]*border:\s*0\.5px solid var\(--mat-border\)/],
    ['caption2 utility', /\.t-caption2\s*\{[\s\S]*font-size:\s*var\(--t-caption2\)/],
    ['adjacent typography utilities', /\.t-footnote\s*\{[\s\S]*font-size:\s*var\(--t-footnote\)/],
    ['toastIn animation', /@keyframes\s+toastIn\s*\{/],
    ['lpFade animation', /@keyframes\s+lpFade\s*\{/],
    ['grain drift animation', /@keyframes\s+grain-drift\s*\{/],
  ];

  for (const [label, pattern] of requiredContracts) {
    assert.match(globalsCss, pattern, `Expected ${label} in app/globals.css`);
  }
});
