'use client';

import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { LearningTarget } from '../lib/learning-targets';
import { openLearningTarget } from '../lib/learning-targets';
import { useLearningTargetState } from '../lib/learning-target-state';
import { resolutionKindLabel, useWorkSession } from '../lib/work-session';

export function WorkSessionHandoff({
  currentTarget,
  nextTarget,
  buttonStyle,
  stateStyle,
}: {
  currentTarget: LearningTarget | null;
  nextTarget: LearningTarget | null;
  buttonStyle: CSSProperties;
  stateStyle?: CSSProperties;
}) {
  const router = useRouter();
  const targetState = useLearningTargetState();
  const workSession = useWorkSession();

  if (!currentTarget) return null;
  const plannedKind = workSession.session?.plannedResolutions?.[currentTarget.id];

  const handleDone = () => {
    targetState.markDone(currentTarget);
    workSession.recordOutcome(currentTarget);
    if (nextTarget) {
      openLearningTarget(router, nextTarget);
      return;
    }
    workSession.clear();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      <div
        className="t-caption2"
        style={{
          color: 'var(--muted)',
          letterSpacing: '0.04em',
          ...stateStyle,
        }}
      >
        Work session
        {plannedKind ? ` · ${resolutionKindLabel(plannedKind)}` : ''}
        {nextTarget ? ` · Next up · ${nextTarget.title}` : ' · Last target in this session'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleDone}
          style={buttonStyle}
        >
          {nextTarget ? 'Done and continue' : 'Done and end'}
        </button>
        <button
          type="button"
          onClick={() => workSession.clear()}
          style={buttonStyle}
        >
          End session
        </button>
      </div>
    </div>
  );
}
