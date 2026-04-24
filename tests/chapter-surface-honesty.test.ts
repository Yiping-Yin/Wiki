import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function walk(relativePath: string): string[] {
  const abs = path.join(repoRoot, relativePath);
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const childRelative = path.join(relativePath, entry.name);
    out.push(childRelative);
    if (entry.isDirectory()) {
      out.push(...walk(childRelative));
    }
  }
  return out;
}

test('Panel detail no longer falls back to static placeholder panels or fake weft provenance', () => {
  const sourceText = read('app/PanelDetailClient.tsx');

  assert.doesNotMatch(sourceText, /const PANELS: Record<string, PanelDetail>/);
  assert.doesNotMatch(sourceText, /source pending/);
  assert.doesNotMatch(sourceText, /This panel has not yet settled\./);
  assert.doesNotMatch(sourceText, /It may still be ripening, or it was never drawn\./);
  assert.match(sourceText, /No held panel matches this route\./);
});

test('Letter surface does not fabricate a recipient or draft prose around a held panel preview', () => {
  const sourceText = read('app/LetterClient.tsx');

  assert.doesNotMatch(sourceText, /recipient not yet chosen/);
  assert.doesNotMatch(sourceText, /Dear —/);
  assert.doesNotMatch(sourceText, /I want to send you a held panel rather than a summary\./);
  assert.doesNotMatch(sourceText, /delivery stays private until chosen/);
  assert.match(sourceText, /does not yet store recipients or delivery drafts/i);
});

test('Weaves honors real focus targets and does not draw synthetic radial links', () => {
  const sourceText = read('app/WeavesClient.tsx');

  assert.match(sourceText, /panel\.id === focusTarget \|\| panel\.docId === focusTarget/);
  assert.doesNotMatch(sourceText, /strokeDasharray="2 4"/);
  assert.doesNotMatch(sourceText, /visible geometry/);
});

test('canonical chapter pages no longer advertise placeholder seed data as their runtime model', () => {
  const pursuitsPage = read('app/pursuits/page.tsx');
  const patternsPage = read('app/patterns/page.tsx');
  const weavesPage = read('app/weaves/page.tsx');
  const soanPage = read('app/soan/page.tsx');
  const pursuitDetail = read('app/PursuitDetailClient.tsx');

  assert.doesNotMatch(pursuitsPage, /11 placeholder questions/);
  assert.doesNotMatch(patternsPage, /placeholder panels/);
  assert.doesNotMatch(weavesPage, /placeholder data/);
  assert.doesNotMatch(soanPage, /static — pixel-placed placeholder cards/);
  assert.doesNotMatch(pursuitDetail, /sources \/ panels lists are still stub data/i);
});

test('repo no longer carries shadow source routes with a \" 2\" suffix', () => {
  const shadowEntries = ['app', 'components', 'lib', 'tests']
    .flatMap((root) => walk(root))
    .filter((entry) => /(^|\/)[^/]+ 2($|\/)/.test(entry));

  assert.deepEqual(shadowEntries, []);
});
