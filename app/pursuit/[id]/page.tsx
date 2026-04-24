import PursuitDetailClient from '../../PursuitDetailClient';

export const metadata = { title: 'Pursuit · Loom' };

export default async function CanonicalPursuitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PursuitDetailClient id={decodeURIComponent(id)} />;
}
