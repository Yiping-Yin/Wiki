import { permanentRedirect } from 'next/navigation';

// Atlas (UMAP scatter) was Loom's first visualization. It has been replaced
// by /kesi — a true tapestry of your learning history. Keep a permanent
// redirect here to preserve existing bookmarks.
export default function AtlasPage() {
  permanentRedirect('/kesi');
}
