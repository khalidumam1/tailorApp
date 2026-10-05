import { Q, type Collection, type Model } from '@nozbe/watermelondb';
import { ApiError, type Session } from './api';
import { apiRequest } from './api';
import {
  CustomerRecord,
  CatalogItemRecord,
  MeasurementRecord,
  OrderRecord,
  OutboxRecord,
  PaymentAttemptRecord,
  SyncStateRecord,
  TemplateRecord,
  openLocalDatabase,
} from './database';
import {
  createClientId,
  normalizePhone,
  type LocalCustomer,
  type LocalCatalogItem,
  type LocalOrder,
  type LocalTemplate,
} from './local';
import { toE164Phone } from '@tailor/shared';

type EntityType = 'customer' | 'measurement' | 'order' | 'catalog_item';
type SyncOperationResult = {
  clientOperationId: string;
  status: string;
  response: Record<string, unknown>;
};

export interface LocalPaymentAttempt {
  idempotency_key: string;
  amount: string;
  method: string;
}

function retryDelay(attempts: number, retryAfterMs = 0): number {
  const exponential = Math.min(5 * 60_000, 1_000 * 2 ** Math.min(Math.max(0, attempts - 1), 8));
  const jittered = exponential * (0.75 + Math.random() * 0.5);
  return Math.max(jittered, Math.min(Math.max(0, retryAfterMs), 60 * 60_000));
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 401 || error.status === 408 || error.status === 425
    || error.status === 429 || error.status >= 500;
}

function responseErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const response = value as Record<string, unknown>;
    const error = response.error && typeof response.error === 'object'
      ? response.error as Record<string, unknown>
      : {};
    for (const candidate of [error.message, response.message, response.detail]) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
  }
  return fallback;
}

function customFieldsObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (!Array.isArray(value)) return {};
  const fields: Record<string, unknown> = {};
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const definition = item.fieldDefinition && typeof item.fieldDefinition === 'object'
      ? item.fieldDefinition as Record<string, unknown>
      : item.definition && typeof item.definition === 'object'
        ? item.definition as Record<string, unknown>
        : {};
    const key = item.key ?? item.fieldKey ?? definition.key;
    if (typeof key !== 'string' || !key) continue;
    const fieldValue = item.value ?? item.valueJson ?? item.valueText ?? item.valueNumber
      ?? item.valueBoolean ?? item.valueDate;
    if (fieldValue !== undefined && fieldValue !== null) fields[key] = fieldValue;
  }
  return fields;
}

function timestampToMilliseconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error('The server returned an invalid timestamp');
}

function serializeSyncCursor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
  throw new Error('The server returned an invalid sync cursor');
}

function parseCatalogChangesPage(value: unknown): { items: unknown[]; hasMore: boolean } {
  if (value === undefined || value === null) return { items: [], hasMore: false };
  if (Array.isArray(value)) return { items: value, hasMore: false };
  if (!value || typeof value !== 'object') {
    throw new Error('The server returned an invalid catalog change page');
  }
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.items) || typeof page.hasMore !== 'boolean') {
    throw new Error('The server returned an invalid catalog change page');
  }
  return { items: page.items, hasMore: page.hasMore };
}

async function findRecord<T extends Model>(
  collection: Collection<T>,
  id: string,
): Promise<T | null> {
  const records = await collection.query(Q.where('id', id)).fetch();
  return records[0] ?? null;
}

function templateLocalId(businessId: string, remoteId: string): string {
  return `${businessId}:${remoteId}`;
}

function mapCustomer(record: CustomerRecord): LocalCustomer {
  return {
    id: record.id,
    business_id: record.businessId,
    name: record.name,
    phone: record.phone,
    notes: record.notes,
    custom_fields_json: record.customFieldsJson,
    version: record.version,
    sync_state: record.syncState,
  };
}

function mapOrder(record: OrderRecord): LocalOrder {
  return {
    id: record.id,
    business_id: record.businessId,
    customer_id: record.customerId,
    customer_name: record.customerName,
    garment_name: record.garmentName,
    item_type_key: record.itemTypeKey,
    item_name: record.itemName,
    quantity: record.quantity,
    unit_price: record.unitPrice,
    promised_at: record.promisedAt,
    status: record.status,
    workflow_stage_key: record.workflowStageKey,
    order_custom_fields_json: record.orderCustomFieldsJson,
    item_custom_fields_json: record.itemCustomFieldsJson,
    total: record.total,
    version: record.version,
    sync_state: record.syncState,
  };
}

type CatalogItemSnapshot = Omit<LocalCatalogItem, 'business_id' | 'syncState'> & { updatedAt: number };

