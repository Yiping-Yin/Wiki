'use client';
/**
 * AIExaminer · Phase 5 (Verifying) component.
 *
 * Implements the "verify you actually learned it" part of Loom's learning
 * loop. The examiner looks at the user's captured Notes for the current
 * doc, generates a probing question about a detail, lets the user answer,
 * then evaluates and decides whether to ask a follow-up or mark the topic
 * as verified.
 *
 * Flow:
 *   1. User lands on Verifying preset with a doc selected
 *   2. AIExaminer generates a question from the doc's accumulated notes
 *   3. User types an answer in the textarea
 *   4. "Submit answer" button sends answer + question + notes as context
 *      to /api/chat with a grading prompt
 *   5. AI returns either PASS or a follow-up question
 *   6. On PASS, the answer is saved as a Note and the examiner either
 *      generates a new question or marks the session complete
 *   7. User can skip ("next question") or give up ("stop")
 *
 * This is a pragmatic loop surface — question generation, grading,
 * crystallize-on-pass, and handoff back to review / rehearsal are all
 * wired, but scoring/rubrics still remain intentionally light.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Note, SourceDocId } from '../../lib/note/types';
import { appendNote } from '../../lib/note/store';
import { OVERLAY_RESUME_KEY, type OverlayResumePayload } from '../../lib/overlay-resume';
import { WeftShuttle } from '../DocViewer';

type Props = {
  docId: SourceDocId | null;
  /** Notes on the current doc, used as context for question generation. */
  contextNotes: Note[];
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'awaiting-answer'; question: string }
  | { kind: 'grading'; question: string; answer: string }
  | { kind: 'verdict'; question: string; answer: string; verdict: 'pass' | 'retry'; feedback: string };

const LS_EXAMINER_KEY = 'loom:examiner:session';

type ExaminerHistory = {
  passCount: number;
  retryCount: number;
  lastFailedQuestion?: string;
  lastFailedFeedback?: string;
  quality: 'untested' | 'fragile' | 'developing' | 'solid';
};

function loadSession(docId: string | null): { phase: Phase; draft: string } {
  if (!docId) return { phase: { kind: 'idle' }, draft: '' };
  try {
    const raw = window.localStorage.getItem(`${LS_EXAMINER_KEY}:${docId}`);
    if (!raw) return { phase: { kind: 'idle' }, draft: '' };
    const saved = JSON.parse(raw);
    // Only restore answerable/verdict states — generating/grading are transient
    if (saved.phase?.kind === 'awaiting-answer' || saved.phase?.kind === 'verdict') {
      return { phase: saved.phase, draft: saved.draft ?? '' };
    }
  } catch {}
  return { phase: { kind: 'idle' }, draft: '' };
}

function saveSession(docId: string | null, phase: Phase, draft: string) {
  if (!docId) return;
  try {
    window.localStorage.setItem(
      `${LS_EXAMINER_KEY}:${docId}`,
      JSON.stringify({ phase, draft }),
    );
  } catch {}
}

