import { Suspense } from 'react';
import CoverClient from '../CoverClient';

export const metadata = { title: 'Cover · Loom' };

/**
 * /cover — a source's opening page.
 *
 * With no query param, renders the canonical placeholder cover ("The
 * Bridge" by Amelia Whitlock) as the Loom reference design. With
 * `?href=/wiki/xyz`, looks up the source in the search index and
 * renders a real cover for that document.
 *
 * useSearchParams() requires Suspense under App Router; we wrap the
 * client in a lightweight paper-colored fallback so the first paint
 * matches the final frame instead of flashing white.
 */
export default function CoverPage() {
  return (
    <Suspense
      fallback={
        <main
          className="loom-cover"
          style={{ opacity: 0 }}
          aria-hidden="true"
        />
      }
    >
      <CoverClient />
    </Suspense>
  );
}
