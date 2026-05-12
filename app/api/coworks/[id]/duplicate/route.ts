import { NextResponse } from 'next/server';
import { duplicateCowork } from '../../../../../lib/coworks-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fresh = await duplicateCowork(id);
  if (!fresh) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(fresh);
}
