import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError } from '../src/errors.js';
import type { TemplateInput } from '../src/routes/template.routes.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://localhost:5432/tailor_test';
process.env.ACCESS_TOKEN_SECRET = 'test-only-secret-that-is-long-enough-to-pass';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.WHATSAPP_ENABLED = 'false';
const { validateTemplate, buildTemplateRevisionSnapshot } = await import('../src/routes/template.routes.js');

const genericTemplate: TemplateInput = {
  key: 'auto-workshop',
  name: 'Auto Workshop',
  category: 'SERVICE',
  terminology: { customer: 'Customer', item: 'Vehicle', order: 'Job' },
  enabledModules: ['customers', 'orders', 'payments'],
  itemTypes: [{ key: 'vehicle', label: 'Vehicle' }],
  paymentMethods: ['CASH'],
  dashboardWidgets: ['newOrders'],
  fields: [{
    module: 'orders',
    screen: 'job',
    key: 'vehicle',
    label: 'Vehicle',
    type: 'REFERENCE',
    required: true,
    sortOrder: 0,
  }],
  stages: [
    { key: 'INSPECTION', label: 'Inspection', sortOrder: 0, isInitial: true, isTerminal: false, actions: [] },
    { key: 'REPAIR', label: 'Repair', sortOrder: 1, isInitial: false, isTerminal: false, actions: [] },
    { key: 'COMPLETED', label: 'Completed', sortOrder: 2, isInitial: false, isTerminal: true, actions: [] },
  ],
  transitions: [
    { from: 'INSPECTION', to: 'REPAIR', allowedRoleKeys: [], actions: [] },
    { from: 'REPAIR', to: 'COMPLETED', allowedRoleKeys: [], actions: [] },
  ],
};

test('accepts configurable business fields and a connected workflow', () => {
  assert.doesNotThrow(() => validateTemplate(genericTemplate));
});

test('captures complete versioned template content in a revision snapshot', () => {
  const snapshot = buildTemplateRevisionSnapshot(genericTemplate, 7, true) as Record<string, unknown>;
  assert.equal(snapshot.version, 7);
  assert.equal(snapshot.key, genericTemplate.key);
  assert.deepEqual(snapshot.itemTypes, genericTemplate.itemTypes);
  assert.deepEqual(snapshot.fields, genericTemplate.fields);
  assert.deepEqual(snapshot.stages, genericTemplate.stages);
  assert.deepEqual(snapshot.transitions, genericTemplate.transitions);
});

test('accepts Tailor, Furniture, and Auto workflows through the same template validator', () => {
  const configurations: Array<{ key: string; item: string; fields: TemplateInput['fields']; stages: string[] }> = [
    {
      key: 'tailor',
      item: 'Garment',
      fields: [{ ...genericTemplate.fields[0], key: 'garment_name', label: 'Garment', type: 'TEXT' }],
      stages: ['New', 'Measurement', 'Cutting', 'Stitching', 'Fitting', 'Ready', 'Completed'],
    },
    {
      key: 'furniture',
      item: 'Furniture Item',
      fields: [
        { ...genericTemplate.fields[0], key: 'dimensions', label: 'Dimensions', type: 'MEASUREMENT' },
        { ...genericTemplate.fields[0], key: 'material', label: 'Material', type: 'DROPDOWN', required: false, sortOrder: 1 },
      ],
      stages: ['New', 'Design', 'Material Confirmation', 'Production', 'Finishing', 'Ready', 'Completed'],
    },
    {
      key: 'auto-workshop',
      item: 'Vehicle',
      fields: [{ ...genericTemplate.fields[0], key: 'vehicle', label: 'Vehicle', type: 'REFERENCE' }],
      stages: ['Inspection', 'Estimate', 'Approved', 'Repair', 'Quality Check', 'Ready', 'Completed'],
    },
  ];
  for (const configuration of configurations) {
    const stages = configuration.stages.map((label, sortOrder) => ({
      key: label.toUpperCase().replaceAll(' ', '_'),
      label,
      sortOrder,
      isInitial: sortOrder === 0,
      isTerminal: sortOrder === configuration.stages.length - 1,
      actions: [],
    }));
    const transitions = stages.slice(0, -1).map((stage, index) => ({
      from: stage.key,
      to: stages[index + 1].key,
      allowedRoleKeys: [],
      actions: [],
    }));
    validateTemplate({
      ...genericTemplate,
      key: configuration.key,
      name: configuration.key,
      terminology: { customer: 'Customer', item: configuration.item, order: 'Order' },
      itemTypes: [{ key: configuration.key.replaceAll('-', '_'), label: configuration.item }],
      fields: configuration.fields,
      stages,
      transitions,
    });
  }
});

test('rejects custom fields assigned to disabled modules', () => {
  assert.throws(
    () => validateTemplate({ ...genericTemplate, enabledModules: ['customers'] }),
    (error: unknown) => error instanceof HttpError && error.code === 'INVALID_TEMPLATE_FIELD_MODULE',
  );
});

test('rejects transitions from terminal stages', () => {
  assert.throws(
    () => validateTemplate({
      ...genericTemplate,
      transitions: [...genericTemplate.transitions, {
        from: 'COMPLETED',
        to: 'INSPECTION',
        allowedRoleKeys: [],
        actions: [],
      }],
    }),
    (error: unknown) => error instanceof HttpError && error.code === 'INVALID_TEMPLATE_TRANSITION',
  );
});
