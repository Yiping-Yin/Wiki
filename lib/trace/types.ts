/**
 * Trace · the core data primitive of Loom.
 *
 * A Trace represents one unit of learning interaction. It can be:
 *   - 'reading'  — you and AI working through a source document
 *   - 'problem'  — you and AI solving a problem (with decompose/spec/execute phases)
 *   - 'concept'  — you and AI nailing down a single concept (often a child of a problem trace)
 *   - 'free'     — open-ended thinking with no source attached (the Scratchpad mode)
 *
 * Traces form a tree (parent/children). Their internal state is an append-only
 * event log — every highlight, note, message, visit, etc. is an event. The
 * "current state" of a trace is the fold of its events.
 *
 * The persistence layer (lib/trace/store) is IndexedDB.
 */

export type TraceKind = 'reading' | 'problem' | 'concept' | 'free';

/** Where in the source material an event is anchored. */
export type SourceAnchor = {
  /** Page number for PDFs. */
  page?: number;
  /** Markdown section id or paragraph id. */
  paragraphId?: string;
  /** Stable or reconstructed top-level source block id. */
  blockId?: string;
  /** Character range within the block for fragment-precise restore. */
  charStart?: number;
  charEnd?: number;
  /** The exact text the user selected, if any. */
  selection?: string;
};

/** Append-only events that make up a Trace's history. */
export type TraceEvent =
  | { kind: 'message'; role: 'user' | 'assistant'; content: string; at: number; quotedAnchor?: SourceAnchor; }
  | { kind: 'highlight'; text: string; tint: string; anchor?: SourceAnchor; at: number; }
  | { kind: 'note'; content: string; at: number; }
  | { kind: 'visit'; at: number; durationMs?: number; }
  /**
   * §7 · Crystallize — lock a thinking unit as "final form".
   *
   * Two scopes:
   * - Trace-level (no anchorId): the whole reading session is done. This is
   *   the legacy behavior used by /kesi to surface finished panels.
   * - Anchor-level (with anchorId): a single thought container is locked.
   *   New versions cannot be appended to a locked container without first
   *   un-crystallizing. Multiple anchor-level crystallize events may exist
   *   in the same trace, one per locked container.
   */
  | { kind: 'crystallize'; summary: string; at: number; anchorId?: string; }
  | { kind: 'prereq-resolved'; concept: string; childTraceId?: string; at: number; }
  | { kind: 'spec-locked'; content: string; at: number; }
  | { kind: 'execute-step'; content: string; verified?: boolean; at: number; }
  | { kind: 'mastery-update'; from: number; to: number; reason?: string; at: number; }
  | { kind: 'sticky'; text: string; scrollY: number; at: number; }
  /**
   * §8 · A new full version of the Live Artifact for this trace's doc.
   * Recompile events are the only source of the visible main-frame note;
   * each one fully replaces the previous version. Append-only — every
   * historical version remains in the event log, in order, replayable.
   */
  | { kind: 'recompile'; content: string; at: number; basedOnVersion?: number; }
  /**
   * §38 · A thought anchored to a specific position in the source doc.
   * Created when the user discusses a passage with AI (Chat mode ✦) and
   * commits with ✓. The Live Note is the concatenation of all thought-
   * anchors ordered by their position in the document.
   *
   * anchorType + anchorId together identify WHERE in the source:
   *   heading:section-3-2     (markdown heading id)
   *   page:12                 (PDF page number)
   *   ts:04:32                (video timestamp)
   *   slide:8                 (presentation slide)
   *   paragraph:3             (nth paragraph in prose)
   */
  | {
      kind: 'thought-anchor';
      anchorType: 'heading' | 'page' | 'timestamp' | 'slide' | 'paragraph';
      anchorId: string;
      /** Base source block the anchor belongs to; needed for fragment-level notes */
      anchorBlockId?: string;
      /** Normalized text fingerprint of the base block for restore after DOM reindexing */
      anchorBlockText?: string;
      /** Vertical offset within the base block, in px */
      anchorOffsetPx?: number;
      /** Character range within the base block for fragment-level notes */
      anchorCharStart?: number;
      anchorCharEnd?: number;
      /** Optional semantic range start for fade/collapse behavior */
      rangeStartId?: string;
      rangeStartText?: string;
      /** Optional semantic range end for fade/collapse behavior */
      rangeEndId?: string;
      rangeEndText?: string;
      /** 1-2 line summary shown in the ◆ hover card and thought map */
      summary: string;
      /** Full organized note content (markdown) */
      content: string;
      /** The original quoted text from the source that triggered this thought */
      quote?: string;
      at: number;
    };

