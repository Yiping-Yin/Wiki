'use client';

import type { CSSProperties } from 'react';
import type { LearningTarget } from '../lib/learning-targets';
import {
  describeLearningTargetState,
  isLearningTargetPinned,
  useLearningTargetState,
} from '../lib/learning-target-state';

export function LearningTargetStateControls({
  target,
  buttonStyle,
  stateStyle,
}: {
  target: LearningTarget;
  buttonStyle: CSSProperties;
  stateStyle?: CSSProperties;
}) {
  const targetState = useLearningTargetState();
  const currentState = describeLearningTargetState(target, targetState.state);
  const pinned = isLearningTargetPinned(target, targetState.state);
  const suppressed = currentState?.kind === 'snoozed' || currentState?.kind === 'hidden-today' || currentState?.kind === 'done';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      {currentState && (
        <div
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            letterSpacing: '0.04em',
            ...stateStyle,
          }}
        >
          {currentState.label}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => targetState.togglePinned(target)}
          style={buttonStyle}
        >
          {pinned ? 'Unpin' : 'Pin'}
        </button>
        {suppressed ? (
          <button
            type="button"
            onClick={() => targetState.restore(target)}
            style={buttonStyle}
          >
            Restore
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => targetState.notNow(target)}
              style={buttonStyle}
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => targetState.hideToday(target)}
              style={buttonStyle}
            >
              Hide today
            </button>
            <button
              type="button"
              onClick={() => targetState.markDone(target)}
              style={buttonStyle}
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
