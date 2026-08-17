/**
 * Executive report over a SELECTED PERIOD of notices, not a single email.
 *
 * Same guarantee as the single-notice path: every body is anonymised under one
 * shared mapping, the payload is re-scanned before it leaves, and real values
 * are only ever restored locally. One shared mapping matters here — it is what
 * lets the model notice that the host that failed in March is the host being
 * patched in April.
 */

import { anonymizeMany, assertNoSensitiveData, restore, type Mapping } from '@/lib/anonymize';
import { formatWindowPoint } from '@/lib/time';
import type { Category, Status } from '@/lib/taxonomy';
import type { NotificationRecord } from '@/lib/types';
import { invokeStructured, type BedrockTool } from './bedrock';

export interface PeriodStats {
  total: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  autoSent: number;
  heldForReview: number;
  productionTouching: number;
}

export interface PeriodReportPayload {
  kind: 'period_report';
  periodLabel: string;
  headline: string;
  riskLevel: 'Low' | 'Moderate' | 'Elevated';
  summary: string;
  operationalRisk: string;
  themes: string[];
  notableEvents: string[];
  decisions: string[];
  stats: PeriodStats;
  noticeIds: string[];
  governanceNote: string;
  outbound?: string;
  generatedAt: string;
}

const RISK_LEVELS = ['Low', 'Moderate', 'Elevated'] as const;

const SYSTEM = `You write periodic operations reports for leadership at the State of Delaware Department of Finance.

You are given every IT service notice from a selected period. Your reader is a director or deputy secretary reviewing the period as a whole. They do not want a list of emails — they want to know what the period MEANT.

Rules:
- Report on the period, not on individual notices. Look for patterns: repeated maintenance on the same systems, recurring outages, work that clusters at month end, anything trending worse.
- Only call out an individual notice when it genuinely mattered on its own.
- Write plainly. No jargon, no acronyms the reader would not know, no filler.
- Never invent detail. If something is not stated in the notices, do not assert it. Say the record is silent.
- Placeholders such as [HOST_1], [IP_1], [EMAIL_1] and [PHONE_1] stand in for real values withheld from you. Reproduce them EXACTLY when referring to them. Never guess what they contain or invent new ones.
- Risk level for the period: Elevated if there were security events or repeated production disruption; Moderate if there was unplanned work or notable concentration of risk; otherwise Low.
- Decisions must be real choices a leader makes. If the period needs no decision, say so plainly.
- Be concrete about counts and systems. Vagueness makes these reports worthless.`;

const TOOL: BedrockTool = {
  name: 'emit_period_report',
  description: 'Return the periodic operations report in the required structure.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'One line characterising the period, under 90 characters.' },
      riskLevel: { type: 'string', enum: [...RISK_LEVELS] },
      summary: { type: 'string', description: 'Three to five sentences on what happened across the period.' },
      operationalRisk: { type: 'string', description: 'Two to four sentences on risk and exposure across the period.' },
      themes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Patterns across the period, e.g. repeated work on one system. 2-5 items.',
      },
      notableEvents: {
        type: 'array',
        items: { type: 'string' },
        description: 'Individual notices that mattered on their own. 0-5 items.',
      },
      decisions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Decisions or actions for leadership. State plainly if none.',
      },
    },
    required: ['headline', 'riskLevel', 'summary', 'operationalRisk', 'themes', 'notableEvents', 'decisions'],
    additionalProperties: false,
  },
};

export function computeStats(notices: NotificationRecord[]): PeriodStats {
  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const n of notices) {
    byCategory[n.model.primary] = (byCategory[n.model.primary] ?? 0) + 1;
    byStatus[n.model.status] = (byStatus[n.model.status] ?? 0) + 1;
  }
  return {
    total: notices.length,
    byCategory,
    byStatus,
    autoSent: notices.filter((n) => n.route === 'auto_send').length,
    heldForReview: notices.filter((n) => n.route === 'human_review').length,
    productionTouching: notices.filter((n) => n.extracted.productionScope === 'production').length,
  };
}

/** Human label for the selected range, e.g. "1 – 30 April 2026". */
export function periodLabel(notices: NotificationRecord[]): string {
  if (notices.length === 0) return 'No period selected';
  const dates = notices.map((n) => n.receivedAt).sort();
  const fmt = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    const month = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ][m - 1];
    return `${day} ${month} ${y}`;
  };
  return dates[0] === dates[dates.length - 1]
    ? fmt(dates[0])
    : `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`;
}

export function buildRequest(notices: NotificationRecord[]): {
  system: string;
  userText: string;
  mapping: Mapping;
} {
  if (notices.length === 0) throw new Error('Select at least one notice.');

  const { texts, mapping } = anonymizeMany(notices.map((n) => n.body));
  const stats = computeStats(notices);

  const blocks = notices.map((n, i) => {
    const w = n.extracted.window;
    return [
      `--- Notice ${i + 1} of ${notices.length} ---`,
      `Received: ${n.receivedAt}`,
      `Category: ${n.model.primary}${n.model.secondary.length ? ` (also ${n.model.secondary.join(', ')})` : ''}`,
      `Status: ${n.model.status}`,
      `Environment: ${n.extracted.productionScope.replace('_', '-')}`,
      w ? `Window: ${formatWindowPoint(w.start)} to ${formatWindowPoint(w.end)}` : 'Window: not stated',
      `Text: ${texts[i]}`,
    ].join('\n');
  });

  const userText = [
    `Period: ${periodLabel(notices)}`,
    `Total notices: ${stats.total}`,
    `By category: ${Object.entries(stats.byCategory).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `By status: ${Object.entries(stats.byStatus).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `Forwarded automatically: ${stats.autoSent}. Held for human review: ${stats.heldForReview}.`,
    '',
    ...blocks,
  ].join('\n');

  // The seatbelt. Nothing leaves if a detector still fires.
  assertNoSensitiveData(userText);

  return { system: SYSTEM, userText, mapping };
}

export function parseResponse(
  raw: Record<string, unknown>,
  notices: NotificationRecord[],
  mapping: Mapping,
): PeriodReportPayload {
  const riskLevel = String(raw.riskLevel ?? '');
  if (!(RISK_LEVELS as readonly string[]).includes(riskLevel)) {
    throw new Error(`Model returned an invalid riskLevel: "${riskLevel}"`);
  }

  const str = (v: unknown) => restore(String(v ?? ''), mapping);
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => restore(String(x), mapping)) : []);

  return {
    kind: 'period_report',
    periodLabel: periodLabel(notices),
    headline: str(raw.headline),
    riskLevel: riskLevel as PeriodReportPayload['riskLevel'],
    summary: str(raw.summary),
    operationalRisk: str(raw.operationalRisk),
    themes: list(raw.themes),
    notableEvents: list(raw.notableEvents),
    decisions: list(raw.decisions),
    stats: computeStats(notices),
    noticeIds: notices.map((n) => n.id),
    governanceNote:
      `AI-drafted on Bedrock from anonymised copies of ${notices.length} notices; host names, ` +
      'IP addresses and contact details were withheld from the model. Requires named human ' +
      'approval before distribution; the original emails are the system of record.',
    generatedAt: new Date().toISOString(),
  };
}

export async function generatePeriodReport(
  notices: NotificationRecord[],
): Promise<PeriodReportPayload> {
  const { system, userText, mapping } = buildRequest(notices);
  const raw = await invokeStructured({ system, userText, tool: TOOL, maxTokens: 4000 });
  return { ...parseResponse(raw, notices, mapping), outbound: userText };
}

export type { Category, Status };
