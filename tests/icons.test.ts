/**
 * The icon is decoration, but a wrong one is a small lie — a padlock beside a
 * printer outage reads as a security incident.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { iconKeyForSystem } from '../src/lib/poster';

test('matches systems to something recognisable', () => {
  assert.equal(iconKeyForSystem('FirstMap'), 'map');
  assert.equal(iconKeyForSystem('SFTP Server'), 'file');
  assert.equal(iconKeyForSystem('CI/CD servers'), 'gear');
  assert.equal(iconKeyForSystem('IRAS Portal'), 'desktop');
  assert.equal(iconKeyForSystem('Citrix gateway'), 'lock');
  assert.equal(iconKeyForSystem('VPN'), 'vpn');
});

test('anything unrecognised is a server, which is usually true', () => {
  assert.equal(iconKeyForSystem('Enterprise ProWatch mainframe thing'), 'lock');
  assert.equal(iconKeyForSystem('Something nobody named'), 'server');
});

test('the more specific rule wins over the general one', () => {
  // "Linux production servers" contains neither map nor file; it must not be
  // caught by the loose application rule before falling through to server.
  assert.equal(iconKeyForSystem('Linux production servers'), 'server');
});
