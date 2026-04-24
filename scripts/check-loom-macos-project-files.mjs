#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireTracked = process.argv.includes('--require-tracked');
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function listSwiftFiles(relativeDir) {
  return fs
    .readdirSync(path.join(repoRoot, relativeDir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.swift'))
    .map((entry) => entry.name)
    .sort();
}

function fail(message) {
  failures.push(message);
}

function expectProjectReference(project, name, kind) {
  if (!project.includes(`/* ${name} in Sources */`)) {
    fail(`${kind} file is present on disk but is missing from Loom.xcodeproj Sources: ${name}`);
  }
}

function extractProjectSwiftNames(project) {
  return new Set(
    [...project.matchAll(/\/\* ([A-Za-z0-9_+]+\.swift)(?: in Sources)? \*\//g)].map(
      (match) => match[1],
    ),
  );
}

function gitStatus(paths) {
  try {
    return execFileSync('git', ['status', '--porcelain=v1', '--', ...paths], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

const project = read('macos-app/Loom/Loom.xcodeproj/project.pbxproj');
const spec = read('macos-app/Loom/project.yml');
const entitlements = read('macos-app/Loom/Loom.entitlements');
const sourceFiles = listSwiftFiles('macos-app/Loom/Sources');
const testFiles = listSwiftFiles('macos-app/Loom/Tests');
const projectSwiftNames = extractProjectSwiftNames(project);
const diskSwiftNames = new Set([...sourceFiles, ...testFiles]);

for (const name of sourceFiles) {
  expectProjectReference(project, name, 'Source');
}

for (const name of testFiles) {
  expectProjectReference(project, name, 'Test');
}

for (const name of projectSwiftNames) {
  if (!diskSwiftNames.has(name)) {
    fail(`Loom.xcodeproj references a Swift file that is missing on disk: ${name}`);
  }
}

if (!fs.existsSync(path.join(repoRoot, 'macos-app/Loom/Resources/PrivacyInfo.xcprivacy'))) {
  fail('PrivacyInfo.xcprivacy is missing from macos-app/Loom/Resources');
}

if (!project.includes('PrivacyInfo.xcprivacy in Resources')) {
  fail('PrivacyInfo.xcprivacy exists but is missing from the Loom resources build phase');
}

for (const requiredSource of ['Sources', 'Assets.xcassets', 'Resources', 'Tests']) {
  if (!new RegExp(`-\\s+${requiredSource}\\b`).test(spec)) {
    fail(`project.yml no longer includes ${requiredSource} as a source/resource root`);
  }
}

const yamlDeployment = spec.match(/MACOSX_DEPLOYMENT_TARGET:\s*"([^"]+)"/)?.[1];
const yamlOptionDeployment = spec.match(/macOS:\s*"([^"]+)"/)?.[1];
const pbxDeployments = [
  ...project.matchAll(/MACOSX_DEPLOYMENT_TARGET = ([^;]+);/g),
].map((match) => match[1].trim());

if (!yamlDeployment || !yamlOptionDeployment) {
  fail('project.yml is missing an explicit macOS deployment target');
} else if (yamlDeployment !== yamlOptionDeployment) {
  fail(
    `project.yml deployment targets disagree: options=${yamlOptionDeployment}, target=${yamlDeployment}`,
  );
}

for (const deployment of pbxDeployments) {
  if (deployment !== yamlDeployment) {
    fail(`Loom.xcodeproj deployment target ${deployment} does not match project.yml ${yamlDeployment}`);
  }
}

const bundleIds = [
  ...new Set(
    [...spec.matchAll(/PRODUCT_BUNDLE_IDENTIFIER:\s*([^\s]+)/g)].map((match) => match[1].trim()),
  ),
];

for (const bundleId of bundleIds) {
  if (!project.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};`)) {
    fail(`Loom.xcodeproj bundle identifier does not match project.yml: ${bundleId}`);
  }
}

if (project.includes('PRODUCT_BUNDLE_IDENTIFIER = com.loom.app')) {
  fail('Loom.xcodeproj still contains the placeholder com.loom.app bundle identifier');
}

if (!/com\.apple\.security\.app-sandbox:\s*true/.test(spec)) {
  fail('project.yml must keep com.apple.security.app-sandbox enabled for App Store builds');
}

if (!/ENABLE_HARDENED_RUNTIME:\s*YES/.test(spec)) {
  fail('project.yml must keep ENABLE_HARDENED_RUNTIME enabled for distribution builds');
}

if (!project.includes('ENABLE_HARDENED_RUNTIME = YES;')) {
  fail('Loom.xcodeproj hardened runtime setting does not match project.yml');
}

if (!/<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\/>/.test(entitlements)) {
  fail('Loom.entitlements must keep com.apple.security.app-sandbox enabled');
}

const statusLines = gitStatus([
  'macos-app/Loom/Sources',
  'macos-app/Loom/Tests',
  'macos-app/Loom/Resources',
]);
const untracked = statusLines.filter((line) => line.startsWith('?? '));

if (untracked.length > 0) {
  const message = [
    `warning: ${untracked.length} macOS project path(s) are still untracked.`,
    'Run with --require-tracked after staging to turn this warning into a failure.',
    ...untracked.map((line) => `  ${line.slice(3)}`),
  ].join('\n');
  if (requireTracked) {
    fail(message);
  } else {
    console.warn(message);
  }
}

if (failures.length > 0) {
  console.error(`Loom macOS project check failed with ${failures.length} issue(s):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `OK: Loom.xcodeproj references ${sourceFiles.length} source Swift files, ${testFiles.length} test Swift files, macOS ${yamlDeployment}, and bundle IDs ${bundleIds.join(', ')}.`,
);
