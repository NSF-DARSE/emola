/**
 * Turns a notice into the 1024-dimensional vector the classifier reads.
 *
 * This is the only point in the classification path that touches the network,
 * so it is also the only point where a host name could leave the building.
 * The text is anonymised first and re-checked immediately before the request
 * goes out: swap, verify, send. If the verification fires we throw rather than
 * send, because a failed classification is recoverable and a leak is not.
 *
 * We never restore the placeholders afterwards. A vector is not read by a
 * person, and the classifier was trained on placeholder-bearing text, so the
 * tokens are what it expects to see.
 */

import { anonymize, assertNoSensitiveData } from '../anonymize';
import { WEIGHTS } from './logreg';

export interface EmbeddingPayload {
  inputText: string;
  dimensions: number;
  normalize: boolean;
}

export class EmbeddingError extends Error {}

/**
 * Pure, so the safety properties can be asserted without a network call.
 * Everything that leaves this process leaves through here.
 */
export function buildEmbeddingPayload(body: string): EmbeddingPayload {
  const { text } = anonymize(body);
  assertNoSensitiveData(text);
  return { inputText: text, dimensions: WEIGHTS.dimensions, normalize: true };
}

function embeddingConfig(): { key: string; region: string; modelId: string } | null {
  const key = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!key || key === 'PASTE_KEY_HERE') return null;
  return {
    key,
    region: process.env.AWS_REGION ?? 'us-west-2',
    modelId: WEIGHTS.embeddingModel,
  };
}

export function isEmbeddingConfigured(): boolean {
  return embeddingConfig() !== null;
}

export async function embed(body: string): Promise<number[]> {
  const cfg = embeddingConfig();
  if (!cfg) throw new EmbeddingError('No Bedrock key, so the notice cannot be embedded.');

  const payload = buildEmbeddingPayload(body);
  const res = await fetch(
    `https://bedrock-runtime.${cfg.region}.amazonaws.com/model/${encodeURIComponent(
      cfg.modelId,
    )}/invoke`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    throw new EmbeddingError(`Bedrock rejected the embedding request (${res.status}).`);
  }

  const json = (await res.json()) as { embedding?: number[] };
  if (!Array.isArray(json.embedding)) {
    throw new EmbeddingError('Bedrock returned no embedding.');
  }
  return json.embedding;
}
