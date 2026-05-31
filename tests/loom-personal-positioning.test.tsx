import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';

import { HomeClient } from '../app/HomeClient';

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
