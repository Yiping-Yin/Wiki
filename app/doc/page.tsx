import { Suspense } from 'react';
import DocClient from '../DocClient';

export const metadata = { title: 'Doc · Loom' };

export default function DocPage() {
  return (
    <Suspense fallback={null}>
      <DocClient />
    </Suspense>
  );
}
