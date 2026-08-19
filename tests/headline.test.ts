/**
 * The poster headline was the first 120 characters of the body, which produced
 * "On Tuesday, January 20, 2026, from 1200 until 0500 the following morning,
 * DTI will be performing maintenance on the DTI-" — a sentence severed
 * mid-word, set at 55px. A headline has to be built, not sliced.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildHeadline, compactRange } from '../src/lib/artifacts';

test('names the systems and what is happening to them', () => {
  assert.equal(
    buildHeadline({ systems: ['Linux production servers'], category: 'Maintenance', status: 'scheduled', fallback: 'x' }),
    'Linux production servers maintenance',
  );
});

test('joins two systems readably', () => {
  assert.equal(
    buildHeadline({ systems: ['IRAS Production', 'IRAS Portal'], category: 'Maintenance', status: 'scheduled', fallback: 'x' }),
    'IRAS Production and IRAS Portal maintenance',
  );
});

test('summarises rather than listing when there are many', () => {
  const h = buildHeadline({
    systems: ['A', 'B', 'C', 'D', 'E'],
    category: 'Maintenance',
    status: 'scheduled',
    fallback: 'x',
  });
  assert.match(h, /across 5 systems/);
  assert.ok(/^Maintenance/.test(h), `should lead with the event: ${h}`);
});

test('says what kind of event it is, not just "maintenance"', () => {
  assert.match(buildHeadline({ systems: ['VPN'], category: 'Outage', status: 'active', fallback: 'x' }), /disruption/i);
  assert.match(buildHeadline({ systems: ['VPN'], category: 'Security', status: 'active', fallback: 'x' }), /security/i);
  assert.match(buildHeadline({ systems: ['VPN'], category: 'Maintenance', status: 'resolved', fallback: 'x' }), /restored/i);
});

test('falls back to the notice text when no system was extracted', () => {
  const h = buildHeadline({ systems: [], category: 'Maintenance', status: 'scheduled', fallback: 'Quarterly patching window announced for all agencies next week' });
  assert.ok(h.length > 0);
  assert.ok(!h.endsWith('-'), 'must not end mid-word');
});

test('never severs a word', () => {
  const long = 'On Tuesday, January 20, 2026, from 1200 until 0500 the following morning, DTI will be performing maintenance on the DTI-managed Linux production servers';
  const h = buildHeadline({ systems: [], category: 'Maintenance', status: 'scheduled', fallback: long });
  assert.ok(h.length <= 78, `too long: ${h.length}`);
  assert.ok(!/\S-$/.test(h), `severed a word: ${h}`);
  assert.ok(long.startsWith(h.replace(/…$/, '')), 'must be a prefix of the source');
});

test('a same-day range shows the date once, not twice', () => {
  assert.equal(
    compactRange('Tue, Jan 20, 2026 · 12:00 PM', 'Tue, Jan 20, 2026 · 1:00 PM'),
    'Tue, Jan 20 · 12:00 PM — 1:00 PM',
  );
});

test('a range crossing days keeps both dates, because that is the point', () => {
  assert.equal(
    compactRange('Tue, Jan 20, 2026 · 8:00 PM', 'Wed, Jan 21, 2026 · 5:00 AM'),
    'Tue, Jan 20 · 8:00 PM — Wed, Jan 21 · 5:00 AM',
  );
});
