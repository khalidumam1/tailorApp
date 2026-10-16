/**
 * Pure request/response mapping between the mobile screens and the API.
 *
 * The API returns camelCase Prisma-shaped records; the screens were written
 * against snake_case local rows. Everything that crosses that boundary lives
 * here so it can be unit-tested without React Native.
 */
import type { LocalCatalogItem, LocalCustomer, LocalOrder } from '../local';

/** Due dates are chosen as calendar days in Pakistan time (UTC+5, no DST). */
const KARACHI_OFFSET = '+05:00';

export type RemoteOrderItem = {
  itemTypeKey?: string | null;
  itemName?: string | null;
  garmentName?: string | null;
  quantity: number;
  unitPrice: string;
  customFields?: Record<string, unknown> | null;
};

export type RemoteOrder = {
  id: string;
  orderNumber?: string | null;
  customerId: string;
  customer?: { id: string; name: string; phone?: string | null } | null;
  status: string;
  workflowStageKey?: string | null;
  promisedAt: string;
  total: string;
  version: number;
  createdAt?: string | null;
  customFields?: Record<string, unknown> | null;
  items?: RemoteOrderItem[] | null;
};

export type RemoteCustomer = {
  id: string;
  name: string;
  phone: string;
  notes?: string | null;
  version: number;
  customFields?: Record<string, unknown> | null;
};

export function mapRemoteOrder(raw: RemoteOrder): LocalOrder {
  const items = raw.items ?? [];
  const first = items[0];
  const quantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  return {
    id: raw.id,
    business_id: '',
    order_number: raw.orderNumber ?? null,
    customer_id: raw.customerId,
    customer_name: raw.customer?.name ?? '',
    garment_name: first?.garmentName ?? first?.itemName ?? '',
    item_type_key: first?.itemTypeKey ?? null,
    item_name: first?.itemName ?? null,
    quantity: quantity || 1,
    unit_price: first?.unitPrice ?? '0.00',
    promised_at: raw.promisedAt,
    status: raw.status,
    workflow_stage_key: raw.workflowStageKey ?? null,
    order_custom_fields_json: JSON.stringify(raw.customFields ?? {}),
    item_custom_fields_json: JSON.stringify(first?.customFields ?? {}),
    total: raw.total,
    version: raw.version,
    sync_state: 'synced',
    createdAt: raw.createdAt ?? null,
  };
}

export function mapRemoteCustomer(raw: RemoteCustomer): LocalCustomer {
  return {
    id: raw.id,
    business_id: '',
    name: raw.name,
    phone: raw.phone,
    notes: raw.notes ?? '',
    custom_fields_json: JSON.stringify(raw.customFields ?? {}),
    version: raw.version,
    sync_state: 'synced',
  };
}

/** Maps a `/catalog` list row. Catalog rows already use the API's field names. */
export function mapRemoteCatalogItem(raw: LocalCatalogItem): LocalCatalogItem {
  return { ...raw, customFields: raw.customFields ?? {}, syncState: 'synced' };
}

/** Converts a `YYYY-MM-DD` due date into the end of that day in Karachi, as ISO 8601. */
export function dueDateToPromisedAt(dueDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('Choose a valid due date');
  const parsed = new Date(`${dueDate}T23:59:00${KARACHI_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Choose a valid due date');
  return parsed.toISOString();
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

export type OrderFormInput = {
  customerId: string;
  itemTypeKey: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
  dueDate: string;
  notes: string;
  orderCustomFields: Record<string, unknown>;
  itemCustomFields: Record<string, unknown>;
};

/** Builds the body for `POST /api/v1/orders` (see `createOrderSchema` in @tailor/shared). */
export function buildOrderRequest(input: OrderFormInput): Record<string, unknown> {
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new Error('Quantity must be a whole number from 1 to 100');
  }
  const itemName = input.itemName.trim();
  if (!itemName) throw new Error('Enter an item name');
  return {
    customerId: input.customerId,
    promisedAt: dueDateToPromisedAt(input.dueDate),
    notes: optionalText(input.notes),
    customFields: input.orderCustomFields,
    items: [{
      itemTypeKey: input.itemTypeKey,
      itemName,
      quantity,
      unitPrice: input.unitPrice.trim(),
      customFields: input.itemCustomFields,
    }],
  };
}

export type CatalogFormInput = {
  typeKey: string;
  name: string;
  description: string;
  sku: string;
  unit: string;
  unitPrice: string;
  sortOrder: number;
  customFields: Record<string, unknown>;
};

/**
 * Builds the body for `POST /api/v1/catalog`. Blank optional fields are omitted:
 * an empty price fails the price pattern and an empty SKU collides with other
 * blank SKUs under the business-wide unique constraint.
 */
export function buildCatalogRequest(input: CatalogFormInput): Record<string, unknown> {
  const name = input.name.trim();
  if (!name) throw new Error('Enter an item name');
  return {
    typeKey: input.typeKey,
    name,
    description: optionalText(input.description),
    sku: optionalText(input.sku),
    unit: optionalText(input.unit) ?? 'unit',
    unitPrice: optionalText(input.unitPrice),
    sortOrder: input.sortOrder,
    customFields: input.customFields,
  };
}

type PlanPrices = { id: string; monthlyPrice: string; yearlyPrice: string };

/** Methods accepted by `POST /api/v1/payments/orders/:orderId` (`createPaymentSchema`). */
export const ORDER_PAYMENT_METHODS = ['CASH', 'BANK', 'DIGITAL'] as const;

/**
 * Business payment methods come from the business template and can contain values
 * the order-payment endpoint rejects. Only offer the ones it accepts.
 */
export function orderPaymentMethodOptions(configured: readonly string[]): string[] {
  const accepted: readonly string[] = ORDER_PAYMENT_METHODS;
  return configured.filter((method) => accepted.includes(method));
}

/** The amount the backend requires for a plan and billing cycle. */
export function subscriptionAmountFor(
  plans: readonly PlanPrices[],
  planId: string,
  cycle: 'MONTHLY' | 'YEARLY',
): string | undefined {
  const plan = plans.find((item) => item.id === planId);
  if (!plan) return undefined;
  return cycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;
}

export type IdempotentAttempt = { key: string; fingerprint: string };

/**
 * Returns the previous attempt when the request is unchanged, so a retry after
 * a lost response reuses the same Idempotency-Key and cannot record twice.
 * A changed request gets a new key.
 */
export function attemptFor(
  previous: IdempotentAttempt | null,
  fingerprint: string,
  createKey: () => string,
): IdempotentAttempt {
  if (previous && previous.fingerprint === fingerprint) return previous;
  return { key: createKey(), fingerprint };
}

/**
 * Reads every page of a cursor-paginated list (`{ items, nextCursor }`).
 * Stops at `maxPages` so a very large dataset cannot block the UI indefinitely.
 */
export async function fetchAllPages<T>(
  fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor?: string | null }>,
  maxPages = 20,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(cursor);
    all.push(...result.items);
    cursor = result.nextCursor ?? null;
    if (!cursor || result.items.length === 0) break;
  }
  return all;
}

/** Parses a cached configuration, returning null instead of throwing on corrupt data. */
export function safeParseCache<T>(raw: string | null, parse: (value: unknown) => T): T | null {
  if (!raw) return null;
  try {
    return parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}
