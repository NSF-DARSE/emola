/**
 * Evaluation. Two numbers the final presentation needs:
 *
 *   1. Holdout agreement — how often the classifier matches the labelled
 *      category and status on notices it was held out of.
 *   2. Human override rate — how often a reviewer's own call differs from
 *      what the model said, measured on real decisions in the queue.
 *
 * Synthetic notices are excluded from (1). They were written to exercise the
 * pipeline, so scoring against them would flatter the number.
 */

import { listDecisions, listNotifications } from './db';
import { SYNTHETIC_ONLY_CATEGORIES } from './taxonomy';
import type { NotificationRecord } from './types';

export interface AgreementBreakdown {
  n: number;
  categoryMatches: number;
  statusMatches: number;
  bothMatch: number;
  categoryRate: number;
  statusRate: number;
  exactRate: number;
  misses: Array<{
    id: string;
    goldPrimary: string;
    modelPrimary: string;
    goldStatus: string;
    modelStatus: string;
    confidence: number;
  }>;
}

function score(rows: NotificationRecord[]): AgreementBreakdown {
  let categoryMatches = 0;
  let statusMatches = 0;
  let bothMatch = 0;
  const misses: AgreementBreakdown['misses'] = [];

  for (const r of rows) {
    const cat = r.goldPrimary === r.model.primary;
    const st = r.goldStatus === r.model.status;
    if (cat) categoryMatches += 1;
    if (st) statusMatches += 1;
    if (cat && st) bothMatch += 1;
    if (!cat || !st) {
      misses.push({
        id: r.id,
        goldPrimary: r.goldPrimary ?? '—',
        modelPrimary: r.model.primary,
        goldStatus: r.goldStatus ?? '—',
        modelStatus: r.model.status,
        confidence: r.model.confidence,
      });
    }
  }

  const n = rows.length;
  const rate = (v: number) => (n === 0 ? 0 : Math.round((v / n) * 1000) / 10);

  return {
    n,
    categoryMatches,
    statusMatches,
    bothMatch,
    categoryRate: rate(categoryMatches),
    statusRate: rate(statusMatches),
    exactRate: rate(bothMatch),
    misses,
  };
}

export interface OverrideStats {
  decisions: number;
  categoryOverrides: number;
  statusOverrides: number;
  anyOverride: number;
  overrideRate: number;
  approvals: number;
  rejections: number;
}

export interface MetricsReport {
  holdout: AgreementBreakdown;
  trainingPool: AgreementBreakdown;
  overrides: OverrideStats;
  routing: { total: number; autoSend: number; humanReview: number; pending: number };
  syntheticOnlyCategories: string[];
  syntheticCount: number;
  engine: string;
}

export function computeMetrics(): MetricsReport {
  const all = listNotifications();
  const labelledReal = all.filter((n) => !n.synthetic && n.goldPrimary && n.goldStatus);

  const holdout = score(labelledReal.filter((n) => n.holdout));
  const trainingPool = score(labelledReal.filter((n) => !n.holdout));

  const decisions = listDecisions();
  let categoryOverrides = 0;
  let statusOverrides = 0;
  let anyOverride = 0;
  for (const d of decisions) {
    const c = d.humanPrimary !== d.modelPrimaryAtDecision;
    const s = d.humanStatus !== d.modelStatusAtDecision;
    if (c) categoryOverrides += 1;
    if (s) statusOverrides += 1;
    if (c || s) anyOverride += 1;
  }

  return {
    holdout,
    trainingPool,
    overrides: {
      decisions: decisions.length,
      categoryOverrides,
      statusOverrides,
      anyOverride,
      overrideRate: decisions.length === 0 ? 0 : Math.round((anyOverride / decisions.length) * 1000) / 10,
      approvals: decisions.filter((d) => d.decision === 'approve').length,
      rejections: decisions.filter((d) => d.decision === 'reject').length,
    },
    routing: {
      total: all.length,
      autoSend: all.filter((n) => n.route === 'auto_send').length,
      humanReview: all.filter((n) => n.route === 'human_review').length,
      pending: all.filter((n) => n.route === 'human_review' && n.reviewState === 'pending').length,
    },
    syntheticOnlyCategories: SYNTHETIC_ONLY_CATEGORIES,
    syntheticCount: all.filter((n) => n.synthetic).length,
    engine: all[0]?.model.engine ?? 'unknown',
  };
}
