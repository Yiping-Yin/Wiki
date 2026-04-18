import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  buildInstallFailure,
  isPermissionFallbackError,
} from '../scripts/install-loom-app.mjs';
import { resolveOutputRoot } from '../scripts/package-loom-app.mjs';

test('install script treats ditto permission stderr as fallback-eligible', () => {
  const error = buildInstallFailure(1, 'ditto: /Applications/Loom.app: Permission denied\n') as Error & { code?: string };

  assert.equal(error.code, 'EACCES');
  assert.equal(isPermissionFallbackError(error), true);
});

test('install script does not classify generic ditto failures as permission fallbacks', () => {
  const error = buildInstallFailure(1, 'ditto: some unrelated failure\n') as Error & { code?: string };

  assert.equal(isPermissionFallbackError(error), false);
});

test('package script resolves output under the repository root instead of a machine-specific path', () => {
  const fakeScriptUrl = pathToFileURL(
    path.join('/tmp', 'workspace', 'Wiki', 'scripts', 'package-loom-app.mjs'),
  ).href;

  assert.equal(
    resolveOutputRoot(fakeScriptUrl),
    path.join('/tmp', 'workspace', 'Wiki', 'output'),
  );
});
