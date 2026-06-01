import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';

import { HomeClient, formatNativeActivitySummary } from '../app/HomeClient';

const repoRoot = path.resolve(__dirname, '..');

function visibleText(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
}

test('HomeClient first paint is not a blank shell when client state has not hydrated yet', () => {
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = require('react-dom/server') as {
    renderToStaticMarkup: (node: React.ReactElement) => string;
  };

  const html = renderToStaticMarkup(<HomeClient />);
  const text = visibleText(html);

  assert.match(html, /personal knowledge identity platform/i);
  assert.match(html, /portfolio people can inspect/i);
  assert.match(html, /knowledge base people can trust/i);
  assert.match(html, /personal AI people can talk to/i);
  assert.match(html, /first reference instance/i);
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

  for (const model of ['Overview', 'Path', 'Sources', 'Process', 'Outputs']) {
    assert.match(html, new RegExp(model));
  }

  assert.match(text, /Sources/);
  assert.match(text, /Draft/);
  assert.doesNotMatch(text, /\b(?:panel|panels|pursuit|pursuits|weave|weaves)\b/i);
  assert.doesNotMatch(html, />\s*&nbsp;\s*</i);
});

test('HomeClient hydrated native activity uses Sources and Draft vocabulary', () => {
  const text = formatNativeActivitySummary({
    panelCount: 2,
    pursuitCount: 1,
    weaveCount: 3,
  });

  assert.equal(text, 'Draft: 2 items, Process: 1 path, Sources: 3 links');
  assert.match(text, /Sources/);
  assert.match(text, /Draft/);
  assert.doesNotMatch(text, /\b(?:panel|panels|pursuit|pursuits|weave|weaves)\b/i);
});

test('HomeClient Open Sources uses literal Sources navigation, not Shuttle', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'app/HomeClient.tsx'), 'utf8');
  const openSourcesMatch = source.match(/const handleOpenSources = \(\) => \{[\s\S]*?\n  \};/);

  assert.ok(openSourcesMatch, 'HomeClient should define handleOpenSources');
  assert.doesNotMatch(source, /import\s+\{\s*openShuttle\s*\}/);
  assert.doesNotMatch(openSourcesMatch[0], /\bopenShuttle\s*\(/);
  assert.match(openSourcesMatch[0], /const href = '\/knowledge'/);
  assert.match(openSourcesMatch[0], /callNativeBridge\('navigate', \{ href \}\)/);
  assert.match(openSourcesMatch[0], /window\.location\.href = href/);
});
