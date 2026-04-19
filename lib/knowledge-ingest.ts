import { execFile } from 'node:child_process';
import { invalidateKnowledgeStoreCache } from './knowledge-store';

type ExecSpec = {
  command: string;
  args: string[];
  cwd: string;
  timeout: number;
};

type RunKnowledgeIngestOptions = {
  cwd?: string;
  exec?: (spec: ExecSpec) => Promise<void>;
  invalidate?: () => void;
};

async function execKnowledgeIngest(spec: ExecSpec): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(spec.command, spec.args, { cwd: spec.cwd, timeout: spec.timeout }, (err) =>
      err ? reject(err) : resolve(),
    );
  });
}

export async function runKnowledgeIngest(options: RunKnowledgeIngestOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const exec = options.exec ?? execKnowledgeIngest;
  const invalidate = options.invalidate ?? invalidateKnowledgeStoreCache;

  await exec({
    command: 'npx',
    args: ['tsx', 'scripts/ingest-knowledge.ts'],
    cwd,
    timeout: 30_000,
  });
  invalidate();
}
