'use client';
/**
 * RehearsalPanel · editable scratch surface for the Producing learning state.
 *
 * This is the first writable component in Loom's unified Personal Layer ×
 * View architecture. It provides:
 *
 *   - A plain textarea for free-form markdown + LaTeX writing (the "rehearsal")
 *   - ⌘K inline AI transform: select text, press ⌘K, AI converts to formal
 *     form (LaTeX / Mermaid / structured list / etc) and replaces the selection
 *   - ⌘S to save the current rehearsal as a Note (anchored to current doc)
 *   - Save & examine: move directly into the Examiner loop on the same doc
 *   - Esc to clear the local draft without saving
 *
 * The Producing preset (lib/view/presets.ts) places this panel in the center.
 * For tonight it persists via appendRehearsal() which writes a thought-anchor
 * trace event; the adapter picks it up in the Notes list next render.
 *
 * No fancy editor (CodeMirror/Tiptap) yet — plain textarea is enough to
 * validate the flow. Round 4 will upgrade to CodeMirror with markdown
 * syntax highlighting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { SourceDocId } from '../../lib/note/types';
import { appendRehearsal } from '../../lib/note/store';
import { REVIEW_RESUME_KEY, type ReviewResumePayload } from '../../lib/review-resume';

const MarkdownPreview = dynamic(
  () => import('../NoteRenderer').then((m) => m.NoteRenderer),
  { ssr: false },
);

type Props = {
  docId: SourceDocId | null;
  /** Called after a successful save so parent can refresh Notes list / continue the loop. */
  onSaved?: (next?: 'stay' | 'examine') => void;
  seedDraft?: string;
  seedLabel?: string;
};

