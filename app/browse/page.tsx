import { redirect } from 'next/navigation';

export const metadata = { title: 'Desk · Loom' };

export default function LegacyBrowsePage() {
  redirect('/desk');
}
