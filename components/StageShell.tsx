import type { CSSProperties, ReactNode } from 'react';

type StageVariant = 'working' | 'archive' | 'map';

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function StageShell({
  variant,
  children,
  className,
  innerClassName,
  style,
  innerStyle,
  contentVariant,
}: {
  variant: StageVariant;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  style?: CSSProperties;
  innerStyle?: CSSProperties;
  contentVariant?: StageVariant;
}) {
  return (
    <div
      className={joinClasses('loom-stage-shell', `loom-stage-shell--${variant}`, className)}
      style={style}
    >
      <div
        className={joinClasses(
          'loom-stage-shell__inner',
          `loom-stage-content--${contentVariant ?? variant}`,
          innerClassName,
        )}
        style={innerStyle}
      >
        {children}
      </div>
    </div>
  );
}
