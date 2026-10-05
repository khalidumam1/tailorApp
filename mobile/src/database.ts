import {
  Database,
  Model,
  Q,
  appSchema,
  localStorageKey,
  tableSchema,
} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { addColumns, createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';
import { field } from '@nozbe/watermelondb/decorators';
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';

const LEGACY_DATABASE_KEY = 'tailorapp.sqlite.key.v1';
const LEGACY_IMPORT_KEY = localStorageKey<boolean>('tailorapp.legacy-sqlite-imported.v1');
const TIMESTAMP_NORMALIZED_KEY = localStorageKey<boolean>('tailorapp.timestamps-normalized.v1');

export class CustomerRecord extends Model {
  static table = 'customers';

  @field('business_id') businessId: string;
  @field('name') name: string;
  @field('phone') phone: string;
  @field('notes') notes: string;
  @field('custom_fields_json') customFieldsJson: string | null;
  @field('version') version: number;
  @field('sync_state') syncState: string;
  @field('updated_at') updatedAt: number;
}

export class OrderRecord extends Model {
  static table = 'orders';

  @field('business_id') businessId: string;
  @field('customer_id') customerId: string;
  @field('customer_name') customerName: string;
  @field('garment_name') garmentName: string;
  @field('item_type_key') itemTypeKey: string | null;
  @field('item_name') itemName: string | null;
  @field('quantity') quantity: number;
  @field('unit_price') unitPrice: string;
  @field('promised_at') promisedAt: string;
  @field('status') status: string;
  @field('total') total: string;
  @field('notes') notes: string;
  @field('workflow_stage_key') workflowStageKey: string | null;
  @field('order_custom_fields_json') orderCustomFieldsJson: string | null;
  @field('item_custom_fields_json') itemCustomFieldsJson: string | null;
  @field('version') version: number;
  @field('sync_state') syncState: string;
  @field('updated_at') updatedAt: number;
}

export class TemplateRecord extends Model {
  static table = 'templates';

  @field('business_id') businessId: string;
  @field('remote_id') remoteId: string;
  @field('name') name: string;
  @field('fields_json') fieldsJson: string;
}

export class MeasurementRecord extends Model {
  static table = 'measurements';

  @field('business_id') businessId: string;
  @field('customer_id') customerId: string;
  @field('template_id') templateId: string;
  @field('template_name') templateName: string;
  @field('values_json') valuesJson: string;
  @field('notes') notes: string;
  @field('measured_at') measuredAt: string;
  @field('sync_state') syncState: string;
}

export class OutboxRecord extends Model {
  static table = 'outbox';

  @field('business_id') businessId: string;
  @field('entity_type') entityType: string;
  @field('entity_id') entityId: string;
  @field('base_version') baseVersion: number | null;
  @field('payload_json') payloadJson: string;
  @field('status') status: string;
  @field('attempts') attempts: number;
  @field('next_retry_at') nextRetryAt: number;
  @field('last_error') lastError: string | null;
  @field('created_at') createdAt: number;
}

export class SyncStateRecord extends Model {
  static table = 'sync_states';

  @field('cursor') cursor: string | null;
  @field('last_successful_sync') lastSuccessfulSync: string | null;
  @field('last_error') lastError: string | null;
}

export class PaymentAttemptRecord extends Model {
  static table = 'payment_attempts';

  @field('business_id') businessId: string;
  @field('order_id') orderId: string;
  @field('amount') amount: string;
  @field('method') method: string;
  @field('status') status: string;
  @field('last_error') lastError: string | null;
  @field('created_at') createdAt: number;
}

export class BusinessConfigurationRecord extends Model {
  static table = 'business_configurations';

  @field('business_id') businessId: string;
  @field('config_json') configJson: string;
  @field('updated_at') updatedAt: number;
}

export class CatalogItemRecord extends Model {
  static table = 'catalog_items';

  @field('business_id') businessId: string;
  @field('remote_id') remoteId: string | null;
  @field('type_key') typeKey: string;
  @field('name') name: string;
  @field('description') description: string | null;
  @field('sku') sku: string | null;
  @field('unit') unit: string;
  @field('unit_price') unitPrice: string | null;
  @field('sort_order') sortOrder: number;
  @field('version') version: number;
  @field('active') active: boolean;
  @field('custom_fields_json') customFieldsJson: string;
  @field('sync_state') syncState: string;
  @field('updated_at') updatedAt: number;
}

const schema = appSchema({
  version: 6,
  tables: [
    tableSchema({
      name: 'customers',
      columns: [
        { name: 'business_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'phone', type: 'string' },
        { name: 'notes', type: 'string' },
        { name: 'custom_fields_json', type: 'string', isOptional: true },
        { name: 'version', type: 'number' },
        { name: 'sync_state', type: 'string', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'orders',
      columns: [
        { name: 'business_id', type: 'string', isIndexed: true },
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'customer_name', type: 'string' },
        { name: 'garment_name', type: 'string' },
        { name: 'item_type_key', type: 'string', isOptional: true },
        { name: 'item_name', type: 'string', isOptional: true },
        { name: 'quantity', type: 'number' },
        { name: 'unit_price', type: 'string' },
        { name: 'promised_at', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'total', type: 'string' },
        { name: 'notes', type: 'string' },
        { name: 'workflow_stage_key', type: 'string', isOptional: true },
        { name: 'order_custom_fields_json', type: 'string', isOptional: true },
        { name: 'item_custom_fields_json', type: 'string', isOptional: true },
        { name: 'version', type: 'number' },
        { name: 'sync_state', type: 'string', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'catalog_items',
      columns: [
        { name: 'business_id', type: 'string', isIndexed: true },
        { name: 'remote_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'type_key', type: 'string', isIndexed: true },
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'sku', type: 'string', isOptional: true },
        { name: 'unit', type: 'string' },
        { name: 'unit_price', type: 'string', isOptional: true },
        { name: 'sort_order', type: 'number' },
        { name: 'version', type: 'number' },
        { name: 'active', type: 'boolean', isIndexed: true },
        { name: 'custom_fields_json', type: 'string' },
        { name: 'sync_state', type: 'string', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'templates',
      columns: [
        { name: 'business_id', type: 'string', isIndexed: true },
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'fields_json', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'measurements',
      columns: [
        { name: 'business_id', type: 'string', isIndexed: true },
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'template_id', type: 'string' },
        { name: 'template_name', type: 'string' },
        { name: 'values_json', type: 'string' },
        { name: 'notes', type: 'string' },
        { name: 'measured_at', type: 'string', isIndexed: true },
        { name: 'sync_state', type: 'string', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'outbox',
      columns: [
        { name: 'business_id', type: 'string', isIndexed: true },
        { name: 'entity_type', type: 'string' },
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'base_version', type: 'number', isOptional: true },
        { name: 'payload_json', type: 'string' },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'attempts', type: 'number' },
        { name: 'next_retry_at', type: 'number', isIndexed: true },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'sync_states',
      columns: [
        { name: 'cursor', type: 'string', isOptional: true },
        { name: 'last_successful_sync', type: 'string', isOptional: true },
        { name: 'last_error', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'payment_attempts',
      columns: [
        { name: 'business_id', type: 'string', isIndexed: true },
        { name: 'order_id', type: 'string', isIndexed: true },
        { name: 'amount', type: 'string' },
        { name: 'method', type: 'string' },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'business_configurations',
      columns: [
        { name: 'business_id', type: 'string', isIndexed: true },
        { name: 'config_json', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
const migrations = schemaMigrations({
  migrations: [{
    toVersion: 2,
    steps: [createTable({
      name: 'business_configurations',
      columns: [
        { name: 'business_id', type: 'string', isIndexed: true },
        { name: 'config_json', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    })],
  }, {
    toVersion: 3,
    steps: [addColumns({
      table: 'orders',
      columns: [
        { name: 'item_type_key', type: 'string', isOptional: true },
        { name: 'item_name', type: 'string', isOptional: true },
        { name: 'workflow_stage_key', type: 'string', isOptional: true },
        { name: 'order_custom_fields_json', type: 'string', isOptional: true },
        { name: 'item_custom_fields_json', type: 'string', isOptional: true },
      ],
    })],
  }, {
    toVersion: 4,
    steps: [addColumns({
      table: 'customers',
      columns: [{ name: 'custom_fields_json', type: 'string', isOptional: true }],
    })],
  }, {
    toVersion: 5,
    steps: [createTable({
      name: 'catalog_items',
      columns: [
        { name: 'business_id', type: 'string', isIndexed: true },
        { name: 'type_key', type: 'string', isIndexed: true },
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'sku', type: 'string', isOptional: true },
        { name: 'unit', type: 'string' },
        { name: 'unit_price', type: 'string', isOptional: true },
        { name: 'sort_order', type: 'number' },
        { name: 'version', type: 'number' },
        { name: 'active', type: 'boolean', isIndexed: true },
        { name: 'custom_fields_json', type: 'string' },
        { name: 'sync_state', type: 'string', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ],
    })],
  }, {
    toVersion: 6,
    steps: [addColumns({
      table: 'catalog_items',
      columns: [
        { name: 'remote_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'description', type: 'string', isOptional: true },
      ],
    })],
  }],
});

type LegacyCustomer = {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  notes: string;
  version: number;
  sync_state: string;
  updated_at: string;
};

type LegacyOrder = {
  id: string;
  business_id: string;
  customer_id: string;
  customer_name: string;
  garment_name: string;
  quantity: number;
  unit_price: string;
  promised_at: string;
  status: string;
  total: string;
  notes: string;
  version: number;
  sync_state: string;
  updated_at: string;
};

type LegacyTemplate = {
  id: string;
  business_id: string;
  name: string;
  fields_json: string;
};

type LegacyMeasurement = {
  id: string;
  business_id: string;
  customer_id: string;
  template_id: string;
  template_name: string;
  values_json: string;
  notes: string;
  measured_at: string;
  sync_state: string;
};

type LegacyOutbox = {
  operation_id: string;
  business_id: string;
  entity_type: string;
  entity_id: string;
  base_version: number | null;
  payload_json: string;
  status: string;
  attempts: number;
  next_retry_at: number;
  last_error: string | null;
  created_at: number;
};

type LegacySyncState = {
  business_id: string;
  cursor: string | null;
  last_successful_sync: string | null;
  last_error: string | null;
};

type LegacyPaymentAttempt = {
  idempotency_key: string;
  business_id: string;
  order_id: string;
  amount: string;
  method: string;
  status: string;
  last_error: string | null;
  created_at: string;
};

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

async function importLegacyRecords(database: Database): Promise<void> {
  if (await database.localStorage.get(LEGACY_IMPORT_KEY)) return;
  const key = await SecureStore.getItemAsync(LEGACY_DATABASE_KEY);
  if (!key) return;
  if (!/^[a-f0-9]{64}$/.test(key)) {
    throw new Error('The saved offline database key is invalid; the original database was left untouched');
  }

  const legacy = await SQLite.openDatabaseAsync('tailorapp.db');
  try {
    await legacy.execAsync(`PRAGMA key = "x'${key}'"`);
    const tables = await legacy.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const names = new Set(tables.map((table) => table.name));

    const customers = names.has('app_customers')
      ? await legacy.getAllAsync<LegacyCustomer>('SELECT * FROM app_customers')
      : [];
    const orders = names.has('app_orders')
      ? await legacy.getAllAsync<LegacyOrder>('SELECT * FROM app_orders')
      : [];
    const templates = names.has('app_templates')
      ? await legacy.getAllAsync<LegacyTemplate>('SELECT * FROM app_templates')
      : [];
    const measurements = names.has('app_measurements')
      ? await legacy.getAllAsync<LegacyMeasurement>('SELECT * FROM app_measurements')
      : [];
    const outbox = names.has('app_outbox')
      ? await legacy.getAllAsync<LegacyOutbox>('SELECT * FROM app_outbox')
      : [];
    const syncStates = names.has('app_sync_state')
      ? await legacy.getAllAsync<LegacySyncState>('SELECT * FROM app_sync_state')
      : [];
    const paymentAttempts = names.has('app_payment_attempts')
      ? await legacy.getAllAsync<LegacyPaymentAttempt>('SELECT * FROM app_payment_attempts')
      : [];

    await database.write(async () => {
      for (const row of customers) {
        if (await database.get<CustomerRecord>('customers').query(Q.where('id', row.id)).fetchCount()) continue;
        await database.get<CustomerRecord>('customers').create((record) => {
          record._raw.id = row.id;
          record.businessId = row.business_id;
          record.name = row.name;
          record.phone = row.phone;
          record.notes = row.notes;
          record.version = row.version;
          record.syncState = row.sync_state;
          record.updatedAt = timestampToMilliseconds(row.updated_at);
        });
      }
      for (const row of orders) {
        if (await database.get<OrderRecord>('orders').query(Q.where('id', row.id)).fetchCount()) continue;
        await database.get<OrderRecord>('orders').create((record) => {
          record._raw.id = row.id;
          record.businessId = row.business_id;
          record.customerId = row.customer_id;
          record.customerName = row.customer_name;
          record.garmentName = row.garment_name;
          record.quantity = row.quantity;
          record.unitPrice = row.unit_price;
          record.promisedAt = row.promised_at;
          record.status = row.status;
          record.total = row.total;
          record.notes = row.notes;
          record.version = row.version;
          record.syncState = row.sync_state;
          record.updatedAt = timestampToMilliseconds(row.updated_at);
        });
      }
      for (const row of templates) {
        const id = `${row.business_id}:${row.id}`;
        if (await database.get<TemplateRecord>('templates').query(Q.where('id', id)).fetchCount()) continue;
        await database.get<TemplateRecord>('templates').create((record) => {
          record._raw.id = id;
          record.businessId = row.business_id;
          record.remoteId = row.id;
          record.name = row.name;
          record.fieldsJson = row.fields_json;
        });
      }
      for (const row of measurements) {
        if (await database.get<MeasurementRecord>('measurements').query(Q.where('id', row.id)).fetchCount()) continue;
        await database.get<MeasurementRecord>('measurements').create((record) => {
          record._raw.id = row.id;
          record.businessId = row.business_id;
          record.customerId = row.customer_id;
          record.templateId = row.template_id;
          record.templateName = row.template_name;
          record.valuesJson = row.values_json;
          record.notes = row.notes;
          record.measuredAt = row.measured_at;
          record.syncState = row.sync_state;
        });
      }
      for (const row of outbox) {
        if (await database.get<OutboxRecord>('outbox').query(Q.where('id', row.operation_id)).fetchCount()) continue;
        await database.get<OutboxRecord>('outbox').create((record) => {
          record._raw.id = row.operation_id;
          record.businessId = row.business_id;
          record.entityType = row.entity_type;
          record.entityId = row.entity_id;
          record.baseVersion = row.base_version;
          record.payloadJson = row.payload_json;
          record.status = row.status === 'sending' ? 'retry' : row.status;
          record.attempts = row.attempts;
          record.nextRetryAt = row.next_retry_at;
          record.lastError = row.last_error;
          record.createdAt = timestampToMilliseconds(row.created_at);
        });
      }
      for (const row of syncStates) {
        if (await database.get<SyncStateRecord>('sync_states')
          .query(Q.where('id', row.business_id)).fetchCount()) continue;
        await database.get<SyncStateRecord>('sync_states').create((record) => {
          record._raw.id = row.business_id;
          record.cursor = row.cursor;
          record.lastSuccessfulSync = row.last_successful_sync;
          record.lastError = row.last_error;
        });
      }
      for (const row of paymentAttempts) {
        if (await database.get<PaymentAttemptRecord>('payment_attempts')
          .query(Q.where('id', row.idempotency_key)).fetchCount()) continue;
        await database.get<PaymentAttemptRecord>('payment_attempts').create((record) => {
          record._raw.id = row.idempotency_key;
          record.businessId = row.business_id;
          record.orderId = row.order_id;
          record.amount = row.amount;
          record.method = row.method;
          record.status = row.status;
          record.lastError = row.last_error;
          record.createdAt = timestampToMilliseconds(row.created_at);
        });
      }
    });
    await database.localStorage.set(LEGACY_IMPORT_KEY, true);
  } finally {
    await legacy.closeAsync();
  }
}

async function normalizePersistedTimestamps(database: Database): Promise<void> {
  if (await database.localStorage.get(TIMESTAMP_NORMALIZED_KEY)) return;
  const customers = await database.get<CustomerRecord>('customers').query().fetch();
  const orders = await database.get<OrderRecord>('orders').query().fetch();
  const paymentAttempts = await database.get<PaymentAttemptRecord>('payment_attempts').query().fetch();
  const changedCustomers = customers.filter((record) => typeof record.updatedAt !== 'number');
  const changedOrders = orders.filter((record) => typeof record.updatedAt !== 'number');
  const changedPayments = paymentAttempts.filter((record) => typeof record.createdAt !== 'number');
  await database.write(async () => {
    for (const record of changedCustomers) {
      const updatedAt = timestampToMilliseconds(record.updatedAt);
      await record.update((item) => { item.updatedAt = updatedAt; });
    }
    for (const record of changedOrders) {
      const updatedAt = timestampToMilliseconds(record.updatedAt);
      await record.update((item) => { item.updatedAt = updatedAt; });
    }
    for (const record of changedPayments) {
      const createdAt = timestampToMilliseconds(record.createdAt);
      await record.update((item) => { item.createdAt = createdAt; });
    }
  });
  await database.localStorage.set(TIMESTAMP_NORMALIZED_KEY, true);
}

let databasePromise: Promise<Database> | undefined;

export function openLocalDatabase(): Promise<Database> {
  if (!databasePromise) {
    const adapter = new SQLiteAdapter({
      schema,
      migrations,
      dbName: 'tailorapp-offline',
      jsi: false,
    });
    const database = new Database({
      adapter,
      modelClasses: [
        CustomerRecord,
        OrderRecord,
        TemplateRecord,
        MeasurementRecord,
        OutboxRecord,
        SyncStateRecord,
        PaymentAttemptRecord,
        BusinessConfigurationRecord,
        CatalogItemRecord,
      ],
    });
    databasePromise = adapter.initializingPromise
      .then(async () => {
        await importLegacyRecords(database);
        await normalizePersistedTimestamps(database);
        return database;
      })
      .catch((error: unknown) => {
        databasePromise = undefined;
        throw error;
      });
  }
  return databasePromise;
}

export async function readBusinessConfigurationCache(businessId: string): Promise<string | null> {
  const database = await openLocalDatabase();
  const records = await database.get<BusinessConfigurationRecord>('business_configurations')
    .query(Q.where('business_id', businessId)).fetch();
  return records[0]?.configJson ?? null;
}

export async function writeBusinessConfigurationCache(businessId: string, configJson: string): Promise<void> {
  const database = await openLocalDatabase();
  const records = await database.get<BusinessConfigurationRecord>('business_configurations')
    .query(Q.where('business_id', businessId)).fetch();
  await database.write(async () => {
    const existing = records[0];
    if (existing) {
      await existing.update((record) => {
        record.configJson = configJson;
        record.updatedAt = Date.now();
      });
      return;
    }
    await database.get<BusinessConfigurationRecord>('business_configurations').create((record) => {
      record._raw.id = businessId;
      record.businessId = businessId;
      record.configJson = configJson;
      record.updatedAt = Date.now();
    });
  });
}
