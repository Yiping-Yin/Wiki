'use client';

/**
 * /pursuits/<id> — legacy pretty URL. Client-side redirects to
 * `/pursuit/<id>` so the redirect doesn't force dynamic
 * rendering at the server layer (which breaks `output: 'export'`).
 *
 * generateStaticParams wasn't a good fit here because pursuit ids
 * come from user data and aren't known at build time.
 */

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LegacyPursuitDetailPage() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  useEffect(() => {
    const id = params?.id ?? '';
    router.replace(`/pursuit/${encodeURIComponent(id)}`);
  }, [router, params]);
  return null;
}
