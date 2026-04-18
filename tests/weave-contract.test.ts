import assert from 'node:assert/strict';
import test from 'node:test';

import {
  syncWeaveContractStatus,
} from '../lib/weave/contract';
import type { Weave } from '../lib/weave/types';

function makeWeave(overrides: Partial<Weave> = {}): Weave {
  return {
    id: 'weave:a',
    fromPanelId: 'panel:a',
    toPanelId: 'panel:b',
    kind: 'references',
    status: 'suggested',
    evidence: [{ snippet: 'A points to B', at: 1 }],
    claim: 'A points to B as part of the same weave.',
    whyItHolds: 'A points to B.',
    openTensions: [
      'This relation is still only suggested.',
      'Only one explicit evidence thread currently supports this relation.',
    ],
    contractSource: 'derived',
    contractUpdatedAt: 1,
    revisions: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test('syncWeaveContractStatus drops the suggested-only tension when confirming a weave', () => {
  const weave = makeWeave();

  assert.deepEqual(syncWeaveContractStatus(weave, 'confirmed'), {
    claim: weave.claim,
    whyItHolds: weave.whyItHolds,
    openTensions: ['Only one explicit evidence thread currently supports this relation.'],
  });
});

test('syncWeaveContractStatus preserves the suggested-only tension for suggested weaves', () => {
  const weave = makeWeave({
    openTensions: ['Only one explicit evidence thread currently supports this relation.'],
  });

  assert.deepEqual(syncWeaveContractStatus(weave, 'suggested'), {
    claim: weave.claim,
    whyItHolds: weave.whyItHolds,
    openTensions: [
      'This relation is still only suggested.',
      'Only one explicit evidence thread currently supports this relation.',
    ],
  });
});
