'use client';

import { WeftShuttle } from '../DocViewer';

export function aiStageButtonStyle(enabled: boolean, variant: 'accent' | 'muted' = 'accent'): React.CSSProperties {
  return {
    padding: '6px 14px',
    fontSize: '0.78rem',
    fontWeight: 600,
    background:
      enabled && variant === 'accent' ? 'var(--accent)' : 'transparent',
    color:
      enabled && variant === 'accent'
        ? 'var(--bg)'
        : enabled
          ? 'var(--fg)'
          : 'var(--muted)',
    border: '0.5px solid ' + (enabled && variant === 'accent' ? 'var(--accent)' : 'var(--mat-border)'),
    borderRadius: 6,
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.5,
  };
}

export function AiStageHeader({
  title,
  helper,
  status,
  busy = false,
}: {
  title: string;
  helper?: string;
  status?: string | null;
  busy?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: '0.7rem',
        color: 'var(--muted)',
      }}
    >
      <span style={{ flex: 1 }}>
        <strong style={{ color: 'var(--accent)' }}>{title}</strong>
        {helper ? (
          <>
            {' · '}
            <span style={{ fontFamily: 'var(--mono)' }}>{helper}</span>
          </>
        ) : null}
      </span>
      {status ? (
        <span
          style={{
            color: 'var(--accent)',
            fontFamily: 'var(--mono)',
            fontSize: '0.68rem',
            opacity: busy ? 0.6 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          {status}
        </span>
      ) : null}
    </div>
  );
}

export function AiStageEmptyState({
  message,
  actionLabel,
  onAction,
  actionDisabled = false,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        color: 'var(--muted)',
      }}
    >
      <div style={{ fontSize: '0.82rem', textAlign: 'center', maxWidth: 320 }}>
        {message}
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={actionDisabled}
        style={aiStageButtonStyle(!actionDisabled)}
      >
        {actionLabel}
      </button>
    </div>
  );
}

export function AiStageBusyState({
  label,
}: {
  label?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        color: 'var(--muted)',
      }}
    >
      <WeftShuttle width={72} />
      {label ? (
        <div style={{ fontSize: '0.78rem', lineHeight: 1.45 }}>
          {label}
        </div>
      ) : null}
    </div>
  );
}

export function AiInlineNotice({
  tone = 'muted',
  children,
}: {
  tone?: 'muted' | 'error' | 'accent';
  children: React.ReactNode;
}) {
  const color =
    tone === 'error' ? 'var(--tint-red)'
      : tone === 'accent' ? 'var(--accent)'
        : 'var(--fg-secondary)';
  const border =
    tone === 'error' ? 'var(--tint-red)'
      : tone === 'accent' ? 'var(--accent)'
        : 'var(--mat-border)';
  return (
    <div
      style={{
        padding: '10px 12px',
        borderTop: `0.5px solid ${border}`,
        borderBottom: '0.5px solid var(--mat-border)',
        color,
        fontSize: '0.8rem',
        lineHeight: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

export function AiInlineHint({
  tone = 'muted',
  children,
  actionLabel,
  onAction,
}: {
  tone?: 'muted' | 'error' | 'accent';
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: (() => void) | null;
}) {
  const color =
    tone === 'error' ? 'var(--tint-red)'
      : tone === 'accent' ? 'var(--accent)'
        : 'var(--muted)';
  return (
    <div
      style={{
        marginTop: 4,
        fontSize: '0.72rem',
        color,
        letterSpacing: '-0.005em',
        lineHeight: 1.4,
        opacity: tone === 'muted' ? 0.8 : 1,
        maxWidth: '56ch',
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
      }}
    >
      <div>{children}</div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          style={{
            padding: 0,
            border: 0,
            background: 'transparent',
            color: 'var(--accent)',
            font: 'inherit',
            lineHeight: 1.2,
            letterSpacing: 'inherit',
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: '0.18em',
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
