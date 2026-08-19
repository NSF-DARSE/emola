/**
 * Stage 7 — the two AI-generated deliverables.
 *
 * They are separate deliverables with separate audiences and separate
 * templates, fed by the SAME extracted JSON:
 *
 *   infographic  → employees.  "what do I do, and when"
 *   exec summary → leadership. "business impact, risk, decisions"
 *
 * Both render into a FIXED template. Nothing here generates freeform layout,
 * and neither can be sent anywhere without an explicit human approval — see
 * routing.assertHumanApproved and the /api/artifacts/approve route.
 *
 * Today the prose is composed deterministically from the extracted fields.
 * When the drafting model is wired in it fills these same slots; the template
 * and the approval gate do not change.
 */

import { formatDuration, formatWindowPoint } from './time';
import type { NotificationRecord } from './types';

export interface InfographicPayload {
  kind: 'infographic';
  eyebrow: string;
  headline: string;
  category: string;
  status: string;
  when: { start: string; end: string; duration: string; crossesMidnight: boolean; timezone: string } | null;
  timeline: Array<{ label: string; start: string; end: string }>;
  systems: string[];
  impact: string;
  actions: string[];
  contact: string | null;
  callouts: string[];
  generatedAt: string;
}

export interface ExecSummaryPayload {
  kind: 'exec_summary';
  headline: string;
  businessImpact: string;
  operationalRisk: string;
  riskLevel: 'Low' | 'Moderate' | 'Elevated';
  affectedServices: string[];
  window: string;
  decisions: string[];
  governanceNote: string;
  generatedAt: string;
  /** Which engine wrote this. Shown in the UI — provenance is not optional. */
  source?: 'ai' | 'template';
  /** The exact anonymised text that was sent, so a reviewer can audit it. */
  outbound?: string;
}

function windowLine(n: NotificationRecord): string {
  const w = n.extracted.window;
  if (!w) return 'No schedule stated in the source notice.';
  return `${formatWindowPoint(w.start)} → ${formatWindowPoint(w.end)} (${formatDuration(
    w.durationMinutes,
  )}, ${w.timezone})`;
}

export function buildInfographic(n: NotificationRecord, parent?: NotificationRecord | null): InfographicPayload {
  const w = n.extracted.window;
  const callouts: string[] = [];

  if (n.model.status === 'updated') {
    callouts.push(
      parent
        ? `This supersedes the earlier notice ${parent.id}. The times below are the current ones.`
        : 'This is an update to an earlier notice. The times below are the current ones.',
    );
  }
  if (n.model.status === 'resolved' && parent) {
    callouts.push(`Closes ${parent.id}. No further action is needed.`);
  }
  if (w?.crossesMidnight) {
    callouts.push('This window runs past midnight and ends the following day.');
  }
  if (/risk of power loss/i.test(n.body)) {
    callouts.push('No outage is expected, but there is a risk of power loss during this work.');
  }
  if (n.synthetic) {
    callouts.push('SYNTHETIC EXAMPLE — not a real State of Delaware notice.');
  }

  const actions: string[] = [];
  if (n.extracted.requiredAction !== 'No action required — informational.') {
    actions.push(n.extracted.requiredAction);
  }
  if (n.extracted.contact) actions.push(`Questions: ${n.extracted.contact}`);
  if (actions.length === 0) actions.push('No action needed — this notice is for awareness.');

  return {
    kind: 'infographic',
    eyebrow: n.model.status === 'resolved' ? 'Service restored' : 'Service notice',
    headline: buildHeadline({
      systems: n.extracted.affectedSystems,
      category: n.model.primary,
      status: n.model.status,
      fallback: n.extracted.eventType,
    }),
    category: n.model.primary,
    status: n.model.status,
    when: w
      ? {
          start: formatWindowPoint(w.start),
          end: formatWindowPoint(w.end),
          duration: formatDuration(w.durationMinutes),
          crossesMidnight: w.crossesMidnight,
          timezone: w.timezone,
        }
      : null,
    timeline: n.extracted.subWindows.map((s) => ({
      label: s.label ?? 'Window',
      start: formatWindowPoint(s.start),
      end: formatWindowPoint(s.end),
    })),
    systems: n.extracted.affectedSystems,
    impact: n.extracted.impact,
    actions,
    contact: n.extracted.contact,
    callouts,
    generatedAt: new Date().toISOString(),
  };
}

