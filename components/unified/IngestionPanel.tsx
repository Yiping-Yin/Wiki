'use client';
import { getAiStage } from '../../lib/ai/stage-model';
import { callAiPrompt } from '../../lib/ai/runtime';
/**
 * IngestionPanel · Phase 0 drag-drop ingestion for plain text / markdown files.
 *
 * MVP scope (Round 6):
 *   - Drop .md, .txt, .mdx files onto the panel
 *   - Read file content via FileReader
 *   - Send to /api/chat with a summarize + extract-key-points prompt
 *   - Receive AI output
 *   - Save the whole thing (file content + AI summary) as a Note anchored
 *     to a synthetic "ingested:<filename>" pseudo-doc id
 *   - Show the list of ingested items with their AI summaries
 *
 * NOT included (future):
 *   - PDF parsing (needs pdf.js integration, risky at this hour)
 *   - ZIP unpacking
 *   - Multi-file batch operations
 *   - AI-generated structure / chapter detection
 *   - Per-section ingestion (splitting into multiple Notes)
 *
 * The "ingested:<name>" pseudo-doc id lets ingested content live in the
 * same Note storage as everything else. Later, when native Note storage
 * lands, these can be migrated to proper uploaded docs.
 */
import { useCallback, useState } from 'react';
import type { Note } from '../../lib/note/types';
import { appendNote } from '../../lib/note/store';

type IngestionItem = {
  filename: string;
  sizeBytes: number;
  ingestedAt: number;
  status: 'processing' | 'done' | 'error';
  error?: string;
  summary?: string;
};

type Props = {
  /** Notes already ingested (from the Personal Layer), used to show history. */
  existingIngested: Note[];
};

const ACCEPT = '.md,.mdx,.txt,.markdown';
const MAX_BYTES = 1_000_000; // 1 MB per file

