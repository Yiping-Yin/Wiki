'use client';

/**
 * /pursuit?pursuitId=<id> — static-export fallback shell.
 *
 * Product links should use `/pursuit/<id>`. The bundled static export
 * cannot emit user-data dynamic segments, so the native shell may route
 * bundle loads through this flat page while preserving the same
 * `PursuitDetailClient` and native `loom://native/pursuit/<id>.json`
 * data boundary.
 */

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import PursuitDetailClient from '../PursuitDetailClient';

function PursuitPageInner() {
  const params = useSearchParams();
  const pursuitId = params?.get('pursuitId') ?? '';
  return <PursuitDetailClient id={pursuitId} />;
}

export default function PursuitPage() {
  // Suspense is required when reading useSearchParams during static
  // export — Next.js will pause SSR and hydrate on the client.
  return (
    <Suspense fallback={null}>
      <PursuitPageInner />
    </Suspense>
  );
}
