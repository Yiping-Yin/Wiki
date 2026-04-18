import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultSidebarModeForWidth,
  resolveInitialSidebarMode,
  shouldForcePinnedSidebarForPath,
} from '../lib/sidebar-mode';

test('desktop viewport defaults sidebar to pinned', () => {
  assert.equal(defaultSidebarModeForWidth(1200), 'pinned');
});

test('small viewport defaults sidebar to hidden', () => {
  assert.equal(defaultSidebarModeForWidth(900), 'hidden');
  assert.equal(defaultSidebarModeForWidth(768), 'hidden');
});

test('stored mode wins over viewport default', () => {
  assert.equal(
    resolveInitialSidebarMode({
      storedMode: 'hidden',
      legacyPinned: null,
      viewportWidth: 1440,
    }),
    'hidden',
  );
});

test('legacy pinned flag still upgrades to pinned', () => {
  assert.equal(
    resolveInitialSidebarMode({
      storedMode: null,
      legacyPinned: '1',
      viewportWidth: 768,
    }),
    'pinned',
  );
});

test('atlas routes force the sidebar pinned on desktop', () => {
  assert.equal(shouldForcePinnedSidebarForPath('/atlas'), true);
  assert.equal(shouldForcePinnedSidebarForPath('/knowledge'), true);
  assert.equal(shouldForcePinnedSidebarForPath('/knowledge/foundations'), true);
});

test('non-atlas routes do not force the sidebar pinned', () => {
  assert.equal(shouldForcePinnedSidebarForPath('/today'), false);
  assert.equal(shouldForcePinnedSidebarForPath('/wiki/rmsnorm'), false);
});
