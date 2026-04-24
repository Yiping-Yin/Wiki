import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './server-config';
import { applyCorrections, readCorrections } from './source-corrections';

const ROOT = CONTENT_ROOT;
const RUNTIME_DOCS_DIR = path.join(ROOT, 'knowledge', '.cache', 'docs');
const LEGACY_DOCS_DIR = path.join(ROOT, 'public', 'knowledge', 'docs');

export type KnowledgeDocBody = {
  id: string;
  title: string;
  body: string;
};

export function knowledgeDocRuntimeDir() {
  return RUNTIME_DOCS_DIR;
}

export function knowledgeDocRuntimePath(id: string) {
  return path.join(RUNTIME_DOCS_DIR, `${id}.json`);
}

export function knowledgeDocLegacyPath(id: string) {
  return path.join(LEGACY_DOCS_DIR, `${id}.json`);
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
