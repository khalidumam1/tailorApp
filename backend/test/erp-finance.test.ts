import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertJournalBalanced,
  inventoryValue,
  minorUnitsToMoney,
  moneyToMinorUnits,
  weightedAverageUnitCost,
} from '../src/domain/erp-finance.js';

test('money is parsed and formatted as exact minor units', () => {
  assert.equal(moneyToMinorUnits('125.40'), 12540n);
  assert.equal(moneyToMinorUnits('0.7'), 70n);
  assert.equal(minorUnitsToMoney(-1n), '-0.01');
  assert.throws(() => moneyToMinorUnits('1.001'), /at most 2 decimal places/);
  assert.throws(() => moneyToMinorUnits('1e3'), /plain decimal/);
});

test('journal validation rejects imbalances and permits split lines', () => {
  assertJournalBalanced([
    { debit: '12.50', credit: '0.00' },
    { debit: '7.50', credit: '0.00' },
    { debit: '0.00', credit: '20.00' },
  ]);
  assert.throws(() => assertJournalBalanced([
    { debit: '10.00', credit: '0.00' },
    { debit: '0.00', credit: '9.99' },
  ]), /out of balance by 0.01/);
  assert.throws(() => assertJournalBalanced([
    { debit: '1.00', credit: '1.00' },
    { debit: '0.00', credit: '0.00' },
  ]), /one non-negative debit or credit/);
});

test('inventory values and weighted-average costs use fixed-point rounding', () => {
  assert.equal(inventoryValue('3.000000', '12.3456'), '37.04');
  assert.equal(weightedAverageUnitCost({
    quantityBefore: '3.000000',
    averageCostBefore: '10.0000',
    quantityReceived: '1.000000',
    receivedUnitCost: '14.0000',
  }), '11.0000');
  assert.equal(weightedAverageUnitCost({
    quantityBefore: '0.000000',
    averageCostBefore: '0.0000',
    quantityReceived: '2.000000',
    receivedUnitCost: '4.0001',
  }), '4.0001');
});
