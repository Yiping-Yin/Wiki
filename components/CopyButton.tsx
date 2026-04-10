'use client';
import { useEffect } from 'react';

export function CopyButtonInjector() {
  useEffect(() => {
    const pres = document.querySelectorAll('main pre');
    const cleanups: (() => void)[] = [];
    pres.forEach((pre) => {
      if (pre.querySelector('.copy-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      Object.assign(btn.style, {
        position: 'absolute', top: '8px', right: '8px',
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: '4px', padding: '2px 8px', fontSize: '0.72rem',
        cursor: 'pointer', color: 'var(--muted)', opacity: '0',
        transition: 'opacity 0.15s',
      } as CSSStyleDeclaration);
      (pre as HTMLElement).style.position = 'relative';
      const show = () => (btn.style.opacity = '1');
      const hide = () => (btn.style.opacity = '0');
      pre.addEventListener('mouseenter', show);
      pre.addEventListener('mouseleave', hide);
      btn.onclick = () => {
        const code = pre.querySelector('code')?.textContent ?? '';
        navigator.clipboard.writeText(code);
        btn.textContent = '✓ Copied';
        setTimeout(() => (btn.textContent = 'Copy'), 1200);
      };
      pre.appendChild(btn);
      cleanups.push(() => {
        pre.removeEventListener('mouseenter', show);
        pre.removeEventListener('mouseleave', hide);
        btn.remove();
      });
    });
    return () => cleanups.forEach((fn) => fn());
  }, []);
  return null;
}
