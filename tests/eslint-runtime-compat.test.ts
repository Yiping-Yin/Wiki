import assert from 'node:assert/strict';
import test from 'node:test';

test('eslint runtime compatibility dependencies are installed', () => {
  const findLastPath = require.resolve('array.prototype.findlast');

  assert.ok(findLastPath.includes('array.prototype.findlast'));
});
