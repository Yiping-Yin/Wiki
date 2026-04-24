import { redirect } from 'next/navigation';

export const metadata = { title: 'Atlas · Loom' };

export default async function AtlasPage() {
  redirect('/desk');
}
