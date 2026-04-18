import assert from 'node:assert/strict';
import test from 'node:test';

import { assembleDeskFocusTargetActions, buildDeskFocusTargetActions } from '../lib/shared/desk-actions';

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

test('assembleDeskFocusTargetActions maps primary and management handlers into renderable actions', () => {
  const calls: string[] = [];
  const onPrimary = () => calls.push('primary');
  const onSecondary = () => calls.push('secondary');
  const onPinToggle = () => calls.push('pin');
  const onNotNow = () => calls.push('not-now');
  const onHideToday = () => calls.push('hide-today');
  const onDone = () => calls.push('done');

  const actions = assembleDeskFocusTargetActions({
    primaryLabel: 'Ask',
    onPrimary,
    secondaryLabel: 'Open source',
    onSecondary,
    includeManagementActions: true,
    pinLabel: 'Unpin',
    onPinToggle,
    onNotNow,
    onHideToday,
    onDone,
  });

  assert.deepEqual(
    actions.map((action) => ({ label: action.label, primary: action.primary ?? false })),
    [
      { label: 'Ask', primary: true },
      { label: 'Open source', primary: false },
      { label: 'Unpin', primary: false },
      { label: 'Not now', primary: false },
      { label: 'Hide today', primary: false },
      { label: 'Done', primary: false },
    ],
  );

  for (const action of actions) action.onClick?.();
  assert.deepEqual(calls, ['primary', 'secondary', 'pin', 'not-now', 'hide-today', 'done']);
});
