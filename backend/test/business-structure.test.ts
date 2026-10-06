import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError } from '../src/errors.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://localhost:5432/tailor_test';
process.env.ACCESS_TOKEN_SECRET = 'test-only-secret-that-is-long-enough-to-pass';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.WHATSAPP_ENABLED = 'false';
const { businessStructureSchema, validateBusinessStructure } = await import('../src/routes/business-structure.routes.js');

const validStructure: Parameters<typeof validateBusinessStructure>[0] = {
  version: 2,
  templateVersion: 3,
  fields: [{
    module: 'customers',
    screen: 'customer',
    key: 'membership',
    label: 'Membership',
    type: 'DROPDOWN',
    required: true,
    options: ['standard', 'premium'],
    sortOrder: 0,
  }],
  stages: [
    { key: 'INTAKE', label: 'Intake', sortOrder: 0, isInitial: true, isTerminal: false, actions: [] },
    { key: 'DONE', label: 'Done', sortOrder: 1, isInitial: false, isTerminal: true, actions: [] },
  ],
  transitions: [{ from: 'INTAKE', to: 'DONE', allowedRoleKeys: [], actions: [] }],
};

test('accepts tenant custom fields and a complete workflow configuration', () => {
  assert.doesNotThrow(() => validateBusinessStructure(validStructure));
});

test('accepts persisted uppercase workflow keys and notification actions', () => {
  const configuration = {
    ...validStructure,
    stages: [
      { ...validStructure.stages[0]!, key: 'NEW', actions: [] },
      { ...validStructure.stages[1]!, key: 'READY_FOR_PICKUP', actions: ['ORDER_READY'] },
    ],
    transitions: [{
      from: 'NEW',
      to: 'READY_FOR_PICKUP',
      allowedRoleKeys: [],
      actions: ['ORDER_READY'],
    }],
  };

  assert.doesNotThrow(() => businessStructureSchema.parse(configuration));
});

test('rejects duplicate keys, stage ordering, and invalid transitions', () => {
  assert.throws(
    () => validateBusinessStructure({ ...validStructure, fields: [...validStructure.fields, validStructure.fields[0]] }),
    (error: unknown) => error instanceof HttpError && error.code === 'DUPLICATE_BUSINESS_CONFIGURATION_KEY',
  );
  assert.throws(
    () => validateBusinessStructure({
      ...validStructure,
      stages: validStructure.stages.map((stage) => ({ ...stage, sortOrder: 0 })),
    }),
    (error: unknown) => error instanceof HttpError && error.code === 'DUPLICATE_BUSINESS_CONFIGURATION_KEY',
  );
  assert.throws(
    () => validateBusinessStructure({
      ...validStructure,
      transitions: [...validStructure.transitions, { from: 'DONE', to: 'INTAKE', allowedRoleKeys: [], actions: [] }],
    }),
    (error: unknown) => error instanceof HttpError && error.code === 'INVALID_BUSINESS_WORKFLOW_TRANSITION',
  );
});

test('rejects malformed dropdown options and invalid validation patterns', () => {
  assert.throws(
    () => validateBusinessStructure({
      ...validStructure,
      fields: [{ ...validStructure.fields[0], options: ['standard', 'standard'] }],
    }),
    (error: unknown) => error instanceof HttpError && error.code === 'INVALID_BUSINESS_FIELD_OPTIONS',
  );
  assert.throws(
    () => validateBusinessStructure({
      ...validStructure,
      fields: [{ ...validStructure.fields[0], validation: { pattern: '[' } }],
    }),
    (error: unknown) => error instanceof HttpError && error.code === 'INVALID_BUSINESS_FIELD_VALIDATION',
  );
  assert.throws(
    () => validateBusinessStructure({
      ...validStructure,
      fields: [{ ...validStructure.fields[0], validation: { minLength: 4, maxLength: 2 } }],
    }),
    (error: unknown) => error instanceof HttpError && error.code === 'INVALID_BUSINESS_FIELD_VALIDATION',
  );
});

test('rejects invalid visibility rules and disconnected workflow stages', () => {
  assert.throws(
    () => validateBusinessStructure({
      ...validStructure,
      fields: [{ ...validStructure.fields[0], visibility: { itemTypes: 'chairs' } }],
    }),
    (error: unknown) => error instanceof HttpError && error.code === 'INVALID_BUSINESS_FIELD_VISIBILITY',
  );
  assert.throws(
    () => validateBusinessStructure({
      ...validStructure,
      stages: [
        ...validStructure.stages,
        { key: 'ORPHAN', label: 'Orphan', sortOrder: 2, isInitial: false, isTerminal: true, actions: [] },
      ],
    }),
    (error: unknown) => error instanceof HttpError && error.code === 'INVALID_BUSINESS_WORKFLOW_GRAPH',
  );
});
