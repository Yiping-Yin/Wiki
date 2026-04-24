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

/** Auto-extracted topic for a folder within a collection (e.g. a Week or
 *  Assessment subfolder). The folder path key uses " / "-joined segments as
 *  produced by ingest (e.g. "Week / Week 1"). */
export type FolderTopic = {
  /** Short subtitle extracted from the folder's signature doc, e.g.
   *  "Introduction to Artificial Intelligence Fundamental Concepts". */
  title?: string;
  sourceDocId?: string;
};

/** Auto-extracted, user-correctable metadata for a collection (course, project).
 *  Populated by ingest from syllabus-like source files; never blocks display
 *  when fields are missing. The display layer should also read user overrides
 *  from user-data so rebuilds don't wipe corrections. */
export type CollectionMetadata = {
  /** Matches KnowledgeCategory.slug */
  categorySlug: string;
  /** Short course code, e.g. "INFS 3822". Derived from category.label. */
  courseCode?: string;
  /** Full descriptive title, e.g. "AI for Business Analytics". */
  courseName?: string;
  /** Term / semester string, e.g. "T1 2026" or "Semester 2, 2025". */
  term?: string;
  /** Teacher / lecturer names, first-listed first. */
  teachers?: string[];
  /** Which source file the metadata was pulled from (for audit + click-through). */
  sourceDocId?: string;
  /** Folder-level topics keyed by subcategory path (e.g. "Week / Week 1"). */
  folders?: Record<string, FolderTopic>;
};
