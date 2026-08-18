import type { ReactNode } from 'react';

import GlassScope from '@/components/GlassScope';
import Nav from '@/components/Nav';
import { getReviewQueue } from '@/lib/db';

export default function Shell({ children }: { children: ReactNode }) {
  const queueCount = getReviewQueue().length;

  return (
    <div className="h-screen p-0 sm:p-3 lg:p-5">
      <GlassScope>
        <Nav queueCount={queueCount} />
        <main className="flex-1 min-w-0 flex flex-col">{children}</main>
      </GlassScope>
    </div>
  );
}
