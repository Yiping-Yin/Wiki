'use client';
import { useEffect } from 'react';
import { useHistory } from '../lib/use-history';

export function TrackView({ id, title, href }: { id: string; title: string; href: string }) {
  const [, track] = useHistory();
  useEffect(() => { track({ id, title, href }); }, [id, title, href, track]);
  return null;
}