function parseRemoteCatalogItems(value: unknown): CatalogItemSnapshot[] {
  if (!Array.isArray(value)) throw new Error('The server returned an invalid catalog list');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('The server returned an invalid catalog item');
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.typeKey !== 'string'
      || typeof record.name !== 'string' || typeof record.unit !== 'string'
      || typeof record.sortOrder !== 'number' || typeof record.version !== 'number'
      || typeof record.active !== 'boolean'
      || (typeof record.updatedAt !== 'string' && typeof record.updatedAt !== 'number')
      || (record.description !== undefined && record.description !== null && typeof record.description !== 'string')
      || (record.sku !== undefined && record.sku !== null && typeof record.sku !== 'string')
      || (record.unitPrice !== undefined && record.unitPrice !== null
        && typeof record.unitPrice !== 'string' && typeof record.unitPrice !== 'number')) {
      throw new Error('The server returned an invalid catalog item');
    }
    let customFields: unknown = record.customFields ?? {};
    if (typeof customFields === 'string') {
      try {
        customFields = JSON.parse(customFields) as unknown;
      } catch {
        throw new Error('The server returned invalid catalog custom fields');
      }
    }
    if (Array.isArray(customFields)) customFields = customFieldsObject(customFields);
    if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) {
      throw new Error('The server returned invalid catalog custom fields');
    }
    return {
      id: record.id,
      typeKey: record.typeKey,
      name: record.name,
      description: typeof record.description === 'string' ? record.description : null,
      sku: typeof record.sku === 'string' ? record.sku : null,
      unit: record.unit,
      unitPrice: typeof record.unitPrice === 'string' || typeof record.unitPrice === 'number'
        ? String(record.unitPrice)
        : null,
      sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : 0,
      version: typeof record.version === 'number' ? record.version : 1,
      active: typeof record.active === 'boolean' ? record.active : true,
      customFields: customFields as Record<string, unknown>,
      updatedAt: timestampToMilliseconds(record.updatedAt),
    };
  });
}

async function findCatalogRecord(
  collection: Collection<CatalogItemRecord>,
  id: string,
): Promise<CatalogItemRecord | null> {
  const byLocalId = await findRecord(collection, id);
  if (byLocalId) return byLocalId;
  const records = await collection.query(Q.where('remote_id', id)).fetch();
  return records[0] ?? null;
}

function assignCatalogSnapshot(
  record: CatalogItemRecord,
  businessId: string,
  item: CatalogItemSnapshot,
): void {
  record.businessId = businessId;
  record.remoteId = item.id;
  record.typeKey = item.typeKey;
  record.name = item.name;
  record.description = item.description;
  record.sku = item.sku;
  record.unit = item.unit;
  record.unitPrice = item.unitPrice;
  record.sortOrder = item.sortOrder;
  record.version = item.version;
  record.active = item.active;
  record.customFieldsJson = JSON.stringify(item.customFields);
  record.syncState = 'synced';
  record.updatedAt = item.updatedAt;
}

async function upsertCatalogItemsInWrite(
  database: Awaited<ReturnType<typeof openLocalDatabase>>,
  businessId: string,
  items: CatalogItemSnapshot[],
): Promise<void> {
  const collection = database.get<CatalogItemRecord>('catalog_items');
  for (const item of items) {
    const existing = await findCatalogRecord(collection, item.id);
    if (existing && existing.syncState !== 'synced') continue;
    if (existing) {
      await existing.update((record) => assignCatalogSnapshot(record, businessId, item));
    } else {
      await collection.create((record) => {
        record._raw.id = item.id;
        assignCatalogSnapshot(record, businessId, item);
      });
    }
  }
}

async function upsertCatalogItems(
  businessId: string,
  items: CatalogItemSnapshot[],
): Promise<void> {
  const database = await openLocalDatabase();
  await database.write(async () => upsertCatalogItemsInWrite(database, businessId, items));
}

export async function enqueueOperation(input: {
  businessId: string;
  entityType: EntityType;
  entityId: string;
  payload: Record<string, unknown>;
  baseVersion?: number;
}): Promise<string> {
  const database = await openLocalDatabase();
  const operationId = createClientId();
  const request = {
    clientOperationId: operationId,
    entityType: input.entityType,
    entityId: input.entityId,
    ...(input.baseVersion !== undefined ? { baseVersion: input.baseVersion } : {}),
    payload: input.payload,
  };
  await database.write(async () => {
    await database.get<OutboxRecord>('outbox').create((record) => {
      record._raw.id = operationId;
      record.businessId = input.businessId;
      record.entityType = input.entityType;
      record.entityId = input.entityId;
      record.baseVersion = input.baseVersion ?? null;
      record.payloadJson = JSON.stringify(request);
      record.status = 'pending';
      record.attempts = 0;
      record.nextRetryAt = 0;
      record.lastError = null;
      record.createdAt = Date.now();
    });
  });
  return operationId;
}

