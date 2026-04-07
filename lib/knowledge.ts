import manifest from './knowledge-manifest.json';

export type KnowledgeDoc = {
  id: string;
  title: string;
  category: string;
  categorySlug: string;
  fileSlug: string;
  sourcePath: string;
  ext: string;
  size: number;
  hasText: boolean;
  preview: string;
};

export const allDocs = manifest as KnowledgeDoc[];

export function docsByCategory(slug: string) {
  return allDocs.filter((d) => d.categorySlug === slug);
}

export function findDoc(category: string, fileSlug: string) {
  return allDocs.find((d) => d.categorySlug === category && d.fileSlug === fileSlug);
}

export function neighborsInCategory(category: string, fileSlug: string) {
  const list = docsByCategory(category).sort((a, b) => a.title.localeCompare(b.title));
  const i = list.findIndex((d) => d.fileSlug === fileSlug);
  return {
    prev: i > 0 ? list[i - 1] : null,
    next: i >= 0 && i < list.length - 1 ? list[i + 1] : null,
  };
}
