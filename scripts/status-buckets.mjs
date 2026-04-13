import { groupByBucket, loadStatusLines, stageHint } from './bucket-lib.mjs';

const lines = loadStatusLines();
const buckets = groupByBucket(lines);

for (const [bucket, items] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\n[${bucket}] ${items.length}`);
  console.log(JSON.stringify(counts));
  console.log(`stage: ${stageHint(bucket)}`);
  for (const item of items.slice(0, 25)) {
    console.log(`${item.status} ${item.path}`);
  }
  if (items.length > 25) {
    console.log(`... ${items.length - 25} more`);
  }
}
