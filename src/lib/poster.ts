/**
 * The poster: an infographic rendered to PNG.
 *
 * No image model is involved, deliberately. A diffusion model draws a picture
 * OF an infographic — it hallucinates the text, and a maintenance window that
 * says 1630 can come out 1530. Here the pixels are laid out from the JSON, so
 * they say exactly what the notice says. It is also free and takes about a
 * tenth of a second, because it is rendering rather than generating.
 *
 * The safety gate below matters more here than anywhere else in the app. Text
 * inside an image cannot be searched, cannot be redacted after the fact, and
 * will not be caught by a mail filter. Once it is pixels it is gone. So every
 * string is checked before it is drawn, and the check fails closed.
 */

import type { InfographicPayload } from './artifacts';

/**
 * DTI's brand colours, and the only hex values outside globals.css.
 *
 * They cannot be CSS custom properties: the poster is rasterised outside the
 * DOM, so there is no cascade to read them from. They are also not the app's
 * theme — this is the State's letterhead, and it does not follow dark mode.
 */
export const POSTER = {
  navy: '#0b2265',
  navyDeep: '#071845',
  ink: '#111827',
  body: '#374151',
  faint: '#6b7280',
  rule: '#e5e7eb',
  paper: '#ffffff',
  wash: '#f4f6fb',
  blue: '#1d5bbf',
  green: '#0f7b46',
  amber: '#b45309',
  red: '#b42318',
  purple: '#6941c6',
  /** The unfilled part of a timeline bar. */
  track: '#e3e8f0',
} as const;

/**
 * The mark, as a gradient string. Lives here rather than in the route so the
 * renderer carries no colour of its own and this file stays the single place
 * the poster's palette is defined.
 */
export const MARK_GRADIENT =
  'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.1) 46%),' +
  ' linear-gradient(155deg, #dfe3ea, #7b8595)';

/** Per-row markers on the timeline, in the order the reference uses. */
export const TRACK_COLORS = [POSTER.blue, POSTER.green, POSTER.amber, POSTER.purple, POSTER.red];

export type PosterTemplate = 'maintenance' | 'outage' | 'security' | 'resolved' | 'timeline';

/**
 * The template is a consequence of the event, never a style choice. A reader
 * who sees the red treatment should be able to trust that something is
 * actually broken.
 */
export function pickTemplate(p: InfographicPayload): PosterTemplate {
  if (p.status === 'resolved') return 'resolved';
  if (p.category === 'Security') return 'security';
  if (p.category === 'Outage' && p.status === 'active') return 'outage';
  if (p.timeline.length > 1) return 'timeline';
  return 'maintenance';
}

export const TEMPLATE_ACCENT: Record<PosterTemplate, string> = {
  maintenance: POSTER.navy,
  timeline: POSTER.navy,
  outage: POSTER.red,
  security: POSTER.amber,
  resolved: POSTER.green,
};

export const TEMPLATE_EYEBROW: Record<PosterTemplate, string> = {
  maintenance: 'Scheduled maintenance',
  timeline: 'Scheduled maintenance',
  outage: 'Service disruption',
  security: 'Security advisory',
  resolved: 'Service restored',
};

/** Every string the renderer will draw, flattened. */
export function posterStrings(p: InfographicPayload): string[] {
  return [
    p.eyebrow,
    p.headline,
    p.category,
    p.status,
    p.impact,
    p.contact ?? '',
    ...p.systems,
    ...p.actions,
    ...p.callouts,
    ...p.timeline.flatMap((t) => [t.label, t.start, t.end]),
    ...(p.when ? [p.when.start, p.when.end, p.when.duration, p.when.timezone] : []),
  ].filter(Boolean);
}

export class PosterLeak extends Error {}

/**
 * Detectors are intentionally broader than the ones the redactor uses. A check
 * that reuses the redactor's assumptions can only ever confirm them.
 */
