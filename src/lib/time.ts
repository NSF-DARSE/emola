/**
 * Time normalisation.
 *
 * Every downstream template (infographic, executive summary) reads explicit
 * start/end datetimes — never the raw prose. Input notices mix 24-hour ranges
 * ("from 1800 until 0600 the following morning"), 12-hour ranges ("6:00 pm to
 * 8:00 pm"), relative day references ("This Saturday", "Today"), and windows
 * that cross midnight.
 *
 * Output is a naive local wall-clock ISO string plus an explicit timezone
 * label. We deliberately do not bake a UTC offset in: every notice in the
 * corpus is State of Delaware local time, and storing wall-clock + zone avoids
 * silently shifting a maintenance window by an hour across a DST boundary.
 */

export const DEFAULT_TZ = 'America/New_York';

export interface NormalizedWindow {
  /** "YYYY-MM-DDTHH:mm" local wall clock. */
  start: string;
  /** "YYYY-MM-DDTHH:mm" local wall clock. Always >= start. */
  end: string;
  timezone: string;
  crossesMidnight: boolean;
  /** Minutes between start and end. */
  durationMinutes: number;
  /** Optional label for sub-windows parsed out of a bulleted timeline. */
  label?: string;
  /** The source text this window was parsed from. */
  raw: string;
}

