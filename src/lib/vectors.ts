/**
 * Embedding storage and comparison.
 *
 * Vectors go into SQLite as raw float32 blobs — 1024 floats is 4KB, versus
 * about 20KB as JSON, and the whole point of keeping precedents local is that
 * lookups stay cheap.
 */

export function toBlob(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

export function fromBlob(blob: Buffer): number[] {
  return Array.from(
    new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / Float32Array.BYTES_PER_ELEMENT),
  );
}

/**
 * Cosine similarity, clamped to 0..1.
 *
 * Negative similarity is clamped rather than returned: the number is shown to
 * a reviewer as a percentage, and "-12% similar" means nothing to read. Two
 * notices pointing in opposite directions are simply unrelated, which is what
 * zero already says.
 */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Cannot compare vectors of different length (${a.length} vs ${b.length}).`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return Math.max(0, dot / (Math.sqrt(normA) * Math.sqrt(normB)));
}
