'use client';

/**
 * /graph?focus=<docId> — legacy alias that forwards to /weaves.
 *
 * Client-side searchParams + `router.replace` so the redirect lives
 * outside the server render path (which would force dynamic
 * rendering and break `output: 'export'`).
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function GraphRedirectInner() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const query = params?.toString() ?? '';
    router.replace(query ? `/weaves?${query}` : '/weaves');
  }, [router, params]);
  return null;
}

export default function LegacyGraphPage() {
  return (
    <Suspense fallback={null}>
      <GraphRedirectInner />
    </Suspense>
  );
}
