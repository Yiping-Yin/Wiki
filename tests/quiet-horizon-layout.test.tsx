import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';

import { KnowledgeHomeStatic } from '../app/knowledge/KnowledgeHomeStatic';

const repoRoot = path.resolve(__dirname, '..');

test('KnowledgeHomeStatic renders inside the atlas quiet-scene column', () => {
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = require('react-dom/server') as {
    renderToStaticMarkup: (node: React.ReactElement) => string;
  };

  const html = renderToStaticMarkup(
    <KnowledgeHomeStatic
      totalCollections={2}
      totalDocs={9}
      groups={[
        {
          label: 'Core',
          items: [
            { slug: 'transformers', label: 'Transformers', count: 4 },
            { slug: 'attention', label: 'Attention', count: 5 },
          ],
        },
      ]}
    />,
  );

  assert.match(html, /loom-quiet-scene--atlas/);
  assert.match(html, /loom-quiet-scene__column/);
});

test('global CSS defines the quiet-scene width token and scene classes', () => {
  const css = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');

  assert.match(css, /--quiet-scene-width/);
  assert.match(css, /\.loom-quiet-scene\b/);
  assert.match(css, /\.loom-quiet-scene__column\b/);
});

test('quiet-scene CSS stays page-neutral and keeps a viewport-height floor', () => {
  const css = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');

  assert.match(css, /\.loom-quiet-scene\s*\{[\s\S]*min-height:\s*calc\(100vh -/);
  assert.match(css, /\.loom-quiet-scene::before[\s\S]*radial-gradient/);
  assert.doesNotMatch(css, /--quiet-scene-tint/);
});

test('today and patterns keep their current route-level shells', () => {
  const todaySource = fs.readFileSync(path.join(repoRoot, 'app/today/TodayClient.tsx'), 'utf8');
  const patternsSource = fs.readFileSync(path.join(repoRoot, 'app/PatternsClient.tsx'), 'utf8');

  assert.match(
    todaySource,
    /className\s*=\s*embedded \? 'loom-today loom-today--embedded' : 'loom-today'/,
  );
  assert.match(patternsSource, /className="loom-patterns"/);
});

test('atlas uses the shared quiet column and route clients avoid page-level guide cards', () => {
  const todaySource = fs.readFileSync(path.join(repoRoot, 'app/today/TodayClient.tsx'), 'utf8');
  const atlasSource = fs.readFileSync(
    path.join(repoRoot, 'app/knowledge/KnowledgeHomeStatic.tsx'),
    'utf8',
  );
  const patternsSource = fs.readFileSync(path.join(repoRoot, 'app/PatternsClient.tsx'), 'utf8');

  assert.match(atlasSource, /QuietSceneColumn/);
  for (const source of [todaySource, atlasSource, patternsSource]) {
    assert.doesNotMatch(source, /guide-card|GuideCard/);
  }
});
