'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Icon from '@/components/Icon';
import Odometer from '@/components/Odometer';
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

  /*
   * Marquee selection.
   *
   * Dragging across cells one at a time only works within a month grid — the
   * months are separate boxes, so a drag that leaves one never reaches the
   * next. A rubber-band rectangle over the whole area selects across months
   * the way selecting files in a folder does.
   *
   * Cells are found by their data-date attribute at drag time rather than
   * kept in a ref map: the grid re-flows with the window and stale
   * coordinates would select the wrong days.
   */
  const gridRef = useRef<HTMLDivElement>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const baseSelection = useRef<Set<string>>(new Set());

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

  /**
   * Starts a rubber band. Additive when a modifier is held, so an existing
   * selection can be extended rather than replaced.
   */
  function startMarquee(e: React.PointerEvent) {
    // Only a plain left-button drag on empty space: clicks on a day cell or a
    // month header are handled by those elements.
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-date]') || target.closest('button')) return;

    e.preventDefault();
    marqueeStart.current = { x: e.clientX, y: e.clientY };
    baseSelection.current = e.shiftKey || e.metaKey || e.ctrlKey ? new Set(selected) : new Set();
    setMarquee({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
    setHover(null);
  }

  useEffect(() => {
    if (!marquee) return;

    function onMove(e: PointerEvent) {
      const origin = marqueeStart.current;
      if (!origin) return;

      const box = {
        left: Math.min(origin.x, e.clientX),
        top: Math.min(origin.y, e.clientY),
        width: Math.abs(e.clientX - origin.x),
        height: Math.abs(e.clientY - origin.y),
      };
      setMarquee(box);

      const next = new Set(baseSelection.current);
      for (const el of gridRef.current?.querySelectorAll<HTMLElement>('[data-date]') ?? []) {
        const r = el.getBoundingClientRect();
        const hits =
          r.right >= box.left &&
          r.left <= box.left + box.width &&
          r.bottom >= box.top &&
          r.top <= box.top + box.height;
        if (hits) {
          const date = el.dataset.date;
          if (date) next.add(date);
        }
      }
      setSelected(next);
    }

    function onUp() {
      marqueeStart.current = null;
      setMarquee(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    };
  }, [marquee]);

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
            <span className="inline-flex items-center gap-1.5">
              <Odometer value={rangeCount} />
              <span>notice{rangeCount === 1 ? '' : 's'} in range</span>
            </span>
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
          {/* Always on screen, including at zero: the point of a rolling
              counter is watching it climb while you drag, and a figure that
              only appears once it is non-zero never gets to climb from
              nothing. */}
          <span className="flex items-center gap-1.5">
            <Odometer value={selectedIds.length} className="font-semibold" />
            <span>notice{selectedIds.length === 1 ? '' : 's'} across</span>
            <Odometer value={selected.size} className="font-semibold" />
            <span>day{selected.size === 1 ? '' : 's'}</span>
            {selectedIds.length === 0 && (
              <span className="text-faint ml-1.5">— drag a box across the calendar</span>
            )}
          </span>
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

        {marquee && (
          <div
            className="marquee"
            aria-hidden="true"
            style={{
              left: marquee.left,
              top: marquee.top,
              width: marquee.width,
              height: marquee.height,
            }}
          />
        )}

        <div
          ref={gridRef}
          onPointerDown={startMarquee}
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
                        data-date={n > 0 ? date : undefined}
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
