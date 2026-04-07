/**
 * Server-side query embedder, used by /api/ask.
 * Loads the local MiniLM model once and caches it for the process lifetime.
 */
let extractorPromise: Promise<any> | null = null;

export async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' });
    })();
  }
  return extractorPromise;
}

export async function embedQuery(text: string): Promise<number[]> {
  const extractor: any = await getExtractor();
  const r = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(r.data as Float32Array);
}

export function cosine(a: number[], b: number[]): number {
  // both already L2-normalised by the extractor → cosine = dot product
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
