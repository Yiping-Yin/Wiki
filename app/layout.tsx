import './globals.css';
import './globals-v2.css';
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
import { CopyButtonInjector } from '../components/CopyButton';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { LinkPreview } from '../components/LinkPreview';
import { DropZone } from '../components/DropZone';
import { TraceMigrator } from '../components/TraceMigrator';
import { GlobalLiveArtifact } from '../components/GlobalLiveArtifact';
import { FreeInput } from '../components/FreeInput';
import { IngestionOverlay } from '../components/IngestionOverlay';
import { RecursingOverlay } from '../components/RecursingOverlay';
import { RehearsalOverlay } from '../components/RehearsalOverlay';
import { ExaminerOverlay } from '../components/ExaminerOverlay';
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
