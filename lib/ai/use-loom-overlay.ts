'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnimatedPresence } from '../use-animated-presence';
import { closeLoomOverlays, type LoomOverlayId } from './surface-actions';

type OverlayDetail = {
  id?: string;
  seedDraft?: string;
  seedLabel?: string;
};

type UseLoomOverlayOptions = {
  id: LoomOverlayId;
  pathname?: string | null;
  onToggleDetail?: (detail: OverlayDetail) => void;
};

export function useLoomOverlay({
  id,
  pathname,
  onToggleDetail,
}: UseLoomOverlayOptions) {
  const [active, setActive] = useState(false);
  const { mounted, visible } = useAnimatedPresence(active, 250);
  const shouldBroadcastCloseRef = useRef(false);
  const prevPathnameRef = useRef(pathname);

  const open = useCallback((detail?: OverlayDetail) => {
    shouldBroadcastCloseRef.current = false;
    if (detail) onToggleDetail?.(detail);
    setActive(true);
  }, [onToggleDetail]);

  const close = useCallback((broadcast = false) => {
    shouldBroadcastCloseRef.current = broadcast;
    setActive(false);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = ((e as CustomEvent).detail ?? {}) as OverlayDetail;
      if (detail.id !== id) return;
      if (active) close(true);
      else open(detail);
    };
    window.addEventListener('loom:overlay:toggle', handler);
    return () => window.removeEventListener('loom:overlay:toggle', handler);
  }, [active, close, id, open]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = ((e as CustomEvent).detail ?? {}) as OverlayDetail;
      if (detail.id === id) return;
      close(false);
    };
    window.addEventListener('loom:overlay:open', handler);
    return () => window.removeEventListener('loom:overlay:open', handler);
  }, [close, id]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      e.preventDefault();
      close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close]);

  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    close(false);
  }, [close, pathname]);

  useEffect(() => {
    if (active || !shouldBroadcastCloseRef.current) return;
    shouldBroadcastCloseRef.current = false;
    closeLoomOverlays();
  }, [active]);

  return {
    active,
    mounted,
    visible,
    open,
    close,
  };
}
