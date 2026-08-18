/**
 * Embedding is the one place the classifier touches the network, so it is the
 * one place a host name could leave the building. The payload is built by a
 * pure function precisely so this can be asserted without a network call.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildEmbeddingPayload } from '../src/lib/model/embed';

const NOTICE = `Scheduled maintenance on dof-iras-prd-04 starting 22:00.
Contact jay.harter@delaware.gov or 302-555-0117. Console at 10.14.22.9.
See https://dti.delaware.gov/status for updates.`;

test('sends no host name, IP, email address or phone number', () => {
  const { inputText } = buildEmbeddingPayload(NOTICE);
  assert.doesNotMatch(inputText, /dof-iras-prd-04/i);
  assert.doesNotMatch(inputText, /10\.14\.22\.9/);
  assert.doesNotMatch(inputText, /@delaware\.gov/i);
  assert.doesNotMatch(inputText, /302-555-0117/);
});

test('replaces them with placeholders rather than deleting them', () => {
  const { inputText } = buildEmbeddingPayload(NOTICE);
  assert.match(inputText, /\[HOST_\d+\]/);
  assert.match(inputText, /\[IP_\d+\]/);
  assert.match(inputText, /\[EMAIL_\d+\]/);
});

test('keeps the words that carry the classification', () => {
  const { inputText } = buildEmbeddingPayload(NOTICE);
  assert.match(inputText, /Scheduled maintenance/);
});

test('the same host always becomes the same placeholder within one notice', () => {
  const { inputText } = buildEmbeddingPayload(
    'dof-iras-prd-04 will reboot; dof-iras-prd-04 returns at 23:00.',
  );
  const tokens = inputText.match(/\[HOST_\d+\]/g) ?? [];
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0], tokens[1]);
});

test('asks Titan for the 1024 dimensions the model was trained on', () => {
  const payload = buildEmbeddingPayload(NOTICE);
  assert.equal(payload.dimensions, 1024);
});

test('refuses to build a payload for text that is only sensitive data', () => {
  const { inputText } = buildEmbeddingPayload('10.14.22.9');
  assert.doesNotMatch(inputText, /10\.14\.22\.9/);
});
