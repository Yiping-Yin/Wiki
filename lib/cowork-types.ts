/**
 * Loom Cowork — rehearsal workspace types.
 *
 * North Star: "为人的思考服务" — serve human thinking.
 *
 * A cowork is a goal-scoped rehearsal surface where the user dumps their
 * thinking into a scratch pad, drops material references inline, and then
 * asks AI to tidy the result into a clean draft. The AI NEVER writes
 * substantive content — only reformats what the user wrote.
 *
 * See: memory/project_loom_cowork_rehearsal.md
 */

export type CoworkMaterialKind = 'library' | 'url';

export type CoworkMaterial = {
  /** Stable id for this material within the cowork. */
  id: string;
  kind: CoworkMaterialKind;
  /** For 'library': the KnowledgeDoc.id. For 'url': the URL string. */
  ref: string;
  /** Display title. For 'library' pulled from doc.title; for 'url' user-set. */
  title: string;
  /** Optional extra context. For 'library': categorySlug + subcategory. */
  meta?: Record<string, string>;
  /** Unix ms. */
  addedAt: number;
  /** Whether Loom proposed this (and user accepted) vs. user added manually. */
  suggested?: boolean;
};

/** A block in the scratch pad. The pad is an ordered list of blocks;
 *  'text' blocks are plain paragraphs (no formatting), 'chip' blocks
 *  reference an attached material, 'image' blocks hold a pasted/dropped
 *  image as a data URL so the whole cowork remains portable inside one
 *  JSON file. Serializing this way keeps storage simple and the tidy-AI
 *  prompt straightforward (non-text blocks are never sent to AI). */
export type ScratchBlock =
  | { kind: 'text'; id: string; content: string }
  | { kind: 'chip'; id: string; materialId: string }
  | { kind: 'image'; id: string; dataUrl: string; alt?: string; widthPx?: number };

/** Per-block AI tidy result. Keyed by the scratch text block id so we can
 *  reliably reassemble the final document + diff each block against its
 *  scratch origin. Rejected = code-level validation failed OR user opted out;
 *  in either case the block renders its original content. */
export type TidiedBlock = {
  /** Matches ScratchBlock.id for text blocks. */
  id: string;
  /** AI output after per-block validation. */
  content: string;
  /** Original scratch content for this block — kept for diff + fallback. */
  originalContent: string;
  /** 'ok' = AI output accepted, 'fallback' = validation failed so original is used,
   *  'user-reverted' = user explicitly kept the original version. */
  status: 'ok' | 'fallback' | 'user-reverted';
  /** If 'fallback', why. */
  fallbackReason?: string;
};

export type Cowork = {
  id: string;
  categorySlug: string;
  title: string;
  description: string;
  materials: CoworkMaterial[];
  scratch: ScratchBlock[];
  /** Last AI-tidy output. Stored per-block so diff / revert work at block
   *  granularity, not whole-document. `markdown` is the assembled output
   *  used for display + export (derived from tidiedBlocks but cached). */
  tidyDraft?: {
    markdown: string;
    tidiedBlocks: TidiedBlock[];
    generatedAt: number;
    /** True once the user has edited the tidied content away from the raw
     *  AI result — used to warn on Regenerate. */
    userEdited?: boolean;
  };
  /** Retrospective the user writes after executing the real project. Loom's
   *  unique closed-loop: rehearse → execute (elsewhere) → come back and
   *  reflect on "what I actually did vs what I rehearsed." Stays optional —
   *  presence of content is the signal that the rehearsal has been
   *  followed through. */
  reflection?: string;
  /** Unix ms when reflection was first saved. */
  reflectedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type CoworkSummary = Pick<
  Cowork,
  'id' | 'categorySlug' | 'title' | 'description' | 'createdAt' | 'updatedAt'
> & {
  materialCount: number;
  scratchBlockCount: number;
  hasTidyDraft: boolean;
  hasReflection: boolean;
};
