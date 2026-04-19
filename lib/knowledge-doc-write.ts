import { promises as fs } from 'node:fs';
import { readKnowledgeDocBody } from './knowledge-doc-cache';
import { getAllDocs } from './knowledge-store';
import { isEligibleCaptureDoc } from './knowledge-doc-state';
import { resolveKnowledgePath } from './server-config';
import { runKnowledgeIngest } from './knowledge-ingest';

type WriteKnowledgeDocBodyOptions = {
  docId: string;
  body: string;
  loadDocs?: typeof getAllDocs;
  writeFile?: typeof fs.writeFile;
  readBody?: typeof readKnowledgeDocBody;
  ingest?: typeof runKnowledgeIngest;
};

export async function writeKnowledgeDocBody({
  docId,
  body,
  loadDocs = getAllDocs,
  writeFile = fs.writeFile,
  readBody = readKnowledgeDocBody,
  ingest = runKnowledgeIngest,
}: WriteKnowledgeDocBodyOptions) {
  const docs = await loadDocs();
  const doc = docs.find((item) => item.id === docId);
  if (!doc) throw new Error(`Knowledge doc not found: ${docId}`);
  const existingBody = await readBody(doc.id);
  if (!existingBody || !isEligibleCaptureDoc({ title: existingBody.title, ext: doc.ext, body: existingBody.body })) {
    throw new Error('This document is not a Loom-owned empty capture doc.');
  }

  const abs = resolveKnowledgePath(doc.sourcePath);
  await writeFile(abs, body, 'utf8');
  await ingest();

  return {
    href: `/knowledge/${doc.categorySlug}/${doc.fileSlug}`,
    title: doc.title,
  };
}
