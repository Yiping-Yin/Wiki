'use client';

import { useMemo, useState } from 'react';
import { resolveAiNotice } from '../../lib/ai-provider-health';
import { runAiText } from '../../lib/ai/runtime';
import { getAiStage } from '../../lib/ai/stage-model';
import { organizeIntoNoteSystemPrompt } from '../../lib/ai/system-prompt';
import { canCaptureInline } from '../../lib/knowledge-doc-state';
import { openSettingsPanel } from '../../lib/settings-panel';
import { useAiHealth } from '../../lib/use-ai-health';
import { AiInlineHint } from '../unified/AiStagePrimitives';

type AttachedSource = {
  name: string;
  size: number;
  text?: string;
  textExtractable: boolean;
};

type CaptureProgressPhase = 'idle' | 'organizing' | 'saving' | 'opening';

export function EmptyDocCaptureSurface({
  docId,
  title,
  categoryLabel,
}: {
  docId: string;
  title: string;
  categoryLabel: string;
}) {
  const [draft, setDraft] = useState('');
  const [sources, setSources] = useState<AttachedSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [progressPhase, setProgressPhase] = useState<CaptureProgressPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const { availability } = useAiHealth();
  const activeNotice = resolveAiNotice(availability.notice);

  const importedSources = useMemo(
    () => sources.filter((item) => item.textExtractable && item.text),
    [sources],
  );
  const canOrganize = availability.canSend && !busy && (draft.trim().length > 0 || importedSources.length > 0);
  const progressMessage = progressPhase === 'organizing'
    ? 'Preparing the first note with AI…'
    : progressPhase === 'saving'
      ? 'Saving the organized page to this topic…'
      : progressPhase === 'opening'
        ? 'Opening the first organized page…'
        : null;

  async function attachFile(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', categoryLabel);

    const response = await fetch('/api/upload', { method: 'POST', body: fd });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? 'Upload failed');

    const textExtractable = Boolean(json.textExtractable ?? canCaptureInline(file.name));
    const extractedText = textExtractable ? await file.text() : undefined;

    setSources((prev) => [
      {
        name: json.name ?? file.name,
        size: file.size,
        textExtractable,
        text: extractedText,
      },
      ...prev,
    ]);
  }

  async function onInputFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      await attachFile(file);
    }
  }

  async function organize() {
    if (!draft.trim() && importedSources.length === 0) return;
    if (!availability.canSend) {
      setError(availability.notice ?? 'AI unavailable — Open Settings to check provider status, then retry.');
      return;
    }
    setBusy(true);
    setProgressPhase('organizing');
    setError(null);
    try {
      let full = '';
      await runAiText({
        stage: getAiStage('capture-organize').id,
        messages: [{ role: 'user', content: draft.trim() || '(no typed draft)' }],
        context: organizeIntoNoteSystemPrompt({
          sourceTitle: title,
          importedSources: importedSources.map((item) => ({
            name: item.name,
            text: item.text ?? '',
          })),
        }),
        onDelta: (_delta, next) => {
          full = next;
        },
      });

      setProgressPhase('saving');
      const save = await fetch('/api/knowledge/doc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docId, body: full }),
      });
      const json = await save.json();
      if (!save.ok) throw new Error(json.error ?? 'Save failed');

      setProgressPhase('opening');
      window.location.assign(json.href);
    } catch (e: any) {
      setError(e.message ?? 'Organize failed');
      setProgressPhase('idle');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: '0.75rem' }}>
      <div style={{ color: 'var(--fg-secondary)', fontSize: '0.95rem', lineHeight: 1.6, maxWidth: 720 }}>
        This topic is still empty. Start writing, paste rough notes, or attach one source, then let Loom organize the first source page.
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Start writing, paste rough notes, or drop one source…"
        rows={12}
        disabled={busy}
        style={{
          width: '100%',
          minHeight: 280,
          borderRadius: 18,
          border: '0.5px solid var(--mat-border)',
          background: 'color-mix(in srgb, var(--bg-elevated) 72%, transparent)',
          color: 'var(--fg)',
          padding: '1rem 1.1rem',
          font: 'inherit',
          lineHeight: 1.6,
          resize: 'vertical',
          outline: 'none',
        }}
      />

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          if (!e.dataTransfer?.files?.length) return;
          try {
            await onInputFiles(e.dataTransfer.files);
          } catch (err: any) {
            setError(err.message ?? 'Upload failed');
          }
        }}
        style={{
          border: '1px dashed var(--mat-border)',
          borderRadius: 14,
          padding: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ color: 'var(--fg-secondary)', fontSize: '0.88rem' }}>
          Drop one text source here, or pick a file to attach it to this topic.
        </div>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            border: '0.5px solid var(--mat-border)',
            borderRadius: 999,
            padding: '0.55rem 0.85rem',
            cursor: 'pointer',
            color: 'var(--fg)',
            fontSize: '0.82rem',
          }}
        >
          Pick a file
          <input
            type="file"
            accept=".md,.mdx,.txt,.pdf,.docx,.doc,.pptx,.ppt"
            multiple
            disabled={busy}
            onChange={async (e) => {
              try {
                if (e.target.files) await onInputFiles(e.target.files);
              } catch (err: any) {
                setError(err.message ?? 'Upload failed');
              } finally {
                e.target.value = '';
              }
            }}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {sources.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700 }}>
            Attached sources
          </div>
          {sources.map((source, index) => (
            <div
              key={`${source.name}:${index}`}
              style={{
                border: '0.5px solid var(--mat-border)',
                borderRadius: 12,
                padding: '0.75rem 0.9rem',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{source.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 2 }}>
                  {source.textExtractable ? 'Will be included in AI organization' : 'Attached to topic only; not included in first-pass organization'}
                </div>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                {(source.size / 1024).toFixed(0)} KB
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <div style={{ color: 'var(--tint-red)', fontSize: '0.84rem', lineHeight: 1.5 }}>
          {error}
        </div>
      ) : null}

      {!error && activeNotice.message ? (
        <AiInlineHint
          tone={availability.tone ?? 'muted'}
          actionLabel={activeNotice.action?.label}
          onAction={activeNotice.action?.kind === 'open-settings' ? openSettingsPanel : null}
        >
          {activeNotice.message}
        </AiInlineHint>
      ) : null}

      {!error && progressMessage ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
          {progressMessage}
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={organize}
          disabled={!canOrganize}
          style={{
            borderRadius: 999,
            border: '0.5px solid var(--accent)',
            background: busy ? 'transparent' : 'color-mix(in srgb, var(--accent) 12%, transparent)',
            color: canOrganize ? 'var(--fg)' : 'var(--muted)',
            padding: '0.62rem 0.95rem',
            fontSize: '0.86rem',
            cursor: canOrganize ? 'pointer' : 'default',
            opacity: canOrganize ? 1 : 0.6,
          }}
        >
          {progressPhase === 'saving'
            ? 'Saving…'
            : progressPhase === 'opening'
              ? 'Opening…'
              : busy
                ? 'Organizing…'
                : 'Organize into note'}
        </button>
      </div>
    </div>
  );
}
