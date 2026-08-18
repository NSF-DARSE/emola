/**
 * The trained classifier, running in TypeScript.
 *
 * Multinomial logistic regression over 1024-dimensional Titan embeddings. The
 * whole model is eight rows of coefficients and eight intercepts — small
 * enough to ship as JSON, which means no Python process at runtime and no
 * model server to keep alive.
 *
 * Logistic regression rather than the linear SVM that narrowly won on macro F1
 * (0.863 vs 0.862, well inside one standard deviation): the routing rule keys
 * on confidence, and only this one produces probabilities that mean anything.
 *
 * Category only. Status is still decided by rules in ./../classifier — we
 * never trained a status model, and pretending otherwise would put an
 * unearned number in front of a reviewer.
 */

import weights from './weights.json';
import type { Category } from '../taxonomy';

export const WEIGHTS = weights as {
  engine: string;
  embeddingModel: string;
  dimensions: number;
  trainedOn: number;
  categories: string[];
  coefficients: number[][];
  intercepts: number[];
};

export interface CategoryPrediction {
  primary: Category;
  /** Runners-up above a floor, strongest first. Never includes the primary. */
  secondary: Category[];
  /** Probability of the primary. Real, not a made-up score. */
  confidence: number;
  probabilities: Record<string, number>;
}

/** Runners-up below this are noise, not a second opinion worth surfacing. */
const SECONDARY_FLOOR = 0.08;
const MAX_SECONDARY = 3;

/**
 * Training L2-normalised every vector, so inference must too. Skipping it
 * still returns a category — just a subtly wrong one — which is exactly the
 * kind of bug that survives a demo.
 */
function l2normalise(vector: number[]): number[] {
  let sumSquares = 0;
  for (const v of vector) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares);
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

/** Subtract the max before exponentiating, or large scores overflow to NaN. */
function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

export function predictCategory(vector: number[]): CategoryPrediction {
  if (vector.length !== WEIGHTS.dimensions) {
    throw new Error(
      `Embedding has ${vector.length} dimensions, expected ${WEIGHTS.dimensions}. ` +
        `Check the embedding model is ${WEIGHTS.embeddingModel}.`,
    );
  }

  const x = l2normalise(vector);

  const scores = WEIGHTS.coefficients.map((row, k) => {
    let dot = 0;
    for (let i = 0; i < row.length; i += 1) dot += row[i] * x[i];
    return dot + WEIGHTS.intercepts[k];
  });

  const probs = softmax(scores);
  const ranked = WEIGHTS.categories
    .map((category, i) => ({ category: category as Category, p: probs[i] }))
    .sort((a, b) => b.p - a.p);

  const probabilities: Record<string, number> = {};
  for (const { category, p } of ranked) probabilities[category] = p;

  return {
    primary: ranked[0].category,
    secondary: ranked
      .slice(1)
      .filter((r) => r.p >= SECONDARY_FLOOR)
      .slice(0, MAX_SECONDARY)
      .map((r) => r.category),
    confidence: ranked[0].p,
    probabilities,
  };
}
