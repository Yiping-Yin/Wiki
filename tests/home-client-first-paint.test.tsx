import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';

import { HomeClient } from '../app/HomeClient';

test('HomeClient first paint is not a blank shell when client state has not hydrated yet', () => {
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = require('react-dom/server') as {
    renderToStaticMarkup: (node: React.ReactElement) => string;
  };

  const html = renderToStaticMarkup(<HomeClient />);

  assert.match(html, /Open your first book\./);
  assert.match(html, /Reading is the center\./);
  assert.match(html, /The second weaver stays in the margin\./);
  assert.match(html, /What settles, settles\./);
  assert.doesNotMatch(html, />\s*&nbsp;\s*</i);
});
