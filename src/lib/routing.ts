/**
 * Stage 3 — routing.
 *
 * The one rule that is not configurable: auto-send forwards the ORIGINAL,
 * UNMODIFIED email and nothing else. No AI-generated artifact is ever sent
 * without a human approving it, regardless of category, confidence, or how
 * routine the notice looks. That is enforced here and again at the approval
 * endpoint, not by a threshold anyone can turn down.
 *
 * Reasons are written as short plain phrases, not sentences — they appear
 * stacked in the queue and a wall of prose there is unreadable.
 */

import type { ExtractedFields, ModelAssessment, Route, SafetyReport } from './types';

/**
 * Confidence at or above this is "high"; below LOW is outright low.
 *
 * 0.80 was set against the keyword stub, whose confidences were an invented
 * formula that ran high. The trained model reports real probabilities and is
 * under-confident by comparison - it is 100% correct on the real corpus
 * everywhere between 0.5 and 0.8 - so 0.80 held 225 of 226 notices, including
 * many it had classified correctly with room to spare.
 *
 * 0.70 instead: cross-validated accuracy above it is 98.1% on training data,
 * and it is deliberately on the cautious side of where the model's errors
 * actually appear (below 0.5).
 *
 * Worth knowing before tuning this: confidence is NOT what protects auto-send.
 * Moving this constant from 0.55 to 0.70 changes 5 notices out of 226 - the
 * content rules below hold the rest. See scripts/route-sim.ts.
 *
 * Provisional until a human labels a sample and we can measure agreement
 * against something other than models agreeing with models.
 */
export const CONFIDENCE_HIGH = 0.7;
export const CONFIDENCE_LOW = 0.5;

export interface RoutingResult {
  route: Route;
  reasons: string[];
}

const SPAN_WORDS: Record<string, string> = {
  ip_address: 'IP address',
  server_name: 'server name',
  unknown_term: 'unfamiliar term',
  phone: 'phone number',
  email: 'email address',
};

export function routeNotification(
  model: ModelAssessment,
  extracted: ExtractedFields,
  safety: SafetyReport,
): RoutingResult {
  const reasons: string[] = [];

  if (!safety.clean) {
    const kinds = [...new Set(safety.spans.map((s) => SPAN_WORDS[s.kind] ?? s.kind))]
      .filter((k) => k !== 'phone number' && k !== 'email address')
      .join(', ');
    reasons.push(`Flagged content: ${kinds}`);
  }

  if (model.confidence < CONFIDENCE_HIGH) {
    reasons.push(`Unsure of the category (${Math.round(model.confidence * 100)}%)`);
  }

  // Hardcoded low-risk definition: planned maintenance, non-production
  // systems, no security content, standard recipient list. Anything
  // production, unplanned, or security-touching always goes to a human.
  if (!extracted.isPlanned) reasons.push('Unplanned event');
  if (extracted.productionScope === 'production') {
    reasons.push('Affects production');
  } else if (extracted.productionScope === 'unstated') {
    reasons.push('Does not say which systems');
  }

  const securityTouching =
    model.primary === 'Security' ||
    model.secondary.includes('Security') ||
    model.primary === 'Compliance' ||
    model.secondary.includes('Compliance');
  if (securityTouching) reasons.push('Security or compliance');

  if (extracted.window === null) {
    reasons.push('No dates found');
  } else if (extracted.scheduleConfidence < 0.8) {
    reasons.push('Dates unclear');
  }

  if (reasons.length === 0) {
    return {
      route: 'auto_send',
      reasons: ['Planned work on test systems, nothing flagged — original email forwarded unchanged.'],
    };
  }

  return { route: 'human_review', reasons };
}

/**
 * Hard guard used by the approval endpoint. AI-generated artifacts are only
 * ever released with a named human approver attached.
 */
export function assertHumanApproved(approver: string | null | undefined): asserts approver is string {
  if (!approver || !approver.trim()) {
    throw new Error(
      'Refusing to release AI-generated content without a human approver. ' +
        'Auto-send may only forward the original, unmodified email.',
    );
  }
}
