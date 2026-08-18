/**
 * The real evaluation, produced by scripts/export_weights.py.
 *
 * The app used to show agreement on a ten-notice demo holdout, where a single
 * notice moves the number by ten points and everything lands on a suspiciously
 * round figure. This is the number that actually means something: the
 * classifier scored once, on 226 real notices it never saw during training.
 */

import fs from 'node:fs';
import path from 'node:path';

import { inboxStats } from './inbox';

const EVAL_PATH = path.join(process.cwd(), 'data', 'model', 'evaluation.json');

export interface CategoryScore {
  category: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface Evaluation {
  testedOn: number;
  trainedOn: number;
  accuracy: number;
  lenientAccuracy: number;
  baseline: number;
  baselineLabel: string;
  macroF1: number;
  perCategory: CategoryScore[];
}

export function readEvaluation(): Evaluation | null {
  if (!fs.existsSync(EVAL_PATH)) return null;
  return JSON.parse(fs.readFileSync(EVAL_PATH, 'utf8'));
}

export interface TriageScore {
  total: number;
  abnormal: number;
  found: number;
  missed: number;
  falseAlarms: number;
  /** Share of the mailbox that is an abnormal event. */
  prevalence: number;
}

export function triageScore(): TriageScore {
  const s = inboxStats();
  return {
    total: s.total,
    abnormal: s.abnormal,
    found: s.found,
    missed: s.missed,
    falseAlarms: s.falseAlarms,
    prevalence: s.total === 0 ? 0 : s.abnormal / s.total,
  };
}

/**
 * Categories with no real examples at all in the 226-notice corpus.
 *
 * Derived from the evaluation rather than hardcoded: the list was previously a
 * constant describing the 34-notice demo set, which made the metrics page
 * contradict its own table — claiming no real Security examples exist directly
 * above a row showing two of them.
 */
export function categoriesWithoutRealExamples(all: readonly string[]): string[] {
  const evaluation = readEvaluation();
  if (!evaluation) return [];
  const seen = new Set(
    evaluation.perCategory.filter((c) => c.support > 0).map((c) => c.category),
  );
  return all.filter((c) => !seen.has(c));
}

/** Categories with real examples, but too few to conclude anything from. */
export function categoriesTooRareToJudge(minimum = 5): string[] {
  const evaluation = readEvaluation();
  if (!evaluation) return [];
  return evaluation.perCategory
    .filter((c) => c.support > 0 && c.support < minimum)
    .map((c) => c.category);
}
