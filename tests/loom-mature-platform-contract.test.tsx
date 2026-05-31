import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PERSONAL_PLATFORM_MODEL,
  PERSONAL_PLATFORM_HISTORY,
  PERSONAL_PLATFORM_NARRATIVE_LAYERS,
  PERSONAL_PLATFORM_OUTPUTS,
  PERSONAL_PLATFORM_PITCH_COPY,
  PERSONAL_PLATFORM_PROCESS,
  PERSONAL_PLATFORM_PRODUCT_THESIS,
  PERSONAL_PLATFORM_PROGRESS,
  PERSONAL_PLATFORM_REFERENCE_INSTANCE,
  PERSONAL_PLATFORM_SECTIONS,
  PERSONAL_PLATFORM_STACK,
} from '../lib/new-loom/personal-platform';

test('personal platform data keeps five sections and the mature section model', () => {
  assert.deepEqual(
    PERSONAL_PLATFORM_SECTIONS.map((section) => section.label),
    ['About', 'UNSW', 'Quantnet', 'WQU', 'Claude'],
  );
  assert.deepEqual(PERSONAL_PLATFORM_MODEL, ['Overview', 'Path', 'Sources', 'Process', 'Outputs']);

  for (const section of PERSONAL_PLATFORM_SECTIONS) {
    assert.ok(section.href, `${section.label} should expose a link`);
    assert.ok(section.summary, `${section.label} should expose a summary`);
    assert.ok(section.status, `${section.label} should expose a status`);
    assert.ok(section.nextAction, `${section.label} should expose a next action`);
    assert.ok(section.pathSteps.length >= 2, `${section.label} should expose path steps`);
    assert.ok(section.sourceGroups.length >= 2, `${section.label} should expose source groups`);
    assert.ok(section.processItems.length >= 2, `${section.label} should expose process items`);
    assert.ok(section.outputs.length >= 1, `${section.label} should expose output items`);
  }

  assert.equal(PERSONAL_PLATFORM_PROGRESS.length, 3, 'home progress strip should have concrete items');
  assert.equal(PERSONAL_PLATFORM_HISTORY.length, 4, 'product history should keep the Loom story visible');
  assert.equal(PERSONAL_PLATFORM_PROCESS.length, 3, 'home process timeline should have concrete items');
  assert.equal(PERSONAL_PLATFORM_OUTPUTS.length, 3, 'home output previews should have concrete items');
  assert.deepEqual(
    PERSONAL_PLATFORM_STACK.map((item) => item.title),
    ['Personal knowledge postcard', 'Portfolio site', 'Knowledge base', 'Virtual personal AI'],
  );
  assert.deepEqual(
    PERSONAL_PLATFORM_NARRATIVE_LAYERS.map((item) => item.title),
    ['Portfolio with proof', 'Source to identity', 'AI persona'],
  );
  assert.match(PERSONAL_PLATFORM_HISTORY[0].text, /personal thinking tool/i);
  assert.match(
    PERSONAL_PLATFORM_HISTORY[PERSONAL_PLATFORM_HISTORY.length - 1].text,
    /future path toward a platform for everyone/i,
  );
  assert.match(PERSONAL_PLATFORM_PRODUCT_THESIS, /helps anyone/i);
  assert.match(PERSONAL_PLATFORM_PRODUCT_THESIS, /portfolio people can inspect/i);
  assert.match(PERSONAL_PLATFORM_PRODUCT_THESIS, /knowledge base people can trust/i);
  assert.match(PERSONAL_PLATFORM_PRODUCT_THESIS, /personal AI people can talk to/i);
  assert.match(PERSONAL_PLATFORM_REFERENCE_INSTANCE.title, /first reference instance/i);
  assert.match(PERSONAL_PLATFORM_REFERENCE_INSTANCE.text, /not the product boundary/i);
  assert.match(PERSONAL_PLATFORM_PITCH_COPY.oneLine, /personal knowledge identity platform/i);
  assert.match(PERSONAL_PLATFORM_PITCH_COPY.oneLine, /personal AI people can talk to/i);
  assert.match(PERSONAL_PLATFORM_PITCH_COPY.problem, /show results but not the evidence/i);
  assert.match(PERSONAL_PLATFORM_PITCH_COPY.solution, /portfolio, knowledge base, and grounded personal AI/i);
  assert.match(PERSONAL_PLATFORM_PITCH_COPY.customer, /students, researchers, builders, creators/i);
  assert.ok(
    Array.from(PERSONAL_PLATFORM_PITCH_COPY.applicationSummary500).length <= 500,
    'application summary should stay within a 500-character form field',
  );
});
