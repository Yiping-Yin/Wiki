'use client';

export function LearningTargetStateBadge({
  label,
}: {
  label: string;
}) {
  return (
    <span
      className="t-caption2"
      style={{
        color: 'var(--muted)',
        letterSpacing: '0.04em',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      · {label}
    </span>
  );
}
