/**
 * /dev/principles · the constitution, rendered inside Loom itself.
 *
 * DESIGN_MEMORY.md is the project's longest-lived asset (§20). This page
 * makes it readable inside the product — not just in the git repo — so
 * the principles can be reviewed in the same typography as everything
 * else the user reads on Loom.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrinciplesView } from './view';


export const metadata = { title: 'Principles · Loom' };

export default async function PrinciplesPage() {
  const raw = await fs.readFile(
    path.join(process.cwd(), 'docs', 'design', 'DESIGN_MEMORY.md'),
    'utf-8'
  );
  return <PrinciplesView source={raw} />;
}
