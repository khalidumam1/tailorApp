export const notificationTemplateVariables = [
  'business.name',
  'business.phone',
  'customer.name',
  'customer.phone',
  'order.number',
  'order.total',
  'order.paid',
  'order.balance',
  'order.status',
  'order.readyDate',
  'item.name',
] as const;

export type NotificationTemplateVariable = typeof notificationTemplateVariables[number];

export type NotificationTemplate = {
  enabled: boolean;
  body: string;
  providerTemplateName?: string;
  language?: string;
};

export type RenderedNotificationTemplate = {
  body: string;
  parameters: string[];
};

const supportedVariables = new Set<string>(notificationTemplateVariables);

export function validateNotificationTemplateBody(body: string): void {
  const matches = [...body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
  const unknown = matches.map((match) => match[1]!.trim()).find((key) => !supportedVariables.has(key));
  if (unknown) throw new Error(`Unsupported notification template variable: ${unknown}`);
  const remainder = body.replace(/\{\{\s*[^{}]+\s*\}\}/g, '');
  if (remainder.includes('{{') || remainder.includes('}}')) {
    throw new Error('Notification template contains an invalid variable expression');
  }
}

export function renderNotificationTemplate(
  body: string,
  values: Record<NotificationTemplateVariable, string>,
): RenderedNotificationTemplate {
  validateNotificationTemplateBody(body);
  const matches = [...body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
  const consumed = matches.map((match) => match[1]!.trim());
  const parameters = consumed.map((key) => values[key as NotificationTemplateVariable]);
  let index = 0;
  const renderedBody = body.replace(/\{\{\s*[^{}]+\s*\}\}/g, () => parameters[index++] ?? '');
  return { body: renderedBody, parameters };
}

export function isNotificationTemplate(value: unknown): value is NotificationTemplate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const template = value as Record<string, unknown>;
  return typeof template.enabled === 'boolean'
    && typeof template.body === 'string'
    && (template.providerTemplateName === undefined
      || (typeof template.providerTemplateName === 'string' && /^[a-z0-9_]{1,128}$/.test(template.providerTemplateName)))
    && (template.language === undefined
      || (typeof template.language === 'string' && /^[a-z]{2}(?:_[A-Z]{2})?$/.test(template.language)));
}

export function isNotificationTemplateMap(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
