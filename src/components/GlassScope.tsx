'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Switches the glass treatment on for the primary page only.
 *
 * The lens is worth it on the page people land on. On the working pages —
 * dense tables, long reports, a review queue somebody sits in for an hour —
 * it costs legibility and buys nothing, so those stay flat.
 */
export default function GlassScope({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const glass = pathname === '/';

  return (
    <div className="app-frame h-full flex" data-glass={glass ? 'on' : 'off'}>
      {children}
    </div>
  );
}
