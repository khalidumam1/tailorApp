import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderNotificationTemplate,
  validateNotificationTemplateBody,
  type NotificationTemplateVariable,
} from '../src/domain/notification-templates.js';

const variables: Record<NotificationTemplateVariable, string> = {
  'business.name': 'Furniture Works',
  'business.phone': '',
  'customer.name': 'Ayesha',
  'customer.phone': '+923001234567',
  'order.number': 'FUR-000001',
  'order.total': 'PKR 25000.00',
  'order.paid': 'PKR 5000.00',
  'order.balance': 'PKR 20000.00',
  'order.status': 'Production',
  'order.readyDate': 'Oct 10, 2026',
  'item.name': 'Walnut table',
};

test('configured notification templates render generic variables and preserve parameter order', () => {
  const rendered = renderNotificationTemplate(
    '{{customer.name}}, {{item.name}} is order {{order.number}} for {{order.total}}',
    variables,
  );

  assert.equal(rendered.body, 'Ayesha, Walnut table is order FUR-000001 for PKR 25000.00');
  assert.deepEqual(rendered.parameters, ['Ayesha', 'Walnut table', 'FUR-000001', 'PKR 25000.00']);
});

test('notification template validation rejects unknown and malformed variable expressions', () => {
  assert.throws(() => validateNotificationTemplateBody('Hello {{customer.email}}'), /Unsupported/);
  assert.throws(() => validateNotificationTemplateBody('Hello {{customer.name'), /invalid variable/);
});
