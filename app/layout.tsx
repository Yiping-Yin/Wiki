import './globals.css';
import type { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';
import { CopyButtonInjector } from '../components/CopyButton';
import { RAGChat } from '../components/RAGChat';

export const metadata = {
  title: 'LLM Wiki — Karpathy LLM101n Knowledge Base',
  description: 'A Notion-style wiki for learning LLMs from Karpathy LLM101n & Zero to Hero.',
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
        <div className="layout">
          <Sidebar />
          <main>{children}</main>
        </div>
        <CopyButtonInjector />
        <RAGChat />
      </body>
    </html>
  );
}
