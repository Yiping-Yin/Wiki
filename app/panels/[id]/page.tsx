'use client';

/**
 * /panels/<id> — legacy pretty URL. Client-side redirect to
 * `/panel/<id>`, same reasoning as /pursuits/[id].
 */

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LegacyPanelDetailPage() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  useEffect(() => {
    const id = params?.id ?? '';
    router.replace(`/panel/${encodeURIComponent(id)}`);
  }, [router, params]);
  return null;
}
