/**
 * Backfill embeddings for all existing notes.
 *
 * Run: npx tsx scripts/backfill-embeddings.ts
 *
 * Reads all traces from IndexedDB (via a headless browser or direct IDB),
 * converts to Notes, then calls /api/embed for each and stores vectors.
 *
 * Since this is a Node script and can't access browser IndexedDB directly,
 * it calls the Loom server's API endpoints instead.
 *
 * Prerequisites: Loom server running on localhost:3001, Ollama running.
 */

const SERVER = 'http://localhost:3001';

async function main() {
  console.log('Backfilling embeddings for existing notes...');
  console.log('Server:', SERVER);

  // Step 1: Check server is up
  try {
    const r = await fetch(`${SERVER}/api/health`);
    if (!r.ok) throw new Error(`Server not ready: ${r.status}`);
    console.log('✓ Server is up');
  } catch (err) {
    console.error('✗ Cannot reach server. Start Loom first.');
    process.exit(1);
  }

  // Step 2: Check Ollama
  try {
    const r = await fetch('http://localhost:11434/api/tags');
    if (!r.ok) throw new Error('Ollama not responding');
    console.log('✓ Ollama is up');
  } catch {
    console.error('✗ Ollama not running. Start it first.');
    process.exit(1);
  }

  // Step 3: Test embed endpoint
  try {
    const r = await fetch(`${SERVER}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test embedding backfill' }),
    });
    const d = await r.json();
    if (!d.vector) throw new Error('No vector returned');
    console.log(`✓ Embed API works (${d.dims} dims, ${d.model})`);
  } catch (err) {
    console.error('✗ Embed API failed:', err);
    process.exit(1);
  }

  console.log('');
  console.log('Note: This script cannot directly access browser IndexedDB.');
  console.log('To backfill, open Loom in the browser and run this in the console:');
  console.log('');
  console.log(`
// Paste this into Loom's browser console (⌘⌥I → Console):
(async () => {
  const { traceStore } = await import('/lib/trace/store');
  const { notesFromTraces } = await import('/lib/note/from-trace');
  const { putEmbedding } = await import('/lib/note/embeddings');

  const traces = await traceStore.getAll();
  const notes = notesFromTraces(traces);
  console.log('Total notes:', notes.length);

  let done = 0, skipped = 0, failed = 0;
  for (const note of notes) {
    const text = [note.anchor.quote, note.content].filter(Boolean).join('\\n\\n').trim();
    if (text.length < 10) { skipped++; continue; }
    try {
      const r = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 2000) }),
      });
      const { vector } = await r.json();
      if (vector) {
        await putEmbedding(note.id, note.anchor.target || '', new Float32Array(vector), text);
        done++;
      } else { failed++; }
    } catch { failed++; }
    if (done % 10 === 0) console.log('Progress:', done, 'embedded,', skipped, 'skipped,', failed, 'failed');
  }
  console.log('Done!', done, 'embedded,', skipped, 'skipped,', failed, 'failed');
})();
  `.trim());
}

main();
