import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(__dirname, '..');
const schemaContentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-bridge-root-'));
process.env.LOOM_CONTENT_ROOT = schemaContentRoot;

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

test('schema record loaders fetch encoded native endpoints and coerce corrections', async () => {
  const records = await repoImport('lib/loom-schema-records.ts');
  const seen: string[] = [];

  await withWindow({ location: { protocol: 'loom:' } }, async () => {
    await withFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(input));
      assert.equal(init?.cache, 'no-store');
      return Response.json({
        traceId: 'trace-1',
        extractorId: 'syllabus-pdf',
        sourceDocId: 'ingested:Course Overview.pdf',
        sourceTitle: 'Course Overview',
        schema: { courseCode: { status: 'found', value: 'FINS3640' } },
        corrections: [
          { fieldPath: 'courseCode', original: 'FINS3640', corrected: 'FINS 3640', at: 1 },
          { fieldPath: 12, corrected: 'bad' },
        ],
        updatedAt: 2,
      });
    }) as typeof fetch, async () => {
      const byDoc = await records.loadSchemaForReadingDoc('know/unsw-fins-3640__week 3.pdf');
      assert.equal(byDoc?.traceId, 'trace-1');
      assert.equal(byDoc?.corrections.length, 1);

      const byTrace = await records.loadSchemaByTraceId('trace/with slash');
      assert.equal(byTrace?.extractorId, 'syllabus-pdf');
    });
  });

  assert.deepEqual(seen, [
    'loom://native/schema-for-doc/know%2Funsw-fins-3640__week%203.pdf.json',
    'loom://native/schema/trace%2Fwith%20slash.json',
  ]);
});

test('schema corrections apply over FieldResult leaves without mutating the raw schema', async () => {
  const corrections = await repoImport('lib/schema-corrections.ts');
  const raw = {
    courseCode: { status: 'found', value: 'FINS3640' },
    assessmentItems: [
      {
        name: { status: 'found', value: 'Midterm' },
        dueDate: { status: 'not_found' },
      },
    ],
  };

  const next = corrections.applySchemaCorrections(raw, [
    { fieldPath: 'courseCode', original: 'FINS3640', corrected: 'FINS 3640', at: 1 },
    { fieldPath: 'assessmentItems[0].dueDate', original: '', corrected: '2026-05-18', at: 2 },
  ]);

  assert.equal(raw.courseCode.value, 'FINS3640');
  assert.equal(next.courseCode.value, 'FINS 3640');
  assert.equal(next.courseCode.userCorrected, true);
  assert.equal(next.assessmentItems[0].dueDate.status, 'found');
  assert.equal(next.assessmentItems[0].dueDate.value, '2026-05-18');
});

test('schema corrections API validates input and persists sidecars in dev mode', async () => {
  const route = await repoImport('app/api/schema-corrections/route.ts');

  const invalid = await route.POST(
    new Request('http://localhost/api/schema-corrections', {
      method: 'POST',
      body: JSON.stringify({
        extractorId: 'syllabus-pdf',
        sourceDocId: 'ingested:Course Overview.pdf',
        fieldPath: 'courseCode',
        newValue: 'FINS3640',
        originalValue: 'FINS3640',
      }),
    }),
  );
  assert.equal(invalid.status, 400);

  const created = await route.POST(
    new Request('http://localhost/api/schema-corrections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        extractorId: 'syllabus-pdf',
        sourceDocId: 'ingested:Course Overview.pdf',
        fieldPath: 'courseCode',
        newValue: 'FINS 3640',
        originalValue: 'FINS3640',
      }),
    }),
  );
  assert.equal(created.status, 200);
  assert.equal((await created.json()).corrections.length, 1);

  const read = await route.GET(
    new Request(
      'http://localhost/api/schema-corrections?extractorId=syllabus-pdf&sourceDocId=ingested%3ACourse%20Overview.pdf',
    ),
  );
  assert.equal(read.status, 200);
  const payload = await read.json();
  assert.equal(payload.corrections[0].corrected, 'FINS 3640');
});

test('native schema bridge files expose schema endpoints and correction reply bridge', () => {
  const handler = fs.readFileSync(
    path.join(repoRoot, 'macos-app/Loom/Sources/LoomURLSchemeHandler.swift'),
    'utf8',
  );
  const contentView = fs.readFileSync(
    path.join(repoRoot, 'macos-app/Loom/Sources/ContentView.swift'),
    'utf8',
  );
  const strip = fs.readFileSync(
    path.join(repoRoot, 'components/CourseContextStrip.tsx'),
    'utf8',
  );
  const docClient = fs.readFileSync(
    path.join(repoRoot, 'app/DocClient.tsx'),
    'utf8',
  );
  const bridge = fs.readFileSync(
    path.join(repoRoot, 'macos-app/Loom/Sources/LoomSchemaBridgeHandler.swift'),
    'utf8',
  );

  assert.match(handler, /case schema/);
  assert.match(handler, /case schemaForDoc = "schema-for-doc"/);
  assert.match(handler, /LoomSchemaBridge\.buildPayload\(traceId: target\.id\)/);
  assert.match(handler, /LoomSchemaBridge\.buildPayload\(forReadingDocId: target\.id\)/);
  assert.match(handler, /idParts\.joined\(separator: "\/"\)/);

  assert.match(contentView, /LoomSchemaCorrectionsBridgeHandler\(\)/);
  assert.match(contentView, /name: LoomSchemaCorrectionsBridgeHandler\.name/);

  assert.match(bridge, /WKScriptMessageHandlerWithReply/);
  assert.match(bridge, /case "append":/);
  assert.match(bridge, /case "read":/);

  assert.match(strip, /loadSchemaForReadingDoc\(docId\)/);
  assert.match(strip, /appendSchemaCorrection/);
  assert.match(strip, /window\.sessionStorage\.setItem\(dismissKey\(docId\), '1'\)/);
  assert.match(docClient, /<CourseContextStrip docId=\{doc\.trackId\} \/>/);
});
