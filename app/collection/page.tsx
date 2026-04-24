import { Suspense } from 'react';
import CollectionClient from '../CollectionClient';

export const metadata = { title: 'Collection · Loom' };

export default function CollectionPage() {
  return (
    <Suspense fallback={null}>
      <CollectionClient />
    </Suspense>
  );
}
