'use client';

export type AiStageId =
  | 'clarify-passage'
  | 'commit-anchor'
  | 'free-recompile'
  | 'rehearsal-transform'
  | 'examiner-question'
  | 'examiner-grade'
  | 'blind-recall-grade'
  | 'ingestion-summary'
  | 'capture-organize';

export type AiSurfaceId = 'selection' | 'free' | 'rehearsal' | 'examiner' | 'ingestion' | 'capture';

export type AiSurfaceSpec = {
  id: AiSurfaceId;
  title: string;
  launcherTitle: string;
  helper?: string;
  placeholder?: string;
  followupPlaceholder?: string;
  emptyMessage?: string;
};

export type AiStageSpec = {
  id: AiStageId;
  family: AiSurfaceId;
  title: string;
  role: string;
  output: string;
};

const SURFACES: Record<AiSurfaceId, AiSurfaceSpec> = {
  selection: {
    id: 'selection',
    title: 'Clarify one passage',
    launcherTitle: 'Passage chat',
    helper: 'One passage · one answer · one anchor',
    placeholder: 'Clarify one passage…',
    followupPlaceholder: 'Clarify this passage again…',
  },
  free: {
    id: 'free',
    title: 'Recompile the current weave',
    launcherTitle: 'Today weave',
    helper: 'One free prompt · one live artifact',
    placeholder: 'Recompile the current weave…',
  },
  rehearsal: {
    id: 'rehearsal',
    title: 'Deepen from memory',
    launcherTitle: 'Rehearsal',
    helper: '⌘K shape · ⌘S save · Save & ask',
    emptyMessage: 'Pick a doc above and begin the next memory pass.',
  },
  examiner: {
    id: 'examiner',
    title: 'Ask one verifying question',
    launcherTitle: 'Examiner',
    helper: 'One question at a time',
    emptyMessage: 'Pick a doc above to begin one verifying question.',
  },
  ingestion: {
    id: 'ingestion',
    title: 'Ingest one source',
    launcherTitle: 'Import',
    helper: 'Drop one source, then let Loom hold the first thread',
  },
  capture: {
    id: 'capture',
    title: 'Organize into note',
    launcherTitle: 'Capture',
    helper: 'One source page · one organized note',
    placeholder: 'Start writing, paste rough notes, or drop one source…',
  },
};

const STAGES: Record<AiStageId, AiStageSpec> = {
  'clarify-passage': {
    id: 'clarify-passage',
    family: 'selection',
    title: SURFACES.selection.title,
    role: 'clarifier',
    output: 'one passage-bound discussion',
  },
  'commit-anchor': {
    id: 'commit-anchor',
    family: 'selection',
    title: 'Commit one anchor',
    role: 'distiller',
    output: 'one anchored understanding',
  },
  'free-recompile': {
    id: 'free-recompile',
    family: 'free',
    title: SURFACES.free.title,
    role: 'recompiler',
    output: 'one free-mode live artifact update',
  },
  'rehearsal-transform': {
    id: 'rehearsal-transform',
    family: 'rehearsal',
    title: SURFACES.rehearsal.title,
    role: 'formatter',
    output: 'one transformed rehearsal fragment',
  },
  'examiner-question': {
    id: 'examiner-question',
    family: 'examiner',
    title: SURFACES.examiner.title,
    role: 'examiner',
    output: 'one probing question',
  },
  'examiner-grade': {
    id: 'examiner-grade',
    family: 'examiner',
    title: 'Grade one answer',
    role: 'verifier',
    output: 'one pass/retry judgment',
  },
  'blind-recall-grade': {
    id: 'blind-recall-grade',
    family: 'examiner',
    title: 'Grade a blind recall',
    role: 'recall-grader',
    output: 'one remembered/misremembered/missed scorecard',
  },
  'ingestion-summary': {
    id: 'ingestion-summary',
    family: 'ingestion',
    title: SURFACES.ingestion.title,
    role: 'ingester',
    output: 'one structured source summary',
  },
  'capture-organize': {
    id: 'capture-organize',
    family: 'capture',
    title: SURFACES.capture.title,
    role: 'organizer',
    output: 'one structured source note rewrite',
  },
};

export function getAiSurface(surface: AiSurfaceId): AiSurfaceSpec {
  return SURFACES[surface];
}

export function getAiStage(stage: AiStageId): AiStageSpec {
  return STAGES[stage];
}
