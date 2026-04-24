'use client';
/**
 * Auto-embed notes after save. Fire-and-forget — embedding failure
 * doesn't affect the save itself. Phase 5: routed through the Swift
 * `loomEmbed` bridge (NLEmbedding) rather than the retired Ollama-backed
 * `/api/embed` route.
 */
import { embed, isEmbedAvailable } from '../embed-client';
import { putEmbedding } from './embeddings';

export async function embedNoteAfterSave(
  noteId: string,
  docId: string,
  docHref: string,
  anchorId: string,
  content: string,
  quote?: string,
): Promise<void> {
  const text = [quote, content].filter(Boolean).join('\n\n').trim();
  if (text.length < 10) return; // Too short to be meaningful
  if (!isEmbedAvailable()) return; // Not running inside Loom — skip silently.
  try {
    const result = await embed(text.slice(0, 2000));
    await putEmbedding(noteId, docId, docHref, anchorId, new Float32Array(result.vector), text);
  } catch {
    // Fire-and-forget
  }
}
