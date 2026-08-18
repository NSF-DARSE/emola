/**
 * Stage 4 — what did a person decide last time this came up?
 *
 * Retrieval is cosine similarity over the same Titan embeddings the classifier
 * uses. It costs no extra network call: every notice is already embedded to be
 * classified, and a ruling inherits the vector of the notice it was made on.
 *
 * Rulings seeded before the vector existed have no embedding, so token overlap
 * remains as a fallback for those. It is worse, and it is labelled as such in
 * the result so the interface can say which kind of match a reviewer is
 * looking at rather than presenting both as the same thing.
 *
 * What has never been a stub, and is the part that matters: a match is
 * reference context for a reviewer. It never decides anything.
 */

import type { PrecedentMatch, PrecedentRecord } from './types';
import { cosine } from './vectors';

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

/** Token overlap. The fallback for rulings stored without an embedding. */
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

/** Token overlap is noisy, so it needs a lower bar than cosine to clear. */
export const SIMILARITY_THRESHOLD = 0.18;

/**
 * Measured rather than guessed. Across every pair of notices in the corpus:
 *
 *                        25%    50%    75%
 *   same category        0.44   0.60   0.77
 *   different category   0.18   0.27   0.32
 *
 * Unrelated notices essentially never reach 0.55, so 0.60 sits clear of them
 * while still retrieving the better half of genuine matches. An earlier guess
 * of 0.72 was well above where the evidence puts the line and returned almost
 * nothing.
 *
 * Caveat: measured on 34 notices, most of them Maintenance. Worth re-checking
 * once the precedent table has real volume in it.
 */
export const VECTOR_THRESHOLD = 0.6;

export function findSimilar(
  query: string,
  precedents: PrecedentRecord[],
  limit = 3,
  queryVector?: number[] | null,
): PrecedentMatch[] {
  return precedents
    .map((p) => {
      if (queryVector && p.embedding && p.embedding.length === queryVector.length) {
        return {
          precedent: p,
          similarity: Math.round(cosine(queryVector, p.embedding) * 100) / 100,
          method: 'embedding' as const,
        };
      }
      return {
        precedent: p,
        similarity: similarity(query, `${p.phrase} ${p.reason}`),
        method: 'tokens' as const,
      };
    })
    .filter((m) =>
      m.method === 'embedding' ? m.similarity >= VECTOR_THRESHOLD : m.similarity >= SIMILARITY_THRESHOLD,
    )
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
