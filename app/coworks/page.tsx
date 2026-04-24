import { listCoworksWithSearchable } from '../../lib/coworks-store';
import { getSourceLibraryCategories } from '../../lib/knowledge-store';
import { CoworksIndexClient } from './CoworksIndexClient';


export const metadata = {
  title: 'Coworks · Loom',
};

export default async function CoworksPage() {
  // Under static export the builder's local cowork list would get baked
  // into every shipped bundle — and the cowork detail pages aren't
  // exported, so any link here 404s on click. Ship an empty list; dev
  // mode still reads the real store.
  if (process.env.LOOM_NEXT_OUTPUT === 'export') {
    return <CoworksIndexClient coworks={[]} />;
  }
  const coworks = await listCoworksWithSearchable();
  const categories = await getSourceLibraryCategories();
  const categoryLabelBySlug = new Map(categories.map((c) => [c.slug, c.label]));
  const enriched = coworks.map((c) => ({
    ...c,
    categoryLabel: categoryLabelBySlug.get(c.categorySlug) ?? c.categorySlug,
  }));
  return <CoworksIndexClient coworks={enriched} />;
}
