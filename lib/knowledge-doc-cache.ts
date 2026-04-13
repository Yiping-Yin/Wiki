import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
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
  for (const candidate of paths) {
    try {
      return JSON.parse(await fs.readFile(candidate, 'utf-8')) as KnowledgeDocBody;
    } catch {}
  }
  return null;
}
