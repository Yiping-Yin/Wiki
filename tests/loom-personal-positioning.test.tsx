import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';

import { HomeClient } from '../app/HomeClient';

const repoRoot = path.resolve(__dirname, '..');

function readText(relativePath: string) {
  const filePath = path.join(repoRoot, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

test('HomeClient renders the mature Loom personal platform positioning', () => {
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = require('react-dom/server') as {
    renderToStaticMarkup: (node: React.ReactElement) => string;
  };

  const html = renderToStaticMarkup(<HomeClient />);

  assert.match(html, /personal knowledge identity platform/i);
  assert.match(html, /helps anyone/i);
  assert.match(html, /portfolio people can inspect/i);
  assert.match(html, /knowledge base people can trust/i);
  assert.match(html, /personal AI people can talk to/i);
  assert.match(html, /first reference instance/i);
  assert.match(html, /not the product boundary/i);
  assert.match(html, /Portfolio with proof/i);
  assert.match(html, /Source to identity/i);
  assert.match(html, /AI persona/i);

  assert.equal(html.match(/class="new-loom-shell__shelf"/g)?.length, 5);
  for (const href of [
    '/about',
    '/knowledge/unsw',
    '/knowledge/quantnet',
    '/knowledge/wqu',
    '/knowledge/claude',
  ]) {
    assert.match(html, new RegExp(`href="${href}"`));
  }

  for (const label of ['Overview', 'Path', 'Sources', 'Process', 'Outputs']) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /Sources/);
  assert.match(html, /Draft/);
});

test('About and product history routes present the approved three-layer narrative', () => {
  const about = readText('app/about/AboutClient.tsx');
  const productHistory = readText('app/product-history/page.tsx');
  const productHistoryDoc = readText('docs/product-history.md');

  assert.match(about, /ordinary portfolios only show results/i);
  assert.match(about, /ordinary notes only help the owner/i);
  assert.match(about, /ordinary chatbots do not know/i);
  assert.match(about, /Loom connects identity, proof, and conversation/i);
  assert.match(productHistory, /Portfolio with proof/i);
  assert.match(productHistory, /Source to identity/i);
  assert.match(productHistory, /AI persona/i);
  assert.match(productHistory, /Yiping's Loom is the first reference instance/i);
  assert.match(productHistoryDoc, /Three-Layer Product Narrative/i);
  assert.match(productHistoryDoc, /Yiping's Loom is the first reference instance, not the product boundary/i);
});
