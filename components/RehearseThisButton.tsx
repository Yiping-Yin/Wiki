'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeMode } from '../lib/is-native-mode';

/**
 * One-click "rehearse this doc" action on the doc reading page. Closes the
 * reverse loop of the category page's "Rehearse this folder" — now any
 * single doc can also spawn a cowork that's pre-seeded with it.
 *
 * The button is intentionally small + quiet. Rehearsal is a deliberate act,
 * not an ambient default; we don't want it to feel promotional.
 */
export function RehearseThisButton({
  docId,
  docTitle,
  categorySlug,
  categoryLabel,
  subcategory,
  fileSlug,
}: {
  docId: string;
  docTitle: string;
  categorySlug: string;
  categoryLabel: string;
  subcategory: string;
  fileSlug: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errored, setErrored] = useState(false);

  // Coworks are web-dev-only: `/api/coworks` is stripped under static
  // export and there's no SwiftData LoomCowork model yet. Hide the
  // button in the shipped native app so users aren't stranded on a
  // 404. Native planning lives in Pursuits + Sōan.
  if (typeof window !== 'undefined' && isNativeMode()) return null;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    setErrored(false);
    try {
      const createRes = await fetch('/api/coworks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categorySlug,
          title: docTitle,
          description: `Rehearsal on ${docTitle} (from ${categoryLabel})`,
        }),
      });
      if (!createRes.ok) throw new Error(`create ${createRes.status}`);
      const cowork = (await createRes.json()) as { id: string };
      await fetch(`/api/coworks/${cowork.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addMaterial: {
            kind: 'library',
            ref: docId,
            title: docTitle,
            meta: {
              categorySlug,
              subcategory,
              href: `/knowledge/${categorySlug}/${fileSlug}`,
            },
          },
        }),
      });
      router.push(`/knowledge/${categorySlug}/cowork/${cowork.id}`);
    } catch {
      setErrored(true);
      setBusy(false);
      setTimeout(() => setErrored(false), 2500);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title="Start a rehearsal cowork pre-loaded with this document"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '0.3rem 0.65rem',
        borderRadius: 999,
        border: '0.5px solid color-mix(in srgb, var(--accent) 40%, var(--mat-border))',
        background: errored
          ? 'color-mix(in srgb, var(--danger, #c33) 12%, transparent)'
          : 'color-mix(in srgb, var(--accent) 8%, transparent)',
        color: errored ? 'var(--danger, #c33)' : 'var(--accent)',
        cursor: busy ? 'default' : 'pointer',
        fontSize: '0.78rem',
        fontWeight: 600,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {errored ? 'Failed — try again' : busy ? 'Creating…' : '✨ Rehearse this'}
    </button>
  );
}
