'use client';
/**
 * useAnimatedPresence · mount/unmount with enter + exit animation.
 *
 * Returns { mounted, visible, close }.
 * - mounted: whether the component should be in the DOM
 * - visible: whether the enter animation should play (true) or exit (false)
 * - close(): triggers exit animation, then unmounts after duration
 *
 * Usage:
 *   const { mounted, visible, close } = useAnimatedPresence(active, 200);
 *   if (!mounted) return null;
 *   return <div style={{ opacity: visible ? 1 : 0 }}> ... </div>
 */
import { useCallback, useEffect, useState } from 'react';

export function useAnimatedPresence(active: boolean, durationMs = 200) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setMounted(true);
      // Delay one frame so the enter animation triggers
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), durationMs);
      return () => clearTimeout(timer);
    }
  }, [active, durationMs]);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(() => setMounted(false), durationMs);
  }, [durationMs]);

  return { mounted, visible, close };
}
