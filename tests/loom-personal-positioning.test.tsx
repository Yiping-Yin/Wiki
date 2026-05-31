import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';

import AboutClient from '../app/about/AboutClient';
import { HomeClient } from '../app/HomeClient';
import ProductHistoryPage from '../app/product-history/page';

const repoRoot = path.resolve(__dirname, '..');

function readText(relativePath: string) {
  const filePath = path.join(repoRoot, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function visibleText(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
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
  const aboutSource = readText('app/about/AboutClient.tsx');
  const productHistorySource = readText('app/product-history/page.tsx');
  const productHistoryDoc = readText('docs/product-history.md');
  const readme = readText('README.md');
  const productDefinition = readText('LOOM.md');
  const productRules = readText('LOOM_RULES.md');
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = require('react-dom/server') as {
    renderToStaticMarkup: (node: React.ReactElement) => string;
  };

  const aboutText = visibleText(renderToStaticMarkup(<AboutClient />));
  const productHistoryText = visibleText(renderToStaticMarkup(<ProductHistoryPage />));

  assert.match(aboutText, /Ordinary portfolios only show results/);
  assert.match(aboutText, /Ordinary notes only help the owner/);
  assert.match(aboutText, /Ordinary chatbots do not know/);
  assert.match(aboutText, /Loom connects identity, proof, and conversation/);
  assert.match(productHistoryText, /Why Loom is called Loom\./);
  assert.match(productHistoryText, /Portfolio with proof/);
  assert.match(productHistoryText, /Source to identity/);
  assert.match(productHistoryText, /AI persona/);
  assert.match(productHistoryText, /Yiping's Loom is the first reference instance/);

  assert.match(aboutSource, /ordinary portfolios only show results/i);
  assert.match(aboutSource, /ordinary notes only help the owner/i);
  assert.match(aboutSource, /ordinary chatbots do not know/i);
  assert.match(aboutSource, /Loom connects identity, proof, and conversation/i);
  assert.match(productHistorySource, /Portfolio with proof/i);
  assert.match(productHistorySource, /Source to identity/i);
  assert.match(productHistorySource, /AI persona/i);
  assert.match(productHistorySource, /Yiping's Loom is the first reference instance/i);
  assert.match(productHistoryDoc, /Three-Layer Product Narrative/i);
  assert.match(productHistoryDoc, /Yiping's Loom is the first reference instance, not the product boundary/i);
  assert.match(readme, /portfolio people can inspect/i);
  assert.match(readme, /knowledge base people can trust/i);
  assert.match(readme, /personal AI people can talk to/i);
  assert.doesNotMatch(readme, /not an AI assistant/i);
  assert.match(productDefinition, /Yiping's Loom is the first reference instance/i);
  assert.match(productRules, /not the product boundary/i);
});