export function buildExecSummary(
  n: NotificationRecord,
  parent?: NotificationRecord | null,
): ExecSummaryPayload {
  const production = n.extracted.isProduction;
  const unplanned = !n.extracted.isPlanned;
  const securityTouching =
    n.model.primary === 'Security' ||
    n.model.secondary.includes('Security') ||
    n.model.primary === 'Compliance';

  let riskLevel: ExecSummaryPayload['riskLevel'] = 'Low';
  if (production || securityTouching) riskLevel = 'Elevated';
  else if (unplanned || n.extracted.window === null || n.extracted.productionScope === 'unstated') {
    riskLevel = 'Moderate';
  }

  const services = n.extracted.affectedSystems.length
    ? n.extracted.affectedSystems
    : ['Not itemised in the source notice'];

  const businessImpact = (() => {
    if (n.model.status === 'resolved') {
      return `Service has been restored${parent ? ` following ${parent.id}` : ''}. ${n.extracted.impact}`;
    }
    if (unplanned) {
      return `Unplanned disruption in progress. ${n.extracted.impact} Affected: ${services.join(', ')}.`;
    }
    return `Planned work affecting ${services.join(', ')}. ${n.extracted.impact}`;
  })();

  const operationalRisk = (() => {
    const parts: string[] = [];
    parts.push(
      n.extracted.productionScope === 'production'
        ? 'Production systems are in scope.'
        : n.extracted.productionScope === 'non_production'
          ? 'Non-production systems only.'
          : 'The notice does not state which environment is affected.',
    );
    if (securityTouching) parts.push('Security or compliance exposure is implicated.');
    if (n.extracted.window?.crossesMidnight) {
      parts.push('The window crosses midnight, so impact spans two business dates.');
    }
    if (n.extracted.scheduleConfidence < 0.8 && n.extracted.window) {
      parts.push('Schedule was parsed with reduced confidence — confirm before acting on the dates.');
    }
    if (n.extracted.window === null) parts.push('No end time was published.');
    return parts.join(' ');
  })();

  const decisions: string[] = [];
  if (production) decisions.push('Confirm whether business hours coverage is needed during the window.');
  if (securityTouching) decisions.push('Decide whether agency ISOs need to be notified separately.');
  if (unplanned) decisions.push('Decide whether to activate incident communications.');
  if (n.safety.spans.some((s) => s.kind === 'ip_address' || s.kind === 'server_name')) {
    decisions.push('Source notice contains internal host detail — approve redaction before any external send.');
  }
  if (decisions.length === 0) decisions.push('No leadership decision required. Awareness only.');

  return {
    kind: 'exec_summary',
    headline: `${n.model.primary} — ${n.extracted.eventType}`,
    businessImpact,
    operationalRisk,
    riskLevel,
    affectedServices: services,
    window: windowLine(n),
    decisions,
    governanceNote:
      'AI-drafted from the source notice. Requires named human approval before distribution; ' +
      'the original email is the system of record.',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * A headline, built rather than sliced.
 *
 * The previous version took the first 120 characters of the body, which at
 * poster size produced a sentence severed mid-word. What a reader needs from
 * a headline is two things: which systems, and what is happening to them.
 * Both are already extracted, so compose them.
 */
export function buildHeadline(input: {
  systems: string[];
  category: string;
  status: string;
  fallback: string;
}): string {
  const { systems, category, status, fallback } = input;

  const event =
    status === 'resolved'
      ? 'service restored'
      : category === 'Security'
        ? 'security advisory'
        : category === 'Outage'
          ? 'service disruption'
          : category === 'Compliance'
            ? 'compliance notice'
            : 'maintenance';

  if (systems.length === 1) return `${systems[0]} ${event}`;
  if (systems.length === 2) return `${systems[0]} and ${systems[1]} ${event}`;
  // Listing five system names is a paragraph, not a headline. Lead with the
  // event so it does not read like a count with a word stuck on the end.
  if (systems.length > 2) {
    return `${event.charAt(0).toUpperCase()}${event.slice(1)} across ${systems.length} systems`;
  }

  return truncateAtWord(fallback, 78);
}

/** Cuts at the last word boundary before the limit, never through a word. */
function truncateAtWord(text: string, limit: number): string {
  const clean = text.trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 20 ? lastSpace : limit).replace(/[,;:\-–—]$/, '')}…`;
}

/**
 * "Tue, Jan 20, 2026 · 12:00 PM" twice in one row is the same date printed
 * twice. Drop the repeat when the range stays inside a day — and keep both
 * when it does not, because crossing midnight is the thing people misread.
 */
export function compactRange(start: string, end: string): string {
  const split = (s: string) => {
    const [datePart, timePart] = s.split(' · ');
    return { date: (datePart ?? s).replace(/,\s*\d{4}$/, ''), time: timePart ?? '' };
  };
  const a = split(start);
  const b = split(end);
  if (a.date === b.date) return `${a.date} · ${a.time} — ${b.time}`;
  return `${a.date} · ${a.time} — ${b.date} · ${b.time}`;
}
