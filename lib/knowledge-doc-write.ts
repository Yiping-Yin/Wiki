import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readKnowledgeDocBody } from './knowledge-doc-cache';
import { getAllDocs } from './knowledge-store';
import { isEligibleCaptureDoc } from './knowledge-doc-state';
import { EXECUTION_ROOT, resolveKnowledgePath } from './server-config';
import { runKnowledgeIngest } from './knowledge-ingest';
import { loomUserDataRoot } from './paths';

type WriteKnowledgeDocBodyOptions = {
  docId: string;
  body: string;
  loadDocs?: typeof getAllDocs;
  writeFile?: typeof fs.writeFile;
  readBody?: typeof readKnowledgeDocBody;
  ingest?: typeof runKnowledgeIngest;
};

function isWithin(root: string, candidate: string) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

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
  if (!isWithin(loomUserDataRoot(), abs)) {
    throw new Error('Loom will not write into source library files.');
  }
  await writeFile(abs, body, 'utf8');
  await ingest({ cwd: EXECUTION_ROOT });

  return {
    href: `/knowledge/${doc.categorySlug}/${doc.fileSlug}`,
    title: doc.title,
  };
}