export async function saveCatalogItemOffline(input: {
  businessId: string;
  typeKey: string;
  name: string;
  description?: string;
  sku?: string;
  unit: string;
  unitPrice?: string;
  sortOrder: number;
  customFields: Record<string, unknown>;
}): Promise<void> {
  const typeKey = input.typeKey.trim();
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  const sku = input.sku?.trim() || null;
  const unit = input.unit.trim() || 'unit';
  const unitPrice = input.unitPrice?.trim() || null;
  if (!typeKey) throw new Error('Choose an item type');
  if (!name) throw new Error('Enter an item name');
  if (unitPrice && !/^\d{1,10}(\.\d{1,2})?$/.test(unitPrice)) {
    throw new Error('Enter a valid unit price');
  }
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0) {
    throw new Error('The catalog sort order is invalid');
  }

  const database = await openLocalDatabase();
  const itemId = createClientId();
  const operationId = createClientId();
  const itemPayload = {
    typeKey,
    name,
    ...(description ? { description } : {}),
    ...(sku ? { sku } : {}),
    unit,
    ...(unitPrice ? { unitPrice } : {}),
    sortOrder: input.sortOrder,
    customFields: input.customFields,
  };
  const operation = {
    clientOperationId: operationId,
    entityType: 'catalog_item',
    entityId: itemId,
    payload: { action: 'catalog.create', item: itemPayload },
  };

  await database.write(async () => {
    const item = database.get<CatalogItemRecord>('catalog_items').prepareCreate((record) => {
      record._raw.id = itemId;
      record.businessId = input.businessId;
      record.remoteId = null;
      record.typeKey = typeKey;
      record.name = name;
      record.description = description;
      record.sku = sku;
      record.unit = unit;
      record.unitPrice = unitPrice;
      record.sortOrder = input.sortOrder;
      record.version = 0;
      record.active = true;
      record.customFieldsJson = JSON.stringify(input.customFields);
      record.syncState = 'pending';
      record.updatedAt = Date.now();
    });
    const outbox = database.get<OutboxRecord>('outbox').prepareCreate((record) => {
      record._raw.id = operationId;
      record.businessId = input.businessId;
      record.entityType = 'catalog_item';
      record.entityId = itemId;
      record.baseVersion = null;
      record.payloadJson = JSON.stringify(operation);
      record.status = 'pending';
      record.attempts = 0;
      record.nextRetryAt = 0;
      record.lastError = null;
      record.createdAt = Date.now();
    });
    await database.batch(item, outbox);
  });
}

export async function saveCustomerOffline(input: {
  businessId: string;
  name: string;
  phone: string;
  notes: string;
  customFields: Record<string, unknown>;
}): Promise<void> {
  const name = input.name.trim();
  const phone = toE164Phone(input.phone);
  const notes = input.notes.trim();
  if (!name) throw new Error('Enter a customer name');

  const database = await openLocalDatabase();
  const customerId = createClientId();
  const operationId = createClientId();
  const payload = {
    action: 'customer.create',
    customer: { name, phone, notes, customFields: input.customFields },
  };
  const operation = {
    clientOperationId: operationId,
    entityType: 'customer',
    entityId: customerId,
    payload,
  };

  await database.write(async () => {
    const existing = await database.get<CustomerRecord>('customers')
      .query(Q.where('business_id', input.businessId)).fetch();
    if (existing.some((record) => normalizePhone(record.phone) === normalizePhone(phone))) {
      throw new Error('A customer with this phone number already exists in this shop');
    }

    const customer = database.get<CustomerRecord>('customers').prepareCreate((record) => {
      record._raw.id = customerId;
      record.businessId = input.businessId;
      record.name = name;
      record.phone = phone;
      record.notes = notes;
      record.customFieldsJson = JSON.stringify(input.customFields);
      record.version = 0;
      record.syncState = 'pending';
      record.updatedAt = Date.now();
    });
    const outbox = database.get<OutboxRecord>('outbox').prepareCreate((record) => {
      record._raw.id = operationId;
      record.businessId = input.businessId;
      record.entityType = 'customer';
      record.entityId = customerId;
      record.baseVersion = null;
      record.payloadJson = JSON.stringify(operation);
      record.status = 'pending';
      record.attempts = 0;
      record.nextRetryAt = 0;
      record.lastError = null;
      record.createdAt = Date.now();
    });
    await database.batch(customer, outbox);
  });
}

