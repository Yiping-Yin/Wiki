'use client';

import React from 'react';
import Image from 'next/image';

/**
 * LoomLogo — reference wordmark asset supplied by the user.
 */
export function LoomLogo({
  size = 24,
  active = false,
  density = 'default',
}: {
  size?: number;
  active?: boolean;
  density?: 'compact' | 'default';
}) {
  const height = size;
  const width = height * (3312 / 1264) * (density === 'compact' ? 0.92 : 1);

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        borderRadius: 999,
        overflow: 'hidden',
        transition: 'transform 0.28s var(--ease-spring), opacity 0.2s var(--ease)',
        transform: active ? 'translateY(-0.2px)' : 'translateY(0px)',
        opacity: active ? 1 : 0.94,
      }}
    >
      <Image
        src="/brand/loom_wordmark_about_reference.png"
        alt="Loom"
        width={width}
        height={height}
        sizes={`${Math.ceil(width)}px`}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