export function AIExaminer({ docId, contextNotes }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(() => loadSession(docId).phase);
  const [draft, setDraft] = useState(() => loadSession(docId).draft);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const examinerHistory = useMemo(() => deriveExaminerHistory(contextNotes), [contextNotes]);

  // Persist session on phase/draft change
  useEffect(() => {
    saveSession(docId, phase, draft);
  }, [docId, phase, draft]);

  // Reload session when docId changes
  useEffect(() => {
    const saved = loadSession(docId);
    setPhase(saved.phase);
    setDraft(saved.draft);
  }, [docId]);

  // Focus textarea when a question appears
  useEffect(() => {
    if (phase.kind === 'awaiting-answer' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [phase.kind]);

  const generateQuestion = useCallback(async () => {
    if (!docId) return;
    if (contextNotes.length === 0) {
      setPhase({
        kind: 'verdict',
        question: '',
        answer: '',
        verdict: 'retry',
        feedback:
          'Nothing is marked here yet. Capture one edge, then come back.',
      });
      return;
    }
    setPhase({ kind: 'generating' });
    window.dispatchEvent(new CustomEvent('loom:island', { detail: { type: 'ai-start' } }));
    try {
      const prompt = buildQuestionPrompt(contextNotes, examinerHistory);
      const question = await callAi(prompt);
      if (!question.trim()) throw new Error('Empty question from AI');
      setPhase({ kind: 'awaiting-answer', question });
      setDraft('');
    } catch (err) {
      setPhase({
        kind: 'verdict',
        question: '',
        answer: '',
        verdict: 'retry',
        feedback: `Failed to generate question: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      window.dispatchEvent(new CustomEvent('loom:island', { detail: { type: 'ai-end' } }));
    }
  }, [docId, contextNotes, examinerHistory]);

  const submitAnswer = useCallback(async () => {
    if (phase.kind !== 'awaiting-answer') return;
    if (!draft.trim()) return;
    const answer = draft.trim();
    setPhase({ kind: 'grading', question: phase.question, answer });
    window.dispatchEvent(new CustomEvent('loom:island', { detail: { type: 'ai-start' } }));
    try {
      const gradingPrompt = buildGradingPrompt(phase.question, answer, contextNotes);
      const raw = await callAi(gradingPrompt);
      const parsed = parseGradingResponse(raw);
      setPhase({
        kind: 'verdict',
        question: phase.question,
        answer,
        verdict: parsed.verdict,
        feedback: parsed.feedback,
      });
      // On PASS: crystallize all context notes for this doc.
      // Crystallized = verified knowledge, won't fade via Passive Fading.
      if (parsed.verdict === 'pass' && docId) {
        window.dispatchEvent(new CustomEvent('loom:crystallize', {
          detail: { docId },
        }));
      }
      // Save the Q&A as a Note
      if (docId) {
        try {
          await appendNote({
            docId,
            docHref: docHrefFromDocId(docId),
            docTitle: docTitleFromDocId(docId),
            content: `**Q**: ${phase.question}\n\n**A**: ${answer}\n\n**Verdict**: ${parsed.verdict === 'pass' ? 'Pass' : 'Retry'}\n\n${parsed.feedback}`,
            summary: `❓ ${phase.question.slice(0, 80)}`,
            anchor: {
              target: docId,
              blockText: 'examiner',
              blockId: 'loom-examiner-root',
              quote: phase.question,
            },
          });
        } catch {
          // Best-effort — don't block UI if save fails
        }
      }
    } catch (err) {
      setPhase({
        kind: 'verdict',
        question: phase.question,
        answer,
        verdict: 'retry',
        feedback: `Grading failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      window.dispatchEvent(new CustomEvent('loom:island', { detail: { type: 'ai-end' } }));
    }
  }, [phase, draft, contextNotes, docId]);

  const next = useCallback(() => {
    setDraft('');
    void generateQuestion();
  }, [generateQuestion]);

  const reviewNotes = useCallback(() => {
    window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id: '__none__' } }));
    window.dispatchEvent(new CustomEvent('loom:review:set-active', { detail: { active: true } }));
  }, []);

  const openKesi = useCallback(() => {
    window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id: '__none__' } }));
    router.push(docId ? `/kesi?focus=${encodeURIComponent(docId)}` : '/kesi');
  }, [docId, router]);

  const openRelations = useCallback(() => {
    window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id: '__none__' } }));
    router.push(docId ? `/graph?focus=${encodeURIComponent(docId)}` : '/graph');
  }, [docId, router]);

  const returnToRehearsal = useCallback(() => {
    const seedDraft = buildRehearsalSeed(
      phase.kind === 'verdict' ? phase.question : examinerHistory.lastFailedQuestion ?? '',
      phase.kind === 'verdict' ? phase.feedback : examinerHistory.lastFailedFeedback ?? '',
    );
    const payload: OverlayResumePayload = {
      href: docHrefFromDocId(docId ?? ''),
      overlay: 'rehearsal',
      seedDraft,
      seedLabel: 'Pick up the missing edge',
    };
    try {
      sessionStorage.setItem(OVERLAY_RESUME_KEY, JSON.stringify(payload));
    } catch {}
    window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id: 'rehearsal' } }));
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('loom:overlay:toggle', { detail: { id: 'rehearsal', seedDraft, seedLabel: payload.seedLabel } }));
    });
  }, [docId, examinerHistory.lastFailedFeedback, examinerHistory.lastFailedQuestion, phase]);

  const stop = useCallback(() => {
    setPhase({ kind: 'idle' });
    setDraft('');
  }, []);

  if (!docId) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontStyle: 'italic',
          padding: 40,
          fontSize: '0.85rem',
        }}
      >
        Pick a doc from the toolbar above to start the examiner.
      </div>
    );
  }

  return (
    <div
      className="loom-unified-examiner"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: 12,
        gap: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: '0.7rem',
          color: 'var(--muted)',
          fontFamily: 'var(--mono)',
        }}
      >
        From {contextNotes.length} note{contextNotes.length === 1 ? '' : 's'}
      </div>

      {/* Idle: show "start" button */}
      {phase.kind === 'idle' && (
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
            Stay with the unfinished edge of this doc.
          </div>
          <button
            type="button"
            onClick={() => void generateQuestion()}
            disabled={contextNotes.length === 0}
            style={buttonStyle(contextNotes.length > 0)}
          >
            {contextNotes.length === 0
              ? 'Capture first'
              : 'Ask one'}
          </button>
        </div>
      )}

      {/* Generating */}
      {phase.kind === 'generating' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
          }}
        >
          <WeftShuttle width={72} />
        </div>
      )}

      {/* Awaiting answer */}
      {phase.kind === 'awaiting-answer' && (
        <>
          <QuestionCard question={phase.question} />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void submitAnswer();
              }
            }}
            placeholder="Your answer… (⌘↩ to send)"
            style={{
              flex: 1,
              minHeight: 0,
              resize: 'none',
              padding: '12px 14px',
              fontFamily: 'var(--display)',
              fontSize: '0.86rem',
              lineHeight: 1.55,
              color: 'var(--fg)',
              background: 'var(--bg)',
              border: '0.5px solid var(--mat-border)',
              borderRadius: 8,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={stop} style={buttonStyle(true, 'muted')}>
              Close
            </button>
            <button
              type="button"
              onClick={() => void submitAnswer()}
              disabled={!draft.trim()}
              style={buttonStyle(Boolean(draft.trim()))}
            >
              Answer
            </button>
          </div>
        </>
      )}

      {/* Grading */}
      {phase.kind === 'grading' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
          }}
        >
          <WeftShuttle width={72} />
        </div>
      )}

      {/* Verdict */}
      {phase.kind === 'verdict' && (
        <>
          {phase.question && <QuestionCard question={phase.question} />}
          {phase.answer && (
            <div
              style={{
                padding: 10,
                fontSize: '0.8rem',
                background: 'var(--bg)',
                border: '0.5px solid var(--mat-border)',
                borderRadius: 6,
                color: 'var(--fg-secondary)',
              }}
            >
              <div
                style={{
                  fontSize: '0.62rem',
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 4,
                }}
              >
                Your words
              </div>
              {phase.answer}
            </div>
          )}
          <div
            style={{
              padding: 12,
              background: phase.verdict === 'pass'
                ? 'color-mix(in srgb, var(--tint-green) 10%, var(--bg))'
                : 'color-mix(in srgb, var(--tint-orange) 10%, var(--bg))',
              border:
                '0.5px solid ' +
                (phase.verdict === 'pass' ? 'var(--tint-green)' : 'var(--tint-orange)'),
              borderRadius: 8,
              fontSize: '0.82rem',
              lineHeight: 1.55,
              color: 'var(--fg)',
            }}
          >
            <div
              style={{
                fontSize: '0.66rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
                color: phase.verdict === 'pass' ? 'var(--tint-green)' : 'var(--tint-orange)',
                marginBottom: 6,
              }}
              >
              {phase.verdict === 'pass' ? 'Held' : 'Not yet'}
            </div>
            {phase.feedback}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={stop} style={buttonStyle(true, 'muted')}>
              Close
            </button>
            {phase.verdict === 'pass' ? (
              <>
                <button type="button" onClick={reviewNotes} style={buttonStyle(true, 'muted')}>
                  Review
                </button>
                <button type="button" onClick={openKesi} style={buttonStyle(true, 'muted')}>
                  Kesi
                </button>
                <button type="button" onClick={openRelations} style={buttonStyle(true, 'muted')}>
                  Relations
                </button>
              </>
            ) : (
              <button type="button" onClick={returnToRehearsal} style={buttonStyle(true, 'muted')}>
                Write again
              </button>
            )}
            <button type="button" onClick={next} style={buttonStyle(true)}>
              Ask another
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── sub-components ───────────────────────────────────────────────────────

function QuestionCard({ question }: { question: string }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        background: 'color-mix(in srgb, var(--accent) 6%, var(--bg))',
        border: '0.5px solid color-mix(in srgb, var(--accent) 30%, transparent)',
        borderLeft: '3px solid var(--accent)',
        borderRadius: 8,
        fontSize: '0.86rem',
        lineHeight: 1.55,
        color: 'var(--fg)',
      }}
    >
      <div
        style={{
          fontSize: '0.62rem',
          color: 'var(--accent)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        Ask
      </div>
      {question}
    </div>
  );
}

function buttonStyle(enabled: boolean, variant: 'accent' | 'muted' = 'accent'): React.CSSProperties {
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

// ── AI call + prompts ────────────────────────────────────────────────────

function buildQuestionPrompt(notes: Note[], history: ExaminerHistory): string {
  const ctx = notes
    .filter((note) => note.anchor.blockId !== 'loom-examiner-root')
    .map((n, i) => {
      const q = n.anchor.quote ? `Quote: "${n.anchor.quote}"` : '';
      const s = n.summary ? `Summary: ${n.summary}` : '';
      const c = n.content ? `Content: ${n.content.slice(0, 300)}` : '';
      return [`Note ${i + 1}`, q, s, c].filter(Boolean).join('\n');
    })
    .join('\n\n')
    .slice(0, 4000);

  const historyBlock = buildExaminerHistoryPrompt(history);

  return [
    'You are an AI tutor probing a learner for detail-level understanding.',
    'The learner has captured these notes on a specific doc:',
    '',
    ctx,
    '',
    historyBlock,
    '',
    'Generate ONE concise, specific question that tests whether they truly',
    'understand a DETAIL of this topic — not a surface recall question, but',
    'a transfer or application question. The question should be answerable',
    'in 2-3 sentences by someone who has genuinely learned the material.',
    '',
    'RULES:',
    '- Return ONLY the question, no preamble, no "Here is…"',
    '- One question only, ending with a question mark',
    '- Keep it under 200 characters',
    '- Prefer "why" or "how" over "what" or "define"',
    '- If the learner has retries, ask a narrower and more concrete question on the weak spot rather than a broader one',
    '- If the learner has been solid, ask a slightly more transfer-oriented question',
  ].join('\n');
}

function buildGradingPrompt(question: string, answer: string, notes: Note[]): string {
  const ctx = notes
    .slice(0, 8)
    .map((n) => n.content || n.summary || n.anchor.quote || '')
    .filter(Boolean)
    .join('\n---\n')
    .slice(0, 3000);

  return [
    'You are grading a learner\'s answer for conceptual correctness.',
    '',
    'QUESTION:',
    question,
    '',
    "LEARNER'S ANSWER:",
    answer,
    '',
    'CONTEXT (the learner\'s prior notes on this topic):',
    ctx,
    '',
    'Evaluate whether the answer demonstrates genuine understanding.',
    '',
    'Respond EXACTLY in this format:',
    'VERDICT: pass | retry',
    'FEEDBACK: [one paragraph, <300 chars, specific]',
    '',
    'Rules:',
    '- "pass" if the answer captures the core insight correctly',
    '- "retry" if the answer is wrong, missing key reasoning, or superficial',
    '- Feedback should point to WHAT was missing, not just say "wrong"',
  ].join('\n');
}

function parseGradingResponse(raw: string): { verdict: 'pass' | 'retry'; feedback: string } {
  const lines = raw.split('\n');
  let verdict: 'pass' | 'retry' = 'retry';
  let feedback = '';
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('VERDICT:')) {
      const v = t.slice('VERDICT:'.length).trim().toLowerCase();
      if (v.startsWith('pass')) verdict = 'pass';
      else verdict = 'retry';
    } else if (t.startsWith('FEEDBACK:')) {
      feedback = t.slice('FEEDBACK:'.length).trim();
    } else if (feedback && t) {
      feedback += ' ' + t;
    }
  }
  if (!feedback) feedback = raw.slice(0, 300);
  return { verdict, feedback };
}

