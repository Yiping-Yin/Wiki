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
  const recencyColor =
    status.recency === 'fresh'
      ? 'var(--tint-green)'
      : status.recency === 'stale'
        ? 'var(--tint-orange)'
        : 'var(--muted)';
  const qualityColor =
    status.quality === 'solid'
      ? 'var(--tint-green)'
      : status.quality === 'fragile'
        ? 'var(--tint-red)'
        : status.quality === 'developing'
          ? 'var(--tint-orange)'
          : 'var(--muted)';

  if (compact) {
    const label = compactStageLabel(status);
    if (!label) return null;
    const active = status.stage !== 'opened';
    return (
      <div
        className="t-caption2"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          color: active ? activeColor : mutedColor,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          fontWeight: active ? 700 : 600,
          opacity: active ? 1 : 0.72,
        }}
      >
        <span>{label}</span>
        {status.quality !== 'untested' && (
          <span
            style={{
            color: qualityColor,
            opacity: status.quality === 'developing' ? 0.86 : 1,
          }}
          >
            {status.quality}
          </span>
        )}
        {status.opened && (
          <span
            style={{
              color: recencyColor,
              opacity: status.recency === 'cooling' ? 0.82 : 1,
            }}
          >
            {status.recency}
          </span>
        )}
      </div>
    );
  }

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
          {labelForStep(step.key, step.label, status)}
        </span>
      ))}
      {status.quality !== 'untested' && (
        <span
          style={{
            color: qualityColor,
            textTransform: 'uppercase',
            fontWeight: 700,
            opacity: status.quality === 'developing' ? 0.86 : 1,
          }}
        >
          {status.quality}
        </span>
      )}
      {status.opened && (
        <span
          style={{
            color: recencyColor,
            textTransform: 'uppercase',
            fontWeight: 700,
            opacity: status.recency === 'cooling' ? 0.82 : 1,
          }}
        >
          {status.recency}
        </span>
      )}
    </div>
  );
}

function compactStageLabel(status: LearningStatusSummary) {
  switch (status.stage) {
    case 'crystallized':
      return 'Crystallized';
    case 'examined':
      return status.examinerCount > 1 ? `Examiner ${status.examinerCount}` : 'Examiner';
    case 'rehearsed':
      return status.rehearsalCount > 1 ? `Rehearsal ${status.rehearsalCount}` : 'Rehearsal';
    case 'captured':
      return status.captureCount > 1 ? `Capture ${status.captureCount}` : 'Capture';
    case 'opened':
      return 'Opened';
    default:
      return '';
  }
}

function labelForStep(
  key: 'capture' | 'rehearsal' | 'examiner' | 'crystallized',
  base: string,
  status: LearningStatusSummary,
) {
  if (key === 'capture' && status.captureCount > 1) return `${base} ${status.captureCount}`;
  if (key === 'rehearsal' && status.rehearsalCount > 1) return `${base} ${status.rehearsalCount}`;
  if (key === 'examiner' && status.examinerCount > 1) return `${base} ${status.examinerCount}`;
  return base;
}
