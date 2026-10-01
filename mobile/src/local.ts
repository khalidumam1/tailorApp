import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DATABASE_KEY = 'tailorapp.sqlite.key.v1';

export interface LocalCustomer {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  notes: string;
  version: number;
  sync_state: string;
}

export interface LocalOrder {
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
  version: number;
  sync_state: string;
}

export interface LocalTemplate {
  id: string;
  name: string;
  fields: Array<{ key: string; label: string; unit: string; required: boolean }>;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

export function openLocalDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('tailorapp.db').then(async (database) => {
      const cipher = await database.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
      if (!cipher?.cipher_version) {
        throw new Error('Encrypted offline storage is unavailable in this app build');
      }
      let key = await SecureStore.getItemAsync(DATABASE_KEY);
      if (key) {
        await database.execAsync(`PRAGMA key = "x'${key}'"`);
        await database.getFirstAsync('SELECT count(*) AS count FROM sqlite_master');
      } else {
        key = Array.from(Crypto.getRandomBytes(32), (value) => value.toString(16).padStart(2, '0')).join('');
        await database.getFirstAsync('SELECT count(*) AS count FROM sqlite_master');
        await database.execAsync(`PRAGMA rekey = "x'${key}'"`);
        await database.execAsync(`PRAGMA key = "x'${key}'"`);
        await database.getFirstAsync('SELECT count(*) AS count FROM sqlite_master');
        await SecureStore.setItemAsync(DATABASE_KEY, key);
      }
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS app_customers (
          id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL,
          name TEXT NOT NULL, phone TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
          version INTEGER NOT NULL DEFAULT 0, sync_state TEXT NOT NULL DEFAULT 'pending',
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS app_customers_business_idx ON app_customers(business_id, name);
        CREATE TABLE IF NOT EXISTS app_orders (
          id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, customer_id TEXT NOT NULL,
          customer_name TEXT NOT NULL, garment_name TEXT NOT NULL, quantity INTEGER NOT NULL,
          unit_price TEXT NOT NULL, promised_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'NEW',
          total TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 0,
          sync_state TEXT NOT NULL DEFAULT 'pending', updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS app_orders_business_idx ON app_orders(business_id, promised_at);
        CREATE TABLE IF NOT EXISTS app_templates (
          id TEXT NOT NULL, business_id TEXT NOT NULL, name TEXT NOT NULL,
          fields_json TEXT NOT NULL, PRIMARY KEY(id, business_id)
        );
        CREATE TABLE IF NOT EXISTS app_measurements (
          id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, customer_id TEXT NOT NULL,
          template_id TEXT NOT NULL, template_name TEXT NOT NULL, values_json TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '', measured_at TEXT NOT NULL, sync_state TEXT NOT NULL DEFAULT 'pending'
        );
        CREATE INDEX IF NOT EXISTS app_measurements_customer_idx ON app_measurements(business_id, customer_id);
        CREATE TABLE IF NOT EXISTS app_outbox (
          operation_id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL, entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL, base_version INTEGER, payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
          next_retry_at INTEGER NOT NULL DEFAULT 0, last_error TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS app_outbox_ready_idx ON app_outbox(business_id, status, created_at);
        CREATE TABLE IF NOT EXISTS app_sync_state (
          business_id TEXT PRIMARY KEY NOT NULL, cursor TEXT, last_successful_sync TEXT,
          last_error TEXT
        );
        CREATE TABLE IF NOT EXISTS app_payment_attempts (
          idempotency_key TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL,
          order_id TEXT NOT NULL, amount TEXT NOT NULL, method TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending', last_error TEXT,
          created_at TEXT NOT NULL
        );
      `);
      return database;
    }).catch((error: unknown) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

export function createClientId(): string {
  return Crypto.randomUUID();
}

export function normalizePhone(value: string): string {
  let compact = value.replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  const digits = compact.replace(/\D/g, '');
  if (compact.startsWith('+92') || digits.startsWith('92')) {
    return `92${digits.slice(2).replace(/^0/, '')}`;
  }
  if (digits.startsWith('0')) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}

export function amountToMinorUnits(value: string): bigint {
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(value)) {
    throw new Error('Enter a valid amount with up to two decimal places');
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function formatPkr(value: string | number): string {
  const [whole = '0', fraction = '00'] = String(value).split('.');
  return `PKR ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}
