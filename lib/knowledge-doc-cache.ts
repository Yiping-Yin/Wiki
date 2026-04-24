import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './server-config';
import { resolveContentRoot } from './runtime-roots';
import { applyCorrections, readCorrections } from './source-corrections';

export type KnowledgeDocBody = {
  id: string;
  title: string;
  body: string;
};

function contentRoot() {
  return resolveContentRoot({ fallbackContentRoot: CONTENT_ROOT });
}

export function knowledgeDocRuntimeDir() {
  return path.join(contentRoot(), 'knowledge', '.cache', 'docs');
}

export function knowledgeDocRuntimePath(id: string) {
  return path.join(knowledgeDocRuntimeDir(), `${id}.json`);
}

export function knowledgeDocLegacyPath(id: string) {
  return path.join(contentRoot(), 'public', 'knowledge', 'docs', `${id}.json`);
}

export async function readKnowledgeDocBody(id: string): Promise<KnowledgeDocBody | null> {
  const paths = [knowledgeDocRuntimePath(id), knowledgeDocLegacyPath(id)];
  let doc: KnowledgeDocBody | null = null;
  for (const candidate of paths) {
    try {
      doc = JSON.parse(await fs.readFile(candidate, 'utf-8')) as KnowledgeDocBody;
      break;
    } catch {}
  }
  if (!doc) return null;
  // Apply user-authored Source Correct sidecar fixes (typos / mis-extraction)
  // on top of the raw extracted body. Corrections survive across reads but
  // stay isolated so rescan doesn't erase them.
  try {
    const corrections = await readCorrections(doc.id ?? id);
    if (corrections.length > 0 && doc.body) {
      doc = { ...doc, body: applyCorrections(doc.body, corrections) };
    }
  } catch {}
  return doc;
}
