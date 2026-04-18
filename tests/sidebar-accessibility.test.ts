import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

test('desktop CSS does not hard-hide the sidebar menu trigger', () => {
  const cssPath = path.join(process.cwd(), 'app', 'globals.css');
  const css = readFileSync(cssPath, 'utf8');

  assert.equal(
    /@media\s*\(min-width:\s*901px\)\s*\{[\s\S]*?\.mobile-menu-btn\s*\{\s*display:\s*none\s*!important;[\s\S]*?\}/m.test(css),
    false,
  );
});
