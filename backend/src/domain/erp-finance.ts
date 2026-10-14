/** Decimal-safe helpers shared by inventory costing and the double-entry journal. */
const QUANTITY_SCALE = 1_000_000n;
const COST_SCALE = 10_000n;
const MONEY_SCALE = 100n;

function parseScaled(value: string, digits: number, label: string): bigint {
  const trimmed = value.trim();
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`${label} must be a plain decimal value`);
  }
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  if (fraction.length > digits) throw new Error(`${label} supports at most ${digits} decimal places`);
  const scaled = BigInt(whole) * 10n ** BigInt(digits)
    + BigInt((fraction + '0'.repeat(digits)).slice(0, digits) || '0');
  return negative ? -scaled : scaled;
}

function formatScaled(value: bigint, digits: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = 10n ** BigInt(digits);
  const whole = absolute / scale;
  const fraction = String(absolute % scale).padStart(digits, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function moneyToMinorUnits(value: string): bigint {
  return parseScaled(value, 2, 'Amount');
}

export function minorUnitsToMoney(value: bigint): string {
  return formatScaled(value, 2);
}

export type JournalAmount = { debit: string; credit: string };

export function assertJournalBalanced(lines: readonly JournalAmount[]): void {
  if (lines.length < 2) throw new Error('A posted journal needs at least two lines');
  let debit = 0n;
  let credit = 0n;
  for (const [index, line] of lines.entries()) {
    const lineDebit = moneyToMinorUnits(line.debit);
    const lineCredit = moneyToMinorUnits(line.credit);
    if (lineDebit < 0n || lineCredit < 0n || (lineDebit > 0n && lineCredit > 0n)) {
      throw new Error(`Journal line ${index + 1} must contain one non-negative debit or credit`);
    }
    debit += lineDebit;
    credit += lineCredit;
  }
  if (debit !== credit) {
    throw new Error(`Journal is out of balance by ${minorUnitsToMoney(debit - credit)}`);
  }
}

/** Weighted-average unit cost, rounded half-up to four decimal places. */
export function weightedAverageUnitCost(input: {
  quantityBefore: string;
  averageCostBefore: string;
  quantityReceived: string;
  receivedUnitCost: string;
}): string {
  const beforeQuantity = parseScaled(input.quantityBefore, 6, 'Quantity on hand');
  const receivedQuantity = parseScaled(input.quantityReceived, 6, 'Received quantity');
  const beforeCost = parseScaled(input.averageCostBefore, 4, 'Average cost');
  const receivedCost = parseScaled(input.receivedUnitCost, 4, 'Received unit cost');
  if (beforeQuantity < 0n || receivedQuantity < 0n || beforeCost < 0n || receivedCost < 0n) {
    throw new Error('Inventory quantities and costs cannot be negative');
  }
  const totalQuantity = beforeQuantity + receivedQuantity;
  if (totalQuantity === 0n) return '0.0000';
  const totalValueScaled = beforeQuantity * beforeCost + receivedQuantity * receivedCost;
  const half = totalQuantity / 2n;
  return formatScaled((totalValueScaled + half) / totalQuantity, 4);
}

/** Product of a six-decimal quantity and four-decimal unit cost -> two-decimal money. */
export function inventoryValue(quantity: string, unitCost: string): string {
  const quantityScaled = parseScaled(quantity, 6, 'Quantity');
  const costScaled = parseScaled(unitCost, 4, 'Unit cost');
  if (quantityScaled < 0n || costScaled < 0n) throw new Error('Quantity and cost cannot be negative');
  const valueAtMoneyScale = quantityScaled * costScaled;
  const divisor = QUANTITY_SCALE * COST_SCALE / MONEY_SCALE;
  const rounded = (valueAtMoneyScale + divisor / 2n) / divisor;
  return formatScaled(rounded, 2);
}
