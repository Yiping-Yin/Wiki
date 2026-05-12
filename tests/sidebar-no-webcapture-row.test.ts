import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * docs/loom.md §VII.bis migration: the WebCaptureSetupView surface was
 * dismantled. Setup content lives in Settings > Capture
 * (CaptureSettingsView) and Help > Set Up Captures…
 * (CaptureHelpView). The sidebar no longer has a Web Capture row.
 *
 * This contract test pins the dismantling invariant so a regression
 * (e.g. someone re-adding the row, or restoring the struct) trips CI.
 */

const MINIMAL_ROOT = resolve('macos-app/Loom/Sources/LoomMinimalRootView.swift');
const CAPTURES = resolve('macos-app/Loom/Sources/CapturesView.swift');
const CAPTURE_SETTINGS = resolve('macos-app/Loom/Sources/CaptureSettingsView.swift');
const CAPTURE_HELP = resolve('macos-app/Loom/Sources/CaptureHelpView.swift');

test('LoomMinimalRootView.swift no longer references the Web Capture sidebar surface', () => {
  const text = readFileSync(MINIMAL_ROOT, 'utf-8');
  const forbidden = [
    'webCaptureSetupRow',
    '.webCaptureSetup',
    'case webCaptureSetup',
    'WebCaptureSetupView',
    '"Web Capture"',
    "'__webcapture'",
    '"__webcapture"',
  ];
  for (const needle of forbidden) {
    assert.equal(
      text.includes(needle),
      false,
      `Found forbidden token "${needle}" in LoomMinimalRootView.swift — ` +
        `per docs/loom.md §VII.bis the Web Capture sidebar surface is dismantled; ` +
        `capture setup content lives in Settings > Capture and Help > Set Up Captures…`,
    );
  }
});

test('CapturesView.swift no longer defines WebCaptureSetupView', () => {
  const text = readFileSync(CAPTURES, 'utf-8');
  assert.equal(
    text.includes('struct WebCaptureSetupView'),
    false,
    'WebCaptureSetupView struct must be deleted from CapturesView.swift per §VII.bis migration',
  );
});

test('CaptureSettingsView and CaptureHelpView exist with their structs', () => {
  const settings = readFileSync(CAPTURE_SETTINGS, 'utf-8');
  const help = readFileSync(CAPTURE_HELP, 'utf-8');
  assert.ok(settings.includes('struct CaptureSettingsView'), 'CaptureSettingsView struct missing');
  assert.ok(help.includes('struct CaptureHelpView'), 'CaptureHelpView struct missing');
  assert.ok(help.includes('enum CaptureHelpWindow'), 'CaptureHelpWindow enum missing');
});
