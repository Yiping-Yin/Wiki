import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Atelier is no longer a mockup-only surface with hardcoded fake source cards', () => {
  const sourceText = fs.readFileSync(path.join(repoRoot, 'app/AtelierClient.tsx'), 'utf8');

  assert.doesNotMatch(sourceText, /Mockup-level: no persistence/);
  assert.doesNotMatch(sourceText, /const SOURCES = \[/);
  assert.match(sourceText, /loadPanelRecords/);
  assert.doesNotMatch(sourceText, /readLoomMirror/);
});
