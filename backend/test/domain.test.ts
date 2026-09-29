import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateNetPaid, calculateOutstanding } from '../src/domain/finance.js';
import { isAllowedOrderTransition } from '../src/domain/orders.js';

test('financial balance arithmetic uses decimal values including reversals', () => {
  const ledger = [
    { kind: 'PAYMENT' as const, amount: '0.10' },
    { kind: 'PAYMENT' as const, amount: '0.20' },
    { kind: 'REVERSAL' as const, amount: '0.10' },
  ];
  assert.equal(calculateNetPaid(ledger).toFixed(2), '0.20');
  assert.equal(calculateOutstanding('100.00', ledger).toFixed(2), '99.80');
});

test('workflow transitions allow only the next stage or cancellation before terminal states', () => {
  assert.equal(isAllowedOrderTransition('NEW', 'MEASUREMENT_CONFIRMED'), true);
  assert.equal(isAllowedOrderTransition('STITCHING', 'READY_FOR_PICKUP'), false);
  assert.equal(isAllowedOrderTransition('READY_FOR_PICKUP', 'COLLECTED'), true);
  assert.equal(isAllowedOrderTransition('COLLECTED', 'CANCELLED'), false);
  assert.equal(isAllowedOrderTransition('CANCELLED', 'NEW'), false);
});