export function IngestionPanel({ existingIngested }: Props) {
  const ingestionStage = getAiStage('ingestion-summary');
  const [items, setItems] = useState<IngestionItem[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const ingestFile = useCallback(async (file: File) => {
    const placeholder: IngestionItem = {
      filename: file.name,
      sizeBytes: file.size,
      ingestedAt: Date.now(),
      status: 'processing',
    };
    setItems((prev) => [placeholder, ...prev]);

    try {
      if (file.size > MAX_BYTES) {
        throw new Error(
          `File too large: ${(file.size / 1024).toFixed(0)}KB > 1000KB`,
        );
      }
      const text = await file.text();
      if (!text.trim()) {
        throw new Error('File is empty');
      }
      const summary = await summarizeWithAi(text, file.name);

      // Save as a Note with a synthetic "ingested:<name>" target
      const pseudoDocId = `ingested:${file.name}`;
      await appendNote({
        docId: pseudoDocId,
        docHref: '/dev/unified',
        docTitle: `Ingested · ${file.name}`,
        content: `# ${file.name}\n\n## AI summary\n\n${summary}\n\n---\n\n## Original content\n\n${text.slice(0, 8000)}${text.length > 8000 ? '\n\n…(truncated)' : ''}`,
        summary: `📥 ${file.name} · ${summary.slice(0, 100)}`,
        anchor: {
          target: pseudoDocId,
          blockText: 'ingested',
          blockId: 'loom-ingestion-root',
        },
      });

      setItems((prev) =>
        prev.map((it) =>
          it === placeholder ? { ...it, status: 'done', summary } : it,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setItems((prev) =>
        prev.map((it) =>
          it === placeholder ? { ...it, status: 'error', error: msg } : it,
        ),
      );
    }
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingOver(false);
      setGlobalError(null);
      const fileList = e.dataTransfer?.files;
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList).filter((f) => {
        const name = f.name.toLowerCase();
        return (
          name.endsWith('.md') ||
          name.endsWith('.mdx') ||
          name.endsWith('.txt') ||
          name.endsWith('.markdown')
        );
      });
      if (files.length === 0) {
        setGlobalError('No supported files (accepts .md/.mdx/.txt)');
        return;
      }
      // Ingest sequentially to avoid hammering the AI endpoint
      for (const f of files) {
        await ingestFile(f);
      }
    },
    [ingestFile],
  );

  const onFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      for (const f of Array.from(files)) {
        await ingestFile(f);
      }
      // reset so the same file can be selected again
      e.target.value = '';
    },
    [ingestFile],
  );

  const historyItems = existingIngested
    .filter((n) => n.anchor.target?.startsWith('ingested:'))
    .sort((a, b) => b.at - a.at)
    .slice(0, 20);

  return (
    <div
      className="loom-unified-ingestion"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: 12,
        gap: 10,
      }}
    >
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={onDrop}
        style={{
          padding: '24px 16px',
          border: isDraggingOver
            ? '2px dashed var(--accent)'
            : '2px dashed var(--mat-border)',
          borderRadius: 12,
          background: isDraggingOver
            ? 'color-mix(in srgb, var(--accent) 8%, var(--bg))'
            : 'var(--bg)',
          textAlign: 'center',
          color: isDraggingOver ? 'var(--accent)' : 'var(--muted)',
          fontSize: '0.82rem',
          transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
        }}
      >
        <div style={{ marginBottom: 10, fontWeight: 500 }}>
          {isDraggingOver ? ingestionStage.title : 'Drop one source here'}
        </div>
        <label
          style={{
            display: 'inline-block',
            padding: '5px 12px',
            fontSize: '0.72rem',
            border: '0.5px solid var(--mat-border)',
            borderRadius: 6,
            cursor: 'pointer',
            background: 'var(--bg-elevated)',
            color: 'var(--fg)',
          }}
        >
          or pick a file
          <input
            type="file"
            accept={ACCEPT}
            multiple
            onChange={onFileInput}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {globalError && (
        <div
          style={{
            padding: 10,
            fontSize: '0.74rem',
            color: 'var(--tint-red)',
            background: 'color-mix(in srgb, var(--tint-red) 8%, var(--bg))',
            border: '0.5px solid var(--tint-red)',
            borderRadius: 6,
          }}
        >
          {globalError}
        </div>
      )}

      {/* Current session items */}
      {items.length > 0 && (
        <div>
          <div
            className="t-caption2"
            style={{
              fontSize: '0.62rem',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            This session
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((it, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '0.5px solid var(--mat-border)',
                  background: 'var(--bg-elevated)',
                  fontSize: '0.76rem',
                  color: 'var(--fg)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      color:
                        it.status === 'done'
                          ? 'var(--tint-green)'
                          : it.status === 'error'
                            ? 'var(--tint-red)'
                            : 'var(--accent)',
                      fontSize: '0.66rem',
                      }}
                  >
                    {it.status === 'done'
                      ? '✓'
                      : it.status === 'error'
                        ? '⚠'
                        : '◌'}
                  </span>
                  <strong style={{ flex: 1 }}>{it.filename}</strong>
                </div>
                {it.summary && (
                  <div
                    style={{
                      marginTop: 4,
                      color: 'var(--fg-secondary)',
                      fontSize: '0.72rem',
                      lineHeight: 1.5,
                    }}
                  >
                    {it.summary.slice(0, 200)}
                    {it.summary.length > 200 ? '…' : ''}
                  </div>
                )}
                {it.error && (
                  <div
                    style={{
                      marginTop: 4,
                      color: 'var(--tint-red)',
                      fontSize: '0.72rem',
                      lineHeight: 1.5,
                    }}
                  >
                    {it.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History from previous sessions */}
      {historyItems.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div
            className="t-caption2"
            style={{
              fontSize: '0.62rem',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Previously ingested
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            {historyItems.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '0.5px solid var(--mat-border)',
                  background: 'var(--bg)',
                  fontSize: '0.72rem',
                  color: 'var(--fg-secondary)',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <span style={{ color: 'var(--muted)', fontSize: '0.64rem' }}>
                  {new Date(n.at).toLocaleDateString()}
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {n.summary ?? n.anchor.target?.replace('ingested:', '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI call ──────────────────────────────────────────────────────────────

async function summarizeWithAi(content: string, filename: string): Promise<string> {
  const prompt = [
    'You are helping a learner ingest a new document into their learning workspace.',
    '',
    `The file is named: ${filename}`,
    '',
    'Read the content below and produce:',
    '1. A 2-3 sentence summary of the main topic',
    '2. A bulleted list of 5-8 key points / concepts covered',
    '',
    'RULES:',
    '- Return ONLY the summary + bullet points, no preamble, no "Here is..."',
    '- Be specific to THIS content, not generic',
    '- Use markdown formatting',
    '',
    'Content:',
    '',
    content.slice(0, 8000) + (content.length > 8000 ? '\n\n[truncated]' : ''),
  ].join('\n');

  return callAiPrompt(getAiStage('ingestion-summary').id, prompt);
}
