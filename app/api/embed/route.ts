/**
 * /api/embed · text → vector embedding
 *
 * Uses local Ollama (nomic-embed-text) as primary backend.
 * Returns { vector: number[], dims: number, model: string }.
 *
 * In-memory LRU cache prevents redundant calls for the same text.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLLAMA_URL = 'http://localhost:11434/api/embeddings';
const MODEL = 'nomic-embed-text';
const MAX_TEXT = 2000;

// Simple LRU cache — max 500 entries
const cache = new Map<string, number[]>();
const MAX_CACHE = 500;

function cacheKey(text: string): string {
  // Simple hash for cache lookup
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return `${h}:${text.length}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = String(body.text ?? '').trim().slice(0, MAX_TEXT);
    if (text.length < 5) {
      return Response.json({ error: 'Text too short' }, { status: 400 });
    }

    // Check cache
    const key = cacheKey(text);
    const cached = cache.get(key);
    if (cached) {
      return Response.json({ vector: cached, dims: cached.length, model: MODEL, cached: true });
    }

    // Call Ollama
    const r = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: text }),
    });

    if (!r.ok) {
      const msg = await r.text().catch(() => '');
      return Response.json(
        { error: `Ollama error: ${r.status} ${msg}` },
        { status: 502 },
      );
    }

    const data = await r.json();
    const vector: number[] = data.embedding;

    if (!vector || !Array.isArray(vector) || vector.length === 0) {
      return Response.json({ error: 'Empty embedding' }, { status: 502 });
    }

    // Cache
    if (cache.size >= MAX_CACHE) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(key, vector);

    return Response.json({ vector, dims: vector.length, model: MODEL });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
