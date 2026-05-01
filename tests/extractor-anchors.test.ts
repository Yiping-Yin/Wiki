import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(__dirname, '..');
const dismissedRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'extractor-anchors-root-'),
);
process.env.LOOM_CONTENT_ROOT = dismissedRoot;

function repoImport(modulePath: string) {
  const absolutePath = path.join(repoRoot, modulePath);
  const href = pathToFileURL(absolutePath).href;
  return import(`${href}?t=${Date.now()}-${Math.random()}`);
}

const globalAny = globalThis as unknown as {
  window?: unknown;
  fetch?: typeof fetch;
};

async function withWindow(value: unknown, body: () => Promise<void> | void) {
  const prev = globalAny.window;
  globalAny.window = value;
  try {
    await body();
  } finally {
    if (prev === undefined) delete globalAny.window;
    else globalAny.window = prev;
  }
}

async function withFetch(stub: typeof fetch, body: () => Promise<void> | void) {
  const prev = globalAny.fetch;
  globalAny.fetch = stub;
  try {
    await body();
  } finally {
    if (prev === undefined) delete globalAny.fetch;
    else globalAny.fetch = prev;
  }
}

test('loadProvisionalAnchors fetches the encoded native endpoint and coerces fields', async () => {
  const records = await repoImport('lib/extractor-anchors.ts');
  const seen: string[] = [];

  await withWindow({ location: { protocol: 'loom:' } }, async () => {
    await withFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(input));
      assert.equal(init?.cache, 'no-store');
      return Response.json({
        docId: 'know/unsw-fins-3640__week-3-lecture',
        anchors: [
          {
            id: 't_1::keyQuotes[0]',
            docId: 'know/unsw-fins-3640__week-3-lecture',
            traceId: 't_1',
            extractorId: 'transcript',
            sourceDocId: 'ingested:Week 3 Lecture.vtt',
            fieldPath: 'keyQuotes[0]',
            text: 'Bond replication requires matching cash flows.',
            pageNum: 12,
            fingerprint: 't_1::keyQuotes[0]',
            attribution: 'extractor',
            status: 'provisional',
            sourceSpans: [{ quote: 'Bond replication requires matching cash flows.', verified: true }],
          },
          // Reject one with the wrong attribution shape — proves
          // coerceAnchor filters out malformed wire data.
          { id: 'x', text: 'oops', fingerprint: 'x', attribution: 'user', status: 'provisional', docId: 'know/x' },
          // Reject another with empty text.
          { id: 'y', text: '', fingerprint: 'y', attribution: 'extractor', status: 'provisional', docId: 'know/x' },
        ],
      });
    }) as typeof fetch, async () => {
      const list = await records.loadProvisionalAnchors(
        'know/unsw-fins-3640__week-3-lecture',
      );
      assert.ok(Array.isArray(list));
      assert.equal(list!.length, 1);
      assert.equal(list![0].attribution, 'extractor');
      assert.equal(list![0].status, 'provisional');
      assert.equal(list![0].origin.extractorId, 'transcript');
      assert.equal(list![0].origin.field, 'keyQuotes[0]');
      assert.equal(list![0].pageNum, 12);
    });
  });

  assert.deepEqual(seen, [
    'loom://native/extractor-anchors-for-doc/know%2Funsw-fins-3640__week-3-lecture.json',
  ]);
});

test('extractor-anchors-dismissed sidecar persists and re-reads', async () => {
  const sidecar = await repoImport('lib/extractor-anchors-dismissed.ts');

  const initial = await sidecar.readDismissedFingerprints('know/unsw-fins-3640__week-3-lecture');
  assert.deepEqual(initial, []);

  const next = await sidecar.appendDismissedFingerprint(
    'know/unsw-fins-3640__week-3-lecture',
    't_1::keyQuotes[0]',
  );
  assert.deepEqual(next, ['t_1::keyQuotes[0]']);

  // Re-appending the same fingerprint is idempotent.
  const stable = await sidecar.appendDismissedFingerprint(
    'know/unsw-fins-3640__week-3-lecture',
    't_1::keyQuotes[0]',
  );
  assert.deepEqual(stable, ['t_1::keyQuotes[0]']);

  // Adding a different fingerprint preserves the first.
  const grown = await sidecar.appendDismissedFingerprint(
    'know/unsw-fins-3640__week-3-lecture',
    't_1::keyQuotes[1]',
  );
  assert.equal(grown.length, 2);
  assert.ok(grown.includes('t_1::keyQuotes[0]'));
  assert.ok(grown.includes('t_1::keyQuotes[1]'));

  const reread = await sidecar.readDismissedFingerprints(
    'know/unsw-fins-3640__week-3-lecture',
  );
  assert.equal(reread.length, 2);
});

