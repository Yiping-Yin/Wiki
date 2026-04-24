import { redirect } from 'next/navigation';

export const metadata = { title: 'Sources · Loom' };

export default function LegacyKnowledgePage() {
  redirect('/sources');
}