export async function saveOrderOffline(input: {
  businessId: string;
  customer: LocalCustomer;
  itemName: string;
  itemTypeKey: string;
  orderCustomFields: Record<string, unknown>;
  itemCustomFields: Record<string, unknown>;
  initialStageKey: string;
  quantity: number;
  unitPrice: string;
  promisedAt: string;
  notes: string;
}): Promise<void> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) {
    throw new Error('Quantity must be between 1 and 100');
  }
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(input.unitPrice) || Number(input.unitPrice) <= 0) {
    throw new Error('Enter a valid price');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.promisedAt)
    || Number.isNaN(Date.parse(`${input.promisedAt}T12:00:00+05:00`))) {
    throw new Error('Enter the promised date as YYYY-MM-DD');
  }
  const itemName = input.itemName.trim();
  if (!itemName) throw new Error('Enter an item name');

  const database = await openLocalDatabase();
  const orderId = createClientId();
  const operationId = createClientId();
  const due = `${input.promisedAt}T23:59:00+05:00`;
  const unitMinor = BigInt(input.unitPrice.split('.')[0]) * 100n
    + BigInt((input.unitPrice.split('.')[1] ?? '').padEnd(2, '0'));
  const totalMinor = unitMinor * BigInt(input.quantity);
  const total = `${(totalMinor / 100n).toString()}.${String(totalMinor % 100n).padStart(2, '0')}`;
  const notes = input.notes.trim();
  const payload = {
    action: 'order.create',
    order: {
      customerId: input.customer.id,
      promisedAt: due,
      notes,
      customFields: input.orderCustomFields,
      items: [{
        itemTypeKey: input.itemTypeKey,
        itemName,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        customFields: input.itemCustomFields,
      }],
    },
  };
  const operation = {
    clientOperationId: operationId,
    entityType: 'order',
    entityId: orderId,
    payload,
  };

  await database.write(async () => {
    const order = database.get<OrderRecord>('orders').prepareCreate((record) => {
      record._raw.id = orderId;
      record.businessId = input.businessId;
      record.customerId = input.customer.id;
      record.customerName = input.customer.name;
      record.garmentName = itemName;
      record.itemName = itemName;
      record.itemTypeKey = input.itemTypeKey;
      record.quantity = input.quantity;
      record.unitPrice = input.unitPrice;
      record.promisedAt = due;
      record.status = 'NEW';
      record.workflowStageKey = input.initialStageKey;
      record.total = total;
      record.notes = notes;
      record.orderCustomFieldsJson = JSON.stringify(input.orderCustomFields);
      record.itemCustomFieldsJson = JSON.stringify(input.itemCustomFields);
      record.version = 0;
      record.syncState = 'pending';
      record.updatedAt = Date.now();
    });
    const outbox = database.get<OutboxRecord>('outbox').prepareCreate((record) => {
      record._raw.id = operationId;
      record.businessId = input.businessId;
      record.entityType = 'order';
      record.entityId = orderId;
      record.baseVersion = null;
      record.payloadJson = JSON.stringify(operation);
      record.status = 'pending';
      record.attempts = 0;
      record.nextRetryAt = 0;
      record.lastError = null;
      record.createdAt = Date.now();
    });
    await database.batch(order, outbox);
  });
}

export async function saveMeasurementOffline(input: {
  businessId: string;
  customer: LocalCustomer;
  template: LocalTemplate;
  values: Record<string, string>;
  notes: string;
}): Promise<void> {
  const missing = input.template.fields.find((field) => field.required && !input.values[field.key]?.trim());
  if (missing) throw new Error(`${missing.label} is required`);
  const values = Object.fromEntries(Object.entries(input.values).filter(([, value]) => value.trim()));
  if (!Object.keys(values).length) throw new Error('Enter at least one measurement');

  const database = await openLocalDatabase();
  const measurementId = createClientId();
  const operationId = createClientId();
  const measuredAt = new Date().toISOString();
  const notes = input.notes.trim();
  const payload = {
    action: 'measurement.revision',
    customerId: input.customer.id,
    garmentTemplateId: input.template.id,
    values,
    notes,
    measuredAt,
  };
  const operation = {
    clientOperationId: operationId,
    entityType: 'measurement',
    entityId: measurementId,
    payload,
  };

  await database.write(async () => {
    const measurement = database.get<MeasurementRecord>('measurements').prepareCreate((record) => {
      record._raw.id = measurementId;
      record.businessId = input.businessId;
      record.customerId = input.customer.id;
      record.templateId = input.template.id;
      record.templateName = input.template.name;
      record.valuesJson = JSON.stringify(values);
      record.notes = notes;
      record.measuredAt = measuredAt;
      record.syncState = 'pending';
    });
    const outbox = database.get<OutboxRecord>('outbox').prepareCreate((record) => {
      record._raw.id = operationId;
      record.businessId = input.businessId;
      record.entityType = 'measurement';
      record.entityId = measurementId;
      record.baseVersion = null;
      record.payloadJson = JSON.stringify(operation);
      record.status = 'pending';
      record.attempts = 0;
      record.nextRetryAt = 0;
      record.lastError = null;
      record.createdAt = Date.now();
    });
    await database.batch(measurement, outbox);
  });
}

