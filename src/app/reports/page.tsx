import { listNotifications } from '@/lib/db';
import { subjectFor } from '@/lib/mail';
import { eventSignal } from '@/lib/severity';

import CalendarClient, { type DayCell } from './CalendarClient';

export const dynamic = 'force-dynamic';

/** Worst severity present that day wins the cell's colour. */
const RANK: Record<string, number> = { red: 4, amber: 3, blue: 2, green: 1, neutral: 0 };

export default function ReportsPage() {
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
        <span className="text-[13px] text-faint">
          {all.length} notifications across {days.length} days
        </span>
      </div>
      <CalendarClient days={days} maxPerDay={maxPerDay} />
    </div>
  );
}
