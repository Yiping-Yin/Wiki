import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';

import AboutClient from '../app/about/AboutClient';
import { HomeClient, formatNativeActivitySummary } from '../app/HomeClient';
import ProductHistoryPage from '../app/product-history/page';

const repoRoot = path.resolve(__dirname, '..');

function readText(relativePath: string) {
  const filePath = path.join(repoRoot, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function visibleText(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
}

function readmeSection(readme: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^## ${escaped}\\n([\\s\\S]*?)(?=\\n## |\\n# |(?![\\s\\S]))`, 'm');
  const match = readme.match(pattern);
  assert.ok(match, `README should include ${heading}`);
  return match[1];
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
  assert.doesNotMatch(visibleText(html), /Collect sources/i);
  assert.doesNotMatch(visibleText(html), /\b(?:panel|panels|pursuit|pursuits|weave|weaves)\b/i);
  assert.doesNotMatch(
    formatNativeActivitySummary({ panelCount: 1, pursuitCount: 2, weaveCount: 1 }),
    /\b(?:panel|panels|pursuit|pursuits|weave|weaves)\b/i,
  );
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
  assert.match(aboutText, /Draft is earned/);
  assert.match(aboutText, /Relations are evidenced/);
  assert.doesNotMatch(aboutText, /Panels are earned/i);
  assert.doesNotMatch(aboutText, /\bweave\b/i);
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

  const currentSurfaces = readmeSection(readme, 'Current surfaces');
  const howItWorks = readmeSection(readme, 'How it works');
  const whatThisIsNot = readmeSection(readme, 'What this is not');
  const closingTagline = readme.match(/> \*.*\*\s*$/m)?.[0] ?? '';

  assert.doesNotMatch(currentSurfaces, /crystallized panels/i);
  assert.doesNotMatch(currentSurfaces, /\bpanel\b/i);
  assert.doesNotMatch(currentSurfaces, /\/patterns/i);
  assert.doesNotMatch(currentSurfaces, /\bPatterns\b/);
  assert.doesNotMatch(currentSurfaces, /\bweaver\b/i);
  assert.doesNotMatch(currentSurfaces, /\bwoven\b/i);
  assert.doesNotMatch(howItWorks, /Patterns archive/i);
  assert.doesNotMatch(howItWorks, /\/patterns/i);
  assert.doesNotMatch(howItWorks, /\bPatterns\b/);
  assert.doesNotMatch(howItWorks, /\bpanel\b/i);
  assert.doesNotMatch(howItWorks, /\bweaver\b/i);
  assert.doesNotMatch(howItWorks, /\bwoven\b/i);
  assert.doesNotMatch(closingTagline, /\/patterns/i);
  assert.doesNotMatch(closingTagline, /\bPatterns\b/);
  assert.doesNotMatch(closingTagline, /\bpanel\b/i);
  assert.doesNotMatch(closingTagline, /\bweaver\b/i);
  assert.doesNotMatch(closingTagline, /\bwoven\b/i);
  assert.doesNotMatch(whatThisIsNot, /pattern archive is woven by you/i);
  assert.doesNotMatch(whatThisIsNot, /second weaver/i);

  assert.match(productDefinition, /Yiping's Loom is the first reference instance/i);
  assert.match(productRules, /not the product boundary/i);
});

test('canonical Loom docs publish Sources and Draft as current visible vocabulary', () => {
  const productDefinition = readText('LOOM.md');
  const productRules = readText('LOOM_RULES.md');
  const loomDoc = readText('docs/loom.md');

  assert.match(productDefinition, /Sources.*Draft|Draft.*Sources/is);
  assert.match(productRules, /Sources.*Draft|Draft.*Sources/is);
  assert.match(loomDoc, /Sources.*Draft|Draft.*Sources/is);
  assert.doesNotMatch(loomDoc, /^.*shipped UI uses.*Collect \/ Organize \/ Draft.*$/im);
  assert.doesNotMatch(loomDoc, /^.*Current shipped vocab.*Collect \/ Organize \/ Draft.*$/im);
  assert.doesNotMatch(loomDoc, /当前\s+Collect/i);
  assert.doesNotMatch(loomDoc, /当前\s+Organize/i);
  assert.doesNotMatch(loomDoc, /Collect\s*=/i);
  assert.doesNotMatch(loomDoc, /Organize\s*=/i);
  assert.doesNotMatch(loomDoc, /Collect\s*:/i);
  assert.doesNotMatch(loomDoc, /Draft surface.*不存在/is);
  assert.doesNotMatch(loomDoc, /^####\s+Phase 7.*Pursuits/im);

  const plateIvInventory = loomDoc.match(/## Plate IV[\s\S]*?(?=### Superseded historical entries)/)?.[0] ?? '';
  assert.ok(plateIvInventory, 'Plate IV should expose a current inventory before historical notes');
  assert.doesNotMatch(plateIvInventory, /^\| \*\*Pursuits\*\*/m);
  assert.doesNotMatch(plateIvInventory, /^\| \*\*Shuttle\b/m);
  assert.doesNotMatch(plateIvInventory, /^\| \*\*Interlace\b/m);
});
