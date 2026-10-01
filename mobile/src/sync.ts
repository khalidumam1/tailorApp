import type { Session } from './api';
import { apiRequest } from './api';
import {
  createClientId,
  normalizePhone,
  openLocalDatabase,
  type LocalCustomer,
  type LocalOrder,
  type LocalTemplate,
} from './local';

type OutboxRecord = {
  operation_id: string;
  business_id: string;
  entity_type: 'customer' | 'measurement' | 'order';
  entity_id: string;
  base_version: number | null;
  payload_json: string;
  attempts: number;
};

type SyncOperationResult = {
  clientOperationId: string;
  status: 'APPLIED' | 'CONFLICT';
  response: Record<string, unknown>;
};

function retryDelay(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
}

export async function enqueueOperation(input: {
  businessId: string;
  entityType: OutboxRecord['entity_type'];
  entityId: string;
  payload: Record<string, unknown>;
  baseVersion?: number;
}): Promise<string> {
  const database = await openLocalDatabase();
  const operationId = createClientId();
  const now = Date.now();
  await database.runAsync(
    `INSERT INTO app_outbox
      (operation_id, business_id, entity_type, entity_id, base_version, payload_json, status, attempts, next_retry_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?)`,
    operationId,
    input.businessId,
    input.entityType,
    input.entityId,
    input.baseVersion ?? null,
    JSON.stringify({
      clientOperationId: operationId,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.baseVersion ? { baseVersion: input.baseVersion } : {}),
      payload: input.payload,
    }),
    now,
  );
  return operationId;
}

