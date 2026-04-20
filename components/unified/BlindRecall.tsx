'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { callAiPrompt } from '../../lib/ai/runtime';
import { LOOM_AI_RULES } from '../../lib/ai/system-prompt';
import { recordPanelRecall } from '../../lib/panel';
import type { Panel } from '../../lib/panel/types';
import { AiStageBusyState, aiStageButtonStyle } from './AiStagePrimitives';

type Props = {
  panel: Panel;
  onClose: () => void;
};

type Phase =
  | { kind: 'typing' }
  | { kind: 'grading' }
  | { kind: 'verdict'; scorecard: Scorecard };

type Scorecard = {
  accuracy: number;
  remembered: string[];
  misremembered: string[];
  missed: string[];
  raw?: string;
};

export function BlindRecall({ panel, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'typing' });
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const submit = useCallback(async () => {
    const recall = draft.trim();
    if (!recall) return;
    setError(null);
    setPhase({ kind: 'grading' });
    try {
      const prompt = buildRecallPrompt(panel, recall);
      const raw = await callAiPrompt('blind-recall-grade', prompt);
      const scorecard = parseScorecard(raw);
      setPhase({ kind: 'verdict', scorecard });
      if (panel.status === 'settled') {
        try {
          await recordPanelRecall(panel.id, scorecard.accuracy);
        } catch {
          // Best-effort SRS update — don't block the verdict.
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase({ kind: 'typing' });
    }
  }, [draft, panel]);

  const retry = useCallback(() => {
    setDraft('');
    setPhase({ kind: 'typing' });
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Blind recall"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'color-mix(in srgb, var(--bg) 82%, transparent)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(640px, 100%)',
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: 20,
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--mat-border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            paddingBottom: 10,
            borderBottom: '0.5px solid var(--mat-border)',
          }}
        >
          <div
            className="t-caption2"
            style={{
              fontSize: '0.62rem',
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 700,
            }}
          >
            Self-test
          </div>
          <div
            style={{
              flex: 1,
              fontFamily: 'var(--display)',
              fontSize: '1.02rem',
              fontWeight: 650,
              letterSpacing: '-0.015em',
              lineHeight: 1.3,
              color: 'var(--fg)',
            }}
          >
            {panel.title}
          </div>
        </div>

        {phase.kind === 'typing' && (
          <>
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--muted)',
                lineHeight: 1.5,
              }}
            >
              Type what you remember about this panel — key claim, distinctions, tensions. ⌘↩ to check.
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Type what you remember…"
              style={{
                minHeight: 180,
                resize: 'vertical',
                padding: '12px 14px',
                fontFamily: 'var(--display)',
                fontSize: '0.88rem',
                lineHeight: 1.55,
                color: 'var(--fg)',
                background: 'var(--bg)',
                border: '0.5px solid var(--mat-border)',
                borderRadius: 8,
                outline: 'none',
              }}
            />
            {error ? (
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--tint-red)',
                  lineHeight: 1.45,
                }}
              >
                {error}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={aiStageButtonStyle(true, 'muted')}>
                Close
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!draft.trim()}
                style={aiStageButtonStyle(Boolean(draft.trim()))}
              >
                Check (⌘↩)
              </button>
            </div>
          </>
        )}

        {phase.kind === 'grading' && <AiStageBusyState label="Checking…" />}

        {phase.kind === 'verdict' && (
          <VerdictView
            scorecard={phase.scorecard}
            onRetry={retry}
            onClose={onClose}
            userRecall={draft}
          />
        )}
      </div>
    </div>
  );
}

// ── verdict ──────────────────────────────────────────────────────────────