test('extractor-anchors-dismissed API validates input and persists', async () => {
  const route = await repoImport('app/api/extractor-anchors-dismissed/route.ts');

  const invalidJson = await route.POST(
    new Request('http://localhost/api/extractor-anchors-dismissed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    }),
  );
  assert.equal(invalidJson.status, 400);

  const missingDoc = await route.POST(
    new Request('http://localhost/api/extractor-anchors-dismissed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fingerprint: 'fp1' }),
    }),
  );
  assert.equal(missingDoc.status, 400);

  const ok = await route.POST(
    new Request('http://localhost/api/extractor-anchors-dismissed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        docId: 'know/unsw-fins-3640__lecture-x',
        fingerprint: 'tX::keyQuotes[2]',
      }),
    }),
  );
  assert.equal(ok.status, 200);
  const okBody = await ok.json();
  assert.deepEqual(okBody.dismissedFingerprints, ['tX::keyQuotes[2]']);

  const read = await route.GET(
    new Request(
      'http://localhost/api/extractor-anchors-dismissed?docId=know%2Funsw-fins-3640__lecture-x',
    ),
  );
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.deepEqual(readBody.dismissedFingerprints, ['tX::keyQuotes[2]']);
});

test('extractor-anchors API returns an empty list in dev mode (Swift owns the resolver)', async () => {
  const route = await repoImport('app/api/extractor-anchors/route.ts');

  const empty = await route.GET(
    new Request(
      'http://localhost/api/extractor-anchors?docId=know%2Funsw-fins-3640__week-3',
    ),
  );
  assert.equal(empty.status, 200);
  const body = await empty.json();
  assert.equal(body.docId, 'know/unsw-fins-3640__week-3');
  assert.deepEqual(body.anchors, []);

  const missing = await route.GET(
    new Request('http://localhost/api/extractor-anchors'),
  );
  assert.equal(missing.status, 400);
});

test('native bridge files expose the extractor-anchors endpoints and dismissal handler', () => {
  const handler = fs.readFileSync(
    path.join(repoRoot, 'macos-app/Loom/Sources/LoomURLSchemeHandler.swift'),
    'utf8',
  );
  const contentView = fs.readFileSync(
    path.join(repoRoot, 'macos-app/Loom/Sources/ContentView.swift'),
    'utf8',
  );
  const bridge = fs.readFileSync(
    path.join(repoRoot, 'macos-app/Loom/Sources/LoomExtractorAnchorsBridgeHandler.swift'),
    'utf8',
  );
  const docClient = fs.readFileSync(
    path.join(repoRoot, 'app/DocClient.tsx'),
    'utf8',
  );

  // URL scheme handler routes the new endpoint kind.
  assert.match(handler, /case extractorAnchorsForDoc = "extractor-anchors-for-doc"/);
  assert.match(handler, /LoomExtractorAnchorsBridge\.buildPayload\(forReadingDocId: target\.id\)/);

  // Reply bridge registered in ContentView.
  assert.match(contentView, /LoomExtractorAnchorsBridgeHandler\(\)/);
  assert.match(contentView, /name: LoomExtractorAnchorsBridgeHandler\.name/);

  // Bridge enforces required fields.
  assert.match(bridge, /WKScriptMessageHandlerWithReply/);
  assert.match(bridge, /case "dismiss":/);
  assert.match(bridge, /case "read":/);

  // Reading page mounts the layer.
  assert.match(docClient, /<ExtractorAnchorLayer docId=\{doc\.trackId\} \/>/);
});
