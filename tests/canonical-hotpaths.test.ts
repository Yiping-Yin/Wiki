import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('high-frequency user flows point to canonical routes, not legacy top-level IA', () => {
  const onboarding = read('app/onboarding/OnboardingClient.tsx');
  const todayClient = read('app/today/TodayClient.tsx');
  const soan = read('app/SoanClient.tsx');
  const coworks = read('app/coworks/CoworksIndexClient.tsx');
  const liveArtifact = read('components/LiveArtifact.tsx');
  const reviewThoughtMap = read('components/ReviewThoughtMap.tsx');

  assert.doesNotMatch(onboarding, /router\.push\('\/knowledge'\)/);
  assert.match(onboarding, /router\.push\('\/desk'\)/);

  assert.doesNotMatch(soan, /href="\/knowledge"/);
  assert.match(soan, /href="\/sources"/);

  assert.doesNotMatch(todayClient, /go\('\/knowledge'\)/);
  assert.match(todayClient, /go\('\/sources'\)/);

  assert.doesNotMatch(coworks, /href="\/knowledge"/);
  assert.match(coworks, /href="\/sources"/);

  assert.doesNotMatch(liveArtifact, /\/graph\?focus=/);
  assert.match(liveArtifact, /\/weaves\?focus=/);

  assert.doesNotMatch(reviewThoughtMap, /\/graph\?focus=/);
  assert.match(reviewThoughtMap, /\/weaves\?focus=/);
});
