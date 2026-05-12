import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { loomContentRootConfigPath } from '../../../lib/paths';
import { invalidateKnowledgeStoreCache } from '../../../lib/knowledge-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Ingest can take minutes on large libraries — keep it alive.
export const maxDuration = 600;

type IngestResult = {
  ok: boolean;
  durationMs: number;
  contentRoot: string;
  error?: string;
};

export async function POST(): Promise<Response> {
  const start = Date.now();
  let contentRoot: string;
  try {
    const raw = await fs.readFile(loomContentRootConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as { contentRoot?: string };
    contentRoot = (parsed.contentRoot ?? '').trim();
  } catch {
    return NextResponse.json<IngestResult>(
      {
        ok: false,
        durationMs: 0,
        contentRoot: '',
        error: 'contentRoot not configured — pick a folder first',
      },
      { status: 400 },
    );
  }

  if (!contentRoot) {
    return NextResponse.json<IngestResult>(
      { ok: false, durationMs: 0, contentRoot: '', error: 'contentRoot empty' },
      { status: 400 },
    );
  }

  // Point the ingest at the user's configured folder for this invocation.
  process.env.LOOM_KNOWLEDGE_ROOT = contentRoot;

  try {
    const mod = await import('../../../scripts/ingest-knowledge');
    await mod.runIngest();
    invalidateKnowledgeStoreCache();
    return NextResponse.json<IngestResult>({
      ok: true,
      durationMs: Date.now() - start,
      contentRoot,
    });
  } catch (err) {
    return NextResponse.json<IngestResult>(
      {
        ok: false,
        durationMs: Date.now() - start,
        contentRoot,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