export interface ScheduleExtraction {
  /** The main window, if one could be parsed. */
  primary: NormalizedWindow | null;
  /** Bulleted per-system windows, e.g. "CI/CD Servers: Tuesday 1200 until 1300". */
  subWindows: NormalizedWindow[];
  /** 0..1 — how confident the parser is that it read the notice correctly. */
  confidence: number;
  /** Human-readable reasons the parser is unsure. */
  notes: string[];
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const MONTH_RE = MONTHS.join('|');

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Add `days` to a "YYYY-MM-DD" string without touching timezone logic. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function minutesBetween(startISO: string, endISO: string): number {
  const toMs = (s: string) => {
    const [date, time] = s.split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return Date.UTC(y, m - 1, d, hh, mm);
  };
  return Math.round((toMs(endISO) - toMs(startISO)) / 60000);
}

/**
 * Parse a clock reference into minutes past midnight.
 * Accepts "1800", "18:00", "6:00 pm", "6 pm", "0000", "2359".
 */
export function parseClock(input: string): number | null {
  const s = input.trim().toLowerCase();

  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] ?? '0');
    if (h < 1 || h > 12 || m > 59) return null;
    if (ampm[3] === 'pm' && h !== 12) h += 12;
    if (ampm[3] === 'am' && h === 12) h = 0;
    return h * 60 + m;
  }

  const colon = s.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) {
    const h = Number(colon[1]);
    const m = Number(colon[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  const military = s.match(/^(\d{3,4})$/);
  if (military) {
    const v = military[1].padStart(4, '0');
    const h = Number(v.slice(0, 2));
    const m = Number(v.slice(2));
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  return null;
}

function toISO(date: string, minutes: number): string {
  return `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * Build a window from a date + two clock readings, resolving the cross-midnight
 * case. `explicitNextDay` is set when the notice says so out loud ("the
 * following morning", "until Wednesday 05:00").
 */
export function buildWindow(
  date: string,
  startMinutes: number,
  endMinutes: number,
  opts: { raw: string; label?: string; timezone?: string; explicitNextDay?: boolean } = {
    raw: '',
  },
): NormalizedWindow {
  const rollsOver = opts.explicitNextDay === true || endMinutes <= startMinutes;
  const endDate = rollsOver ? addDays(date, 1) : date;
  const start = toISO(date, startMinutes);
  const end = toISO(endDate, endMinutes);
  return {
    start,
    end,
    timezone: opts.timezone ?? DEFAULT_TZ,
    crossesMidnight: rollsOver,
    durationMinutes: minutesBetween(start, end),
    label: opts.label,
    raw: opts.raw,
  };
}

/** Find "January 20, 2026" / "August 3rd, 2025" / "July 31st" in the text. */
function findDate(text: string, referenceDate: string): { date: string; inferredYear: boolean } | null {
  const re = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`, 'i');
  const m = text.match(re);
  if (!m) return null;

  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  const day = Number(m[2]);
  if (day < 1 || day > 31) return null;

  if (m[3]) {
    return { date: `${m[3]}-${pad(month)}-${pad(day)}`, inferredYear: false };
  }

  // No year given — take it from the date the notice was received, rolling
  // forward if that would place the event in the past.
  const refYear = Number(referenceDate.slice(0, 4));
  let candidate = `${refYear}-${pad(month)}-${pad(day)}`;
  if (candidate < referenceDate) {
    candidate = `${refYear + 1}-${pad(month)}-${pad(day)}`;
  }
  return { date: candidate, inferredYear: true };
}

const TIME_TOKEN = String.raw`\d{1,2}:\d{2}\s*(?:am|pm)|\d{1,2}\s*(?:am|pm)|\d{1,2}:\d{2}|\d{3,4}`;

/** Find "from X until Y" / "between X and Y" / "X to Y". */
function findRange(text: string): { start: string; end: string; nextDay: boolean; raw: string } | null {
  const patterns = [
    new RegExp(String.raw`from\s+(${TIME_TOKEN})\s+(?:until|to|through)\s+(${TIME_TOKEN})`, 'i'),
    new RegExp(String.raw`between\s+(${TIME_TOKEN})\s+and\s+(${TIME_TOKEN})`, 'i'),
    new RegExp(
      String.raw`starting\s+at\s+(${TIME_TOKEN})\s+(?:until|to|through)\s+(${TIME_TOKEN})`,
      'i',
    ),
    new RegExp(String.raw`(${TIME_TOKEN})\s+(?:until|to|through)\s+(${TIME_TOKEN})`, 'i'),
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    // "the following morning" / "the next day" / "until Wednesday 05:00"
    const tail = text.slice(m.index! + m[0].length, m.index! + m[0].length + 40).toLowerCase();
    const nextDay = /following morning|following day|next morning|next day/.test(tail);
    return { start: m[1], end: m[2], nextDay, raw: m[0] };
  }
  return null;
}

/** Bulleted per-system timelines, e.g. "SFTP Server: Tuesday 1630 until 1700". */
function findSubWindows(text: string, baseDate: string): NormalizedWindow[] {
  const out: NormalizedWindow[] = [];
  const lineRe = new RegExp(
    String.raw`^[\s•\-*]*([A-Za-z0-9/ .+_-]{2,40}?):\s*(?:\w+day\s+)?(${TIME_TOKEN})\s*(?:until|to|and|through)\s*(?:(\w+day)\s+)?(${TIME_TOKEN})`,
    'i',
  );

  for (const line of text.split(/\r?\n/)) {
    const m = line.match(lineRe);
    if (!m) continue;
    const s = parseClock(m[2]);
    const e = parseClock(m[4]);
    if (s === null || e === null) continue;
    // A named weekday before the end time ("until Wednesday 05:00") means the
    // window explicitly rolls into the next day.
    const explicitNextDay = Boolean(m[3]);
    out.push(
      buildWindow(baseDate, s, e, {
        raw: line.trim(),
        label: m[1].trim(),
        explicitNextDay,
      }),
    );
  }
  return out;
}

/**
 * Main entry point. `referenceDate` is the date the notification was received
 * ("YYYY-MM-DD"), used to resolve years and relative day words.
 */
export function normalizeSchedule(text: string, referenceDate: string): ScheduleExtraction {
  const notes: string[] = [];
  let confidence = 1;

  const dateHit = findDate(text, referenceDate);
  if (!dateHit) {
    // "Today, ... between 12:00 PM and 12:30 PM" with no month name.
    if (/\btoday\b/i.test(text)) {
      const range = findRange(text);
      if (range) {
        const s = parseClock(range.start);
        const e = parseClock(range.end);
        if (s !== null && e !== null) {
          return {
            primary: buildWindow(referenceDate, s, e, {
              raw: range.raw,
              explicitNextDay: range.nextDay,
            }),
            subWindows: [],
            confidence: 0.75,
            notes: ['Date taken from "today" plus the notice received date.'],
          };
        }
      }
    }
    return {
      primary: null,
      subWindows: [],
      confidence: 0,
      notes: ['No calendar date found in the notice.'],
    };
  }

  if (dateHit.inferredYear) {
    confidence -= 0.15;
    notes.push('Year was not stated; inferred from the notice received date.');
  }

  const range = findRange(text);
  if (!range) {
    return {
      primary: null,
      subWindows: findSubWindows(text, dateHit.date),
      confidence: 0.2,
      notes: [...notes, 'Found a date but no start/end time range.'],
    };
  }

  const s = parseClock(range.start);
  const e = parseClock(range.end);
  if (s === null || e === null) {
    return {
      primary: null,
      subWindows: [],
      confidence: 0,
      notes: [...notes, `Could not parse the time range "${range.raw}".`],
    };
  }

  const primary = buildWindow(dateHit.date, s, e, {
    raw: range.raw,
    explicitNextDay: range.nextDay,
  });

  if (primary.crossesMidnight && !range.nextDay) {
    confidence -= 0.1;
    notes.push('End time is at or before the start time; treated as crossing midnight.');
  }
  if (primary.durationMinutes > 24 * 60) {
    confidence -= 0.2;
    notes.push('Window is longer than 24 hours; worth a human check.');
  }

  return {
    primary,
    subWindows: findSubWindows(text, dateHit.date),
    confidence: Math.max(0, Math.round(confidence * 100) / 100,),
    notes,
  };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Thu, Jan 23, 2025 · 6:00 PM" — display only. */
export function formatWindowPoint(iso: string): string {
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dow = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()].slice(0, 3);
  const month = MONTHS[m - 1].slice(0, 3);
  const monthName = month.charAt(0).toUpperCase() + month.slice(1);
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${dow}, ${monthName} ${d}, ${y} · ${h12}:${pad(mm)} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
