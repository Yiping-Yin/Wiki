'use client';

import type { LearningStatusSummary } from '../lib/learning-status';

const STEP_META = [
  { key: 'capture', label: 'Capture' },
  { key: 'rehearsal', label: 'Rehearsal' },
  { key: 'examiner', label: 'Examiner' },
  { key: 'crystallized', label: 'Crystallized' },
] as const;

export function LearningStatusInline({
  status,
  compact = false,
}: {
  status: LearningStatusSummary;
  compact?: boolean;
}) {
  const activeColor = 'var(--accent)';
  const mutedColor = 'var(--muted)';

  const steps = STEP_META.map((step) => {
    const completed =
      step.key === 'capture'
        ? status.captureCount > 0
        : step.key === 'rehearsal'
          ? status.rehearsalCount > 0
          : step.key === 'examiner'
            ? status.examinerCount > 0
            : status.crystallized;
    return { ...step, completed };
  });

  if (!status.opened && steps.every((step) => !step.completed)) return null;

  return (
    <div
      className="t-caption2"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 8,
        flexWrap: 'wrap',
        color: mutedColor,
        letterSpacing: '0.04em',
      }}
    >
      {!steps.some((step) => step.completed) && status.opened && (
        <span
          style={{
            color: mutedColor,
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Opened
        </span>
      )}
      {steps.map((step) => (
        <span
          key={step.key}
          style={{
            color: step.completed ? activeColor : mutedColor,
            textTransform: 'uppercase',
            fontWeight: step.completed ? 700 : 500,
            opacity: step.completed ? 1 : 0.65,
          }}
        >
          {labelForStep(step.key, step.label, status, compact)}
        </span>
      ))}
    </div>
  );
}

function labelForStep(
  key: 'capture' | 'rehearsal' | 'examiner' | 'crystallized',
  base: string,
  status: LearningStatusSummary,
  compact: boolean,
) {
  if (compact) return base;
  if (key === 'capture' && status.captureCount > 1) return `${base} ${status.captureCount}`;
  if (key === 'rehearsal' && status.rehearsalCount > 1) return `${base} ${status.rehearsalCount}`;
  if (key === 'examiner' && status.examinerCount > 1) return `${base} ${status.examinerCount}`;
  return base;
}
