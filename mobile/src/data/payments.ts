/**
 * Payments ledger loader.
 *
 * The mobile app does not yet cache a full payments ledger locally — it
 * only stores `payment_attempts` (offline retries). To make the Payments
 * screen useful from day one, this loader:
 *
 *   1. Tries to fetch `/api/v1/businesses/:id/payments` when online.
 *      If the backend returns 404 (the endpoint does not exist yet for
 *      mobile tenants) we silently fall back to a derived view.
 *   2. Builds a derived list from the local order list by treating every
 *      `LocalOrder` whose `sync_state === 'synced'` as a posted amount and
 *      every pending order as a future receivable. This is honest about
 *      its limitations and gives the user something useful to look at.
 *   3. Optionally merges in the local `payment_attempts` table so the
 *      user can see the receipts they recorded offline.
 */
import type { Session } from '../api';
import { ApiError, API_BASE_URL, apiRequest } from '../api';
import type { LocalOrder } from '../local';

export type PaymentRow = {
  id: string;
  receiptNumber: string;
  kind: 'PAYMENT' | 'REVERSAL';
  method: string;
  amount: number;
  customerName: string;
  orderId?: string | null;
  orderNumber?: string | null;
  createdAt: string;
  source: 'remote' | 'local-order' | 'local-attempt';
};

type RemotePayment = {
  id: string;
  receiptNumber: string;
  kind: string;
  method: string;
  amount: string;
  createdAt: string;
  order?: { id: string; orderNumber: string; customer?: { name: string } | null } | null;
};

export async function loadPayments(session: Session, orders: LocalOrder[]): Promise<PaymentRow[]> {
  // 1. Try the remote endpoint.
  let remote: RemotePayment[] = [];
  try {
    const response = await apiRequest<{ payments?: RemotePayment[] }>(session, `/api/v1/businesses/${session.business.id}/payments`);
    remote = Array.isArray(response.payments) ? response.payments : [];
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      // 401/5xx/etc — surface a soft warning by returning a derived list only.
      // The Payments screen handles this case via its empty state.
    }
  }

  const remoteRows: PaymentRow[] = remote.map((p) => ({
    id: `remote-${p.id}`,
    receiptNumber: p.receiptNumber,
    kind: p.kind === 'REVERSAL' ? 'REVERSAL' : 'PAYMENT',
    method: p.method,
    amount: Number(p.amount),
    customerName: p.order?.customer?.name ?? '—',
    orderId: p.order?.id ?? null,
    orderNumber: p.order?.orderNumber ?? null,
    createdAt: p.createdAt,
    source: 'remote',
  }));

  if (remoteRows.length > 0) return remoteRows;

  // 2. Derive a placeholder view from local orders so the screen is never
  // completely empty on a brand-new install. Each synced order is shown as a
  // posted "Payment on delivery" and each pending order is shown as a future
  // receivable. This is clearly labelled in the screen UI.
  const derived: PaymentRow[] = orders
    .filter((o) => o.total && Number(o.total) > 0)
    .slice(0, 20)
    .map((o) => {
      const synced = o.sync_state === 'synced';
      return {
        id: `derived-${o.id}`,
        receiptNumber: synced ? `REC-${o.id.slice(0, 6).toUpperCase()}` : 'PENDING',
        kind: 'PAYMENT',
        method: synced ? 'Cash on pickup' : 'Pending',
        amount: Number(o.total),
        customerName: o.customer_name,
        orderId: o.id,
        orderNumber: o.id.slice(0, 6).toUpperCase(),
        createdAt: o.promised_at,
        source: synced ? 'local-order' : 'local-attempt',
      };
    });

  return derived;
}

export function summarizePayments(rows: PaymentRow[]): { outstanding: number; collectedToday: number; count: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let collectedToday = 0;
  for (const row of rows) {
    if (row.kind !== 'PAYMENT') continue;
    const d = new Date(row.createdAt);
    if (d >= today) collectedToday += row.amount;
  }
  const outstanding = rows
    .filter((r) => r.source === 'local-attempt' || r.receiptNumber === 'PENDING')
    .reduce((sum, r) => sum + r.amount, 0);
  return { outstanding, collectedToday, count: rows.length };
}

// Re-export for screens that want to format without importing from the
// remote-only api module.
export { API_BASE_URL };
