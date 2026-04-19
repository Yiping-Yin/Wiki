#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';

function usage() {
  console.error('fake-codex-cli only supports `codex exec ... -o <file> <prompt>`');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args[0] !== 'exec') usage();

let outputPath = null;
const promptParts = [];

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '-o') {
    outputPath = args[i + 1] ?? null;
    i += 1;
    continue;
  }
  if (arg === '-c' || arg === '--model') {
    i += 1;
    continue;
  }
  if (arg.startsWith('-')) continue;
  promptParts.push(arg);
}

if (!outputPath) usage();

const prompt = promptParts.join(' ').trim();

function buildResponse(input) {
  if (/reply with exactly:? ok\.?$/i.test(input)) {
    return 'OK';
  }

  if (/capture-organize/i.test(input) || /organize the first source page/i.test(input)) {
    return [
      '# Smoke Verification',
      '',
      '- Installed Loom runtime launched successfully.',
      '- AI organize returned markdown through the local runtime path.',
      '- Capture writeback completed and the page exited empty-doc mode.',
    ].join('\n');
  }

  return [
    '# Smoke Verification',
    '',
    'Installed app smoke response.',
  ].join('\n');
}

await writeFile(outputPath, buildResponse(prompt), 'utf8');