function VerdictView({
  scorecard,
  onRetry,
  onClose,
  userRecall,
}: {
  scorecard: Scorecard;
  onRetry: () => void;
  onClose: () => void;
  userRecall: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, scorecard.accuracy)) * 100);
  const tone =
    pct >= 75 ? 'var(--tint-green)' : pct >= 40 ? 'var(--tint-yellow)' : 'var(--tint-orange)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '1.6rem',
            fontWeight: 700,
            color: tone,
            letterSpacing: '-0.02em',
          }}
        >
          {pct}%
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              height: 4,
              background: 'var(--mat-border)',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: tone,
                transition: 'width 0.4s var(--ease)',
              }}
            />
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: '0.7rem',
              color: 'var(--muted)',
              letterSpacing: '0.04em',
            }}
          >
            {pct >= 75 ? 'Solid — you remember the key points' : pct >= 40 ? 'Partial — some gaps' : 'Weak — most points missed'}
          </div>
        </div>
      </div>

      <ScoreList label="Remembered" items={scorecard.remembered} tone="accent" />
      <ScoreList label="Misremembered" items={scorecard.misremembered} tone="warning" />
      <ScoreList label="Missed" items={scorecard.missed} tone="muted" />

      {userRecall ? (
        <details style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
          <summary style={{ cursor: 'pointer', letterSpacing: '0.04em' }}>What you wrote</summary>
          <div
            style={{
              marginTop: 6,
              padding: 10,
              border: '0.5px solid var(--mat-border)',
              borderRadius: 6,
              background: 'var(--bg)',
              color: 'var(--fg-secondary)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
            }}
          >
            {userRecall}
          </div>
        </details>
      ) : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button type="button" onClick={onClose} style={aiStageButtonStyle(true, 'muted')}>
          Close
        </button>
        <button type="button" onClick={onRetry} style={aiStageButtonStyle(true)}>
          Try again
        </button>
      </div>
    </div>
  );
}

function ScoreList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: 'accent' | 'warning' | 'muted';
}) {
  if (items.length === 0) return null;
  const color =
    tone === 'accent' ? 'var(--tint-green)'
      : tone === 'warning' ? 'var(--tint-orange)'
        : 'var(--muted)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        className="t-caption2"
        style={{
          fontSize: '0.64rem',
          color,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((item, i) => (
          <li
            key={`${label}:${i}`}
            style={{
              fontSize: '0.82rem',
              color: 'var(--fg-secondary)',
              lineHeight: 1.5,
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── prompt + parse ───────────────────────────────────────────────────────

function buildRecallPrompt(panel: Panel, recall: string): string {
  const distinctions = panel.keyDistinctions.filter(Boolean);
  const tensions = panel.openTensions.filter(Boolean);

  const panelBlock = [
    `Title: ${panel.title}`,
    panel.centralClaim ? `Central claim: ${panel.centralClaim}` : '',
    distinctions.length ? `Key distinctions:\n${distinctions.map((d) => `- ${d}`).join('\n')}` : '',
    tensions.length ? `Open tensions:\n${tensions.map((t) => `- ${t}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  return [
    "You are grading a learner's blind recall of a crystallized understanding.",
    "They wrote this from memory, without looking at the panel.",
    '',
    'THE PANEL (what they should remember):',
    panelBlock,
    '',
    "THE LEARNER'S RECALL:",
    recall,
    '',
    'Compare semantically — not literal string match. Someone paraphrasing the same idea correctly counts as remembered.',
    '',
    'Respond EXACTLY in this format:',
    'ACCURACY: <decimal 0.0-1.0>',
    'REMEMBERED:',
    '- <item they mentioned correctly, <100 chars>',
    'MISREMEMBERED:',
    '- <item they got wrong or confused, <100 chars>',
    'MISSED:',
    '- <item from the panel they did not mention, <100 chars>',
    '',
    'Rules:',
    '- If a section has no items, output "- (none)"',
    '- Base MISSED on the panel\'s distinctions and tensions',
    '- Keep every bullet concrete and under 100 chars',
    '- Do not add commentary outside the format',
    '',
    LOOM_AI_RULES,
  ].join('\n');
}

function parseScorecard(raw: string): Scorecard {
  const lines = raw.split('\n').map((l) => l.trim());

  let accuracy = 0;
  const remembered: string[] = [];
  const misremembered: string[] = [];
  const missed: string[] = [];
  let bucket: 'remembered' | 'misremembered' | 'missed' | null = null;

  for (const line of lines) {
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('ACCURACY:')) {
      const match = line.match(/([0-9]*\.?[0-9]+)/);
      if (match) {
        const v = parseFloat(match[1]);
        accuracy = v > 1 ? v / 100 : v;
      }
      bucket = null;
    } else if (upper.startsWith('REMEMBERED')) {
      bucket = 'remembered';
    } else if (upper.startsWith('MISREMEMBERED')) {
      bucket = 'misremembered';
    } else if (upper.startsWith('MISSED')) {
      bucket = 'missed';
    } else if (line.startsWith('-') && bucket) {
      const text = line.replace(/^-+\s*/, '').trim();
      if (!text || /^\(none\)$/i.test(text)) continue;
      if (bucket === 'remembered') remembered.push(text);
      else if (bucket === 'misremembered') misremembered.push(text);
      else missed.push(text);
    }
  }

  return { accuracy, remembered, misremembered, missed, raw };
}
