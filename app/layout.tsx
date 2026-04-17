import './globals.css';
import type { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';
import { CopyButtonInjector } from '../components/CopyButton';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { LinkPreview } from '../components/LinkPreview';
import { QuickSwitcher } from '../components/QuickSwitcher';
import { DropZone } from '../components/DropZone';
import { SettingsPanel } from '../components/SettingsPanel';
import { TraceMigrator } from '../components/TraceMigrator';
import { GlobalLiveArtifact } from '../components/GlobalLiveArtifact';
import { FreeInput } from '../components/FreeInput';
import { IngestionOverlay } from '../components/IngestionOverlay';
import { RecursingOverlay } from '../components/RecursingOverlay';
import { KeyboardHelpOverlay } from '../components/unified/KeyboardHelpOverlay';
import { ExportAction } from '../components/ExportAction';
import { CrystallizeListener } from '../components/CrystallizeListener';
import { PanelSync } from '../components/PanelSync';
import { WeaveSync } from '../components/WeaveSync';
import { PageScopedChrome } from '../components/PageScopedChrome';


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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#000000' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{localStorage.removeItem('wiki:reading-mode');}catch(e){}try{var root=document.documentElement;var t=localStorage.getItem('theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=t==='dark'||(!t&&p);root.classList.toggle('dark',d);root.classList.toggle('light',t==='light');var a=localStorage.getItem('wiki:accent');if(a){var P=[['#0071e3','#0a84ff'],['#5856d6','#5e5ce6'],['#af52de','#bf5af2'],['#ff2d55','#ff375f'],['#ff3b30','#ff453a'],['#ff9500','#ff9f0a'],['#34c759','#30d158'],['#30b0c7','#40c8e0']];var i=parseInt(a,10);if(P[i]){var c=d?P[i][1]:P[i][0];root.style.setProperty('--accent',c);root.style.setProperty('--accent-soft','color-mix(in srgb, '+c+' 14%, transparent)');}}var sb=localStorage.getItem('wiki:sidebar:mode');var legacyPinned=localStorage.getItem('wiki:sidebar:pinned');var defaultSidebar=window.innerWidth>900?'pinned':'hidden';if((sb==='pinned')||(!sb&&legacyPinned==='1')||(!sb&&!legacyPinned&&defaultSidebar==='pinned'))document.body&&document.body.classList.add('sidebar-pinned');}catch(e){}`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var onKey=function(e){if(e.key==='Tab')document.documentElement.classList.add('user-tabbing')};var clear=function(){document.documentElement.classList.remove('user-tabbing')};window.addEventListener('keydown',onKey,{passive:true});window.addEventListener('mousedown',clear,{passive:true});window.addEventListener('pointerdown',clear,{passive:true});}catch(e){}`,
          }}
        />
      </head>
      <body>
        <div className="loom-grain" />
        <div className="loom-vignette" />
        <div className="layout">
          <Sidebar />
          <main id="main" tabIndex={-1}>
            {children}
            <GlobalLiveArtifact />
            <FreeInput />
          </main>
        </div>
        <CopyButtonInjector />
        <SettingsPanel />
        <TraceMigrator />
        <KeyboardShortcuts />
        <LinkPreview />
        <QuickSwitcher />
        <DropZone />
        <PageScopedChrome />
        <IngestionOverlay />
        <RecursingOverlay />
        <KeyboardHelpOverlay />
        <ExportAction />
        <CrystallizeListener />
        <PanelSync />
        <WeaveSync />
      </body>
    </html>
  );
}
