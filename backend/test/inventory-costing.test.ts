import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePositiveAdjustmentCost } from '../src/domain/inventory-costing.js';

test('positive inventory adjustments reuse the existing location weighted average by default', () => {
  assert.deepEqual(resolvePositiveAdjustmentCost({ quantityBefore: '8.250000', averageCostBefore: '12.3400' }), {
    unitCost: '12.3400', requiresUnitCost: false,
  });
});

test('positive inventory adjustments accept an explicit unit-cost override', () => {
  assert.deepEqual(resolvePositiveAdjustmentCost({
    quantityBefore: '8.250000', averageCostBefore: '12.3400', requestedUnitCost: '15.1250',
  }), { unitCost: '15.1250', requiresUnitCost: false });
});

test('positive inventory adjustments require a cost when the location has no stock', () => {
  assert.deepEqual(resolvePositiveAdjustmentCost({ quantityBefore: '0.000000', averageCostBefore: '0.0000' }), {
    unitCost: '0.0000', requiresUnitCost: true,
  });
  assert.deepEqual(resolvePositiveAdjustmentCost({
    quantityBefore: '0.000000', averageCostBefore: '0.0000', requestedUnitCost: '0.0000',
  }), { unitCost: '0.0000', requiresUnitCost: false });
});