export function RehearsalPanel({ docId, onSaved, seedDraft = '', seedLabel = '' }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [transforming, setTransforming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [bounce, setBounce] = useState(false);
  const [savedState, setSavedState] = useState<{ mode: 'stay' | 'examine'; at: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!seedDraft) return;
    setDraft((current) => (current.trim().length > 0 ? current : seedDraft));
  }, [seedDraft]);

  const persistDraft = useCallback(async (next: 'stay' | 'examine') => {
    if (!docId || !draft.trim() || saving) return;
    setSaving(true);
    setStatus(next === 'examine' ? 'Saving + opening the next pass…' : 'Saving…');
    try {
      await appendRehearsal({
        docId,
        docHref: docHrefFromDocId(docId),
        docTitle: docTitleFromDocId(docId),
        content: draft,
      });
      setDraft('');
      onSaved?.(next);
      setSavedState({ mode: next, at: Date.now() });
      // Micro-bounce: the panel physically pulses to confirm save
      setBounce(true);
      setStatus(null);
      window.setTimeout(() => setBounce(false), 350);
    } catch (err) {
      setStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [docId, draft, saving, onSaved]);

  const save = useCallback(() => {
    void persistDraft('stay');
  }, [persistDraft]);

  const saveAndExamine = useCallback(() => {
    void persistDraft('examine');
  }, [persistDraft]);

  const openReview = useCallback(() => {
    if (!docId) return;
    const payload: ReviewResumePayload = { href: docHrefFromDocId(docId), anchorId: null };
    try {
      sessionStorage.setItem(REVIEW_RESUME_KEY, JSON.stringify(payload));
    } catch {}
    router.push(docHrefFromDocId(docId));
  }, [docId, router]);

  const openKesi = useCallback(() => {
    router.push('/kesi');
  }, [router]);

  const openRelations = useCallback(() => {
    router.push(docId ? `/graph?focus=${encodeURIComponent(docId)}` : '/graph');
  }, [docId, router]);

  /**
   * ⌘K · transform the currently-selected text via AI.
   *
   * Flow:
   *  1. Get the textarea's current selection
   *  2. POST to /api/chat with a system prompt asking for formal transform
   *  3. Stream the SSE response, accumulate
   *  4. Replace the selection with the result
   *  5. User continues editing (AI output is just text in the textarea)
   */
  const transformSelection = useCallback(async () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) {
      setStatus('Select some text first');
      window.setTimeout(() => setStatus(null), 2000);
      return;
    }
    const selected = draft.slice(start, end);
    if (!selected.trim()) return;

    setTransforming(true);
    setStatus('⌘K shaping…');
    // Signal notch: AI is working
    window.dispatchEvent(new CustomEvent('loom:island', { detail: { type: 'ai-start' } }));
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: buildTransformPrompt(selected),
            },
          ],
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`AI call failed: ${response.status}`);
      }
      const result = await readSseToString(response.body);
      if (!result.trim()) {
        throw new Error('Empty response from AI');
      }
      // Replace selection with the AI-transformed result.
      const next = draft.slice(0, start) + result + draft.slice(end);
      setDraft(next);
      // Micro-bounce + notch signal
      setBounce(true);
      setStatus(null);
      window.setTimeout(() => setBounce(false), 350);
      // ai-end is dispatched in the finally block below
      // Re-place cursor at the end of the inserted content
      window.setTimeout(() => {
        if (textareaRef.current) {
          const cursor = start + result.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(cursor, cursor);
        }
      }, 0);
    } catch (err) {
      setStatus(
        `⌘K failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      window.setTimeout(() => setStatus(null), 3000);
    } finally {
      setTransforming(false);
      window.dispatchEvent(new CustomEvent('loom:island', { detail: { type: 'ai-end' } }));
    }
  }, [draft]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 's') {
        e.preventDefault();
        void save();
      } else if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault();
        void transformSelection();
      } else if (e.key === 'Escape') {
        if (draft.length > 0) {
          e.stopPropagation();
          if (confirm('Discard this draft?')) setDraft('');
        }
      }
    },
    [save, transformSelection, draft],
  );

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
        Pick a doc above and start writing from memory.
      </div>
    );
  }

  return (
    <div
      className="loom-unified-rehearsal"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: 10,
        gap: 8,
        transform: bounce ? 'scale(1.012)' : 'scale(1)',
        transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      {/* Toolbar */}
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
          <strong style={{ color: 'var(--accent)' }}>Write from memory</strong>
          {' · '}
          <span style={{ fontFamily: 'var(--mono)' }}>
            ⌘K shape · ⌘S save · Save & ask
          </span>
        </span>
        {status && (
          <span
            style={{
              color: 'var(--accent)',
              fontFamily: 'var(--mono)',
              fontSize: '0.68rem',
              opacity: transforming || saving ? 0.6 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            {status}
          </span>
        )}
      </div>

      {seedLabel && (
        <div
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {seedLabel}
        </div>
      )}

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={
          'Write what still holds in memory.\n\n' +
          '⌘K on a selection shapes it into a cleaner form.\n' +
          '⌘S saves it back to this doc.'
        }
        disabled={transforming}
        style={{
          flex: 1,
          minHeight: 120,
          resize: 'none',
          padding: '12px 14px',
          fontFamily: 'var(--display)',
          fontSize: '0.86rem',
          lineHeight: 1.6,
          color: 'var(--fg)',
          background: 'var(--bg)',
          border: '0.5px solid var(--mat-border)',
          borderRadius: 8,
          outline: 'none',
          opacity: transforming ? 0.7 : 1,
          transition: 'opacity 0.15s ease',
        }}
      />

      {/* Live preview (hide if draft is empty to save space) */}
      {draft.trim().length > 0 && (
        <div
          className="note-rendered"
          style={{
            maxHeight: '35%',
            overflow: 'auto',
            padding: '10px 14px',
            fontSize: '0.82rem',
            lineHeight: 1.55,
            background: 'color-mix(in srgb, var(--accent) 4%, var(--bg))',
            border: '0.5px dashed var(--mat-border)',
            borderRadius: 8,
            userSelect: 'text',
          }}
        >
          <div
            className="t-caption2"
            style={{
              fontSize: '0.6rem',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 6,
            }}
          >
            Preview
          </div>
          <MarkdownPreview source={draft} />
        </div>
      )}

      {savedState?.mode === 'stay' && !draft.trim() && (
        <div
          style={{
            padding: '10px 12px',
            borderTop: '0.5px solid var(--accent)',
            borderBottom: '0.5px solid var(--mat-border)',
            color: 'var(--fg-secondary)',
            fontSize: '0.8rem',
            lineHeight: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div>
            Saved into this weave. Continue from the current panel, open kesi, or look at its relations.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={openReview} style={buttonStyle(true, 'muted')}>
              Review
            </button>
            <button type="button" onClick={openKesi} style={buttonStyle(true, 'muted')}>
              Kesi
            </button>
            <button type="button" onClick={openRelations} style={buttonStyle(true, 'muted')}>
              Relations
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={save}
          disabled={!draft.trim() || saving || transforming}
          style={buttonStyle(Boolean(draft.trim()) && !saving && !transforming, 'muted')}
        >
          Save
        </button>
        <button
          type="button"
          onClick={saveAndExamine}
          disabled={!draft.trim() || saving || transforming}
          style={buttonStyle(Boolean(draft.trim()) && !saving && !transforming)}
        >
          Save & ask
        </button>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

function buildTransformPrompt(selection: string): string {
  return [
    'You are a content-format translator for a learning tool. The user is',
    'reconstructing a concept from memory and has selected a phrase they',
    'want converted to its proper formal form.',
    '',
    'Decide the appropriate form based on the content:',
    '- Mathematical description → LaTeX ($$...$$ for display, $...$ for inline)',
    '- Process / flow / relationship → Mermaid diagram (graph LR / flowchart)',
    '- Comparison / enumeration → markdown table or bullet list',
    '- Code description → a fenced code block with the right language',
    '- Formal definition → the definition written out in markdown',
    '',
    'RULES:',
    '- Return ONLY the transformed content. No explanation, no "Here is…",',
    '  no surrounding prose.',
    '- Preserve the meaning exactly.',
    '- If the selection is already in proper form, return it unchanged.',
    '',
    'Selection to transform:',
    '',
    selection,
  ].join('\n');
}

/**
 * Read the /api/chat SSE stream into a single string. Accumulates all
 * `data: {delta: "..."}` chunks until `data: [DONE]`.
 */
async function readSseToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Parse complete SSE messages (separated by blank line)
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      // Each chunk is like "data: {...}"
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
    if (idx >= 0) {
      return `/knowledge/${rest.slice(0, idx)}/${rest.slice(idx + 2)}`;
    }
    return `/knowledge/${rest}`;
  }
  return `/`;
}

function docTitleFromDocId(docId: string): string {
  const slug = docId.split('/').pop() ?? docId;
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
