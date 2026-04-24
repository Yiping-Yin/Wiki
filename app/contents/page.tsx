import ContentsClient from '../ContentsClient';

export const metadata = { title: 'Contents · Loom' };

/**
 * /contents — The book's table of contents (front matter).
 *
 * A reader's map of all major surfaces: 8 chapters plus front and back
 * matter. Lists each chapter's surfaces as italic serif links. Like
 * Colophon / Frontispiece, this is chrome, so art fonts are allowed.
 */
export default function ContentsPage() {
  return <ContentsClient />;
}
