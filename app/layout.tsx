import './globals.css';
import type { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';
import { CopyButtonInjector } from '../components/CopyButton';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { LinkPreview } from '../components/LinkPreview';
import { QuickSwitcher } from '../components/QuickSwitcher';
import { DropZone } from '../components/DropZone';
import { SWRegister } from '../components/SWRegister';
import { SettingsPanel } from '../components/SettingsPanel';
import { TraceMigrator } from '../components/TraceMigrator';
import { GlobalLiveArtifact } from '../components/GlobalLiveArtifact';
import { FreeInput } from '../components/FreeInput';
import { RehearsalOverlay } from '../components/RehearsalOverlay';
import { ExaminerOverlay } from '../components/ExaminerOverlay';
import { IngestionOverlay } from '../components/IngestionOverlay';
import { RecursingOverlay } from '../components/RecursingOverlay';
import { KeyboardHelpOverlay } from '../components/unified/KeyboardHelpOverlay';
import { ExportAction } from '../components/ExportAction';
import { CrystallizeListener } from '../components/CrystallizeListener';
import { PageScopedChrome } from '../components/PageScopedChrome';


export const metadata = {
  title: 'Loom',
  description: 'Weave your kesi — a place where fast thinking with AI becomes a lasting fabric of understanding.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Loom',
    statusBarStyle: 'black-translucent' as const,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon', sizes: '32x32' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#000000' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{localStorage.removeItem('wiki:reading-mode');}catch(e){}try{var t=localStorage.getItem('theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=t==='dark'||(!t&&p);if(d)document.documentElement.classList.add('dark');var a=localStorage.getItem('wiki:accent');if(a){var P=[['#0071e3','#0a84ff'],['#5856d6','#5e5ce6'],['#af52de','#bf5af2'],['#ff2d55','#ff375f'],['#ff3b30','#ff453a'],['#ff9500','#ff9f0a'],['#34c759','#30d158'],['#30b0c7','#40c8e0']];var i=parseInt(a,10);if(P[i]){var c=d?P[i][1]:P[i][0];document.documentElement.style.setProperty('--accent',c);document.documentElement.style.setProperty('--accent-soft','color-mix(in srgb, '+c+' 14%, transparent)');}}var sb=localStorage.getItem('wiki:sidebar:mode');if(sb==='pinned')document.body&&document.body.classList.add('sidebar-pinned');}catch(e){}`,
          }}
        />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <div className="layout">
          <Sidebar />
          <main id="main" tabIndex={-1}>
            {children}
            <GlobalLiveArtifact />
            <FreeInput />
          </main>
        </div>
        <CopyButtonInjector />
        <SWRegister />
        <SettingsPanel />
        <TraceMigrator />
        <KeyboardShortcuts />
        <LinkPreview />
        <QuickSwitcher />
        <DropZone />
        <PageScopedChrome />
        <RehearsalOverlay />
        <ExaminerOverlay />
        <IngestionOverlay />
        <RecursingOverlay />
        <KeyboardHelpOverlay />
        <ExportAction />
        <CrystallizeListener />
      </body>
    </html>
  );
}
