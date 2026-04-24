'use client';

import { usePathname } from 'next/navigation';
import { HighlightOverlay } from './HighlightOverlay';
import { ChatFocus } from './ChatFocus';
import { ReviewMode } from './CoworkSplit';
import { SelectionWarp } from './SelectionWarp';
import { SelectionLegend } from './SelectionLegend';
import { SourceCorrectTrigger } from './SourceCorrectTrigger';
import { SourceCorrectionsBadge } from './SourceCorrectionsBadge';
import { ReadingMode } from './ReadingMode';
import { LoomCursor } from './LoomCursor';
import { CapturePrompt } from './CapturePrompt';
import { ScrollDirection } from './ScrollDirection';
import { ActiveRetrieval } from './ActiveRetrieval';
import { RefreshCoach } from './RefreshCoach';

function isReadingPath(pathname: string) {
  return (
    pathname.startsWith('/wiki/') ||
    pathname.startsWith('/knowledge/') ||
    pathname.startsWith('/uploads/')
  );
}

export function PageScopedChrome() {
  const pathname = usePathname() ?? '/';

  if (!isReadingPath(pathname)) return null;

  return (
    <>
      <HighlightOverlay />
      <ChatFocus />
      <ReviewMode />
      <SelectionWarp />
      <SelectionLegend />
      <SourceCorrectTrigger />
      <SourceCorrectionsBadge />
      <ReadingMode />
      <LoomCursor />
      <CapturePrompt />
      <ScrollDirection />
      <ActiveRetrieval />
      <RefreshCoach />
    </>
  );
}
