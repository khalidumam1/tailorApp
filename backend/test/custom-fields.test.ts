import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError } from '../src/errors.js';
import { validateCustomFieldValues, withBuiltInOrderItemFields } from '../src/domain/custom-fields.js';

const field = (key: string, type: string, additional: Record<string, unknown> = {}) => ({
  id: `id-${key}`,
  key,
  label: key,
  type,
  required: false,
  defaultValue: null,
  validation: null,
  options: null,
  visibility: null,
  ...additional,
});

test('validates generic field types and configured options', () => {
  const definitions = [
    field('material', 'DROPDOWN', { options: ['wood', 'metal'] }),
    field('size', 'MEASUREMENT', { validation: { min: 1, max: 300 } }),
    field('delivery_date', 'DATE'),
    field('custom', 'BOOLEAN'),
    field('finishes', 'MULTI_SELECT', { options: [{ key: 'oak', label: 'Oak' }, { key: 'ash', label: 'Ash' }] }),
  ];
  const result = validateCustomFieldValues(definitions, {
    material: 'wood',
    size: '42.5',
    delivery_date: '2026-10-05',
    custom: true,
    finishes: ['oak', 'ash'],
  });
  assert.deepEqual(result.map(({ key }) => key), ['material', 'size', 'delivery_date', 'custom', 'finishes']);
  assert.throws(
    () => validateCustomFieldValues(definitions, { material: 'glass' }),
    (error: unknown) => error instanceof HttpError && error.code === 'INVALID_CUSTOM_FIELD_VALUE',
  );
});

test('enforces required fields, visibility, unknown keys, defaults, and configured validation', () => {
  const definitions = [
    field('serial', 'TEXT', { required: true, validation: { minLength: 4, pattern: '^[A-Z0-9]+$' } }),
    field('paint', 'TEXT', { visibility: { itemTypes: ['vehicle'] } }),
    field('warranty', 'NUMBER', { defaultValue: 12, validation: { min: 0, max: 60 } }),
  ];
  assert.throws(
    () => validateCustomFieldValues(definitions, {}),
    (error: unknown) => error instanceof HttpError && error.code === 'REQUIRED_CUSTOM_FIELD',
  );
  assert.throws(
    () => validateCustomFieldValues(definitions, { serial: '1234', paint: 'red' }, { itemTypeKey: 'furniture' }),
    (error: unknown) => error instanceof HttpError && error.code === 'UNKNOWN_CUSTOM_FIELD',
  );
  assert.throws(
    () => validateCustomFieldValues(definitions, { serial: 'bad' }),
    (error: unknown) => error instanceof HttpError && error.code === 'INVALID_CUSTOM_FIELD_VALUE',
  );
  const values = validateCustomFieldValues(definitions, { serial: 'AB12' });
  assert.equal(values.find((value) => value.key === 'warranty')?.value, 12);
});

test('only projects built-in order item values into configured legacy-compatible fields', () => {
  assert.deepEqual(
    withBuiltInOrderItemFields([{ key: 'material' }], { material: 'wood' }, 'Dining table', 2),
    { material: 'wood' },
  );
  assert.deepEqual(
    withBuiltInOrderItemFields([{ key: 'garment_name' }, { key: 'quantity' }], {}, 'Jacket', 3),
    { garment_name: 'Jacket', quantity: 3 },
  );
});