export async function saveCustomerOffline(input: {
  businessId: string;
  name: string;
  phone: string;
  notes: string;
}): Promise<void> {
  const database = await openLocalDatabase();
  const id = createClientId();
  const now = new Date().toISOString();
  const digits = input.phone.replace(/\D/g, '');
  if (input.name.trim().length === 0) throw new Error('Enter a customer name');
  if (digits.length < 7 || digits.length > 24) throw new Error('Enter a valid phone number');
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const existingPhones = await transaction.getAllAsync<{ phone: string }>(
      'SELECT phone FROM app_customers WHERE business_id = ?',
      input.businessId,
    );
    if (existingPhones.some((item) => normalizePhone(item.phone) === normalizePhone(input.phone))) {
      throw new Error('A customer with this phone number already exists in this shop');
    }
    await transaction.runAsync(
      `INSERT INTO app_customers
        (id, business_id, name, phone, notes, version, sync_state, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 'pending', ?)`,
      id, input.businessId, input.name.trim(), input.phone.trim(), input.notes.trim(), now,
    );
    const operationId = createClientId();
    await transaction.runAsync(
      `INSERT INTO app_outbox
        (operation_id, business_id, entity_type, entity_id, payload_json, status, attempts, next_retry_at, created_at)
       VALUES (?, ?, 'customer', ?, ?, 'pending', 0, 0, ?)`,
      operationId,
      input.businessId,
      id,
      JSON.stringify({
        clientOperationId: operationId,
        entityType: 'customer',
        entityId: id,
        payload: {
          action: 'customer.create',
          customer: { name: input.name.trim(), phone: input.phone.trim(), notes: input.notes.trim() },
        },
      }),
      Date.now(),
    );
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
  const database = await openLocalDatabase();
  const id = createClientId();
  const due = `${input.promisedAt}T23:59:00+05:00`;
  const totalMinor = BigInt(input.unitPrice.split('.')[0]) * 100n
    + BigInt((input.unitPrice.split('.')[1] ?? '').padEnd(2, '0'));
  const total = `${(totalMinor * BigInt(input.quantity) / 100n).toString()}.${String(totalMinor * BigInt(input.quantity) % 100n).padStart(2, '0')}`;
  const operationId = createClientId();
  const payload = {
    action: 'order.create',
    order: {
      customerId: input.customer.id,
      promisedAt: due,
      notes: input.notes.trim(),
      items: [{
        garmentName: input.garmentName.trim(),
        quantity: input.quantity,
        unitPrice: input.unitPrice,
      }],
    },
  };
  if (!input.garmentName.trim()) throw new Error('Enter a garment name');

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO app_orders
        (id, business_id, customer_id, customer_name, garment_name, quantity, unit_price, promised_at, status, total, notes, version, sync_state, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, 0, 'pending', ?)`,
      id,
      input.businessId,
      input.customer.id,
      input.customer.name,
      input.garmentName.trim(),
      input.quantity,
      input.unitPrice,
      due,
      total,
      input.notes.trim(),
      new Date().toISOString(),
    );
    await transaction.runAsync(
      `INSERT INTO app_outbox
        (operation_id, business_id, entity_type, entity_id, payload_json, status, attempts, next_retry_at, created_at)
       VALUES (?, ?, 'order', ?, ?, 'pending', 0, 0, ?)`,
      operationId,
      input.businessId,
      id,
      JSON.stringify({
        clientOperationId: operationId,
        entityType: 'order',
        entityId: id,
        payload,
      }),
      Date.now(),
    );
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
  const id = createClientId();
  const operationId = createClientId();
  const measuredAt = new Date().toISOString();
  const payload = {
    action: 'measurement.revision',
    customerId: input.customer.id,
    garmentTemplateId: input.template.id,
    values,
    notes: input.notes.trim(),
    measuredAt,
  };
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO app_measurements
        (id, business_id, customer_id, template_id, template_name, values_json, notes, measured_at, sync_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      id,
      input.businessId,
      input.customer.id,
      input.template.id,
      input.template.name,
      JSON.stringify(values),
      input.notes.trim(),
      measuredAt,
    );
    await transaction.runAsync(
      `INSERT INTO app_outbox
        (operation_id, business_id, entity_type, entity_id, payload_json, status, attempts, next_retry_at, created_at)
       VALUES (?, ?, 'measurement', ?, ?, 'pending', 0, 0, ?)`,
      operationId,
      input.businessId,
      id,
      JSON.stringify({
        clientOperationId: operationId,
        entityType: 'measurement',
        entityId: id,
        payload,
      }),
      Date.now(),
    );
  });
}

async function pushOutbox(session: Session, businessId: string, updateSession: (session: Session) => void): Promise<void> {
  const database = await openLocalDatabase();
  await database.runAsync(
    `UPDATE app_outbox SET status = 'retry', next_retry_at = ?
     WHERE business_id = ? AND status = 'sending'`,
    Date.now(),
    businessId,
  );
  const records = await database.getAllAsync<OutboxRecord>(
    `SELECT operation_id, business_id, entity_type, entity_id, base_version, payload_json, attempts
     FROM app_outbox
     WHERE business_id = ? AND status IN ('pending', 'retry') AND next_retry_at <= ?
     ORDER BY created_at ASC LIMIT 20`,
    businessId,
    Date.now(),
  );
  for (const record of records) {
    try {
      await database.runAsync(
        `UPDATE app_outbox SET status = 'sending' WHERE operation_id = ?`,
        record.operation_id,
      );
      const request = JSON.parse(record.payload_json) as Record<string, unknown>;
      const result = await apiRequest<{
        data: { results: SyncOperationResult[] };
      }>(session, '/api/v1/sync/operations', {
        method: 'POST',
        body: { operations: [request] },
      }, updateSession);
      const outcome = result.data.results.find((item) => item.clientOperationId === record.operation_id);
      if (!outcome) throw new Error('The server did not confirm the queued change');
      if (outcome.status === 'CONFLICT') {
        await database.runAsync(
          `UPDATE app_outbox SET status = 'conflict', last_error = ? WHERE operation_id = ?`,
          JSON.stringify(outcome.response),
          record.operation_id,
        );
        await database.runAsync(
          `UPDATE app_${record.entity_type === 'customer' ? 'customers' : record.entity_type === 'order' ? 'orders' : 'measurements'}
           SET sync_state = 'conflict' WHERE id = ?`,
          record.entity_id,
        );
        continue;
      }
      const serverVersion = Number(outcome.response.version ?? 1);
      if (record.entity_type === 'customer') {
        await database.runAsync(
          `UPDATE app_customers SET version = ?, sync_state = 'synced' WHERE id = ?`,
          serverVersion,
          record.entity_id,
        );
      } else if (record.entity_type === 'order') {
        await database.runAsync(
          `UPDATE app_orders SET version = ?, sync_state = 'synced' WHERE id = ?`,
          serverVersion,
          record.entity_id,
        );
      } else {
        await database.runAsync(
          `UPDATE app_measurements SET sync_state = 'synced' WHERE id = ?`,
          record.entity_id,
        );
      }
      await database.runAsync(`DELETE FROM app_outbox WHERE operation_id = ?`, record.operation_id);
    } catch (error) {
      const attempts = record.attempts + 1;
      await database.runAsync(
        `UPDATE app_outbox SET status = 'retry', attempts = ?, next_retry_at = ?, last_error = ? WHERE operation_id = ?`,
        attempts,
        Date.now() + retryDelay(attempts),
        error instanceof Error ? error.message : 'Sync failed',
        record.operation_id,
      );
      throw error;
    }
  }
}

async function pullChanges(session: Session, businessId: string, updateSession: (session: Session) => void): Promise<void> {
  const database = await openLocalDatabase();
  const state = await database.getFirstAsync<{ cursor: string | null }>(
    'SELECT cursor FROM app_sync_state WHERE business_id = ?',
    businessId,
  );
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
  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const customer of data.customers.items) {
      const id = String(customer.id);
      const dirty = await transaction.getFirstAsync<{ id: string }>(
        `SELECT id FROM app_customers WHERE id = ? AND sync_state != 'synced'`,
        id,
      );
      if (dirty) continue;
      await transaction.runAsync(
        `INSERT INTO app_customers (id, business_id, name, phone, notes, version, sync_state, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'synced', ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, notes=excluded.notes,
           version=excluded.version, sync_state='synced', updated_at=excluded.updated_at`,
        id,
        businessId,
        String(customer.name ?? ''),
        String(customer.phone ?? ''),
        String(customer.notes ?? ''),
        Number(customer.version ?? 1),
        String(customer.updatedAt ?? new Date().toISOString()),
      );
    }
    for (const order of data.orders.items) {
      const id = String(order.id);
      const dirty = await transaction.getFirstAsync<{ id: string }>(
        `SELECT id FROM app_orders WHERE id = ? AND sync_state != 'synced'`,
        id,
      );
      if (dirty) continue;
      const items = Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : [];
      const firstItem = items[0] ?? {};
      const customer = order.customer && typeof order.customer === 'object'
        ? order.customer as Record<string, unknown>
        : {};
      const localCustomer = await transaction.getFirstAsync<{ name: string }>(
        'SELECT name FROM app_customers WHERE business_id = ? AND id = ?',
        businessId,
        String(order.customerId ?? customer.id ?? ''),
      );
      await transaction.runAsync(
        `INSERT INTO app_orders
          (id, business_id, customer_id, customer_name, garment_name, quantity, unit_price, promised_at, status, total, notes, version, sync_state, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)
         ON CONFLICT(id) DO UPDATE SET customer_id=excluded.customer_id, customer_name=excluded.customer_name,
           garment_name=excluded.garment_name, quantity=excluded.quantity, unit_price=excluded.unit_price,
           promised_at=excluded.promised_at, status=excluded.status, total=excluded.total, notes=excluded.notes,
           version=excluded.version, sync_state='synced', updated_at=excluded.updated_at`,
        id,
        businessId,
        String(order.customerId ?? customer.id ?? ''),
        String(customer.name ?? localCustomer?.name ?? ''),
        String(firstItem.garmentName ?? 'Garment'),
        Number(firstItem.quantity ?? 1),
        String(firstItem.unitPrice ?? '0.00'),
        String(order.promisedAt ?? new Date().toISOString()),
        String(order.status ?? 'NEW'),
        String(order.total ?? '0.00'),
        String(order.notes ?? ''),
        Number(order.version ?? 1),
        String(order.updatedAt ?? new Date().toISOString()),
      );
    }
    for (const measurement of data.measurements.items) {
      const profile = measurement.profile && typeof measurement.profile === 'object'
        ? measurement.profile as Record<string, unknown>
        : {};
      const template = profile.garmentTemplate && typeof profile.garmentTemplate === 'object'
        ? profile.garmentTemplate as Record<string, unknown>
        : {};
      await transaction.runAsync(
        `INSERT OR IGNORE INTO app_measurements
          (id, business_id, customer_id, template_id, template_name, values_json, notes, measured_at, sync_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
        String(measurement.id),
        businessId,
        String(profile.customerId ?? ''),
        String(profile.garmentTemplateId ?? template.id ?? ''),
        String(template.name ?? 'Garment'),
        JSON.stringify(measurement.values ?? {}),
        String(measurement.notes ?? ''),
        String(measurement.measuredAt ?? measurement.createdAt ?? new Date().toISOString()),
      );
    }
    await transaction.runAsync(
      `INSERT INTO app_sync_state (business_id, cursor, last_successful_sync, last_error)
       VALUES (?, ?, ?, NULL)
       ON CONFLICT(business_id) DO UPDATE SET cursor=excluded.cursor,
         last_successful_sync=excluded.last_successful_sync, last_error=NULL`,
      businessId,
      data.nextCursor,
      new Date().toISOString(),
    );
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
  await pushOutbox(session, session.business.id, updateSession);
  await pullChanges(session, session.business.id, updateSession);
  if (session.permissions.includes('measurements:read')) {
    const templates = await apiRequest<{ data: { items: Array<Record<string, unknown>> } }>(
      session,
      '/api/v1/measurements/templates',
      {},
      updateSession,
    );
    const database = await openLocalDatabase();
    for (const template of templates.data.items) {
      await database.runAsync(
        `INSERT INTO app_templates (id, business_id, name, fields_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id, business_id) DO UPDATE SET name=excluded.name, fields_json=excluded.fields_json`,
        String(template.id),
        session.business.id,
        String(template.name),
        JSON.stringify(template.fields ?? []),
      );
    }
  }
}

