import { permanentRedirect } from 'next/navigation';

// Historical Atlas route. The user-facing Atlas entry now lives at /knowledge.
// Keep this redirect so older bookmarks still land on the correct surface.
export default function AtlasPage() {
  permanentRedirect('/knowledge');
}