/** A required prerequisite for a problem-kind Trace. */
export type Prereq = {
  concept: string;
  status: 'known' | 'stale' | 'unknown';
  /** If the user opened a sub-trace to learn this prereq, the id is here. */
  childTraceId?: string;
  /** A 1-line summary captured when the prereq was resolved. */
  resolvedSummary?: string;
  resolvedAt?: number;
};

/** The full Trace object as stored in IndexedDB. */
export type Trace = {
  /** Stable id. Format: `t_<timestamp>_<random>` */
  id: string;
  kind: TraceKind;

  /** AI-suggested or user-edited title. */
  title: string;

  /* ── Tree pointers ── */
  parentId: string | null;
  childIds: string[];
  /** When this trace was branched from a parent message, the parent message index. */
  branchedFromEventIndex?: number;

  /* ── Source binding (optional — free-kind traces have none) ── */
  source?: {
    /** Doc id, e.g. "wiki/transformer" or "know/unsw-fins-3640__bond-replication" */
    docId: string;
    /** Resolvable href to the source */
    href: string;
    /** Initial anchor — where in the source this trace was started */
    anchor?: SourceAnchor;
    /** Title of the source for display */
    sourceTitle?: string;
  };

  /* ── Append-only history ── */
  events: TraceEvent[];

  /* ── Cached derived metadata ── */
  /** First event timestamp. */
  createdAt: number;
  /** Last event timestamp. */
  updatedAt: number;
  /** Total number of distinct sessions (visit events). */
  visitCount: number;
  /** Total time spent (sum of visit durationMs). */
  totalDurationMs: number;
  /** Latest crystallize event's summary, if any. */
  crystallizedSummary?: string;
  crystallizedAt?: number;
  /** If pinned for later, the timestamp of the pin action. */
  pinnedAt?: number;
  /** Mastery score 0..1 — derived heuristic. */
  mastery: number;

  /* ── Problem-kind specific ── */
  problem?: {
    decomposition?: Prereq[];
    specContent?: string;
    specLockedAt?: number;
    executionContent?: string;
  };

  /* ── Concept-kind specific ── */
  concept?: {
    /** Canonical concept name (matched to a Concept entity). */
    name: string;
    /** Aliases the user has typed for this concept. */
    aliases?: string[];
  };
};

/** Newly-created trace input — derived fields are filled in by the store. */
export type TraceCreateInput = {
  kind: TraceKind;
  title: string;
  parentId?: string | null;
  source?: Trace['source'];
  problem?: Trace['problem'];
  concept?: Trace['concept'];
  /** Optional initial events to seed the trace with. */
  initialEvents?: TraceEvent[];
};

/** A lightweight projection used by listing views. */
export type TraceSummary = {
  id: string;
  kind: TraceKind;
  title: string;
  source?: { docId: string; href: string; sourceTitle?: string };
  createdAt: number;
  updatedAt: number;
  visitCount: number;
  mastery: number;
  crystallizedSummary?: string;
  parentId: string | null;
  childCount: number;
};

/** Convert a Trace into a lightweight summary. */
export function toSummary(t: Trace): TraceSummary {
  return {
    id: t.id,
    kind: t.kind,
    title: t.title,
    source: t.source ? { docId: t.source.docId, href: t.source.href, sourceTitle: t.source.sourceTitle } : undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    visitCount: t.visitCount,
    mastery: t.mastery,
    crystallizedSummary: t.crystallizedSummary,
    parentId: t.parentId,
    childCount: t.childIds.length,
  };
}

/** Generate a stable trace id. */
export function newTraceId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `t_${ts}_${rand}`;
}
