'use client';
import { useEffect, useRef } from 'react';

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import('mermaid')).default;
      const isDark = document.documentElement.classList.contains('dark');
      mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default', securityLevel: 'loose' });
      try {
        const id = 'm' + Math.random().toString(36).slice(2);
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (ref.current) ref.current.textContent = String(e);
      }
    })();
    return () => { cancelled = true; };
  }, [chart]);
  return <div ref={ref} style={{ margin: '1.2rem 0', textAlign: 'center' }} />;
}
