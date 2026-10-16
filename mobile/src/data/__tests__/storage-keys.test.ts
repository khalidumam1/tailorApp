import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessConfigurationCacheKey } from '../storage-keys';

test('configuration cache keys satisfy SecureStore validation for arbitrary business IDs', () => {
  for (const id of ['550e8400-e29b-41d4-a716-446655440000', 'business:one', 'shop/one', 'shop one', 'دکان', '🧵', '']) {
    const key = businessConfigurationCacheKey(id);
    assert.match(key, /^[a-zA-Z0-9._-]+$/);
    assert.equal(key, businessConfigurationCacheKey(id));
  }
});

test('configuration cache keys keep different businesses isolated', () => {
  const ids = ['shop:one', 'shop/one', 'shop_one', 'shop-one', 'shop.one', 'shop one', 'SHOP:one'];
  assert.equal(new Set(ids.map(businessConfigurationCacheKey)).size, ids.length);
});
