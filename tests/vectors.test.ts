/**
 * Vectors are stored as raw float32 blobs in SQLite. A silent corruption here
 * would not throw — it would just return slightly wrong neighbours forever —
 * so the round-trip is asserted rather than assumed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cosine, fromBlob, toBlob } from '../src/lib/vectors';

test('a vector survives a round trip through the database blob', () => {
  const v = [0.1, -0.25, 0.5, 0, 1, -1];
  const back = fromBlob(toBlob(v));
  assert.equal(back.length, v.length);
  for (const [i, x] of v.entries()) {
    assert.ok(Math.abs(back[i] - x) < 1e-6, `index ${i}: ${back[i]} != ${x}`);
  }
});

test('a vector is identical to itself', () => {
  assert.ok(Math.abs(cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
});

test('perpendicular vectors score zero', () => {
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
});

test('scale does not change similarity, only direction does', () => {
  assert.ok(Math.abs(cosine([1, 2, 3], [10, 20, 30]) - 1) < 1e-9);
});

test('opposite vectors are clamped to zero rather than reported as negative', () => {
  // Similarity is shown to reviewers as a percentage. A negative percentage
  // would be meaningless to read, and nothing downstream ranks below "unrelated".
  assert.equal(cosine([1, 0], [-1, 0]), 0);
});

test('a zero vector is unrelated to everything instead of dividing by zero', () => {
  assert.equal(cosine([0, 0, 0], [1, 2, 3]), 0);
});

test('mismatched lengths throw rather than silently comparing a prefix', () => {
  assert.throws(() => cosine([1, 2], [1, 2, 3]), /length/i);
});
