import type { Metadata } from 'next';
import { Suspense } from 'react';

import './globals.css';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'Abnormal Events — DOF',
  description:
    'Notification classification, human approval workflow, and employee/leadership communications for State of Delaware DOF abnormal events.',
};

/**
 * Runs before first paint. Without it a dark-theme user gets a white flash on
 * every navigation, because the stored preference is only readable on the
 * client and React would apply it after hydration.
 */
const NO_FLASH = `(function(){try{var s=localStorage.getItem('theme');var t=s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="font-sans">
        <Suspense>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