function deriveExaminerHistory(notes: Note[]): ExaminerHistory {
  let passCount = 0;
  let retryCount = 0;
  let lastFailedAt = 0;
  let lastFailedQuestion = '';
  let lastFailedFeedback = '';

  for (const note of notes) {
    if (note.anchor.blockId !== 'loom-examiner-root') continue;
    const verdict = verdictFromExaminerNote(note.content);
    if (verdict === 'pass') passCount += 1;
    if (verdict === 'retry') {
      retryCount += 1;
      if (note.at >= lastFailedAt) {
        lastFailedAt = note.at;
        lastFailedQuestion = note.anchor.quote ?? note.summary ?? '';
        lastFailedFeedback = feedbackFromExaminerNote(note.content);
      }
    }
  }

  const quality =
    passCount === 0 && retryCount === 0
      ? 'untested'
      : retryCount > passCount || (retryCount >= 2 && passCount === 0)
        ? 'fragile'
        : retryCount > 0
          ? 'developing'
          : 'solid';

  return {
    passCount,
    retryCount,
    lastFailedQuestion: lastFailedQuestion || undefined,
    lastFailedFeedback: lastFailedFeedback || undefined,
    quality,
  };
}

function verdictFromExaminerNote(content: string): 'pass' | 'retry' | null {
  const lower = content.toLowerCase();
  if (lower.includes('**verdict**: pass')) return 'pass';
  if (lower.includes('**verdict**: retry')) return 'retry';
  return null;
}

