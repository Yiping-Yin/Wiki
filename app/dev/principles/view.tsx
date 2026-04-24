'use client';
import dynamic from 'next/dynamic';
import { PageFrame } from '../../../components/PageFrame';

const NoteRenderer = dynamic(
  () => import('../../../components/NoteRenderer').then((m) => m.NoteRenderer),
  { ssr: false }
);

export function PrinciplesView({ source }: { source: string }) {
  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: 'var(--space-7)' }}>
      <PageFrame
        eyebrow="Dev"
        title="Principles."
        description="The design constitution, rendered inside Loom itself."
      >
        <NoteRenderer source={source} />
      </PageFrame>
    </div>
  );
}
