'use client';
import dynamic from 'next/dynamic';

const NoteRenderer = dynamic(
  () => import('../../../components/NoteRenderer').then((m) => m.NoteRenderer),
  { ssr: false }
);

export function PrinciplesView({ source }: { source: string }) {
  return (
    <div className="prose-notion">
      <NoteRenderer source={source} />
    </div>
  );
}
