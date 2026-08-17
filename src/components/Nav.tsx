'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import Icon, { type IconName } from '@/components/Icon';
import ThemeToggle from '@/components/ThemeToggle';

const ITEMS: Array<{ href: string; icon: IconName; label: string; match: (p: string) => boolean }> = [
  { href: '/', icon: 'events', label: 'Events', match: (p) => p === '/' },
  { href: '/review', icon: 'queue', label: 'Review queue', match: (p) => p.startsWith('/review') },
  { href: '/reports', icon: 'metrics', label: 'Reports', match: (p) => p.startsWith('/reports') },
  { href: '/precedents', icon: 'precedents', label: 'Precedents', match: (p) => p.startsWith('/precedents') },
  { href: '/metrics', icon: 'metrics', label: 'Evaluation', match: (p) => p.startsWith('/metrics') },
  { href: '/workflow', icon: 'workflow', label: 'How it works', match: (p) => p.startsWith('/workflow') },
];

export default function Nav({ queueCount }: { queueCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="w-14 shrink-0 border-r border-border flex flex-col items-center py-3 gap-1 bg-surface">
      <Link href="/" className="mb-3 w-8 h-8 rounded-lg bg-fg text-bg grid place-items-center shrink-0">
        <span className="text-[10px] font-bold tracking-tight font-mono">DE</span>
      </Link>

      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            className={`rail-btn group ${active ? 'rail-btn-active' : ''}`}
          >
            <Icon name={item.icon} size={17} />
            {item.href === '/review' && queueCount > 0 && (
              <span
                className="absolute top-1 right-1 w-[6px] h-[6px] rounded-full"
                style={{ background: 'var(--sig-amber)' }}
              />
            )}
            <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-md border border-border bg-elevated px-2 py-1 text-[11.5px] text-fg opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              {item.label}
              {item.href === '/review' && queueCount > 0 && (
                <span className="ml-1.5 text-muted tabular-nums">{queueCount}</span>
              )}
            </span>
          </Link>
        );
      })}

      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </nav>
  );
}
