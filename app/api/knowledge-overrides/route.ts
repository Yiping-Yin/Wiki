import { NextResponse } from 'next/server';
import {
  patchKnowledgeOverrides,
  readKnowledgeOverrides,
  type CollectionOverride,
  type FolderOverride,
} from '../../../lib/knowledge-overrides';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const overrides = await readKnowledgeOverrides();
  return NextResponse.json(overrides);
}

type PatchBody = {
  collections?: Record<string, CollectionOverride>;
  folders?: Record<string, Record<string, FolderOverride>>;
};

export async function POST(req: Request) {
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const next = await patchKnowledgeOverrides(body);
  return NextResponse.json(next);
}
