import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  collectExtensionEntries,
  evaluateExtensionState,
} from '../scripts/check-atlas-loom-extension.mjs';

const sourceManifest = {
  name: '__MSG_extensionName__',
  version: '1.4.5',
};

const resourcesPath = path.resolve('/repo/macos-app/Loom/LoomWebExtension/Resources');

test('exact Resources path passes', () => {
  const prefs = {
    extensions: {
      settings: {
        abcdef: {
          path: resourcesPath,
          manifest: { name: 'Capture to Loom', version: '1.4.5' },
        },
      },
    },
  };

  const result = evaluateExtensionState({
    sourceManifest,
    expectedResourcesPath: resourcesPath,
    entries: collectExtensionEntries(prefs, '/profile/Preferences'),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.extensionIds, ['abcdef']);
  assert.deepEqual(result.loadedVersions, ['1.4.5']);
  assert.deepEqual(result.loadedPaths, [resourcesPath]);
});

test('parent LoomWebExtension path fails', () => {
  const prefs = {
    extensions: {
      settings: {
        abcdef: {
          path: path.dirname(resourcesPath),
          manifest: { name: 'Capture to Loom', version: '1.4.5' },
        },
      },
    },
  };

  const result = evaluateExtensionState({
    sourceManifest,
    expectedResourcesPath: resourcesPath,
    entries: collectExtensionEntries(prefs, '/profile/Secure Preferences'),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /not exact Resources folder/);
});

test('version mismatch fails', () => {
  const prefs = {
    extensions: {
      settings: {
        abcdef: {
          path: resourcesPath,
          manifest: { name: 'Capture to Loom', version: '1.4.4' },
        },
      },
    },
  };

  const result = evaluateExtensionState({
    sourceManifest,
    expectedResourcesPath: resourcesPath,
    entries: collectExtensionEntries(prefs, '/profile/Preferences'),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /version mismatch/);
});

test('missing prefs fails', () => {
  const result = evaluateExtensionState({
    sourceManifest,
    expectedResourcesPath: resourcesPath,
    entries: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /No loaded Loom extension/);
});