export async function loadCustomers(businessId: string): Promise<LocalCustomer[]> {
  const database = await openLocalDatabase();
  return database.getAllAsync<LocalCustomer>(
    'SELECT * FROM app_customers WHERE business_id = ? ORDER BY name COLLATE NOCASE',
    businessId,
  );
}

export async function loadOrders(businessId: string): Promise<LocalOrder[]> {
  const database = await openLocalDatabase();
  return database.getAllAsync<LocalOrder>(
    'SELECT * FROM app_orders WHERE business_id = ? ORDER BY promised_at ASC',
    businessId,
  );
}

export async function loadTemplates(businessId: string): Promise<LocalTemplate[]> {
  const database = await openLocalDatabase();
  const records = await database.getAllAsync<{ id: string; name: string; fields_json: string }>(
    'SELECT id, name, fields_json FROM app_templates WHERE business_id = ? ORDER BY name COLLATE NOCASE',
    businessId,
  );
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    fields: JSON.parse(record.fields_json) as LocalTemplate['fields'],
  }));
}

export async function loadMeasurements(businessId: string, customerId?: string): Promise<Array<{
  id: string; customer_id: string; template_name: string; values_json: string; measured_at: string; sync_state: string;
}>> {
  const database = await openLocalDatabase();
  return customerId
    ? database.getAllAsync(
      `SELECT * FROM app_measurements WHERE business_id = ? AND customer_id = ? ORDER BY measured_at DESC`,
      businessId,
      customerId,
    )
    : database.getAllAsync(
      'SELECT * FROM app_measurements WHERE business_id = ? ORDER BY measured_at DESC',
      businessId,
    );
}

export async function loadSyncState(businessId: string): Promise<{
  pending: number; attention: number; last_successful_sync: string | null; last_error: string | null;
}> {
  const database = await openLocalDatabase();
  const counts = await database.getFirstAsync<{ pending: number; attention: number }>(
    `SELECT
       SUM(CASE WHEN status IN ('pending', 'retry', 'sending') THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status IN ('conflict', 'rejected') THEN 1 ELSE 0 END) AS attention
     FROM app_outbox WHERE business_id = ?`,
    businessId,
  );
  const state = await database.getFirstAsync<{ last_successful_sync: string | null; last_error: string | null }>(
    'SELECT last_successful_sync, last_error FROM app_sync_state WHERE business_id = ?',
    businessId,
  );
  return {
    pending: Number(counts?.pending ?? 0),
    attention: Number(counts?.attention ?? 0),
    last_successful_sync: state?.last_successful_sync ?? null,
    last_error: state?.last_error ?? null,
  };
}
