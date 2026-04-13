import { spawnSync } from 'node:child_process';
import { groupByBucket, loadStatusLines, stageHint } from './bucket-lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const bucket = args.find((arg) => !arg.startsWith('--'));

if (!bucket) {
  console.error('Usage: node scripts/stage-bucket.mjs <bucket> [--apply]');
  process.exit(1);
}

const buckets = groupByBucket(loadStatusLines());
const items = buckets.get(bucket) ?? [];

if (items.length === 0) {
  console.error(`No changes matched bucket: ${bucket}`);
  process.exit(1);
}

const deletions = items.filter((item) => item.status.includes('D')).map((item) => item.path);
const updates = items.filter((item) => !item.status.includes('D')).map((item) => item.path);

console.log(`[${bucket}] ${items.length}`);
console.log(`hint: ${stageHint(bucket)}`);
if (updates.length) {
  console.log(`git add -- ${updates.join(' ')}`);
}
if (deletions.length) {
  console.log(`git add -u -- ${deletions.join(' ')}`);
}

if (!apply) {
  console.log('dry-run only; pass --apply to stage');
  process.exit(0);
}

function chunk(arr, size = 100) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status === 0) return;
  const stderr = (result.stderr || '').trim();
  if (stderr.includes('index.lock') || stderr.includes('Operation not permitted')) {
    console.error('staging failed: this environment cannot write the git index (.git/index.lock permission denied)');
    process.exit(2);
  }
  if (stderr) console.error(stderr);
  process.exit(result.status || 1);
}

for (const paths of chunk(updates)) {
  runGit(['add', '--', ...paths]);
}
for (const paths of chunk(deletions)) {
  runGit(['add', '-u', '--', ...paths]);
}

console.log(`staged bucket: ${bucket}`);
