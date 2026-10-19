import assert from 'node:assert/strict';
import { test } from 'node:test';
import { businessDayRange, businessMonthStart } from '../src/domain/business-time.js';

test('businessDayRange uses the tenant timezone, not a hardcoded zone', () => {
  // 2026-01-15T20:30:00Z is 2026-01-16 01:30 in Karachi (UTC+5)...
  const instant = new Date('2026-01-15T20:30:00.000Z');
  const karachi = businessDayRange('Asia/Karachi', instant);
  assert.equal(karachi.start.toISOString(), '2026-01-15T19:00:00.000Z');
  assert.equal(karachi.end.toISOString(), '2026-01-16T19:00:00.000Z');
  // ...but still 2026-01-15 15:30 in New York (UTC-5 in January).
  const new_York = businessDayRange('America/New_York', instant);
  assert.equal(new_York.start.toISOString(), '2026-01-15T05:00:00.000Z');
  assert.equal(new_York.end.toISOString(), '2026-01-16T05:00:00.000Z');
  // UTC tenant: plain UTC day.
  const utc = businessDayRange('UTC', instant);
  assert.equal(utc.start.toISOString(), '2026-01-15T00:00:00.000Z');
  assert.equal(utc.end.toISOString(), '2026-01-16T00:00:00.000Z');
});

test('businessDayRange handles a DST spring-forward day (23-hour day)', () => {
  // 2026-03-08 is the US spring-forward: local day runs 05:00Z -> next day 04:00Z.
  const range = businessDayRange('America/New_York', new Date('2026-03-08T17:00:00.000Z'));
  assert.equal(range.start.toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-03-09T04:00:00.000Z');
  assert.equal(range.end.getTime() - range.start.getTime(), 23 * 60 * 60 * 1000);
});

test('businessMonthStart returns local midnight on the first', () => {
  const instant = new Date('2026-01-15T20:30:00.000Z'); // Jan 16 in Karachi
  assert.equal(businessMonthStart('Asia/Karachi', instant).toISOString(), '2025-12-31T19:00:00.000Z');
  assert.equal(businessMonthStart('America/New_York', instant).toISOString(), '2026-01-01T05:00:00.000Z');
  assert.equal(businessMonthStart('UTC', instant).toISOString(), '2026-01-01T00:00:00.000Z');
});

test('businessDayRange rejects an invalid timezone', () => {
  assert.throws(() => businessDayRange('Not/AZone', new Date()), /Business timezone is invalid/);
});