async function markEntitySyncState(
  database: Awaited<ReturnType<typeof openLocalDatabase>>,
  entityType: string,
  entityId: string,
  status: string,
  version?: number,
): Promise<void> {
  if (entityType === 'customer') {
    const record = await findRecord(database.get<CustomerRecord>('customers'), entityId);
    if (!record) throw new Error('The local customer for a queued change is missing');
    await record.update((item) => {
      item.syncState = status;
      if (version !== undefined) item.version = version;
    });
    return;
  }
  if (entityType === 'order') {
    const record = await findRecord(database.get<OrderRecord>('orders'), entityId);
    if (!record) throw new Error('The local order for a queued change is missing');
    await record.update((item) => {
      item.syncState = status;
      if (version !== undefined) item.version = version;
    });
    return;
  }
  if (entityType === 'catalog_item') {
    const record = await findRecord(database.get<CatalogItemRecord>('catalog_items'), entityId);
    if (!record) throw new Error('The local catalog item for a queued change is missing');
    await record.update((item) => {
      item.syncState = status;
      if (version !== undefined) item.version = version;
    });
    return;
  }
  if (entityType === 'measurement') {
    const record = await findRecord(database.get<MeasurementRecord>('measurements'), entityId);
    if (!record) throw new Error('The local measurement for a queued change is missing');
    await record.update((item) => {
      item.syncState = status;
    });
    return;
  }
  throw new Error('The queued change has an unsupported entity type');
}

async function pushOutbox(
  getSession: () => Session,
  businessId: string,
  updateSession: (session: Session) => void,
): Promise<void> {
  const database = await openLocalDatabase();
  const outbox = database.get<OutboxRecord>('outbox');
  const stranded = await outbox.query(
    Q.where('business_id', businessId),
    Q.where('status', 'sending'),
  ).fetch();
  if (stranded.length) {
    await database.write(async () => {
      for (const record of stranded) {
        await record.update((item) => {
          item.status = 'retry';
          item.nextRetryAt = 0;
          item.lastError = 'Retrying an operation interrupted by app shutdown';
        });
      }
    });
  }
  const records = await outbox.query(
    Q.where('business_id', businessId),
    Q.where('status', Q.oneOf(['pending', 'retry'])),
    Q.where('next_retry_at', Q.lte(Date.now())),
    Q.sortBy('created_at', Q.asc),
    Q.take(20),
  ).fetch();

  for (const record of records) {
    try {
      await database.write(async () => {
        await record.update((item) => {
          item.status = 'sending';
        });
      });
      const request = JSON.parse(record.payloadJson) as Record<string, unknown>;
      const result = await apiRequest<{
        data: { results: SyncOperationResult[] };
      }>(getSession(), '/api/v1/sync/operations', {
        method: 'POST',
        body: { operations: [request] },
      }, updateSession);
      const outcome = result.data.results.find((item) => item.clientOperationId === record.id);
      if (!outcome) throw new Error('The server did not confirm the queued change');

      if (outcome.status === 'CONFLICT') {
        await database.write(async () => {
          await record.update((item) => {
            item.status = 'conflict';
            item.lastError = JSON.stringify(outcome.response);
          });
          await markEntitySyncState(database, record.entityType, record.entityId, 'conflict');
        });
        continue;
      }

      if (outcome.status === 'REJECTED') {
        await database.write(async () => {
          await record.update((item) => {
            item.status = 'rejected';
            item.lastError = JSON.stringify(outcome.response);
          });
          await markEntitySyncState(database, record.entityType, record.entityId, 'rejected');
        });
        continue;
      }

      if (outcome.status !== 'APPLIED') {
        throw new Error(`The server returned an unsupported sync result: ${outcome.status}`);
      }

      const catalogSnapshot = record.entityType === 'catalog_item'
        ? parseRemoteCatalogItems([outcome.response])[0]
        : undefined;
      const serverVersion = Number(outcome.response.version ?? 1);
      if (!Number.isFinite(serverVersion) || serverVersion < 1) {
        throw new Error('The server returned an invalid version for the queued change');
      }
      await database.write(async () => {
        if (catalogSnapshot) {
          const catalogRecord = await findRecord(database.get<CatalogItemRecord>('catalog_items'), record.entityId);
          if (!catalogRecord) throw new Error('The local catalog item for a confirmed change is missing');
          await catalogRecord.update((item) => assignCatalogSnapshot(item, businessId, catalogSnapshot));
        } else {
          await markEntitySyncState(database, record.entityType, record.entityId, 'synced', serverVersion);
        }
        await record.destroyPermanently();
      });
    } catch (error) {
      const retryable = isRetryable(error);
      const isConflict = error instanceof ApiError && error.status === 409;
      const attempts = record.attempts + 1;
      const message = error instanceof Error ? error.message : 'Sync failed';
      await database.write(async () => {
        await record.update((item) => {
          item.status = isConflict ? 'conflict' : retryable ? 'retry' : 'rejected';
          item.attempts = attempts;
          item.nextRetryAt = retryable && !isConflict
            ? Date.now() + retryDelay(attempts, error instanceof ApiError ? error.retryAfterMs : undefined)
            : 0;
          item.lastError = message;
        });
        if (isConflict || !retryable) {
          await markEntitySyncState(
            database,
            record.entityType,
            record.entityId,
            isConflict ? 'conflict' : 'rejected',
          );
        }
      });
      if (retryable && !isConflict) throw error;
    }
  }
}

