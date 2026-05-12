import { NextResponse } from 'next/server';
import {
  addMaterial,
  addMaterials,
  deleteCowork,
  getCowork,
  removeMaterial,
  renameMaterial,
  updateCowork,
} from '../../../../lib/coworks-store';
import type { ScratchBlock, TidiedBlock } from '../../../../lib/cowork-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cowork = await getCowork(id);
  if (!cowork) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(cowork);
}

type MaterialInput = {
  kind: 'library' | 'url';
  ref: string;
  title: string;
  meta?: Record<string, string>;
  suggested?: boolean;
};

type PatchBody = {
  title?: string;
  description?: string;
  scratch?: ScratchBlock[];
  addMaterial?: MaterialInput;
  addMaterials?: MaterialInput[];
  removeMaterialId?: string;
  renameMaterial?: { id: string; title: string };
  reflection?: string;
  tidyDraft?: {
    markdown: string;
    tidiedBlocks: TidiedBlock[];
    generatedAt: number;
    userEdited: boolean;
  };
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const direct: Parameters<typeof updateCowork>[1] = {};
  if (typeof body.title === 'string') direct.title = body.title;
  if (typeof body.description === 'string') direct.description = body.description;
  if (Array.isArray(body.scratch)) direct.scratch = body.scratch;
  if (typeof body.reflection === 'string') {
    direct.reflection = body.reflection;
    // Record first-reflection timestamp so it's preserved across edits.
    const existing = await getCowork(id);
    if (existing && !existing.reflectedAt && body.reflection.trim().length > 0) {
      direct.reflectedAt = Date.now();
    }
  }
  if (body.tidyDraft) {
    direct.tidyDraft = body.tidyDraft;
  }
  if (Object.keys(direct).length > 0) {
    const updated = await updateCowork(id, direct);
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (body.addMaterial) {
    const updated = await addMaterial(id, body.addMaterial);
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (Array.isArray(body.addMaterials) && body.addMaterials.length > 0) {
    const updated = await addMaterials(id, body.addMaterials);
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (body.removeMaterialId) {
    const updated = await removeMaterial(id, body.removeMaterialId);
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (body.renameMaterial?.id && typeof body.renameMaterial.title === 'string') {
    const updated = await renameMaterial(id, body.renameMaterial.id, body.renameMaterial.title);
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const cowork = await getCowork(id);
  return NextResponse.json(cowork);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteCowork(id);
  return NextResponse.json({ ok });
}
