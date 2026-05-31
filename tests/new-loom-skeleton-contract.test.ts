import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';

import AboutClient from '../app/about/AboutClient';
import ProductHistoryPage from '../app/product-history/page';

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
