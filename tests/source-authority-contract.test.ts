import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function exists(relativePath: string) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

test('derived knowledge caches are not written under the selected content root', () => {
  const paths = read('lib/paths.ts');
  const derivedIndexCache = read('lib/derived-index-cache.ts');
  const knowledgeStore = read('lib/knowledge-store.ts');
  const knowledgeDocCache = read('lib/knowledge-doc-cache.ts');
  const staticExport = read('scripts/build-static-export.mjs');

  assert.match(paths, /loomDerivedDataRoot/);
  assert.match(paths, /knowledgeDerivedCacheRoot/);
  assert.match(derivedIndexCache, /knowledgeDerivedCacheRoot/);
  assert.doesNotMatch(derivedIndexCache, /CONTENT_ROOT/);
  assert.match(knowledgeStore, /knowledgeDerivedCacheRoot/);
  assert.match(knowledgeStore, /legacyKnowledgeManifestRoot/);
  assert.match(knowledgeDocCache, /knowledgeDerivedCacheRoot/);
  assert.match(knowledgeDocCache, /knowledgeDocLegacyRuntimePath/);
  assert.match(staticExport, /resolveDerivedDataRootForStaticExport/);
  assert.match(staticExport, /LOOM_DERIVED_DATA_ROOT/);
});

test('user-authored sidecars write to user-data with content-root fallback read only', () => {
  for (const relativePath of [
    'lib/source-corrections.ts',
    'lib/schema-corrections.ts',
    'lib/pursuit-hide.ts',
    'lib/extractor-anchors-dismissed.ts',
  ]) {
    const source = read(relativePath);
    assert.match(source, /loomUserDataRoot/);
    assert.match(source, /LEGACY_/);
    assert.match(source, /readPathsFor/);
  }
});

test('flat uploads are stored in Loom user-data, not the source content root', () => {
  for (const relativePath of [
    'app/uploads/page.tsx',
  ]) {
    const source = read(relativePath);
    assert.match(source, /knowledgeUploadRoot|loomUserDataRoot/);
  }

  if (exists('app/api/upload/route.ts')) {
    const uploadRoute = read('app/api/upload/route.ts');
    assert.match(uploadRoute, /knowledgeUploadRoot/);
    assert.match(uploadRoute, /const UPLOAD_DIR = knowledgeUploadRoot\(\)/);
    assert.match(uploadRoute, /fs\.writeFile\(path\.join\(UPLOAD_DIR, finalName\), buf\)/);
    assert.doesNotMatch(uploadRoute, /fs\.writeFile\(path\.join\(LEGACY_UPLOAD_DIR/);
    assert.doesNotMatch(uploadRoute, /runKnowledgeIngest/);
  }

  if (exists('app/api/source-upload/route.ts')) {
    const sourceUploadRoute = read('app/api/source-upload/route.ts');
    assert.match(sourceUploadRoute, /loomUserDataRoot/);
    assert.doesNotMatch(sourceUploadRoute, /fs\.writeFile|fs\.mkdir|runKnowledgeIngest/);
  }

  if (exists('app/api/doc-body/route.ts')) {
    const docBodyRoute = read('app/api/doc-body/route.ts');
    assert.match(docBodyRoute, /loomUserDataRoot/);
    assert.doesNotMatch(docBodyRoute, /fs\.writeFile|fs\.mkdir|runKnowledgeIngest/);
  }

  if (exists('app/api/knowledge/create/route.ts')) {
    const createRoute = read('app/api/knowledge/create/route.ts');
    assert.match(createRoute, /knowledgeUploadRoot/);
    assert.match(createRoute, /fs\.writeFile\(path\.join\(uploadDir, finalName\)/);
    assert.doesNotMatch(createRoute, /CONTENT_ROOT|KNOWLEDGE_ROOT|runKnowledgeIngest/);
  }

  const uploadButton = read('app/uploads/UploadButton.tsx');
  assert.match(uploadButton, /isNativeMode/);
  assert.match(uploadButton, /return null/);
  assert.match(uploadButton, /\/api\/upload/);
});

test('knowledge doc writes are limited to Loom user-data files', () => {
  const source = read('lib/knowledge-doc-write.ts');

  assert.match(source, /loomUserDataRoot/);
  assert.match(source, /will not write into source library files/);
});

test('native resource URLs read derived caches instead of content-root caches', () => {
  const runtimePaths = read('macos-app/Loom/Sources/LoomRuntimePaths.swift');
  const contentView = read('macos-app/Loom/Sources/ContentView.swift');
  const captureWebView = read('macos-app/Loom/Sources/CaptureWebView.swift');
  const sidebar = read('macos-app/Loom/Sources/KnowledgeSidebarView.swift');
  const askAI = read('macos-app/Loom/Sources/AskAIWindow.swift');

  assert.match(runtimePaths, /hostRoots\["derived"\]/);
  assert.match(runtimePaths, /hostRoots\["user-data"\]/);
  assert.match(contentView, /hostRoots\["derived"\]/);
  assert.match(captureWebView, /hostRoots\["derived"\]/);
  assert.match(sidebar, /loom:\/\/derived\/knowledge\/\.cache\/manifest\/knowledge-nav\.json/);
  assert.match(askAI, /loom:\/\/derived\/knowledge\/\.cache\/docs/);
});
