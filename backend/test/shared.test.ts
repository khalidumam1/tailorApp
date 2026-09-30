import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCustomerSchema,
  createPaymentSchema,
  normalizePakistanPhone,
  orderStatuses,
  syncOperationSchema,
} from '../shared/src/index.ts';

test('customer phone validation accepts common Pakistan formats and rejects letters', () => {
  for (const phone of ['03001234567', '+92 300 1234567', '+92 (21) 12345678']) {
    assert.equal(createCustomerSchema.safeParse({ name: 'Test Customer', phone }).success, true);
  }
  assert.equal(createCustomerSchema.safeParse({ name: 'Test Customer', phone: '0300abc4567' }).success, false);
});

test('payment input accepts decimal strings and rejects exponent or zero values', () => {
  assert.equal(createPaymentSchema.safeParse({ amount: '1250.50', method: 'CASH' }).success, true);
  assert.equal(createPaymentSchema.safeParse({ amount: '1e4', method: 'CASH' }).success, false);
  assert.equal(createPaymentSchema.safeParse({ amount: '0.00', method: 'CASH' }).success, false);
});

test('common local and international Pakistan phone formats normalize to the same lookup key', () => {
  assert.equal(normalizePakistanPhone('0300 1234567'), '923001234567');
  assert.equal(normalizePakistanPhone('+92 (300) 123-4567'), '923001234567');
  assert.equal(normalizePakistanPhone('0092 300 1234567'), '923001234567');
});

test('order workflow includes terminal collected and cancelled statuses', () => {
  assert.deepEqual(orderStatuses.slice(-2), ['COLLECTED', 'CANCELLED']);
});

test('offline sync operations require UUID operation and entity identifiers', () => {
  const validOperation = {
    clientOperationId: '9ab629c8-5424-40f9-a29d-c7f797563102',
    entityType: 'customer',
    entityId: 'c380ec0b-50a0-46cc-8d6e-38cc5930d529',
    payload: { action: 'customer.create' },
  };
  assert.equal(syncOperationSchema.safeParse(validOperation).success, true);
  assert.equal(syncOperationSchema.safeParse({ ...validOperation, clientOperationId: 'duplicate' }).success, false);
});