function feedbackFromExaminerNote(content: string): string {
  const match = content.match(/\*\*Verdict\*\*:[^\n]+\n\n([\s\S]+)/i);
  return match?.[1]?.trim().slice(0, 220) ?? '';
}

function buildExaminerHistoryPrompt(history: ExaminerHistory) {
  if (history.quality === 'untested') return 'Prior examiner history: none yet.';
  const lines = [`Prior examiner history: ${history.passCount} pass, ${history.retryCount} retry.`];
  if (history.lastFailedQuestion) lines.push(`Most recent failed question: ${history.lastFailedQuestion}`);
  if (history.lastFailedFeedback) lines.push(`What was missing last time: ${history.lastFailedFeedback}`);
  if (history.quality === 'fragile') {
    lines.push('The learner is still fragile here. Ask a tighter, more concrete question on the same weak concept.');
  } else if (history.quality === 'developing') {
    lines.push('The learner is improving but not stable. Ask a medium-difficulty question that checks the previously weak edge.');
  } else {
    lines.push('The learner has been solid recently. Ask a slightly more transfer-oriented question.');
  }
  return lines.join('\n');
}

function buildRehearsalSeed(question: string, feedback: string) {
  const parts = [
    'Rebuild the missing edge in your own words.',
  ];
  if (question.trim()) {
    parts.push('', `Question: ${question.trim()}`);
  }
  if (feedback.trim()) {
    parts.push('', `What was missing: ${feedback.trim()}`);
  }
  parts.push('', 'Answer again, cleanly and from memory:');
  return parts.join('\n');
}

async function callAi(prompt: string): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`AI call failed: ${response.status}`);
  }
  return readSseToString(response.body);
}

async function readSseToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') return result;
          try {
            const obj = JSON.parse(payload);
            if (typeof obj.delta === 'string') result += obj.delta;
          } catch {
            // ignore non-JSON data lines
          }
        }
      }
    }
  }
  return result;
}

function docHrefFromDocId(docId: string): string {
  if (docId.startsWith('wiki/')) return `/${docId}`;
  if (docId.startsWith('know/')) {
    const rest = docId.slice(5);
    const idx = rest.indexOf('__');
    if (idx >= 0) return `/knowledge/${rest.slice(0, idx)}/${rest.slice(idx + 2)}`;
    return `/knowledge/${rest}`;
  }
  return '/';
}

function docTitleFromDocId(docId: string): string {
  const slug = docId.split('/').pop() ?? docId;
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
