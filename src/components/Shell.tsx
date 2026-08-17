import type { ReactNode } from 'react';

import Nav from '@/components/Nav';
import { getReviewQueue } from '@/lib/db';

export default function Shell({ children }: { children: ReactNode }) {
  const queueCount = getReviewQueue().length;

  return (
    <div className="h-screen flex bg-bg">
      <Nav queueCount={queueCount} />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
