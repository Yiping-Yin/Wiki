import './globals.css';
import type { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';
import { CopyButtonInjector } from '../components/CopyButton';
import { ChatPanel } from '../components/ChatPanel';
import { ScrollProgress } from '../components/ScrollProgress';
import { SelectionMenu } from '../components/SelectionMenu';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { LinkPreview } from '../components/LinkPreview';
import { ReadingMode } from '../components/ReadingMode';
import { StickyTitle } from '../components/StickyTitle';
import { QuickSwitcher } from '../components/QuickSwitcher';
import { DropZone } from '../components/DropZone';
import { FloatingDock } from '../components/FloatingDock';
import { LiquidBar } from '../components/LiquidBar';

export const metadata = {
  title: 'My Personal Wiki',
  description: 'Notion-style knowledge base over your local notes + LLM reference library.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&p))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <ScrollProgress />
        <StickyTitle />
        <div className="layout">
          <Sidebar />
          <main>{children}</main>
        </div>
        <CopyButtonInjector />
        <SelectionMenu />
        <KeyboardShortcuts />
        <LinkPreview />
        <ReadingMode />
        <QuickSwitcher />
        <DropZone />
        <ChatPanel />
        <LiquidBar />
      </body>
    </html>
  );
}
