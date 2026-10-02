import * as Crypto from 'expo-crypto';
export { openLocalDatabase } from './database';

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
