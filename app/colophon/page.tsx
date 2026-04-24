import ColophonClient from '../ColophonClient';

export const metadata = { title: 'Colophon · Loom' };

/**
 * /colophon — The book's back matter.
 *
 * Names the type, the palette, the hand. A single vertical column, centered
 * on paper. This is chrome / identity, not user content, so art fonts
 * (Cormorant Garamond, EB Garamond) are allowed.
 */
export default function ColophonPage() {
  return <ColophonClient />;
}
