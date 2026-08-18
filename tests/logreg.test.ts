/**
 * The model was trained in Python and re-implemented here so the app needs no
 * Python at runtime. That port is the thing most likely to break silently — a
 * transposed matrix or a missing normalisation still returns a plausible
 * category — so these tests check it reproduces the original exactly rather
 * than merely returning something sensible.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { predictCategory, WEIGHTS } from '../src/lib/model/logreg';

interface ParityCase {
  id: string;
  vector: number[];
  expectedCategory: string;
  expectedConfidence: number;
}

const fixture: { cases: ParityCase[] } = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/logreg-parity.json'), 'utf8'),
);

test('predicts the same category as the Python model on every real notice', () => {
  for (const c of fixture.cases) {
    const got = predictCategory(c.vector);
    assert.equal(got.primary, c.expectedCategory, `${c.id} disagreed with Python`);
  }
});

test('produces the same confidence as the Python model, to 4 decimal places', () => {
  for (const c of fixture.cases) {
    const got = predictCategory(c.vector);
    assert.ok(
      Math.abs(got.confidence - c.expectedConfidence) < 1e-4,
      `${c.id}: expected ${c.expectedConfidence}, got ${got.confidence}`,
    );
  }
});

test('probabilities across the eight categories sum to 1', () => {
  for (const c of fixture.cases.slice(0, 5)) {
    const total = Object.values(predictCategory(c.vector).probabilities)
      .reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `summed to ${total}`);
  }
});

test('normalises an unnormalised vector rather than trusting the caller', () => {
  const c = fixture.cases[0];
  const scaled = c.vector.map((v) => v * 7.3);
  assert.equal(predictCategory(scaled).primary, c.expectedCategory);
});

test('rejects a vector of the wrong length instead of returning a wrong answer', () => {
  assert.throws(() => predictCategory([0.1, 0.2, 0.3]), /1024/);
});

test('secondary categories are the runners-up, never the primary', () => {
  for (const c of fixture.cases) {
    const got = predictCategory(c.vector);
    assert.ok(!got.secondary.includes(got.primary), `${c.id} listed its primary as secondary`);
  }
});

test('ships weights for all eight categories', () => {
  assert.equal(WEIGHTS.categories.length, 8);
  assert.equal(WEIGHTS.dimensions, 1024);
});
