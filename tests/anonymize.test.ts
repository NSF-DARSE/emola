import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { anonymize, assertNoSensitiveData, restore } from '../src/lib/anonymize';

test('replaces an IP address with a token', () => {
  const { text } = anonymize('Host is at 10.42.18.211 today.');
  assert.ok(!text.includes('10.42.18.211'), 'raw IP must not survive');
  assert.match(text, /\[IP_1\]/);
});

test('the same value always gets the same token within one document', () => {
  const { text } = anonymize('10.42.18.211 talks to 10.42.18.211 and 10.42.18.212');
  assert.equal(text.match(/\[IP_1\]/g)?.length, 2);
  assert.match(text, /\[IP_2\]/);
});

test('different value kinds get their own token namespaces', () => {
  const { text } = anonymize(
    'Host wpdc-ctx-prd-04 at 10.42.18.211, contact someone@delaware.gov',
  );
  assert.match(text, /\[HOST_1\]/);
  assert.match(text, /\[IP_1\]/);
  assert.match(text, /\[EMAIL_1\]/);
  assert.ok(!text.includes('wpdc-ctx-prd-04'));
  assert.ok(!text.includes('someone@delaware.gov'));
});

test('round trip restores the original text exactly', () => {
  const original =
    'Hosts wpdc-ctx-prd-04 and wpdc-ctx-prd-05 (10.42.18.211, 10.42.18.212) are isolated. ' +
    'Contact ExampleEmail@delaware.gov or 302-739-9560.';
  const { text, mapping } = anonymize(original);
  assert.equal(restore(text, mapping), original);
});

test('restores tokens that come back inside model-written prose', () => {
  const { mapping } = anonymize('Host wpdc-ctx-prd-04 at 10.42.18.211 was isolated.');
  const modelOutput = 'The affected host [HOST_1] ([IP_1]) was taken offline as a precaution.';
  const restored = restore(modelOutput, mapping);
  assert.match(restored, /wpdc-ctx-prd-04/);
  assert.match(restored, /10\.42\.18\.211/);
  assert.ok(!restored.includes('[HOST_1]'));
});

test('restore leaves unknown tokens untouched rather than inventing values', () => {
  const { mapping } = anonymize('nothing sensitive here');
  assert.equal(restore('a [HOST_9] appeared', mapping), 'a [HOST_9] appeared');
});

test('phone numbers are tokenised', () => {
  const { text } = anonymize('Call the Service Desk at 302-739-9560.');
  assert.ok(!text.includes('302-739-9560'));
  assert.match(text, /\[PHONE_1\]/);
});

// --- the seatbelt --------------------------------------------------------

test('assertNoSensitiveData throws when an IP survives', () => {
  assert.throws(() => assertNoSensitiveData('leaking 10.0.0.1 out'), /IP/i);
});

test('assertNoSensitiveData throws when a hostname survives', () => {
  assert.throws(() => assertNoSensitiveData('leaking wpdc-ctx-prd-04 out'), /host/i);
});

test('assertNoSensitiveData throws when an email survives', () => {
  assert.throws(() => assertNoSensitiveData('mail me at a@b.gov'), /email/i);
});

test('assertNoSensitiveData accepts fully tokenised text', () => {
  assert.doesNotThrow(() => assertNoSensitiveData('Host [HOST_1] at [IP_1], mail [EMAIL_1]'));
});

// --- batches -------------------------------------------------------------

test('a batch shares one mapping so the same host keeps one token across emails', async () => {
  const { anonymizeMany } = await import('../src/lib/anonymize');
  const { texts } = anonymizeMany([
    'Host wpdc-ctx-prd-04 was isolated.',
    'Follow-up: wpdc-ctx-prd-04 is back online.',
  ]);
  assert.match(texts[0], /\[HOST_1\]/);
  assert.match(texts[1], /\[HOST_1\]/, 'same host must reuse the same token in email 2');
});

test('a batch gives different hosts different tokens', async () => {
  const { anonymizeMany } = await import('../src/lib/anonymize');
  const { texts } = anonymizeMany([
    'Host wpdc-ctx-prd-04 down.',
    'Host wpdc-ctx-prd-05 down.',
  ]);
  assert.match(texts[0], /\[HOST_1\]/);
  assert.match(texts[1], /\[HOST_2\]/);
});

test('a batch round trips every message', async () => {
  const { anonymizeMany } = await import('../src/lib/anonymize');
  const originals = [
    'Host wpdc-ctx-prd-04 at 10.42.18.211.',
    'Contact ExampleEmail@delaware.gov or 302-739-9560.',
    'Nothing sensitive in this one.',
  ];
  const { texts, mapping } = anonymizeMany(originals);
  texts.forEach((t, i) => assert.equal(restore(t, mapping), originals[i]));
});

test('every message in a batch is leak-free', async () => {
  const { anonymizeMany } = await import('../src/lib/anonymize');
  const events = JSON.parse(fs.readFileSync('data/events.json', 'utf8')) as Array<{ body: string }>;
  const { texts } = anonymizeMany(events.map((e) => e.body));
  for (const t of texts) assert.doesNotThrow(() => assertNoSensitiveData(t));
});

// --- the one that actually protects the State ----------------------------

test('no notice in the real corpus leaks anything on the way out', () => {
  const events = JSON.parse(fs.readFileSync('data/events.json', 'utf8')) as Array<{
    id: string;
    body: string;
  }>;

  assert.ok(events.length >= 30, 'corpus should be loaded');

  for (const e of events) {
    const { text, mapping } = anonymize(e.body);
    // The seatbelt must pass for every single notice.
    assert.doesNotThrow(() => assertNoSensitiveData(text), `${e.id} leaked`);
    // And the transformation must be lossless.
    assert.equal(restore(text, mapping), e.body, `${e.id} did not round trip`);
  }
});
