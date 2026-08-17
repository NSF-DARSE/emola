'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Icon from '@/components/Icon';
import PeriodReport from '@/components/PeriodReport';
import { Note } from '@/components/ui';
import type { PeriodReportPayload } from '@/lib/llm/period-report';
import type { Signal } from '@/lib/severity';

export interface DayNotice {
  id: string;
  subject: string;
  category: string;
  status: string;
  signal: Signal;
}

export interface DayCell {
  date: string; // YYYY-MM-DD
  notices: DayNotice[];
  signal: Signal;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const SIGNAL_VAR: Record<string, string> = {
  red: 'var(--sig-red)',
  amber: 'var(--sig-amber)',
  green: 'var(--sig-green)',
  blue: 'var(--sig-blue)',
  neutral: 'var(--border-strong)',
};

function dowIndex(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function prettyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

interface Hover {
  date: string;
  x: number;
  y: number;
}

export default function CalendarClient({ days, maxPerDay }: { days: DayCell[]; maxPerDay: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<PeriodReportPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Drag-to-select. Whether a drag adds or removes is decided by the cell you
  // started on, so dragging back over a selected block clears it.
  const dragMode = useRef<'add' | 'remove' | null>(null);
  const [dragging, setDragging] = useState(false);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const months = useMemo(() => [...new Set(days.map((d) => d.date.slice(0, 7)))].sort(), [days]);

  const selectedIds = useMemo(() => {
    const out: string[] = [];
    for (const date of selected) out.push(...(byDate.get(date)?.notices.map((n) => n.id) ?? []));
    return out;
  }, [selected, byDate]);

  const applyDrag = useCallback((date: string) => {
    if (!byDate.get(date)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (dragMode.current === 'remove') next.delete(date);
      else next.add(date);
      return next;
    });
  }, [byDate]);

  // Ending the drag anywhere on the page must end it — including outside the
  // calendar, or the selection would keep following the cursor.
  useEffect(() => {
    const end = () => {
      dragMode.current = null;
      setDragging(false);
    };
    window.addEventListener('mouseup', end);
    return () => window.removeEventListener('mouseup', end);
  }, []);

  function startDrag(date: string, e: React.MouseEvent) {
    e.preventDefault(); // stop the browser starting a text selection
    dragMode.current = selected.has(date) ? 'remove' : 'add';
    setDragging(true);
    setHover(null);
    applyDrag(date);
  }

  /** ISO dates sort lexicographically, so a string compare is the range test. */
  const applyRange = useCallback(
    (start: string, end: string) => {
      if (!start || !end) return;
      const [lo, hi] = start <= end ? [start, end] : [end, start];
      setSelected(new Set(days.filter((d) => d.date >= lo && d.date <= hi).map((d) => d.date)));
    },
    [days],
  );

  const rangeCount = useMemo(() => {
    if (!from || !to) return null;
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    return days
      .filter((d) => d.date >= lo && d.date <= hi)
      .reduce((a, d) => a + d.notices.length, 0);
  }, [from, to, days]);

  const bounds = useMemo(
    () => ({ min: days[0]?.date ?? '', max: days[days.length - 1]?.date ?? '' }),
    [days],
  );

  function toggleMonth(ym: string) {
    const inMonth = days.filter((d) => d.date.startsWith(ym)).map((d) => d.date);
    const allOn = inMonth.every((d) => selected.has(d));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const d of inMonth) {
        if (allOn) next.delete(d);
        else next.add(d);
      }
      return next;
    });
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not draft the report.');
      setReport(data.report as PeriodReportPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const hoverCell = hover ? byDate.get(hover.date) : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={dragging ? { userSelect: 'none' } : undefined}>
      {/* date range */}
      <div className="shrink-0 border-b border-border flex flex-wrap items-center gap-2.5 px-4 sm:px-6 py-2.5">
        <span className="label">From</span>
        <input
          type="date"
          value={from}
          min={bounds.min}
          max={bounds.max}
          onChange={(e) => {
            setFrom(e.target.value);
            if (to) applyRange(e.target.value, to);
          }}
          className="w-[168px]"
        />
        <span className="label">To</span>
        <input
          type="date"
          value={to}
          min={bounds.min}
          max={bounds.max}
          onChange={(e) => {
            setTo(e.target.value);
            if (from) applyRange(from, e.target.value);
          }}
          className="w-[168px]"
        />
        {rangeCount !== null && (
          <span className="text-[12.5px] text-muted">
            {rangeCount} notification{rangeCount === 1 ? '' : 's'} in range
          </span>
        )}
        {(from || to) && (
          <button
            type="button"
            className="btn btn-ghost h-7"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            Reset dates
          </button>
        )}
        <span className="hidden lg:block ml-auto text-[12px] text-faint">
          Data runs {bounds.min} to {bounds.max}
        </span>
      </div>

      {/* toolbar */}
      <div className="shrink-0 border-b border-border flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3">
        <div className="text-[13.5px]">
          {selectedIds.length === 0 ? (
            <span className="text-muted">Pick dates above, or drag across the calendar</span>
          ) : (
            <span>
              <span className="font-semibold">{selectedIds.length}</span> notification
              {selectedIds.length === 1 ? '' : 's'} across{' '}
              <span className="font-semibold">{selected.size}</span> day
              {selected.size === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => setSelected(new Set(days.map((d) => d.date)))}
            disabled={busy}
          >
            Select everything
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setSelected(new Set())}
            disabled={busy || selected.size === 0}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={generate}
            disabled={busy || selectedIds.length === 0}
          >
            <Icon name="sparkle" size={14} />
            {busy ? 'Drafting…' : 'Generate report'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-5 max-w-[900px]">
            <Note tone="red" icon="alert">{error}</Note>
          </div>
        )}
        {busy && (
          <div className="mb-5 max-w-[900px]">
            <Note tone="blue" icon="info">
              Anonymising {selectedIds.length} notices and drafting the report.
            </Note>
          </div>
        )}
        {report && (
          <div className="mb-8 max-w-[900px] anim-rise">
            <PeriodReport data={report} />
          </div>
        )}

        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))' }}
        >
          {months.map((ym) => {
            const [y, m] = ym.split('-').map(Number);
            const monthDays = days.filter((d) => d.date.startsWith(ym));
            const total = monthDays.reduce((a, d) => a + d.notices.length, 0);
            const allOn = monthDays.every((d) => selected.has(d.date));
            const lead = dowIndex(y, m, 1);

            return (
              <div key={ym} className="card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleMonth(ym)}
                  className={`w-full flex items-baseline gap-2 px-3.5 py-2.5 text-left border-b border-border transition-colors ${
                    allOn ? 'bg-selected' : 'hover:bg-hover'
                  }`}
                  title={allOn ? `Deselect all of ${MONTHS[m - 1]}` : `Select all of ${MONTHS[m - 1]}`}
                >
                  <span className="text-[13.5px] font-semibold">{MONTHS[m - 1]}</span>
                  <span className="text-[12px] text-faint">{y}</span>
                  <span className="ml-auto text-[12px] text-muted tabular-nums">{total}</span>
                </button>

                <div className="grid grid-cols-7 gap-1 px-3.5 py-3">
                  {DOW.map((d, i) => (
                    <div key={i} className="text-[9.5px] text-faint text-center pb-0.5">{d}</div>
                  ))}
                  {Array.from({ length: lead }, (_, i) => <div key={`lead-${i}`} />)}
                  {Array.from({ length: daysInMonth(y, m) }, (_, i) => {
                    const day = i + 1;
                    const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const cell = byDate.get(date);
                    const n = cell?.notices.length ?? 0;
                    const isSel = selected.has(date);
                    const strength = n === 0 ? 0 : 0.28 + 0.72 * (n / Math.max(1, maxPerDay));

                    return (
                      <div
                        key={date}
                        role={n > 0 ? 'button' : undefined}
                        tabIndex={n > 0 ? 0 : undefined}
                        onMouseDown={n > 0 ? (e) => startDrag(date, e) : undefined}
                        onMouseEnter={
                          n > 0
                            ? (e) => {
                                if (dragMode.current) return applyDrag(date);
                                const r = e.currentTarget.getBoundingClientRect();
                                setHover({ date, x: r.left, y: r.bottom + 6 });
                              }
                            : undefined
                        }
                        onMouseLeave={() => setHover((h) => (h?.date === date ? null : h))}
                        className={`aspect-square rounded text-[10px] grid place-items-center select-none transition-all ${
                          n === 0 ? 'text-faint/40' : 'cursor-pointer hover:scale-110'
                        } ${isSel ? 'ring-2' : ''}`}
                        style={{
                          background:
                            n === 0
                              ? 'transparent'
                              : `color-mix(in srgb, ${SIGNAL_VAR[cell!.signal]} ${Math.round(strength * 100)}%, transparent)`,
                          color: n > 0 && strength > 0.62 ? 'var(--bg)' : undefined,
                          boxShadow: isSel ? '0 0 0 2px var(--fg)' : undefined,
                        }}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* hover preview — fixed so the scrolling calendar cannot clip it */}
      {hover && hoverCell && !dragging && (
        <div
          className="fixed z-50 w-[320px] card shadow-lg anim-pop pointer-events-auto"
          style={{
            left: Math.min(hover.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 340),
            top: hover.y,
          }}
          onMouseEnter={() => setHover(hover)}
          onMouseLeave={() => setHover(null)}
        >
          <div className="px-3.5 py-2 border-b border-border flex items-baseline gap-2">
            <span className="text-[12.5px] font-semibold">{prettyDate(hover.date)}</span>
            <span className="text-[11.5px] text-faint">
              {hoverCell.notices.length} notification{hoverCell.notices.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {hoverCell.notices.map((notice) => (
              <Link
                key={notice.id}
                href={`/?selected=${notice.id}`}
                className="flex gap-2.5 px-3.5 py-2 border-b border-border last:border-0 hover:bg-hover"
              >
                <span
                  className="w-[3px] rounded-full shrink-0 self-stretch"
                  style={{ background: SIGNAL_VAR[notice.signal] }}
                />
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-fg truncate">{notice.subject}</span>
                  <span className="block text-[11px] text-faint">
                    {notice.category} · {notice.status}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <div className="px-3.5 py-1.5 border-t border-border text-[11px] text-faint">
            Click one to open it
          </div>
        </div>
      )}
    </div>
  );
}
