'use client';
/**
 * Auto-embed notes after save. Fire-and-forget — embedding failure
 * doesn't affect the save itself.
 */
import { putEmbedding } from './embeddings';

export async function embedNoteAfterSave(
  noteId: string,
  docId: string,
  content: string,
  quote?: string,
): Promise<void> {
  const text = [quote, content].filter(Boolean).join('\n\n').trim();
  if (text.length < 10) return; // Too short to be meaningful

  try {
    const r = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 2000) }),
    });
    if (!r.ok) return;
    const { vector } = await r.json();
    if (!vector || !Array.isArray(vector)) return;
    await putEmbedding(noteId, docId, new Float32Array(vector), text);
  } catch {
    // Fire-and-forget
  }
}
