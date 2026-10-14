import assert from 'node:assert/strict';
import { test } from 'node:test';
import { removedItemTypeKeys } from '../src/domain/item-types.js';

const current = [{ key: 'furniture_item', label: 'Furniture Item' }, { key: 'repair', label: 'Repair' }];

test('unchanged types and label edits do not trigger removal checks', () => {
  assert.deepEqual(removedItemTypeKeys(current, current), []);
  const renamed = [{ key: 'repair' }, { key: 'furniture_item', label: 'Sofa' }];
  assert.deepEqual(removedItemTypeKeys(current, renamed), []);
});

test('removal and key changes check the old key', () => {
  assert.deepEqual(removedItemTypeKeys(current, [{ key: 'repair' }]), ['furniture_item']);
  assert.deepEqual(removedItemTypeKeys(current, [{ key: 'sofa' }, { key: 'repair' }]), ['furniture_item']);
});

test('adding types does not treat legacy references as removals', () => {
  assert.deepEqual(removedItemTypeKeys([{ key: 'repair' }], current), []);
  assert.deepEqual(removedItemTypeKeys([{ key: 'repair' }], [{ key: 'repair' }]), []);
});
