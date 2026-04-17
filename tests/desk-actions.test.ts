import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeskFocusTargetActions } from '../lib/shared/desk-actions';

test('buildDeskFocusTargetActions returns primary/secondary actions in stable order', () => {
  assert.deepEqual(
    buildDeskFocusTargetActions({
      primaryLabel: 'Ask',
      secondaryLabel: 'Open source',
    }),
    [
      { kind: 'focus-primary', label: 'Ask', primary: true },
      { kind: 'focus-secondary', label: 'Open source' },
    ],
  );
});

test('buildDeskFocusTargetActions appends management actions when requested', () => {
  assert.deepEqual(
    buildDeskFocusTargetActions({
      primaryLabel: 'Write',
      secondaryLabel: 'Open source',
      includeManagementActions: true,
      pinLabel: 'Unpin',
    }),
    [
      { kind: 'focus-primary', label: 'Write', primary: true },
      { kind: 'focus-secondary', label: 'Open source' },
      { kind: 'pin-toggle', label: 'Unpin' },
      { kind: 'not-now', label: 'Not now' },
      { kind: 'hide-today', label: 'Hide today' },
      { kind: 'done', label: 'Done' },
    ],
  );
});
