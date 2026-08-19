/**
 * The bar is the one part of the poster that shows quantity rather than
 * stating it, so a wrong position is a lie a reader cannot check.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildTrackBars, minutesOfDay } from '../src/lib/poster';

test('reads a 12-hour clock', () => {
  assert.equal(minutesOfDay('Tue, Jan 20 · 12:00 PM'), 12 * 60);
  assert.equal(minutesOfDay('Tue, Jan 20 · 12:00 AM'), 0);
  assert.equal(minutesOfDay('Wed, Jan 21 · 5:00 AM'), 5 * 60);
});

test('the earliest window starts at the left edge', () => {
  const bars = buildTrackBars([
    { label: 'A', start: '· 12:00 PM', end: '· 1:00 PM' },
    { label: 'B', start: '· 4:00 PM', end: '· 5:00 PM' },
  ]);
  assert.equal(bars[0].left, 0);
});

test('the latest window ends at the right edge', () => {
  const bars = buildTrackBars([
    { label: 'A', start: '· 12:00 PM', end: '· 1:00 PM' },
    { label: 'B', start: '· 4:00 PM', end: '· 5:00 PM' },
  ]);
  const last = bars[1];
  assert.ok(Math.abs(last.left + last.width - 1) < 1e-9, `ends at ${last.left + last.width}`);
});

test('a window crossing midnight is not drawn backwards', () => {
  const bars = buildTrackBars([{ label: 'Night', start: '· 8:00 PM', end: '· 5:00 AM' }]);
  assert.ok(bars[0].width > 0, 'width must be positive across midnight');
});

test('a very short window still gets a visible mark', () => {
  const bars = buildTrackBars([
    { label: 'Long', start: '· 12:00 PM', end: '· 11:00 PM' },
    { label: 'Brief', start: '· 4:00 PM', end: '· 4:15 PM' },
  ]);
  assert.ok(bars[1].width >= 0.035, `too thin to see: ${bars[1].width}`);
});

test('unreadable times produce no bar rather than a fabricated one', () => {
  assert.deepEqual(buildTrackBars([{ label: 'A', start: 'sometime', end: 'later' }]), []);
});
