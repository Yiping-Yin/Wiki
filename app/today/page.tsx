import { redirect } from 'next/navigation';

export const metadata = { title: 'Today · Loom' };

export default function LegacyTodayPage() {
  redirect('/desk');
}
