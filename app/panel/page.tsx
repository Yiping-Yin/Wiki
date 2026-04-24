'use client';

/**
 * /panel?panelId=<id> — static-export fallback shell.
 *
 * Product links should use `/panel/<id>`. The bundled static export
 * cannot emit user-data dynamic segments, so the native shell may route
 * bundle loads through this flat page while preserving the same
 * `PanelDetailClient` and native `loom://native/panel/<id>.json`
 * data boundary.
 */

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import PanelDetailClient from '../PanelDetailClient';

function PanelPageInner() {
  const params = useSearchParams();
  const panelId = params?.get('panelId') ?? '';
  return <PanelDetailClient id={panelId} />;
}

export default function PanelPage() {
  return (
    <Suspense fallback={null}>
      <PanelPageInner />
    </Suspense>
  );
}
