import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Fetch a URL and extract its <title>. Used by cowork URL chips so users
 * see a human-readable label instead of the raw URL string. Best-effort —
 * failures return the original URL so the caller can fall back gracefully.
 *
 * Safety:
 *  - Only http / https (no file:// / ftp:// / javascript:)
 *  - 5-second timeout
 *  - Max 1 MB response
 *  - Honest User-Agent
 */

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 1024 * 1024;
const USER_AGENT = 'LoomURLPreview/1.0 (+local)';

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function extractTitle(html: string): string | null {
  // Prefer Open Graph title; fall back to <title>.
  const og = html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (og && og[1]) return decodeEntities(og[1]).trim();
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t && t[1]) return decodeEntities(t[1]).replace(/\s+/g, ' ').trim();
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url')?.trim() ?? '';
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: 'invalid URL' }, { status: 400 });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return NextResponse.json({ error: 'only http/https' }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(target.toString(), {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json({ title: null, status: res.status });
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('html')) {
      return NextResponse.json({ title: null, note: 'non-html' });
    }

    // Read up to MAX_BYTES so we don't buffer giant pages.
    const reader = res.body?.getReader();
    if (!reader) return NextResponse.json({ title: null });
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let html = '';
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      html += decoder.decode(value, { stream: true });
      // Early exit once we've seen </head> — title lives there.
      if (/<\/head>/i.test(html)) break;
      if (total >= MAX_BYTES) break;
    }
    html += decoder.decode();
    try { reader.cancel().catch(() => {}); } catch { /* ignore */ }

    const title = extractTitle(html);
    return NextResponse.json({ title: title ?? null });
  } catch (err) {
    clearTimeout(timer);
    return NextResponse.json({
      title: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
