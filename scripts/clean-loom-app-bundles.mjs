import { homedir } from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const home = homedir();
const derivedDataRoot = path.join(home, 'Library/Developer/Xcode/DerivedData');

async function listDirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const entries = await listDirSafe(derivedDataRoot);
  const targets = [];
  const configurations = ['Debug', 'Release'];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('Loom-')) continue;

    for (const configuration of configurations) {
      targets.push(
        path.join(derivedDataRoot, entry.name, `Build/Products/${configuration}/Loom.app`),
        path.join(derivedDataRoot, entry.name, `Index.noindex/Build/Products/${configuration}/Loom.app`),
      );
    }
  }

  const found = [];
  for (const target of targets) {
    if (await exists(target)) found.push(target);
  }

  if (found.length === 0) {
    console.log('No DerivedData Loom.app bundles found.');
    return;
  }

  for (const target of found) {
    await fs.rm(target, { recursive: true, force: true });
    console.log(`Removed ${target}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
