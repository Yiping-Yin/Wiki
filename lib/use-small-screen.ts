'use client';

import { useEffect, useState } from 'react';

export function useSmallScreen(maxWidth = 900) {
  const [small, setSmall] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const apply = () => setSmall(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [maxWidth]);

  return small;
}