async function pullChanges(
  getSession: () => Session,
  businessId: string,
  updateSession: (session: Session) => void,
): Promise<void> {
  const database = await openLocalDatabase();
  const syncState = database.get<SyncStateRecord>('sync_states');
  const state = await findRecord(syncState, businessId);
  let cursor = state?.cursor ?? null;

  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    const response = await apiRequest<{
      data: {
        customers: { items: Array<Record<string, unknown>>; hasMore: boolean };
        orders: { items: Array<Record<string, unknown>>; hasMore: boolean };
        measurements: { items: Array<Record<string, unknown>>; hasMore: boolean };
        catalogItems?: unknown;
        nextCursor: unknown;
      };
    }>(getSession(), `/api/v1/sync/changes?${params.toString()}`, {}, updateSession);
    const data = response.data;
    const nextCursor = serializeSyncCursor(data.nextCursor);
    const catalogPage = parseCatalogChangesPage(data.catalogItems);
    const catalogSnapshots = parseRemoteCatalogItems(catalogPage.items);

    await database.write(async () => {
      const customers = database.get<CustomerRecord>('customers');
      const orders = database.get<OrderRecord>('orders');
      const measurements = database.get<MeasurementRecord>('measurements');
      await upsertCatalogItemsInWrite(database, businessId, catalogSnapshots);

      for (const customer of data.customers.items) {
        const id = String(customer.id);
        const local = await findRecord(customers, id);
        if (local && local.syncState !== 'synced') continue;
        const values = {
          businessId,
          name: String(customer.name ?? ''),
          phone: String(customer.phone ?? ''),
          notes: String(customer.notes ?? ''),
          customFieldsJson: JSON.stringify(customFieldsObject(customer.customFieldValues ?? customer.customFields)),
          version: Number(customer.version ?? 1),
          syncState: 'synced',
          updatedAt: timestampToMilliseconds(customer.updatedAt),
        };
        if (local) {
          await local.update((record) => Object.assign(record, values));
        } else {
          await customers.create((record) => {
            record._raw.id = id;
            Object.assign(record, values);
          });
        }
      }

      for (const order of data.orders.items) {
        const id = String(order.id);
        const local = await findRecord(orders, id);
        if (local && local.syncState !== 'synced') continue;
         const items = Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : [];
        const firstItem = items[0] ?? {};
         if (items.length === 0) throw new Error('The server returned an order without any items');
         const itemName = typeof firstItem.itemName === 'string'
           ? firstItem.itemName
           : typeof firstItem.garmentName === 'string' ? firstItem.garmentName : '';
         if (!itemName) throw new Error('The server returned an order without an item name');
         const promisedAt = typeof order.promisedAt === 'string' ? order.promisedAt : '';
         if (!promisedAt) throw new Error('The server returned an order without a promised date');
         const quantity = firstItem.quantity;
         if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
           throw new Error('The server returned an order with an invalid item quantity');
         }
         const unitPriceValue = firstItem.unitPrice;
         if (typeof unitPriceValue !== 'string' && typeof unitPriceValue !== 'number') {
           throw new Error('The server returned an order without an item price');
         }
         const totalValue = order.total;
         if (typeof totalValue !== 'string' && typeof totalValue !== 'number') {
           throw new Error('The server returned an order without a total');
         }
         if (typeof order.status !== 'string') throw new Error('The server returned an order without a status');
        const customer = order.customer && typeof order.customer === 'object'
          ? order.customer as Record<string, unknown>
          : {};
        const customerId = String(order.customerId ?? customer.id ?? '');
        const localCustomer = await findRecord(customers, customerId);
        const values = {
          businessId,
          customerId,
          customerName: String(customer.name ?? localCustomer?.name ?? ''),
          garmentName: itemName,
          itemTypeKey: typeof firstItem.itemTypeKey === 'string' ? firstItem.itemTypeKey : null,
          itemName,
          quantity,
          unitPrice: String(unitPriceValue),
          promisedAt,
          status: order.status,
          workflowStageKey: String(order.workflowStageKey ?? order.status),
          orderCustomFieldsJson: JSON.stringify(customFieldsObject(order.customFieldValues ?? order.customFields)),
          itemCustomFieldsJson: JSON.stringify(customFieldsObject(firstItem.customFieldValues ?? firstItem.customFields)),
          total: String(totalValue),
          notes: String(order.notes ?? ''),
          version: Number(order.version ?? 1),
          syncState: 'synced',
          updatedAt: timestampToMilliseconds(order.updatedAt),
        };
        if (local) {
          await local.update((record) => Object.assign(record, values));
        } else {
          await orders.create((record) => {
            record._raw.id = id;
            Object.assign(record, values);
          });
        }
      }

      for (const measurement of data.measurements.items) {
        const id = String(measurement.id);
        if (await findRecord(measurements, id)) continue;
        const profile = measurement.profile && typeof measurement.profile === 'object'
          ? measurement.profile as Record<string, unknown>
          : {};
        const template = profile.garmentTemplate && typeof profile.garmentTemplate === 'object'
          ? profile.garmentTemplate as Record<string, unknown>
          : {};
        const templateName = typeof template.name === 'string' ? template.name : '';
        const measuredAt = typeof measurement.measuredAt === 'string'
          ? measurement.measuredAt
          : typeof measurement.createdAt === 'string' ? measurement.createdAt : '';
        if (!templateName || !measuredAt) {
          throw new Error('The server returned an incomplete measurement revision');
        }
        await measurements.create((record) => {
          record._raw.id = id;
          record.businessId = businessId;
          record.customerId = String(profile.customerId ?? '');
          record.templateId = String(profile.garmentTemplateId ?? template.id ?? '');
          record.templateName = templateName;
          record.valuesJson = JSON.stringify(measurement.values ?? {});
          record.notes = String(measurement.notes ?? '');
          record.measuredAt = measuredAt;
          record.syncState = 'synced';
        });
      }

      const currentState = await findRecord(syncState, businessId);
      const lastSuccessfulSync = new Date().toISOString();
      if (currentState) {
        await currentState.update((record) => {
          record.cursor = nextCursor;
          record.lastSuccessfulSync = lastSuccessfulSync;
          record.lastError = null;
        });
      } else {
        await syncState.create((record) => {
          record._raw.id = businessId;
          record.cursor = nextCursor;
          record.lastSuccessfulSync = lastSuccessfulSync;
          record.lastError = null;
        });
      }
    });

    const more = data.customers.hasMore || data.orders.hasMore || data.measurements.hasMore || catalogPage.hasMore;
    if (!more) return;
    if (!nextCursor || nextCursor === cursor) {
      throw new Error('The server returned a sync cursor that did not advance');
    }
    cursor = nextCursor;
  }
  throw new Error('Sync is still catching up; retry to continue downloading changes');
}

