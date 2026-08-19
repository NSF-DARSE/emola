/**
 * The poster is the one artifact that leaves as a picture. Text in an image
 * cannot be searched, redacted after the fact, or spotted by a mail filter —
 * once it is pixels it is gone. So the gate runs on every string that reaches
 * the renderer, and it fails closed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertPosterIsSafe, pickTemplate, posterStrings } from '../src/lib/poster';
import type { InfographicPayload } from '../src/lib/artifacts';

function payload(over: Partial<InfographicPayload> = {}): InfographicPayload {
  return {
    kind: 'infographic',
    eyebrow: 'Service notice',
    headline: 'Linux production server maintenance',
    category: 'Maintenance',
    status: 'scheduled',
    when: {
      start: 'Tue, Jun 16, 2026 · 12:00 PM',
      end: 'Wed, Jun 17, 2026 · 5:00 AM',
      duration: '17 hr',
      crossesMidnight: true,
      timezone: 'America/New_York',
    },
    timeline: [{ label: 'CI/CD Servers', start: 'Tue 12:00 PM', end: 'Tue 1:00 PM' }],
    systems: ['SFTP', 'FirstMap'],
    impact: 'Several services intermittently unavailable.',
    actions: ['Log out before the window begins.'],
    contact: 'DTI_Change_Enablement@delaware.gov',
    callouts: [],
    generatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

test('a clean notice passes', () => {
  assert.doesNotThrow(() => assertPosterIsSafe(payload()));
});

test('refuses to render an IP address into pixels', () => {
  assert.throws(() => assertPosterIsSafe(payload({ impact: 'Reach 10.42.18.211 directly.' })), /IP/i);
});

test('refuses a host name, wherever it hides', () => {
  assert.throws(
    () => assertPosterIsSafe(payload({ systems: ['SFTP', 'wpdc-ctx-prd-04'] })),
    /host/i,
  );
});

test('checks nested timeline labels, not just the top-level fields', () => {
  assert.throws(
    () => assertPosterIsSafe(payload({ timeline: [{ label: 'dof-iras-prd-04', start: 'a', end: 'b' }] })),
    /host/i,
  );
});

test('checks every action line', () => {
  assert.throws(
    () => assertPosterIsSafe(payload({ actions: ['All fine', 'Ping 192.168.0.14 to verify'] })),
    /IP/i,
  );
});

test('refuses a network path', () => {
  // Built from char codes: a UNC path in a source literal is a backslash
  // escaping problem waiting to happen, and this detector was silently broken
  // by exactly that until a test exercised it.
  const B = String.fromCharCode(92);
  assert.throws(
    () => assertPosterIsSafe(payload({ impact: `Copy from ${B}${B}fileserver${B}share first.` })),
    /network path/i,
  );
});

test('refuses a MAC address', () => {
  assert.throws(
    () => assertPosterIsSafe(payload({ impact: 'Adapter 00:1A:2B:3C:4D:5E is affected.' })),
    /MAC/i,
  );
});

test('refuses a placeholder that was never restored', () => {
  // A poster reading "contact [EMAIL_1]" is worse than useless — it tells the
  // reader the pipeline is broken.
  assert.throws(() => assertPosterIsSafe(payload({ contact: '[EMAIL_1]' })), /placeholder/i);
});

test('ordinary braces in prose are not a network path', () => {
  assert.doesNotThrow(() => assertPosterIsSafe(payload({ impact: 'Batch {2} runs after.' })));
});

test('a contact address is allowed — it is the point of the poster', () => {
  assert.doesNotThrow(() => assertPosterIsSafe(payload({ contact: 'DTI_Change_Enablement@delaware.gov' })));
});

test('collects every string the renderer will draw', () => {
  const strings = posterStrings(payload());
  assert.ok(strings.includes('Linux production server maintenance'));
  assert.ok(strings.some((s) => s.includes('CI/CD Servers')));
  assert.ok(strings.includes('SFTP'));
});

test('picks a template from the event, not at random', () => {
  assert.equal(pickTemplate(payload({ category: 'Outage', status: 'active' })), 'outage');
  assert.equal(pickTemplate(payload({ category: 'Security', status: 'active' })), 'security');
  assert.equal(pickTemplate(payload({ status: 'resolved' })), 'resolved');
  assert.equal(pickTemplate(payload({ timeline: [
    { label: 'a', start: '1', end: '2' },
    { label: 'b', start: '3', end: '4' },
  ] })), 'timeline');
  assert.equal(pickTemplate(payload()), 'maintenance');
});
