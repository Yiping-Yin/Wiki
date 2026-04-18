import assert from 'node:assert/strict';
import test from 'node:test';

class FakeWindow extends EventTarget {}

const fakeWindow = new FakeWindow();

Object.assign(globalThis, {
  window: fakeWindow,
});

let SETTINGS_PANEL_OPEN_EVENT: typeof import('../lib/settings-panel').SETTINGS_PANEL_OPEN_EVENT;
let openSettingsPanel: typeof import('../lib/settings-panel').openSettingsPanel;

test.before(async () => {
  const settingsPanel = await import('../lib/settings-panel');
  SETTINGS_PANEL_OPEN_EVENT = settingsPanel.SETTINGS_PANEL_OPEN_EVENT;
  openSettingsPanel = settingsPanel.openSettingsPanel;
});

test.beforeEach(() => {
  Object.assign(globalThis, {
    window: fakeWindow,
  });
});

test('openSettingsPanel dispatches the settings open event', () => {
  let opened = 0;
  window.addEventListener(SETTINGS_PANEL_OPEN_EVENT, () => {
    opened += 1;
  }, { once: true });

  openSettingsPanel();

  assert.equal(opened, 1);
});
