import * as Crypto from 'expo-crypto';
export {
  openLocalDatabase,
  readBusinessConfigurationCache,
  writeBusinessConfigurationCache,
} from './database';

export interface LocalCustomer {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  notes: string;
  custom_fields_json?: string | null;
  version: number;
  sync_state: string;
}

export interface LocalOrder {
  id: string;
  business_id: string;
  customer_id: string;
  customer_name: string;
  garment_name: string;
  item_type_key?: string | null;
  item_name?: string | null;
  quantity: number;
  unit_price: string;
  promised_at: string;
  status: string;
  workflow_stage_key?: string | null;
  order_custom_fields_json?: string | null;
  item_custom_fields_json?: string | null;
  total: string;
  version: number;
  sync_state: string;
}

export interface LocalCatalogItem {
  id: string;
  business_id: string;
  typeKey: string;
  name: string;
  description: string | null;
  sku: string | null;
  unit: string;
  unitPrice: string | null;
  sortOrder: number;
  version: number;
  active: boolean;
  customFields: Record<string, unknown>;
  syncState: string;
}

export interface LocalTemplate {
  id: string;
  name: string;
  fields: Array<{ key: string; label: string; unit: string; required: boolean }>;
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

export function formatCurrency(value: string | number, currency = 'PKR'): string {
  const [whole = '0', fraction = '00'] = String(value).split('.');
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}