export async function synchronize(
  session: Session,
  updateSession: (session: Session) => void,
  catalogEnabled = false,
): Promise<void> {
  const businessId = session.business.id;
  let activeSession = session;
  const refreshSession = (nextSession: Session) => {
    activeSession = nextSession;
    updateSession(nextSession);
  };
  const getSession = () => activeSession;
  await pushOutbox(getSession, businessId, refreshSession);
  await pullChanges(getSession, businessId, refreshSession);
  if (catalogEnabled && session.permissions.includes('orders:read')) {
    await refreshCatalogItems(getSession(), businessId, refreshSession);
  }
  if (session.permissions.includes('measurements:read')) {
    const templates = await apiRequest<{ data: { items: Array<Record<string, unknown>> } }>(
      getSession(),
      '/api/v1/measurements/templates',
      {},
      refreshSession,
    );
    const database = await openLocalDatabase();
    const collection = database.get<TemplateRecord>('templates');
    await database.write(async () => {
      for (const template of templates.data.items) {
        const remoteId = String(template.id);
        const id = templateLocalId(businessId, remoteId);
        const existing = await findRecord(collection, id);
        const fieldsJson = JSON.stringify(template.fields ?? []);
        if (existing) {
          await existing.update((record) => {
            record.name = String(template.name ?? '');
            record.fieldsJson = fieldsJson;
          });
        } else {
          await collection.create((record) => {
            record._raw.id = id;
            record.businessId = businessId;
            record.remoteId = remoteId;
            record.name = String(template.name ?? '');
            record.fieldsJson = fieldsJson;
          });
        }
      }
    });
  }
}

export async function refreshCatalogItems(
  session: Session,
  businessId: string,
  updateSession: (session: Session) => void,
): Promise<LocalCatalogItem[]> {
  const response = await apiRequest<{ data?: { items?: unknown } }>(
    session,
    '/api/v1/catalog?limit=100',
    {},
    updateSession,
  );
  await upsertCatalogItems(businessId, parseRemoteCatalogItems(response.data?.items));
  return loadCatalogItems(businessId);
}

export async function loadCustomers(businessId: string): Promise<LocalCustomer[]> {
  const database = await openLocalDatabase();
  const records = await database.get<CustomerRecord>('customers').query(
    Q.where('business_id', businessId),
    Q.sortBy('name', Q.asc),
  ).fetch();
  return records.map(mapCustomer);
}

export async function loadOrders(businessId: string): Promise<LocalOrder[]> {
  const database = await openLocalDatabase();
  const records = await database.get<OrderRecord>('orders').query(
    Q.where('business_id', businessId),
    Q.sortBy('promised_at', Q.asc),
  ).fetch();
  return records.map(mapOrder);
}

