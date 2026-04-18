import type { CSSProperties, ReactNode } from 'react';

type QuietSceneTone = 'home' | 'today' | 'atlas' | 'patterns';

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function QuietScene({
  tone,
  children,
  className,
  style,
}: {
  tone: QuietSceneTone;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={joinClasses('loom-quiet-scene', `loom-quiet-scene--${tone}`, className)}
      style={style}
    >
      {children}
    </div>
  );
}

export function QuietSceneColumn({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={joinClasses('loom-quiet-scene__column', className)} style={style}>
      {children}
    </div>
  );
}
