import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

const filePaths = [
  'app/about/AboutClient.tsx',
  'app/product-history/page.tsx',
] as const;

const files = Object.fromEntries(
  filePaths.map((relativePath) => {
    const filePath = path.join(repoRoot, relativePath);
    return [relativePath, fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''];
  }),
) as Record<(typeof filePaths)[number], string>;

test('new Loom skeleton exposes product narrative copy on stable routes', () => {
  assert.match(files['app/about/AboutClient.tsx'], /ordinary portfolios only show results/);
  assert.match(files['app/about/AboutClient.tsx'], /Loom connects identity, proof, and conversation/);
  assert.match(files['app/product-history/page.tsx'], /Portfolio with proof/);
  assert.match(files['app/product-history/page.tsx'], /Source to identity/);
  assert.match(files['app/product-history/page.tsx'], /AI persona/);
});
