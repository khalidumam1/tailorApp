/**
 * Pure ledger arithmetic (no network or native imports) so it can be tested.
 * Reversals subtract from collections.
 */
export type PaymentRow = {
  id: string;
  receiptNumber: string;
  kind: 'PAYMENT' | 'REVERSAL';
  method: string;
  amount: number;
  customerName: string;
  customerId: string | null;
  customerPhone: string | null;
  orderId: string | null;
  orderNumber: string | null;
  createdAt: string;
};

/** Net amount collected from the given rows (reversals subtract). */
export function netCollected(rows: PaymentRow[]): number {
  return rows.reduce((sum, row) => sum + (row.kind === 'REVERSAL' ? -row.amount : row.amount), 0);
}

export function summarizePayments(rows: PaymentRow[]): { collectedToday: number; collectedThisMonth: number; count: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const todayRows = rows.filter((row) => new Date(row.createdAt) >= today);
  const monthRows = rows.filter((row) => new Date(row.createdAt) >= monthStart);
  return {
    collectedToday: netCollected(todayRows),
    collectedThisMonth: netCollected(monthRows),
    count: rows.length,
  };
}
