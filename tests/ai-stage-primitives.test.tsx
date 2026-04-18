import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';

import { AiInlineHint } from '../components/unified/AiStagePrimitives';

test('AiInlineHint renders an action button when a notice exposes one', () => {
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = require('react-dom/server') as {
    renderToStaticMarkup: (node: React.ReactElement) => string;
  };

  const html = renderToStaticMarkup(
    <AiInlineHint tone="error" actionLabel="Open Settings" onAction={() => {}}>
      AI unavailable — Codex and Claude are not authenticated.
    </AiInlineHint>,
  );

  assert.match(html, /AI unavailable/i);
  assert.match(html, /<button/i);
  assert.match(html, />Open Settings</i);
});
