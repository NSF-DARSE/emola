/**
 * ============================================================================
 * PLACEHOLDER SIMILARITY — not the real retrieval.
 * ============================================================================
 *
 * Stage 4 looks up prior human rulings that resemble the case in front of the
 * reviewer. The real version embeds the flagged phrase with a sentence
 * embedding model and does cosine similarity over stored vectors.
 *
 * For the mockup this is token-overlap (Jaccard with a light IDF-ish weighting)
 * so the UI has something to show with no model to host. `findSimilar()` keeps
 * the signature the embedded version will use, and the store already has a
 * column for the vector.
 *
 * What matters and is NOT a stub: a match is surfaced to the reviewer as
 * reference context only. It never decides anything.
 */

import type { PrecedentMatch, PrecedentRecord } from './types';

const STOP = new Set(
  'the a an and or of to in on at for is are was were be been will would should may might can could this that these those with without from by as it its'.split(
    ' ',
  ),
);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9/\s-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

/** Placeholder for cosine similarity over embeddings. Range 0..1. */
export function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;

  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;

  const jaccard = overlap / (ta.size + tb.size - overlap);
  // Rare, longer tokens carry more signal than common short ones.
  let weighted = 0;
  for (const t of ta) if (tb.has(t) && t.length > 5) weighted += 1;
  const bonus = Math.min(0.2, weighted * 0.05);

  return Math.min(1, Math.round((jaccard + bonus) * 100) / 100);
}

export const SIMILARITY_THRESHOLD = 0.18;

export function findSimilar(
  query: string,
  precedents: PrecedentRecord[],
  limit = 3,
): PrecedentMatch[] {
  return precedents
    .map((p) => ({ precedent: p, similarity: similarity(query, `${p.phrase} ${p.reason}`) }))
    .filter((m) => m.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