const FORBIDDEN: Array<{ kind: string; noun: string; re: RegExp }> = [
  { kind: 'IP', noun: 'an IP address', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  {
    kind: 'HOST',
    noun: 'a host name',
    re: /\b[a-z]{2,8}[-_][a-z0-9]{2,10}[-_](?:prd|prod|dev|tst|test|qa|stg|uat)[-_]?\d{0,3}\b/i,
  },
  { kind: 'HOST', noun: 'a host name', re: /\b(?:srv|vm|host|node|db|sql|web|app)[-_]?[a-z0-9]{2,12}\d{1,3}\b/i },
  { kind: 'UNC', noun: 'a network path', re: /\\\\[\w.-]+/ },
  { kind: 'MAC', noun: 'a MAC address', re: /\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b/i },
  { kind: 'TOKEN', noun: 'an unrestored placeholder', re: /\[[A-Z]+_\d+\]/ },
];

/**
 * Throws rather than redacting. A poster with a hole in it still goes out and
 * still looks finished; refusing to draw one forces the notice back to a
 * person, which is the correct outcome.
 */
export function assertPosterIsSafe(p: InfographicPayload): void {
  for (const value of posterStrings(p)) {
    for (const d of FORBIDDEN) {
      const hit = value.match(d.re);
      if (hit) {
        throw new PosterLeak(
          `Refusing to render: the poster would contain ${d.noun}. ` +
            `Text in an image cannot be redacted afterwards. Fix the notice, then regenerate.`,
        );
      }
    }
  }
}


/**
 * A minute-of-day position for a formatted time, used to lay the timeline bar
 * out proportionally. Returns null when the string cannot be read, so the bar
 * degrades to the plain rows rather than drawing a lie.
 */
export function minutesOfDay(formatted: string): number | null {
  const m = formatted.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

export interface TrackBar {
  label: string;
  color: string;
  /** 0..1 across the whole span. */
  left: number;
  width: number;
  when: string;
}

/**
 * Lays the timeline rows out as proportional bars across a shared span.
 *
 * Returns an empty array when the times cannot be parsed. A timeline drawn
 * from times nobody could read would be decoration that looks like data, which
 * is worse than no timeline at all.
 */
export function buildTrackBars(
  timeline: Array<{ label: string; start: string; end: string }>,
): TrackBar[] {
  const parsed = timeline.map((t, i) => {
    const a = minutesOfDay(t.start);
    let b = minutesOfDay(t.end);
    if (a === null || b === null) return null;
    // A window ending "before" it starts has crossed midnight.
    if (b <= a) b += 24 * 60;
    return { i, t, a, b };
  });

  if (parsed.some((x) => x === null)) return [];
  const rows = parsed as NonNullable<(typeof parsed)[number]>[];
  if (rows.length === 0) return [];

  const min = Math.min(...rows.map((r) => r.a));
  const max = Math.max(...rows.map((r) => r.b));
  const span = max - min || 1;

  return rows.map((r) => ({
    label: r.t.label,
    color: TRACK_COLORS[r.i % TRACK_COLORS.length],
    left: (r.a - min) / span,
    // A window shorter than about 3% of the span is invisible; give it a floor
    // so a 30-minute outage in a 17-hour night still reads as a mark.
    width: Math.max(0.035, (r.b - r.a) / span),
    when: `${r.t.start.split(' · ').pop()} — ${r.t.end.split(' · ').pop()}`,
  }));
}


/**
 * The illustration for a template, as a data URI.
 *
 * Read from disk and cached in memory: satori cannot resolve a relative URL,
 * and re-encoding a two-megabyte PNG on every render would make the poster
 * slow for no reason.
 *
 * These are generated once by scripts/generate-art.mjs and committed. Nothing
 * is generated per notice — artwork nobody has looked at should not go out
 * under the State's name, and a fixed set can be reviewed once and trusted
 * afterwards. Missing art returns null and the poster simply omits it.
 */
const ART_CACHE = new Map<string, string | null>();

function readArt(dir: 'hero' | 'icon' | 'backdrop', key: string): string | null {
  const cacheKey = `${dir}/${key}`;
  if (ART_CACHE.has(cacheKey)) return ART_CACHE.get(cacheKey) ?? null;

  let uri: string | null = null;
  try {
    // Required lazily so this module stays importable from the browser bundle,
    // where the review UI reads the template list.
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const file = path.join(process.cwd(), 'public', 'art', dir, `${key}.png`);
    if (fs.existsSync(file)) {
      uri = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    }
  } catch {
    uri = null;
  }

  ART_CACHE.set(cacheKey, uri);
  return uri;
}

export function heroArt(template: PosterTemplate): string | null {
  return readArt('hero', template);
}

/**
 * The generated backdrop for the header band.
 *
 * The model draws only this layer, because it is the only layer it cannot get
 * wrong: abstract texture with no text, no numbers and no symbols. Generating
 * the whole poster was tried and the words came back as gibberish while
 * looking entirely authoritative — see scripts/generate-backdrops.mjs.
 */
export function backdropArt(template: PosterTemplate): string | null {
  return readArt('backdrop', template);
}

/**
 * Picks an icon for a system by what it is, so the poster can show a row of
 * pictures instead of a comma-separated list. Falls back to a server, which is
 * true of nearly everything DTI runs.
 */
const ICON_RULES: Array<[RegExp, string]> = [
  [/first\s*map|map|gis/i, 'map'],
  [/sftp|ftp|file|transfer/i, 'file'],
  [/ci\/?cd|jenkins|build|pipeline/i, 'gear'],
  [/vpn|remote access/i, 'vpn'],
  [/citrix|gateway|prowatch|badge|access control/i, 'lock'],
  [/network|circuit|fibre|fiber|switch|router/i, 'network'],
  [/wi-?fi|wireless/i, 'wifi'],
  [/database|sql|oracle/i, 'database'],
  [/portal|iras|web|application|app/i, 'desktop'],
  [/mail|exchange|outlook|smtp/i, 'mail'],
  [/print/i, 'printer'],
  [/cloud|azure|aws/i, 'cloud'],
  [/report|dashboard|analytic/i, 'chart'],
  [/phone|voice|telecom/i, 'phone'],
];

export function iconKeyForSystem(name: string): string {
  for (const [re, key] of ICON_RULES) if (re.test(name)) return key;
  return 'server';
}

export function systemIcon(name: string): string | null {
  return readArt('icon', iconKeyForSystem(name));
}
