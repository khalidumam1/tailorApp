/**
 * Payments ledger loader.
 *
 * Reads the real payment ledger from `GET /api/v1/payments` (the same data the
 * web Payments screen shows). Only recorded payments and reversals are
 * returned — nothing is invented from order totals. The ledger needs a
 * connection; the screen explains this when offline.
 */
import type { Session } from '../api';
import { apiRequest } from '../api';
import { summarizePayments } from './ledger';

export { netCollected, summarizePayments } from './ledger';

export type { PaymentRow } from './ledger';
import type { PaymentRow } from './ledger';

type RemotePayment = {
  id: string;
  receiptNumber: string;
  kind: string;
  method: string;
  amount: string;
  createdAt: string;
  order?: {
    id: string;
    orderNumber: string;
    customer?: { id: string; name: string; phone?: string | null } | null;
  } | null;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 30;

/**
 * Loads the ledger newest first, following the cursor so month and today
 * totals are complete (capped at MAX_PAGES * PAGE_SIZE rows).
 */
export async function loadPayments(session: Session): Promise<PaymentRow[]> {
  const rows: PaymentRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = `limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const response: { data?: { items?: RemotePayment[]; nextCursor?: string | null } } = await apiRequest(
      session,
      `/api/v1/payments?${query}`,
    );
    const items = response.data?.items ?? [];
    rows.push(...items.map(toRow));
    cursor = response.data?.nextCursor ?? null;
    if (!cursor || items.length === 0) break;
  }
  return rows;
}

function toRow(payment: RemotePayment): PaymentRow {
  return {
    id: payment.id,
    receiptNumber: payment.receiptNumber,
    kind: payment.kind === 'REVERSAL' ? 'REVERSAL' : 'PAYMENT',
    method: payment.method,
    amount: Number(payment.amount),
    customerName: payment.order?.customer?.name ?? '—',
    customerId: payment.order?.customer?.id ?? null,
    customerPhone: payment.order?.customer?.phone ?? null,
    orderId: payment.order?.id ?? null,
    orderNumber: payment.order?.orderNumber ?? null,
    createdAt: payment.createdAt,
  };
}
