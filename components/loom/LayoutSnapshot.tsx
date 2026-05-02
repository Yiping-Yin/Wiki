'use client';
import type { ReactNode } from 'react';

export interface LayoutSnapshotProps {
  toolbar: ReactNode;
  children: ReactNode;
}

export function LayoutSnapshot({ toolbar, children }: LayoutSnapshotProps) {
  return (
    <div className="loom-layout-snapshot">
      <div className="loom-layout-snapshot__toolbar">{toolbar}</div>
      <div className="loom-layout-snapshot__frame">{children}</div>

      <style jsx>{`
        .loom-layout-snapshot {
          width: 100%;
          min-height: 100vh;
          background: var(--paper-deep);
          color: var(--ink-1);
          display: flex;
          flex-direction: column;
        }
        /*
         * Sticky toolbar — solid paper-up bg + 0.5px hair border-bottom.
         * NEVER add backdrop-filter here (constitutional rule 1).
         */
        .loom-layout-snapshot__toolbar {
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--paper-up);
          border-bottom: 0.5px solid var(--hair);
          padding: var(--space-sm) var(--space-md);
        }
        .loom-layout-snapshot__frame {
          flex: 1 1 auto;
          width: 100%;
          display: flex;
          flex-direction: column;
        }
        .loom-layout-snapshot__frame :global(iframe) {
          flex: 1 1 auto;
          width: 100%;
          min-height: calc(100vh - 3rem);
          border: 0;
          background: var(--paper-deep);
        }
      `}</style>
    </div>
  );
}
