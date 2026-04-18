import { promises as fs } from 'node:fs';
import { getAllDocs } from './knowledge-store';
import { resolveKnowledgePath } from './server-config';
import { runKnowledgeIngest } from './knowledge-ingest';

type WriteKnowledgeDocBodyOptions = {
  docId: string;
  body: string;
  loadDocs?: typeof getAllDocs;
  writeFile?: typeof fs.writeFile;
  ingest?: typeof runKnowledgeIngest;
};

export async function writeKnowledgeDocBody({
  docId,
  body,
  loadDocs = getAllDocs,
  writeFile = fs.writeFile,
  ingest = runKnowledgeIngest,
}: WriteKnowledgeDocBodyOptions) {
  const docs = await loadDocs();
  const doc = docs.find((item) => item.id === docId);
  if (!doc) throw new Error(`Knowledge doc not found: ${docId}`);

  const abs = resolveKnowledgePath(doc.sourcePath);
  await writeFile(abs, body, 'utf8');
  await ingest();

  return {
    href: `/knowledge/${doc.categorySlug}/${doc.fileSlug}`,
    title: doc.title,
  };
}
