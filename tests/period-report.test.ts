import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { assertNoSensitiveData } from '../src/lib/anonymize';
import { classify, extract } from '../src/lib/classifier';
import { buildRequest, computeStats, parseResponse, periodLabel } from '../src/lib/llm/period-report';
import { scanForSensitiveContent } from '../src/lib/redaction';
import { routeNotification } from '../src/lib/routing';
import type { NotificationRecord } from '../src/lib/types';

const EVENTS = JSON.parse(fs.readFileSync('data/events.json', 'utf8')) as Array<{
  id: string;
  body: string;
  received_at: string;
}>;

function make(e: { id: string; body: string; received_at: string }): NotificationRecord {
  const model = classify(e.body);
  const extracted = extract(e.body, e.received_at);
  const safety = scanForSensitiveContent(e.body);
  const routing = routeNotification(model, extracted, safety);
  return {
    id: e.id,
    receivedAt: e.received_at,
    body: e.body,
    synthetic: false,
    syntheticReason: null,
    goldPrimary: null,
    goldSecondary: [],
    goldStatus: null,
    holdout: false,
    model,
    extracted,
    safety,
    route: routing.route,
    routeReasons: routing.reasons,
    reviewState: 'pending',
    threadParentId: null,
  };
}

const ALL = EVENTS.map(make);

test('a whole-corpus batch produces a leak-free payload', () => {
  const { userText } = buildRequest(ALL);
  assert.doesNotThrow(() => assertNoSensitiveData(userText));
  assert.ok(!userText.includes('wpdc-ctx-prd-04'));
  assert.ok(!userText.includes('10.42.18.211'));
});

test('the payload carries every selected notice', () => {
  const { userText } = buildRequest(ALL);
  assert.match(userText, new RegExp(`Notice ${ALL.length} of ${ALL.length}`));
});

test('one shared mapping means a repeated host keeps one token across notices', () => {
  const withHosts = ALL.filter((n) => /wpdc-ctx-prd/.test(n.body));
  assert.ok(withHosts.length >= 1);
  const { userText } = buildRequest(ALL);
  // SYN-001 mentions two hosts; both tokens must appear exactly once each per mention.
  assert.match(userText, /\[HOST_1\]/);
});

test('refuses an empty selection', () => {
  assert.throws(() => buildRequest([]), /at least one/i);
});

test('stats count categories, routing and production exposure', () => {
  const stats = computeStats(ALL);
  assert.equal(stats.total, ALL.length);
  assert.equal(stats.autoSent + stats.heldForReview, ALL.length);
  assert.ok(stats.byCategory.Maintenance > 0);
  assert.ok(stats.productionTouching > 0);
});

test('period label spans first to last received date', () => {
  const label = periodLabel(ALL);
  assert.match(label, /\d{4}/);
  assert.match(label, /–/);
});

test('a single-day selection reads as one date, not a range', () => {
  const one = [ALL[0]];
  assert.ok(!periodLabel(one).includes('–'));
});

test('the response is rehydrated to real values', () => {
  const subset = ALL.filter((n) => /wpdc-ctx-prd/.test(n.body));
  const { mapping } = buildRequest(subset);
  const payload = parseResponse(
    {
      headline: 'A month of work',
      riskLevel: 'Elevated',
      summary: 'Host [HOST_1] was isolated.',
      operationalRisk: 'Traffic to [IP_1] was blocked.',
      themes: ['Repeated work on [HOST_1]'],
      notableEvents: ['[HOST_1] isolation'],
      decisions: ['Review [HOST_1] ownership'],
    },
    subset,
    mapping,
  );
  assert.match(payload.summary, /wpdc-ctx-prd-04/);
  assert.match(payload.themes[0], /wpdc-ctx-prd-04/);
  assert.ok(!JSON.stringify(payload).includes('[HOST_1]'));
  assert.equal(payload.kind, 'period_report');
  assert.deepEqual(payload.noticeIds, subset.map((n) => n.id));
});

test('an invalid riskLevel is rejected', () => {
  assert.throws(
    () =>
      parseResponse(
        { headline: 'h', riskLevel: 'Nuclear', summary: 's', operationalRisk: 'r', themes: [], notableEvents: [], decisions: [] },
        ALL,
        { values: {} },
      ),
    /riskLevel/i,
  );
});
