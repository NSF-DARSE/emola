import Link from 'next/link';

import PrecedentList from '@/components/PrecedentList';
import { listNotifications, listPrecedents } from '@/lib/db';
import { subjectFor } from '@/lib/mail';
import { eventSignal } from '@/lib/severity';

import CalendarClient, { type DayCell } from './CalendarClient';

export const dynamic = 'force-dynamic';

/** Worst severity present that day wins the cell's colour. */
const RANK: Record<string, number> = { red: 4, amber: 3, blue: 2, green: 1, neutral: 0 };

export default function ReportsPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const showPrecedents = searchParams.view === 'precedents';
  const all = listNotifications();

  const byDate = new Map<string, DayCell>();
  for (const n of all) {
    const cell =
      byDate.get(n.receivedAt) ??
      ({ date: n.receivedAt, notices: [], signal: 'neutral' } as DayCell);
    const signal = eventSignal(n);
    cell.notices.push({
      id: n.id,
      subject: subjectFor(n),
      category: n.model.primary,
      status: n.model.status,
      signal,
    });
    if ((RANK[signal] ?? 0) > (RANK[cell.signal] ?? 0)) cell.signal = signal;
    byDate.set(n.receivedAt, cell);
  }

  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const maxPerDay = Math.max(1, ...days.map((d) => d.notices.length));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-14 shrink-0 border-b border-border flex items-center gap-3 px-4 sm:px-6">
        <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Reports</h1>
        <div className="seg ml-1">
          <Link href="/reports" className={`seg-item ${!showPrecedents ? 'seg-item-active' : ''}`}>
            By date
          </Link>
          <Link
            href="/reports?view=precedents"
            className={`seg-item ${showPrecedents ? 'seg-item-active' : ''}`}
          >
            Past decisions
            <span className="ml-1.5 text-[12px] opacity-60">{listPrecedents().length}</span>
          </Link>
        </div>
        <span className="text-[13px] text-faint">
          {/* "across 32 days" read as a 32-day period; it was really 32 days
              that happened to have a notice, spread over eighteen months. Say
              the span, which is what a reader is actually asking. */}
          {showPrecedents
            ? 'What people decided before'
            : `${all.length} notices${
                days.length > 0
                  ? ` · ${monthLabel(days[0].date)} to ${monthLabel(days[days.length - 1].date)}`
                  : ''
              }`}
        </span>
      </div>
      {showPrecedents ? (
        <PrecedentList />
      ) : (
        <CalendarClient days={days} maxPerDay={maxPerDay} />
      )}
    </div>
  );
}

/** "Jan 2025" — enough to place a date without implying a precise range. */
function monthLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  // An unparseable date renders as "Invalid Date" otherwise, which looks like
  // a value rather than a failure.
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