export async function loadCatalogItems(businessId: string): Promise<LocalCatalogItem[]> {
  const database = await openLocalDatabase();
  const records = await database.get<CatalogItemRecord>('catalog_items').query(
    Q.where('business_id', businessId),
    Q.sortBy('sort_order', Q.asc),
    Q.sortBy('name', Q.asc),
  ).fetch();
  return records.map((record) => ({
    id: record.remoteId ?? record.id,
    business_id: record.businessId,
    typeKey: record.typeKey,
    name: record.name,
    description: record.description,
    sku: record.sku,
    unit: record.unit,
    unitPrice: record.unitPrice,
    sortOrder: record.sortOrder,
    version: record.version,
    active: record.active,
    customFields: JSON.parse(record.customFieldsJson) as Record<string, unknown>,
    syncState: record.syncState,
  }));
}

export async function loadTemplates(businessId: string): Promise<LocalTemplate[]> {
  const database = await openLocalDatabase();
  const records = await database.get<TemplateRecord>('templates').query(
    Q.where('business_id', businessId),
    Q.sortBy('name', Q.asc),
  ).fetch();
  return records.map((record) => ({
    id: record.remoteId,
    name: record.name,
    fields: JSON.parse(record.fieldsJson) as LocalTemplate['fields'],
  }));
}

export async function loadMeasurements(businessId: string, customerId?: string): Promise<Array<{
  id: string;
  customer_id: string;
  template_name: string;
  values_json: string;
  measured_at: string;
  sync_state: string;
}>> {
  const database = await openLocalDatabase();
  const records = await database.get<MeasurementRecord>('measurements').query(
    Q.where('business_id', businessId),
    ...(customerId ? [Q.where('customer_id', customerId)] : []),
    Q.sortBy('measured_at', Q.desc),
  ).fetch();
  return records.map((record) => ({
    id: record.id,
    customer_id: record.customerId,
    template_name: record.templateName,
    values_json: record.valuesJson,
    measured_at: record.measuredAt,
    sync_state: record.syncState,
  }));
}

export async function loadSyncState(businessId: string): Promise<{
  pending: number;
  attention: number;
  next_retry_at: number | null;
  attention_details: Array<{ id: string; entity_type: string; message: string }>;
  last_successful_sync: string | null;
  last_error: string | null;
}> {
  const database = await openLocalDatabase();
  const queue = await database.get<OutboxRecord>('outbox').query(
    Q.where('business_id', businessId),
  ).fetch();
  const syncState = await findRecord(database.get<SyncStateRecord>('sync_states'), businessId);
  const retryable = queue.filter((record) => ['pending', 'retry', 'sending'].includes(record.status));
  const attentionRecords = queue.filter((record) => ['conflict', 'rejected'].includes(record.status));
  return {
    pending: retryable.length,
    attention: attentionRecords.length,
    next_retry_at: retryable.length ? Math.min(...retryable.map((record) => record.nextRetryAt || 0)) : null,
    attention_details: attentionRecords.map((record) => {
      let response: unknown;
      try {
        response = JSON.parse(record.lastError ?? '');
      } catch {
        response = record.lastError;
      }
      return {
        id: record.id,
        entity_type: record.entityType,
        message: responseErrorMessage(response, record.status === 'conflict'
          ? 'This change conflicts with a newer server version.'
          : 'The server rejected this change.'),
      };
    }),
    last_successful_sync: syncState?.lastSuccessfulSync ?? null,
    last_error: syncState?.lastError ?? null,
  };
}

export async function findPendingPaymentAttempt(
  businessId: string,
  orderId: string,
): Promise<LocalPaymentAttempt | null> {
  const database = await openLocalDatabase();
  const records = await database.get<PaymentAttemptRecord>('payment_attempts').query(
    Q.where('business_id', businessId),
    Q.where('order_id', orderId),
    Q.where('status', 'pending'),
    Q.sortBy('created_at', Q.desc),
    Q.take(1),
  ).fetch();
  const record = records[0];
  return record
    ? { idempotency_key: record.id, amount: record.amount, method: record.method }
    : null;
}

export async function createPaymentAttempt(input: {
  idempotencyKey: string;
  businessId: string;
  orderId: string;
  amount: string;
  method: string;
}): Promise<void> {
  const database = await openLocalDatabase();
  await database.write(async () => {
    await database.get<PaymentAttemptRecord>('payment_attempts').create((record) => {
      record._raw.id = input.idempotencyKey;
      record.businessId = input.businessId;
      record.orderId = input.orderId;
      record.amount = input.amount;
      record.method = input.method;
      record.status = 'pending';
      record.lastError = null;
      record.createdAt = Date.now();
    });
  });
}

export async function updatePaymentAttempt(
  idempotencyKey: string,
  status: 'confirmed' | 'rejected' | 'pending',
  lastError: string | null,
): Promise<void> {
  const database = await openLocalDatabase();
  await database.write(async () => {
    const record = await findRecord(
      database.get<PaymentAttemptRecord>('payment_attempts'),
      idempotencyKey,
    );
    if (!record) throw new Error('The saved payment attempt could not be found');
    await record.update((item) => {
      item.status = status;
      item.lastError = lastError;
    });
  });
}
