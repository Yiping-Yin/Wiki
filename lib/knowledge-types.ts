export type KnowledgeSub = {
  label: string;
  order: number;
  count: number;
};

export type KnowledgeCategory = {
  slug: string;
  label: string;
  count: number;
  subs: KnowledgeSub[];
};

export type KnowledgeDoc = {
  id: string;
  title: string;
  category: string;
  categorySlug: string;
  subcategory?: string;
  subOrder?: number;
  fileSlug: string;
  sourcePath: string;
  ext: string;
  size: number;
  hasText: boolean;
  preview: string;
};
