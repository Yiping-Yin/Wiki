'use client';

export type AiStageId =
  | 'clarify-passage'
  | 'commit-anchor'
  | 'free-recompile'
  | 'rehearsal-transform'
  | 'examiner-question'
  | 'examiner-grade'
  | 'ingestion-summary';

export type AiStageSpec = {
  id: AiStageId;
  family: 'selection' | 'free' | 'rehearsal' | 'examiner' | 'ingestion';
  title: string;
  role: string;
  output: string;
};

const STAGES: Record<AiStageId, AiStageSpec> = {
  'clarify-passage': {
    id: 'clarify-passage',
    family: 'selection',
    title: 'Clarify one passage',
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
    title: 'Recompile the current weave',
    role: 'recompiler',
    output: 'one free-mode live artifact update',
  },
  'rehearsal-transform': {
    id: 'rehearsal-transform',
    family: 'rehearsal',
    title: 'Deepen from memory',
    role: 'formatter',
    output: 'one transformed rehearsal fragment',
  },
  'examiner-question': {
    id: 'examiner-question',
    family: 'examiner',
    title: 'Ask one verifying question',
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
  'ingestion-summary': {
    id: 'ingestion-summary',
    family: 'ingestion',
    title: 'Ingest one source',
    role: 'ingester',
    output: 'one structured source summary',
  },
};

export function getAiStage(stage: AiStageId): AiStageSpec {
  return STAGES[stage];
}
