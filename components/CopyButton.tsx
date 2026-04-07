'use client';
import { useEffect } from 'react';

export function CopyButtonInjector() {
  useEffect(() => {
    const pres = document.querySelectorAll('main pre');
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
      pre.addEventListener('mouseenter', () => (btn.style.opacity = '1'));
      pre.addEventListener('mouseleave', () => (btn.style.opacity = '0'));
      btn.onclick = () => {
        const code = pre.querySelector('code')?.textContent ?? '';
        navigator.clipboard.writeText(code);
        btn.textContent = '✓ Copied';
        setTimeout(() => (btn.textContent = 'Copy'), 1200);
      };
      pre.appendChild(btn);
    });
  }, []);
  return null;
}
