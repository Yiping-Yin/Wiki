import FrontispieceClient from '../FrontispieceClient';

export const metadata = { title: 'Frontispiece · Loom' };

/**
 * /frontispiece — The book's title page (front matter).
 *
 * Ceremonial opening — Loom wordmark, edition, tagline. Like Colophon
 * this is chrome/identity, so art fonts are allowed.
 */
export default function FrontispiecePage() {
  return <FrontispieceClient />;
}
