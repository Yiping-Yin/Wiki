'use client';
/**
 * GlobalLiveArtifact · the LiveArtifact mount point for non-doc surfaces.
 *
 * On wiki/* and knowledge/* pages, the page itself already mounts a
 * <LiveArtifact> in the right place. On every other surface (/today,
 * /patterns, /, /knowledge index, etc.) there is no doc-shaped container, so
 * the user's free-thinking artifact would have nowhere to live.
 *
 * This component sits inside <main> in the root layout. It only renders
 * when the current pathname maps to a free/<date> doc context — on real
 * doc pages it returns null and yields the surface to that page's own
 * LiveArtifact.
 *
 * §1 — empty by default. The component only takes space once the user
 * has actually woven something into the free-mode Live Note.
 */
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { contextFromPathname } from '../lib/doc-context';
import { LiveArtifact } from './LiveArtifact';

export function GlobalLiveArtifact() {
  const pathname = usePathname() ?? '/';
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const ctx = contextFromPathname(pathname);
  if (!ctx.isFree) return null; // doc pages mount their own

  // Wrap in .prose-notion so the artifact matches the typography & width
  // of doc pages exactly. The free-mode artifact reads as "the same kind of
  // thing" the user sees on /wiki and /knowledge pages — one fabric.
  return (
    <div className="prose-notion" style={{ paddingTop: 0, paddingBottom: '4rem' }}>
      <LiveArtifact docId={ctx.docId} />
    </div>
  );
}
