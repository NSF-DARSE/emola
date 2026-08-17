import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { assertNoSensitiveData } from '../src/lib/anonymize';
import { buildRequest, parseResponse } from '../src/lib/llm/exec-summary-llm';
import { classify, extract } from '../src/lib/classifier';
import { scanForSensitiveContent } from '../src/lib/redaction';
import { routeNotification } from '../src/lib/routing';
import type { NotificationRecord } from '../src/lib/types';

function makeNotification(id: string, body: string, receivedAt = '2026-05-04'): NotificationRecord {
  const model = classify(body);
  const extracted = extract(body, receivedAt);
  const safety = scanForSensitiveContent(body);
  const routing = routeNotification(model, extracted, safety);
  return {
    id,
    receivedAt,
    body,
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

const SENSITIVE_BODY =
  'SECURITY ADVISORY: hosts wpdc-ctx-prd-04 and wpdc-ctx-prd-05 (10.42.18.211, 10.42.18.212) ' +
  'have been isolated. Contact ExampleEmail@delaware.gov or 302-739-9560.';

test('the outbound payload contains no real host, IP, email or phone', () => {
  const { userText } = buildRequest(makeNotification('SYN-001', SENSITIVE_BODY));
  assert.doesNotThrow(() => assertNoSensitiveData(userText));
  assert.ok(!userText.includes('wpdc-ctx-prd-04'));
  assert.ok(!userText.includes('10.42.18.211'));
  assert.ok(!userText.includes('ExampleEmail@delaware.gov'));
});

test('the outbound payload keeps the tokens so the model can be specific', () => {
  const { userText } = buildRequest(makeNotification('SYN-001', SENSITIVE_BODY));
  assert.match(userText, /\[HOST_1\]/);
  assert.match(userText, /\[IP_1\]/);
});

test('the system prompt states the tokens must be preserved verbatim', () => {
  const { system } = buildRequest(makeNotification('SYN-001', SENSITIVE_BODY));
  assert.match(system, /\[HOST_1\]|placeholder|token/i);
});

test('every notice in the corpus produces a leak-free payload', () => {
  const events = JSON.parse(fs.readFileSync('data/events.json', 'utf8')) as Array<{
    id: string;
    body: string;
    received_at: string;
  }>;
  for (const e of events) {
    const { userText } = buildRequest(makeNotification(e.id, e.body, e.received_at));
    assert.doesNotThrow(() => assertNoSensitiveData(userText), `${e.id} leaked`);
  }
});

test('the model response is rehydrated back to real values', () => {
  const n = makeNotification('SYN-001', SENSITIVE_BODY);
  const { mapping } = buildRequest(n);

  const payload = parseResponse(
    {
      headline: 'Security — isolated hosts',
      businessImpact: 'Hosts [HOST_1] and [HOST_2] were isolated.',
      operationalRisk: 'Traffic to [IP_1] was blocked.',
      riskLevel: 'Elevated',
      affectedServices: ['[HOST_1]', 'Citrix gateway'],
      decisions: ['Notify the owner of [HOST_1]'],
      window: 'Not stated',
    },
    n,
    mapping,
  );

  assert.match(payload.businessImpact, /wpdc-ctx-prd-04/);
  assert.match(payload.operationalRisk, /10\.42\.18\.211/);
  assert.equal(payload.affectedServices[0], 'wpdc-ctx-prd-04');
  assert.match(payload.decisions[0], /wpdc-ctx-prd-04/);
  assert.ok(!JSON.stringify(payload).includes('[HOST_1]'));
});

test('the rehydrated payload is a valid exec summary artifact', () => {
  const n = makeNotification('SYN-001', SENSITIVE_BODY);
  const { mapping } = buildRequest(n);
  const payload = parseResponse(
    {
      headline: 'h',
      businessImpact: 'b',
      operationalRisk: 'r',
      riskLevel: 'Low',
      affectedServices: ['s'],
      decisions: ['d'],
      window: 'w',
    },
    n,
    mapping,
  );
  assert.equal(payload.kind, 'exec_summary');
  assert.ok(payload.governanceNote.length > 0);
  assert.ok(payload.generatedAt.length > 0);
});

test('an invalid riskLevel from the model is rejected rather than passed through', () => {
  const n = makeNotification('SYN-001', SENSITIVE_BODY);
  const { mapping } = buildRequest(n);
  assert.throws(
    () =>
      parseResponse(
        {
          headline: 'h',
          businessImpact: 'b',
          operationalRisk: 'r',
          riskLevel: 'Catastrophic',
          affectedServices: [],
          decisions: [],
          window: 'w',
        },
        n,
        mapping,
      ),
    /riskLevel/i,
  );
});
