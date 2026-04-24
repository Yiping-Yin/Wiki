import PanelDetailClient from '../../PanelDetailClient';

export const metadata = { title: 'Panel · Loom' };

export default async function CanonicalPanelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PanelDetailClient id={decodeURIComponent(id)} />;
}
