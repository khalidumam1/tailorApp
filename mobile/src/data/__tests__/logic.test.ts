/**
 * Unit tests for the pure mobile logic behind the buttons: contact links,
 * receipt text, item-type keys, list comparison, measurement diffs and ledger
 * totals. Run with `npm test --workspace @tailor/mobile`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../phone';
import { receiptMessage, telUrl, whatsappUrl } from '../messaging';
import { itemTypeKeyFrom, sameList, diffRows, parseValues } from '../format';
import { netCollected, summarizePayments, type PaymentRow } from '../ledger';

test('normalizePhone returns the 92 country-code form', () => {
  assert.equal(normalizePhone('0300-1234567'), '923001234567');
  assert.equal(normalizePhone('+92 300 1234567'), '923001234567');
  assert.equal(normalizePhone('00923001234567'), '923001234567');
  assert.equal(normalizePhone('3001234567'), '923001234567');
});

test('whatsappUrl and telUrl use the normalised number and refuse unusable numbers', () => {
  assert.equal(whatsappUrl('0300 1234567'), 'https://wa.me/923001234567');
  assert.equal(whatsappUrl('0300 1234567', 'Hi there'), 'https://wa.me/923001234567?text=Hi%20there');
  assert.equal(telUrl('0300 1234567'), 'tel:+923001234567');
  assert.equal(whatsappUrl(''), null);
  assert.equal(whatsappUrl(null), null);
  assert.equal(telUrl('12'), null);
});

test('receiptMessage lists the business, receipt number, customer and amount', () => {
  const text = receiptMessage({
    businessName: 'Ali Tailors',
    receiptLabel: 'Receipt',
    receiptNumber: 'RC-0042',
    amount: 'PKR 1,500.00',
    date: '2026-10-12',
    customerName: 'Sara',
  });
  assert.equal(text, 'Ali Tailors\nReceipt: RC-0042\nSara\nPKR 1,500.00 · 2026-10-12');
});

test('itemTypeKeyFrom produces keys the server accepts and keeps them unique', () => {
  const pattern = /^[a-z][a-z0-9_-]{0,79}$/;
  for (const label of ['Kurta Shalwar', '3 piece', '!!!', 'Shirt & Trousers', 'Waistcoat']) {
    assert.match(itemTypeKeyFrom(label, []), pattern, label);
  }
  assert.equal(itemTypeKeyFrom('Kurta Shalwar', []), 'kurta_shalwar');
  assert.equal(itemTypeKeyFrom('3 piece', []), 'type_3_piece');
  assert.equal(itemTypeKeyFrom('Shirt', ['shirt']), 'shirt_2');
  assert.equal(itemTypeKeyFrom('Shirt', ['shirt', 'shirt_2']), 'shirt_3');
});

test('sameList ignores order and detects changes', () => {
  assert.equal(sameList(['CASH', 'BANK'], ['BANK', 'CASH']), true);
  assert.equal(sameList([], []), true);
  assert.equal(sameList(['CASH'], ['CASH', 'BANK']), false);
  assert.equal(sameList(['CASH', 'BANK'], ['CASH', 'DIGITAL']), false);
});

test('parseValues reads stored measurement JSON and tolerates bad input', () => {
  assert.deepEqual(parseValues('{"chest":40,"waist":"34"}'), { chest: '40', waist: '34' });
  assert.deepEqual(parseValues('not json'), {});
  assert.deepEqual(parseValues('[1,2]'), {});
});

test('diffRows reports only changed fields against the previous revision', () => {
  const label = (key: string) => key.toUpperCase();
  const current = { values: { chest: '42', waist: '34', sleeve: '24' } };
  const previous = { values: { chest: '40', waist: '34' } };
  assert.deepEqual(diffRows(current, previous, label), [
    ['CHEST', '40', '42'],
    ['SLEEVE', '—', '24'],
  ]);
  assert.deepEqual(diffRows(current, undefined, label), []);
  assert.deepEqual(diffRows(previous, previous, label), []);
});

const row = (kind: 'PAYMENT' | 'REVERSAL', amount: number, createdAt: Date): PaymentRow => ({
  id: `${kind}-${amount}-${createdAt.getTime()}`,
  receiptNumber: 'RC',
  kind,
  method: 'CASH',
  amount,
  customerName: 'C',
  customerId: null,
  customerPhone: null,
  orderId: null,
  orderNumber: null,
  createdAt: createdAt.toISOString(),
});

test('netCollected subtracts reversals', () => {
  const now = new Date();
  assert.equal(netCollected([row('PAYMENT', 1000, now), row('REVERSAL', 250, now)]), 750);
});

test('summarizePayments splits today and this month', () => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const earlierThisMonth = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const lastMonth = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, 15);
  const rows = [
    row('PAYMENT', 500, new Date(Math.max(now.getTime() - 60_000, todayStart.getTime()))),
    row('PAYMENT', 300, earlierThisMonth),
    row('PAYMENT', 900, lastMonth),
  ];
  const summary = summarizePayments(rows);
  assert.equal(summary.count, 3);
  assert.equal(summary.collectedToday, 500);
  assert.equal(summary.collectedThisMonth, 800);
});
