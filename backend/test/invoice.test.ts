import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInvoice } from '../src/domain/invoice.ts';

const items = [
  { name: 'Shalwar Kameez', quantity: 2, unitPrice: '1500.00' },
  { name: 'Waistcoat', quantity: 1, unitPrice: '2500.50' },
];

test('invoice lines multiply quantity by unit price with decimal arithmetic', () => {
  const invoice = buildInvoice({ items, total: '5500.50', payments: [] });
  assert.deepEqual(invoice.lines.map((line) => line.lineTotal), ['3000.00', '2500.50']);
  assert.equal(invoice.total, '5500.50');
});

test('invoice balance is total minus net paid (payments minus reversals)', () => {
  const invoice = buildInvoice({
    items,
    total: '5500.50',
    payments: [
      { kind: 'PAYMENT', amount: '2000.00' },
      { kind: 'PAYMENT', amount: '1000.00' },
      { kind: 'REVERSAL', amount: '500.00' },
    ],
  });
  assert.equal(invoice.paid, '2500.00');
  assert.equal(invoice.balance, '3000.50');
});

test('invoice balance never goes negative and is zero when fully paid', () => {
  const paidInFull = buildInvoice({
    items,
    total: '5500.50',
    payments: [{ kind: 'PAYMENT', amount: '5500.50' }],
  });
  assert.equal(paidInFull.balance, '0.00');
  const overpaid = buildInvoice({
    items,
    total: '100.00',
    payments: [{ kind: 'PAYMENT', amount: '150.00' }],
  });
  assert.equal(overpaid.balance, '0.00');
});
