/**
 * Pure invoice arithmetic (Phase 2 task 2.2, F-007).
 *
 * Money is handled as integer cents (BigInt) parsed from the canonical
 * `Decimal(12, 2)` strings the API stores, so arithmetic is exact and does
 * not depend on the generated Prisma client being importable.
 *
 * Financial rules — the invoice must never invent numbers:
 * - lineTotal = quantity × unitPrice;
 * - total is the server-recorded order total (not a re-sum), so the invoice
 *   always agrees with the order the customer was quoted;
 * - paid is the net of payment entries — PAYMENT adds, every other kind
 *   (REVERSAL, REFUND, ...) subtracts — the same rule `calculateNetPaid`
 *   applies for receipts and dashboards;
 * - balance = total − paid, never below zero (order payment caps make
 *   overpayment impossible through the API; clamping keeps a legacy or
 *   hand-adjusted row from printing a negative "amount due").
 */
export type InvoiceItemInput = {
  name: string;
  quantity: number;
  unitPrice: string;
};

export type InvoicePaymentInput = {
  kind: string;
  amount: string;
};

export type InvoiceLine = InvoiceItemInput & { lineTotal: string };

export type Invoice = {
  lines: InvoiceLine[];
  total: string;
  paid: string;
  balance: string;
};

function toCents(amount: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new Error(`Invalid money amount: ${amount}`);
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0') || '0');
  return match[1] === '-' ? -cents : cents;
}

function toAmount(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function buildInvoice(input: {
  items: readonly InvoiceItemInput[];
  total: string;
  payments: readonly InvoicePaymentInput[];
}): Invoice {
  const lines = input.items.map((item) => ({
    ...item,
    lineTotal: toAmount(toCents(item.unitPrice) * BigInt(item.quantity)),
  }));
  const paidCents = input.payments.reduce(
    (net, entry) => (entry.kind === 'PAYMENT' ? net + toCents(entry.amount) : net - toCents(entry.amount)),
    0n,
  );
  const balanceCents = toCents(input.total) - paidCents;
  return {
    lines,
    total: toAmount(toCents(input.total)),
    paid: toAmount(paidCents),
    balance: toAmount(balanceCents > 0n ? balanceCents : 0n),
  };
}
