import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OVERLAY_RESUME_KEY,
  consumeOverlayResume,
  type OverlayResumePayload,
} from '../lib/overlay-resume';

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.data.delete(key);
  }
}

test('consumeOverlayResume returns and clears a matching examiner resume payload', () => {
  const storage = new MemoryStorage();
  const payload: OverlayResumePayload = {
    href: '/wiki/rope',
    overlay: 'examiner',
  };
  storage.setItem(OVERLAY_RESUME_KEY, JSON.stringify(payload));

  const consumed = consumeOverlayResume(storage, {
    href: '/wiki/rope',
    overlay: 'examiner',
  });

  assert.deepEqual(consumed, payload);
  assert.equal(storage.getItem(OVERLAY_RESUME_KEY), null);
});

test('consumeOverlayResume leaves a mismatched payload untouched', () => {
  const storage = new MemoryStorage();
  const payload: OverlayResumePayload = {
    href: '/wiki/rope',
    overlay: 'examiner',
  };
  storage.setItem(OVERLAY_RESUME_KEY, JSON.stringify(payload));

  const consumed = consumeOverlayResume(storage, {
    href: '/today',
    overlay: 'examiner',
  });

  assert.equal(consumed, null);
  assert.equal(storage.getItem(OVERLAY_RESUME_KEY), JSON.stringify(payload));
});
