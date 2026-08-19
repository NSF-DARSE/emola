import Link from 'next/link';

import DetailPanel from '@/components/DetailPanel';
import IngestTheatre from '@/components/IngestTheatre';
import Tabs from '@/components/Tabs';
import { CategoryLabel, Dot, Empty } from '@/components/ui';
import { getNotification, listNotifications } from '@/lib/db';
import { listInbox } from '@/lib/inbox';
import { shortDate, subjectFor } from '@/lib/mail';
import { eventSignal, reviewSignal, SIGNAL_VAR } from '@/lib/severity';
import { CATEGORIES, isCategory } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

type Filter = 'all' | 'review' | 'sent';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Needs review' },
  { key: 'sent', label: 'Auto-sent' },
];

function href(params: { filter?: string; category?: string; selected?: string }): string {
  const q = new URLSearchParams();
  if (params.filter && params.filter !== 'all') q.set('filter', params.filter);
  if (params.category) q.set('category', params.category);
  if (params.selected) q.set('selected', params.selected);
  const s = q.toString();
  return s ? `/?${s}` : '/';
}

export default function EventsPage({
  searchParams,
}: {
  searchParams: { filter?: string; category?: string; selected?: string };
}) {
  const filter: Filter =
    searchParams.filter === 'review' || searchParams.filter === 'sent'
      ? searchParams.filter
      : 'all';
  const category = searchParams.category && isCategory(searchParams.category) ? searchParams.category : undefined;

  const all = listNotifications();
  let rows = all;
  if (filter === 'review') rows = rows.filter((n) => n.route === 'human_review' && n.reviewState === 'pending');
  if (filter === 'sent') rows = rows.filter((n) => n.route === 'auto_send');
  if (category) rows = rows.filter((n) => n.model.primary === category);

  const selected = searchParams.selected ? getNotification(searchParams.selected) : null;

  const counts = {
    all: all.length,
    review: all.filter((n) => n.route === 'human_review' && n.reviewState === 'pending').length,
    sent: all.filter((n) => n.route === 'auto_send').length,
  };

  if (all.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <Tabs counts={{ inbox: listInbox().length, abnormal: 0 }} />
        <IngestTheatre mailbox="DOF IT Support" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Tabs counts={{ inbox: listInbox().length, abnormal: all.length }} />
      <div className="flex-1 flex min-h-0">
      {/* Below lg the panel takes the whole pane, so the list steps aside —
          master/detail rather than two columns squeezed together. */}
      <div className={`flex-1 min-w-0 flex-col ${selected ? 'hidden lg:flex' : 'flex'}`}>
        {/* header */}
        <div className="h-14 shrink-0 border-b border-border flex items-center gap-3 px-4 sm:px-6">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">
            Relayed to staff
          </h1>
          <span className="text-[13px] text-faint">{rows.length}</span>
        </div>

        {/* filters */}
        <div className="h-14 shrink-0 border-b border-border flex items-center gap-3 px-4 sm:px-6 overflow-x-auto">
          <div className="seg shrink-0">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={href({ filter: f.key, category, selected: searchParams.selected })}
                className={`seg-item ${filter === f.key ? 'seg-item-active' : ''}`}
              >
                {f.label}
                <span className="ml-2 text-[12px] opacity-60">{counts[f.key]}</span>
              </Link>
            ))}
          </div>

          <span className="w-px h-4 bg-border shrink-0" />

          <div className="flex items-center gap-1 shrink-0">
            {CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <Link
                  key={c}
                  href={href({
                    filter,
                    category: active ? undefined : c,
                    selected: searchParams.selected,
                  })}
                  className={`px-2.5 py-1 rounded-md text-[13px] transition-colors ${
                    active ? 'bg-selected text-fg font-medium' : 'text-muted hover:bg-hover hover:text-fg'
                  }`}
                >
                  {c}
                </Link>
              );
            })}
          </div>
        </div>

        {/* table */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {rows.map((n, i) => {
            const isSelected = selected?.id === n.id;
            const review = reviewSignal(n);
            return (
              <Link
                key={n.id}
                href={href({ filter, category, selected: isSelected ? undefined : n.id })}
                className={`trow anim-rise ${isSelected ? 'trow-selected' : ''}`}
                // Stagger only the first rows on screen; past that it just
                // delays content someone is waiting to read.
                style={{ animationDelay: `${Math.min(i, 10) * 22}ms` }}
              >
                <span className="trow-bar" style={{ background: SIGNAL_VAR[eventSignal(n)] }} />
                <span className="hidden md:block w-[104px] shrink-0">
                  <CategoryLabel value={n.model.primary} />
                </span>
                <span className="flex-1 min-w-0 flex items-baseline gap-2.5">
                  <span className="text-[14px] font-medium text-fg truncate lg:max-w-[54%]">
                    {subjectFor(n)}
                  </span>
                  <span className="hidden lg:block text-[13px] text-faint truncate">
                    {n.extracted.affectedSystems.join(', ')}
                  </span>
                </span>
                {n.synthetic && (
                  <span className="badge shrink-0" title="Written by us to test the system">
                    Example
                  </span>
                )}
                <span className="shrink-0 flex items-center gap-2 sm:w-[118px]">
                  <Dot signal={review.signal} />
                  <span className="hidden sm:block text-[13px] text-muted truncate">
                    {review.label}
                  </span>
                </span>
                <span className="hidden sm:block shrink-0 text-[13px] text-faint w-[74px] text-right">
                  {shortDate(n.receivedAt)}
                </span>
              </Link>
            );
          })}
          {rows.length === 0 && <Empty>Nothing here.</Empty>}
        </div>
      </div>

        {selected && (
          <DetailPanel
            notification={selected}
            closeHref={href({ filter, category })}
          />
        )}
      </div>
    </div>
  );
}
