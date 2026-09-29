import { Prisma } from '@prisma/client';

export type LedgerKind = 'PAYMENT' | 'REVERSAL';
export type LedgerEntry = { kind: LedgerKind; amount: Prisma.Decimal | string | number };

export function calculateNetPaid(entries: readonly LedgerEntry[]): Prisma.Decimal {
  return entries.reduce((net, entry) => {
    const amount = new Prisma.Decimal(entry.amount);
    return entry.kind === 'PAYMENT' ? net.plus(amount) : net.minus(amount);
  }, new Prisma.Decimal(0));
}

export function calculateOutstanding(
  orderTotal: Prisma.Decimal | string | number,
  entries: readonly LedgerEntry[],
): Prisma.Decimal {
  return new Prisma.Decimal(orderTotal).minus(calculateNetPaid(entries));
}
