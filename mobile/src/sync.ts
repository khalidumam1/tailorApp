import { Q, type Collection, type Model } from '@nozbe/watermelondb';
import type { Session } from './api';
import { apiRequest } from './api';
import {
  CustomerRecord,
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
  type LocalOrder,
  type LocalTemplate,
} from './local';
import { toE164Phone } from '@tailor/shared';

type EntityType = 'customer' | 'measurement' | 'order';
type SyncOperationResult = {
  clientOperationId: string;
  status: 'APPLIED' | 'CONFLICT';
  response: Record<string, unknown>;
};

export interface LocalPaymentAttempt {
  idempotency_key: string;
  amount: string;
  method: string;
}

function retryDelay(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
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
  return Date.now();
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
    quantity: record.quantity,
    unit_price: record.unitPrice,
    promised_at: record.promisedAt,
    status: record.status,
    total: record.total,
    version: record.version,
    sync_state: record.syncState,
  };
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

export async function saveCustomerOffline(input: {
  businessId: string;
  name: string;
  phone: string;
  notes: string;
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
    customer: { name, phone, notes },
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
  garmentName: string;
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
  const garmentName = input.garmentName.trim();
  if (!garmentName) throw new Error('Enter a garment name');

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
      items: [{ garmentName, quantity: input.quantity, unitPrice: input.unitPrice }],
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
      record.garmentName = garmentName;
      record.quantity = input.quantity;
      record.unitPrice = input.unitPrice;
      record.promisedAt = due;
      record.status = 'NEW';
      record.total = total;
      record.notes = notes;
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
  session: Session,
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
      }>(session, '/api/v1/sync/operations', {
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

      const serverVersion = Number(outcome.response.version ?? 1);
      await database.write(async () => {
        await markEntitySyncState(database, record.entityType, record.entityId, 'synced', serverVersion);
        await record.destroyPermanently();
      });
    } catch (error) {
      const attempts = record.attempts + 1;
      await database.write(async () => {
        await record.update((item) => {
          item.status = 'retry';
          item.attempts = attempts;
          item.nextRetryAt = Date.now() + retryDelay(attempts);
          item.lastError = error instanceof Error ? error.message : 'Sync failed';
        });
      });
      throw error;
    }
  }
}

async function pullChanges(
  session: Session,
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
        nextCursor: string | null;
      };
    }>(session, `/api/v1/sync/changes?${params.toString()}`, {}, updateSession);
    const data = response.data;

    await database.write(async () => {
      const customers = database.get<CustomerRecord>('customers');
      const orders = database.get<OrderRecord>('orders');
      const measurements = database.get<MeasurementRecord>('measurements');

      for (const customer of data.customers.items) {
        const id = String(customer.id);
        const local = await findRecord(customers, id);
        if (local && local.syncState !== 'synced') continue;
        const values = {
          businessId,
          name: String(customer.name ?? ''),
          phone: String(customer.phone ?? ''),
          notes: String(customer.notes ?? ''),
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
        const customer = order.customer && typeof order.customer === 'object'
          ? order.customer as Record<string, unknown>
          : {};
        const customerId = String(order.customerId ?? customer.id ?? '');
        const localCustomer = await findRecord(customers, customerId);
        const values = {
          businessId,
          customerId,
          customerName: String(customer.name ?? localCustomer?.name ?? ''),
          garmentName: String(firstItem.garmentName ?? 'Garment'),
          quantity: Number(firstItem.quantity ?? 1),
          unitPrice: String(firstItem.unitPrice ?? '0.00'),
          promisedAt: String(order.promisedAt ?? new Date().toISOString()),
          status: String(order.status ?? 'NEW'),
          total: String(order.total ?? '0.00'),
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
        await measurements.create((record) => {
          record._raw.id = id;
          record.businessId = businessId;
          record.customerId = String(profile.customerId ?? '');
          record.templateId = String(profile.garmentTemplateId ?? template.id ?? '');
          record.templateName = String(template.name ?? 'Garment');
          record.valuesJson = JSON.stringify(measurement.values ?? {});
          record.notes = String(measurement.notes ?? '');
          record.measuredAt = String(measurement.measuredAt ?? measurement.createdAt ?? new Date().toISOString());
          record.syncState = 'synced';
        });
      }

      const currentState = await findRecord(syncState, businessId);
      const nextCursor = data.nextCursor;
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

    const more = data.customers.hasMore || data.orders.hasMore || data.measurements.hasMore;
    if (!more) return;
    if (!data.nextCursor || data.nextCursor === cursor) {
      throw new Error('The server returned a sync cursor that did not advance');
    }
    cursor = data.nextCursor;
  }
  throw new Error('Sync is still catching up; retry to continue downloading changes');
}

export async function synchronize(
  session: Session,
  updateSession: (session: Session) => void,
): Promise<void> {
  const businessId = session.business.id;
  await pushOutbox(session, businessId, updateSession);
  await pullChanges(session, businessId, updateSession);
  if (session.permissions.includes('measurements:read')) {
    const templates = await apiRequest<{ data: { items: Array<Record<string, unknown>> } }>(
      session,
      '/api/v1/measurements/templates',
      {},
      updateSession,
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
  last_successful_sync: string | null;
  last_error: string | null;
}> {
  const database = await openLocalDatabase();
  const queue = await database.get<OutboxRecord>('outbox').query(
    Q.where('business_id', businessId),
  ).fetch();
  const syncState = await findRecord(database.get<SyncStateRecord>('sync_states'), businessId);
  return {
    pending: queue.filter((record) => ['pending', 'retry', 'sending'].includes(record.status)).length,
    attention: queue.filter((record) => ['conflict', 'rejected'].includes(record.status)).length,
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
