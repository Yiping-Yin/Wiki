#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const DEFAULT_MANIFEST_PATH = path.join(
  repoRoot,
  'macos-app',
  'Loom',
  'LoomWebExtension',
  'Resources',
  'manifest.json',
);
const DEFAULT_RESOURCES_PATH = path.dirname(DEFAULT_MANIFEST_PATH);
const DEFAULT_ATLAS_HOST_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'com.openai.atlas',
  'browser-data',
  'host',
);
const PREFERENCE_FILE_NAMES = new Set(['Preferences', 'Secure Preferences']);
const KNOWN_LOOM_EXTENSION_NAMES = new Set(['Capture to Loom', '__MSG_extensionName__']);

export async function loadJsonFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return { ok: true, data: JSON.parse(text), path: filePath };
  } catch (error) {
    return {
      ok: false,
      data: null,
      path: filePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * @param {unknown} preferences
 * @param {string | null} [sourcePath]
 */
export function collectExtensionEntries(preferences, sourcePath = null) {
  const settings = preferences?.extensions?.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return [];

  return Object.entries(settings)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([id, value]) => ({
      id,
      sourcePath,
      path: typeof value.path === 'string' ? value.path : null,
      manifest: value.manifest && typeof value.manifest === 'object' ? value.manifest : {},
      raw: value,
    }));
}

export function evaluateExtensionState({ sourceManifest, expectedResourcesPath, entries }) {
  const sourceVersion = stringOrNull(sourceManifest?.version);
  const expectedPath = normalizePath(expectedResourcesPath);
  const sourceNames = new Set(KNOWN_LOOM_EXTENSION_NAMES);
  const sourceName = stringOrNull(sourceManifest?.name);
  if (sourceName) sourceNames.add(sourceName);

  const matches = entries.filter((entry) => isLoomExtensionEntry(entry, sourceNames, sourceVersion));
  const failures = [];

  if (matches.length === 0) {
    failures.push('No loaded Loom extension found in Atlas Preferences.');
  }

  for (const entry of matches) {
    if (entry.path && normalizePath(entry.path) !== expectedPath) {
      failures.push(
        `Extension ${entry.id} loaded path is not exact Resources folder: ${entry.path}`,
      );
    }

    const loadedVersion = stringOrNull(entry.manifest?.version);
    if (sourceVersion && loadedVersion && loadedVersion !== sourceVersion) {
      failures.push(
        `Extension ${entry.id} version mismatch: loaded ${loadedVersion}, source ${sourceVersion}`,
      );
    }
  }

  return {
    ok: matches.length > 0 && failures.length === 0,
    sourceVersion,
    extensionIds: unique(matches.map((entry) => entry.id)),
    loadedVersions: unique(matches.map((entry) => stringOrNull(entry.manifest?.version)).filter(Boolean)),
    loadedPaths: unique(matches.map((entry) => entry.path).filter(Boolean)),
    entries: matches,
    failures,
  };
}

export async function findPreferenceFiles(rootPath) {
  const found = [];

  async function visit(dirPath) {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && PREFERENCE_FILE_NAMES.has(entry.name)) {
        found.push(entryPath);
      }
    }
  }

  await visit(rootPath);
  return found.sort();
}

function isLoomExtensionEntry(entry, sourceNames, sourceVersion) {
  if (entry.path && normalizePath(entry.path).includes('/LoomWebExtension/Resources')) {
    return true;
  }

  const manifest = entry.manifest ?? {};
  const candidateNames = [
    manifest.name,
    manifest.short_name,
    manifest.description,
    manifest.action?.default_title,
    manifest.browser_action?.default_title,
  ]
    .map(stringOrNull)
    .filter(Boolean);

  if (candidateNames.some((name) => sourceNames.has(name) || /capture to loom/i.test(name))) {
    return true;
  }

  return Boolean(
    sourceVersion
      && manifest.version === sourceVersion
      && candidateNames.some((name) => /loom/i.test(name)),
  );
}

function normalizePath(value) {
  return path.resolve(String(value)).replaceAll(path.sep, '/').replace(/\/+$/, '');
}

function stringOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function unique(values) {
  return Array.from(new Set(values));
}

function formatList(values) {
  return values.length > 0 ? values.join(', ') : '(none)';
}

async function loadSourceManifest() {
  const manifestResult = await loadJsonFile(DEFAULT_MANIFEST_PATH);
  if (!manifestResult.ok) return manifestResult;

  const localeName = await loadLocalizedName();
  if (localeName && manifestResult.data?.name === '__MSG_extensionName__') {
    return {
      ...manifestResult,
      data: {
        ...manifestResult.data,
        resolvedName: localeName,
      },
    };
  }

  return manifestResult;
}

async function loadLocalizedName() {
  const messagesPath = path.join(DEFAULT_RESOURCES_PATH, '_locales', 'en', 'messages.json');
  const result = await loadJsonFile(messagesPath);
  return result.ok ? stringOrNull(result.data?.extensionName?.message) : null;
}

async function runCli() {
  const manifestResult = await loadSourceManifest();
  if (!manifestResult.ok) {
    console.error(`FAIL: Could not read source manifest at ${DEFAULT_MANIFEST_PATH}`);
    console.error(manifestResult.error);
    return 1;
  }

  const preferenceFiles = await findPreferenceFiles(DEFAULT_ATLAS_HOST_PATH);
  const entries = [];
  const unreadable = [];

  for (const preferenceFile of preferenceFiles) {
    const result = await loadJsonFile(preferenceFile);
    if (result.ok) {
      entries.push(...collectExtensionEntries(result.data, preferenceFile));
    } else {
      unreadable.push(`${preferenceFile}: ${result.error}`);
    }
  }

  const sourceManifest = {
    ...manifestResult.data,
    name: manifestResult.data.resolvedName ?? manifestResult.data.name,
  };
  const state = evaluateExtensionState({
    sourceManifest,
    expectedResourcesPath: DEFAULT_RESOURCES_PATH,
    entries,
  });

  console.log('Atlas Loom extension check');
  console.log(`Source manifest version: ${state.sourceVersion ?? '(unknown)'}`);
  console.log(`Extension id(s): ${formatList(state.extensionIds)}`);
  console.log(`Loaded version(s): ${formatList(state.loadedVersions)}`);
  console.log(`Loaded path(s): ${formatList(state.loadedPaths)}`);
  console.log(state.ok ? 'PASS' : 'FAIL');

  for (const failure of state.failures) {
    console.log(`- ${failure}`);
  }
  for (const warning of unreadable) {
    console.log(`- Unreadable preferences file: ${warning}`);
  }

  return state.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
