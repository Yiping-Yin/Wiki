export type KnowledgeSub = {
  label: string;
  order: number;
  count: number;
};

export type KnowledgeCategoryKind = 'source' | 'wiki';

export type KnowledgeCategory = {
  slug: string;
  label: string;
  count: number;
  subs: KnowledgeSub[];
  kind: KnowledgeCategoryKind;
};

export type SourceLibraryGroupRecord = {
  id: string;
  label: string;
  order: number;
};

export type SourceLibraryMembership = {
  categorySlug: string;
  groupId: string;
  order: number;
  hidden?: boolean;
};

export type SourceLibraryMetadata = {
  groups: SourceLibraryGroupRecord[];
  memberships: SourceLibraryMembership[];
};

export type SourceLibraryGroup = SourceLibraryGroupRecord & {
  count: number;
  categories: KnowledgeCategory[];
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
