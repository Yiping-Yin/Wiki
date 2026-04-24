import { NextResponse } from 'next/server';
import { createCowork, listCoworksByCategory } from '../../../lib/coworks-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const categorySlug = url.searchParams.get('category')?.trim() ?? '';
  if (!categorySlug) {
    return NextResponse.json({ error: 'category required' }, { status: 400 });
  }
  const coworks = await listCoworksByCategory(categorySlug);
  return NextResponse.json({ coworks });
}

type CreateBody = {
  categorySlug?: string;
  title?: string;
  description?: string;
};

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const categorySlug = body.categorySlug?.trim() ?? '';
  const title = body.title?.trim() ?? '';
  if (!categorySlug || !title) {
    return NextResponse.json(
      { error: 'categorySlug and title required' },
      { status: 400 },
    );
  }
  const cowork = await createCowork({
    categorySlug,
    title,
    description: body.description,
  });
  return NextResponse.json(cowork);
}
