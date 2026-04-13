'use client';

import { usePathname } from 'next/navigation';
import { HighlightOverlay } from './HighlightOverlay';
import { ChatFocus } from './ChatFocus';
import { ReviewMode } from './CoworkSplit';
import { SelectionWarp } from './SelectionWarp';
import { ReadingMode } from './ReadingMode';
import { LoomCursor } from './LoomCursor';
import { CapturePrompt } from './CapturePrompt';
import { FirstTimeHint } from './FirstTimeHint';
import { ScrollDirection } from './ScrollDirection';
import { ActiveRetrieval } from './ActiveRetrieval';

function isReadingPath(pathname: string) {
  return pathname.startsWith('/wiki/') || pathname.startsWith('/knowledge/');
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
      <ReadingMode />
      <LoomCursor />
      <CapturePrompt />
      <FirstTimeHint />
      <ScrollDirection />
      <ActiveRetrieval />
    </>
  );
}
