import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addDays,
  buildWindow,
  formatDuration,
  normalizeSchedule,
  parseClock,
} from '../src/lib/time';
import { shortDate } from '../src/lib/mail';

test('parseClock handles 24-hour, colon, and 12-hour forms', () => {
  assert.equal(parseClock('1800'), 18 * 60);
  assert.equal(parseClock('0430'), 4 * 60 + 30);
  assert.equal(parseClock('18:00'), 18 * 60);
  assert.equal(parseClock('6:00 pm'), 18 * 60);
  assert.equal(parseClock('6 pm'), 18 * 60);
  assert.equal(parseClock('12:00 AM'), 0);
  assert.equal(parseClock('12:00 PM'), 12 * 60);
  assert.equal(parseClock('2359'), 23 * 60 + 59);
  assert.equal(parseClock('not a time'), null);
  assert.equal(parseClock('2565'), null);
});

test('addDays rolls month and year boundaries', () => {
  assert.equal(addDays('2025-01-31', 1), '2025-02-01');
  assert.equal(addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29'); // leap year
});

// Cross-midnight is the known bug source called out in the build brief.
test('cross-midnight window rolls the end date forward', () => {
  const r = normalizeSchedule(
    'On Thursday, January 23, 2025, from 1800 until 0430 the following morning, DTI will perform maintenance to the DTI-managed Linux Production servers.',
    '2025-01-17',
  );
  assert.ok(r.primary);
  assert.equal(r.primary!.start, '2025-01-23T18:00');
  assert.equal(r.primary!.end, '2025-01-24T04:30');
  assert.equal(r.primary!.crossesMidnight, true);
  assert.equal(r.primary!.durationMinutes, 10 * 60 + 30);
});

test('cross-midnight is detected even without "the following morning"', () => {
  const w = buildWindow('2026-06-03', 22 * 60, 2 * 60, { raw: '2200 until 0200' });
  assert.equal(w.start, '2026-06-03T22:00');
  assert.equal(w.end, '2026-06-04T02:00');
  assert.equal(w.crossesMidnight, true);
  assert.equal(w.durationMinutes, 4 * 60);
});

test('same-day 24-hour window does not roll over', () => {
  const r = normalizeSchedule(
    'On Tuesday, January 14, 2025, from 0900 until 1700, DTI will be performing maintenance on the FirstMap 2.0 TEST ArcGIS system.',
    '2025-01-13',
  );
  assert.ok(r.primary);
  assert.equal(r.primary!.start, '2025-01-14T09:00');
  assert.equal(r.primary!.end, '2025-01-14T17:00');
  assert.equal(r.primary!.crossesMidnight, false);
});

test('12-hour clock with an inferred year', () => {
  const r = normalizeSchedule(
    'IRAS Production and the Portal will experience scheduled maintenance on Thursday, July 31st, from 7:00 pm to 10:00 pm.',
    '2025-07-28',
  );
  assert.ok(r.primary);
  assert.equal(r.primary!.start, '2025-07-31T19:00');
  assert.equal(r.primary!.end, '2025-07-31T22:00');
  assert.ok(r.confidence < 1, 'inferred year should reduce confidence');
  assert.ok(r.notes.some((n) => /inferred/i.test(n)));
});

test('"Today ... between X and Y" resolves against the received date', () => {
  const r = normalizeSchedule(
    'Today, Monday, March 24, 2025, between 12:00 PM and 12:30 PM, DTI will be performing necessary maintenance to the mainframe TN3270 application.',
    '2025-03-24',
  );
  assert.ok(r.primary);
  assert.equal(r.primary!.start, '2025-03-24T12:00');
  assert.equal(r.primary!.end, '2025-03-24T12:30');
  assert.equal(r.primary!.durationMinutes, 30);
});

test('"starting at ... until ..." phrasing', () => {
  const r = normalizeSchedule(
    'IRAS Production and the Portal will be undergoing maintenance from Sunday, August 3rd, 2025 starting at 6:00 am until 10:00 am.',
    '2025-07-28',
  );
  assert.ok(r.primary);
  assert.equal(r.primary!.start, '2025-08-03T06:00');
  assert.equal(r.primary!.end, '2025-08-03T10:00');
});

test('bulleted sub-windows are parsed, including the one that names the next day', () => {
  const body = [
    'On Tuesday, January 20, 2026, from 1200 until 0500 the following morning, DTI will be performing maintenance.',
    '• CI/CD Servers: Tuesday 1200 until 1300',
    '• SFTP Server: Tuesday 1630 until 1700',
    '• Production Servers: Tuesday 20:00 until Wednesday 05:00',
  ].join('\n');

  const r = normalizeSchedule(body, '2026-01-14');
  assert.ok(r.primary);
  assert.equal(r.primary!.start, '2026-01-20T12:00');
  assert.equal(r.primary!.end, '2026-01-21T05:00');
  assert.equal(r.subWindows.length, 3);

  const cicd = r.subWindows[0];
  assert.equal(cicd.label, 'CI/CD Servers');
  assert.equal(cicd.crossesMidnight, false);

  const prod = r.subWindows[2];
  assert.equal(prod.label, 'Production Servers');
  assert.equal(prod.start, '2026-01-20T20:00');
  assert.equal(prod.end, '2026-01-21T05:00');
  assert.equal(prod.crossesMidnight, true);
});

test('a notice with no parsable schedule reports zero confidence', () => {
  const r = normalizeSchedule(
    'We are currently experiencing a system issue affecting legacy applications that use Oracle databases.',
    '2025-02-24',
  );
  assert.equal(r.primary, null);
  assert.equal(r.confidence, 0);
});

test('formatDuration', () => {
  assert.equal(formatDuration(30), '30 min');
  assert.equal(formatDuration(120), '2 hr');
  assert.equal(formatDuration(630), '10 hr 30 min');
});

/**
 * shortDate split an ISO string on "-" and read the third piece as the day.
 * That works for "2026-07-28" and breaks for "2026-07-28T09:14:00", where the
 * day becomes Number("28T09:14:00") — NaN. The inbox carries timestamps, so
 * every row in it read "Aug NaN".
 */
test('formats a plain date', () => {
  assert.equal(shortDate('2026-07-28', new Date('2026-01-01')), 'Jul 28, 2026');
});

test('formats a full timestamp without producing NaN', () => {
  const out = shortDate('2026-07-28T09:14:00', new Date('2026-01-01'));
  assert.ok(!out.includes('NaN'), `got ${out}`);
  assert.equal(out, 'Jul 28, 2026');
});

test('drops the year for dates in the current year', () => {
  assert.equal(shortDate('2026-07-28T09:14:00', new Date('2026-05-05')), 'Jul 28');
});

test('an unparseable date says so rather than rendering NaN', () => {
  for (const bad of ['', 'not a date', '2026', '2026-13-99']) {
    const out = shortDate(bad, new Date('2026-01-01'));
    assert.ok(!out.includes('NaN') && !out.includes('undefined'), `${bad} gave ${out}`);
  }
});
