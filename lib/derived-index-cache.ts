import path from 'node:path';

const ROOT = process.cwd();
const INDEX_ROOT = path.join(ROOT, 'knowledge', '.cache', 'indexes');

export function derivedIndexRoot() {
  return INDEX_ROOT;
}

export function ragIndexPath() {
  return path.join(INDEX_ROOT, 'rag-index.json');
}

export function relatedIndexPath() {
  return path.join(INDEX_ROOT, 'related.json');
}

export function searchIndexPath() {
  return path.join(INDEX_ROOT, 'search-index.json');
}

export function atlasIndexPath() {
  return path.join(INDEX_ROOT, 'atlas.json');
}
