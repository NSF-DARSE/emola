/**
 * Stage 1 — is this email an abnormal event that needs relaying?
 *
 * The expensive mistake is a false positive: pulling a routine ticket into the
 * relay path wastes a reviewer's attention and, at 600 emails a week, would
 * bury the 7 that matter. So the corpus test below asserts zero false alarms
 * across the whole export, not merely a good hit rate.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { triageSubject } from '../src/lib/triage';

const corpus: Array<{ subject: string; category: string; is_abnormal_event: boolean }> =
  JSON.parse(fs.readFileSync('data/model/triage.json', 'utf8'));

test('recognises the standard DTI notification', () => {
  const got = triageSubject('Abnormal Events Notification');
  assert.equal(got.abnormal, true);
});

test('recognises a scheduled outage announcement', () => {
  const got = triageSubject('Scheduled IRAS Outage - Sunday, August 2, 2026');
  assert.equal(got.abnormal, true);
});

test('does not relay an incident ticket, even when it reports an outage', () => {
  // Jay: "If they were incident tickets reporting an outage, they are not to
  // be relayed." The ticket number is what distinguishes them.
  const got = triageSubject('INC0618469 has been opened for Department of Finance - IRAS outage');
  assert.equal(got.abnormal, false);
  assert.match(got.reason, /incident ticket/i);
});

test('ignores an update to an incident ticket', () => {
  assert.equal(triageSubject('Update - Incident INC0612088 - DOF').abnormal, false);
});

test('finds every abnormal event in the real export', () => {
  const missed = corpus.filter((r) => r.is_abnormal_event && !triageSubject(r.subject).abnormal);
  assert.deepEqual(missed.map((m) => m.subject), [], 'these tagged abnormal events were missed');
});

test('raises no false alarms across all 603 real subjects', () => {
  const false_alarms = corpus.filter((r) => !r.is_abnormal_event && triageSubject(r.subject).abnormal);
  assert.deepEqual(
    false_alarms.map((f) => `[${f.category}] ${f.subject}`),
    [],
    'these routine emails were wrongly flagged',
  );
});

test('explains itself, because a reviewer has to trust the filter', () => {
  assert.ok(triageSubject('Abnormal Events Notification').reason.length > 0);
  assert.ok(triageSubject('Toner cartridge order').reason.length > 0);
});
