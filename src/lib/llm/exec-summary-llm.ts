/**
 * AI-drafted executive summary, via Bedrock.
 *
 * The flow, and the order is the point:
 *
 *   1. anonymise the notice locally
 *   2. assert nothing sensitive survived  <-- request aborts here if it did
 *   3. send only the tokenised text
 *   4. rehydrate the response locally
 *
 * The model never sees a real host name, IP, email or phone number. It sees
 * [HOST_1] and writes about [HOST_1]; we put the real value back afterwards.
 */

import { anonymize, assertNoSensitiveData, restore, type Mapping } from '@/lib/anonymize';
import type { ExecSummaryPayload } from '@/lib/artifacts';
import { formatDuration, formatWindowPoint } from '@/lib/time';
import type { NotificationRecord } from '@/lib/types';
import { invokeStructured, type BedrockTool } from './bedrock';

const RISK_LEVELS = ['Low', 'Moderate', 'Elevated'] as const;

/** The master prompt. */
const SYSTEM = `You write executive summaries of IT service notices for leadership at the State of Delaware Department of Finance.

Your reader is a director or deputy secretary. They are not an engineer. They have thirty seconds and they need to know: what is the business impact, what is the operational risk, and is there anything they personally must decide.

Rules:
- Write plainly. No jargon, no acronyms the reader would not already know, no filler.
- Never invent detail. If the notice does not state an end time, an owner, or a cause, say it is not stated. An honest gap is more useful than a confident guess.
- Placeholders such as [HOST_1], [IP_1], [EMAIL_1] and [PHONE_1] stand in for real values that have been withheld from you. Reproduce them EXACTLY as written when you need to refer to them. Never guess what they contain, never expand them, never invent new ones.
- Risk level: Elevated if production systems or security are involved; Moderate if the work is unplanned, the scope is unstated, or no end time is published; otherwise Low.
- Decisions must be things a leader actually chooses. If nothing needs deciding, say so plainly rather than manufacturing an action.
- Be specific about services and times. Vagueness is what makes these summaries useless.`;

const TOOL: BedrockTool = {
  name: 'emit_executive_summary',
  description: 'Return the executive summary in the required structure.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'One line, under 90 characters.' },
      businessImpact: { type: 'string', description: 'Two or three sentences on what this means for the business.' },
      operationalRisk: { type: 'string', description: 'Two or three sentences on risk and exposure.' },
      riskLevel: { type: 'string', enum: [...RISK_LEVELS] },
      affectedServices: { type: 'array', items: { type: 'string' } },
      decisions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Decisions or actions for leadership. State plainly if none.',
      },
      window: { type: 'string', description: 'The schedule in plain words, or that it is not stated.' },
    },
    required: [
      'headline',
      'businessImpact',
      'operationalRisk',
      'riskLevel',
      'affectedServices',
      'decisions',
      'window',
    ],
    additionalProperties: false,
  },
};

/** Everything that will cross the network, plus the mapping to undo it. */
export function buildRequest(n: NotificationRecord): {
  system: string;
  userText: string;
  mapping: Mapping;
} {
  const w = n.extracted.window;
  const schedule = w
    ? `${formatWindowPoint(w.start)} to ${formatWindowPoint(w.end)} (${formatDuration(
        w.durationMinutes,
      )}${w.crossesMidnight ? ', crosses midnight' : ''})`
    : 'No schedule stated in the notice.';

  // Structured facts we already extracted locally, plus the notice itself.
  const composed = [
    `Category: ${n.model.primary}${n.model.secondary.length ? ` (also ${n.model.secondary.join(', ')})` : ''}`,
    `Status: ${n.model.status}`,
    `Schedule: ${schedule}`,
    `Affected systems: ${n.extracted.affectedSystems.join(', ') || 'not itemised'}`,
    `Environment: ${n.extracted.productionScope.replace('_', '-')}`,
    '',
    'Original notice:',
    n.body,
  ].join('\n');

  const { text, mapping } = anonymize(composed);

  // The seatbelt. If any detector still fires, no request is made at all.
  assertNoSensitiveData(text);

  return { system: SYSTEM, userText: text, mapping };
}

function restoreAll(value: string, mapping: Mapping): string {
  return restore(value, mapping);
}

/** Validate the model's output and put the real values back. */
export function parseResponse(
  raw: Record<string, unknown>,
  n: NotificationRecord,
  mapping: Mapping,
): ExecSummaryPayload {
  const riskLevel = String(raw.riskLevel ?? '');
  if (!(RISK_LEVELS as readonly string[]).includes(riskLevel)) {
    throw new Error(`Model returned an invalid riskLevel: "${riskLevel}"`);
  }

  const str = (v: unknown) => restoreAll(String(v ?? ''), mapping);
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => restoreAll(String(x), mapping)) : []);

  return {
    kind: 'exec_summary',
    headline: str(raw.headline),
    businessImpact: str(raw.businessImpact),
    operationalRisk: str(raw.operationalRisk),
    riskLevel: riskLevel as ExecSummaryPayload['riskLevel'],
    affectedServices: list(raw.affectedServices),
    decisions: list(raw.decisions),
    window: str(raw.window),
    governanceNote:
      `AI-drafted on Bedrock from an anonymised copy of ${n.id}; host names, IP addresses and ` +
      'contact details were withheld from the model. Requires named human approval before ' +
      'distribution; the original email is the system of record.',
    generatedAt: new Date().toISOString(),
  };
}

/** Full round trip. Throws if Bedrock is unconfigured or anonymisation fails. */
export async function generateExecSummary(n: NotificationRecord): Promise<ExecSummaryPayload> {
  const { system, userText, mapping } = buildRequest(n);
  const raw = await invokeStructured({ system, userText, tool: TOOL, maxTokens: 2000 });
  return parseResponse(raw, n, mapping);
}

/** The exact bytes that would leave the machine — shown to reviewers in the UI. */
export function outboundPreview(n: NotificationRecord): string {
  return buildRequest(n).userText;
}
