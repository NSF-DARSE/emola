'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The two views of the same mailbox, and the only navigation most people need.
 *
 * They are a pair on purpose: "All email" is the six hundred that arrive and
 * "Abnormal events" is the handful that matter. Seeing the counts side by side
 * is the fastest way to understand what the system is for.
 */
const TABS = [
  { href: '/inbox', label: 'All email', match: (p: string) => p.startsWith('/inbox') },
  { href: '/', label: 'Abnormal events', match: (p: string) => p === '/' },
];

export default function Tabs({ counts }: { counts: { inbox: number; abnormal: number } }) {
  const pathname = usePathname();
  const n = { '/inbox': counts.inbox, '/': counts.abnormal } as Record<string, number>;

  return (
    <div className="h-14 shrink-0 border-b border-border flex items-end px-4 sm:px-6 gap-1">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`tab ${active ? 'tab-active' : ''}`}
          >
            {t.label}
            <span className="ml-2 text-[12.5px] tabular-nums opacity-55">{n[t.href]}</span>
          </Link>
        );
      })}
    </div>
  );
}
