import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';

import AboutClient from '../app/about/AboutClient';
import ProductHistoryPage from '../app/product-history/page';

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

function visibleText(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
}

test('new Loom skeleton exposes product narrative copy on stable routes', () => {
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = require('react-dom/server') as {
    renderToStaticMarkup: (node: React.ReactElement) => string;
  };

  const aboutText = visibleText(renderToStaticMarkup(React.createElement(AboutClient)));
  const productHistoryText = visibleText(renderToStaticMarkup(React.createElement(ProductHistoryPage)));

  assert.ok(Object.hasOwn(files, 'app/about/AboutClient.tsx'));
  assert.ok(Object.hasOwn(files, 'app/product-history/page.tsx'));
  assert.match(files['app/about/AboutClient.tsx'], /ordinary portfolios only show results/);
  assert.match(files['app/about/AboutClient.tsx'], /Loom connects identity, proof, and conversation/);
  assert.match(files['app/product-history/page.tsx'], /Portfolio with proof/);
  assert.match(files['app/product-history/page.tsx'], /Source to identity/);
  assert.match(files['app/product-history/page.tsx'], /AI persona/);

  assert.match(aboutText, /Ordinary portfolios only show results/);
  assert.match(aboutText, /Ordinary notes only help the owner/);
  assert.match(aboutText, /Ordinary chatbots do not know/);
  assert.match(aboutText, /Loom connects identity, proof, and conversation/);
  assert.match(productHistoryText, /Why Loom is called Loom\./);
  assert.match(productHistoryText, /Portfolio with proof/);
  assert.match(productHistoryText, /Source to identity/);
  assert.match(productHistoryText, /AI persona/);
  assert.match(productHistoryText, /Yiping's Loom is the first reference instance/);
});
