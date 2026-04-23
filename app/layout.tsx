import './globals.css';
import type { ReactNode } from 'react';
import { Cormorant_Garamond } from 'next/font/google';
import { FocusLayerProvider } from '../lib/focus-layer';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['italic', 'normal'],
  variable: '--font-cormorant',
  display: 'swap',
});
// Sidebar retired 2026-04-22 — web component is now a null shell; the
// native SwiftUI `KnowledgeSidebarView` is Loom's only sidebar. See
// components/Sidebar.tsx for the historic-import stub.
import { CopyButtonInjector } from '../components/CopyButton';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { LinkPreview } from '../components/LinkPreview';
// QuickSwitcher retired 2026-04-21 — replaced by native SwiftUI Shuttle
// (⌘K) with doc search via search-index.json. File stays on disk until
// Phase 5 sweep; two tests still reference its source as fixture.
import { DropZone } from '../components/DropZone';
// SettingsPanel retired 2026-04-21 — replaced by native SwiftUI Settings
// scene (Appearance / AI / Data tabs) reached via ⌘, in the Loom Mac app.
// The web component file stays in place as dead code until Phase 5 sweeps.
import { TraceMigrator } from '../components/TraceMigrator';
import { GlobalLiveArtifact } from '../components/GlobalLiveArtifact';
import { FreeInput } from '../components/FreeInput';
import { IngestionOverlay } from '../components/IngestionOverlay';
import { RecursingOverlay } from '../components/RecursingOverlay';
import { RehearsalOverlay } from '../components/RehearsalOverlay';
import { ExaminerOverlay } from '../components/ExaminerOverlay';
// KeyboardHelpOverlay retired 2026-04-21 — replaced by native SwiftUI
// Keyboard Shortcuts window (⌘⇧?) in the Loom Mac app. The web-only
// modal is no longer mounted; the component file stays in place as
// dead code until Phase 5 deletes it.
import { ExportAction } from '../components/ExportAction';
import { CrystallizeListener } from '../components/CrystallizeListener';
import { PanelSync } from '../components/PanelSync';
import { WeaveSync } from '../components/WeaveSync';
import { PageScopedChrome } from '../components/PageScopedChrome';
import { AiKeyMissingBanner } from '../components/AiKeyMissingBanner';
import { MigrationInstaller } from '../components/MigrationInstaller';
import { InterlaceInstaller } from '../components/InterlaceInstaller';


export const metadata = {
  title: 'Loom',
  description: 'Weave lasting patterns of understanding from your reading and thinking.',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon', sizes: '32x32' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F0E4' },
    { media: '(prefers-color-scheme: dark)',  color: '#1A1815' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {

  return (
    <html lang="en" className={cormorant.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{localStorage.removeItem('wiki:reading-mode');}catch(e){}try{var root=document.documentElement;var t=localStorage.getItem('wiki:theme');if(t==='dark'){root.classList.add('dark');root.classList.remove('light');}else if(t==='light'){root.classList.add('light');root.classList.remove('dark');}}catch(e){}`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var onKey=function(e){if(e.key==='Tab')document.documentElement.classList.add('user-tabbing')};var clear=function(){document.documentElement.classList.remove('user-tabbing')};window.addEventListener('keydown',onKey,{passive:true});window.addEventListener('mousedown',clear,{passive:true});window.addEventListener('pointerdown',clear,{passive:true});}catch(e){}`,
          }}
        />
      </head>
      <body>
        <FocusLayerProvider>
        <div className="loom-grain" />
        <div className="loom-vignette" />
        <div className="layout">
          <main id="main" tabIndex={-1}>
            <AiKeyMissingBanner />
            {children}
            <GlobalLiveArtifact />
            <FreeInput />
          </main>
        </div>
        <CopyButtonInjector />
        <TraceMigrator />
        <KeyboardShortcuts />
        <LinkPreview />
        <DropZone />
        <RehearsalOverlay />
        <ExaminerOverlay />
        <PageScopedChrome />
        <IngestionOverlay />
        <RecursingOverlay />
        <ExportAction />
        <CrystallizeListener />
        <PanelSync />
        <WeaveSync />
        <MigrationInstaller />
        <InterlaceInstaller />
        </FocusLayerProvider>
      </body>
    </html>
  );
}
