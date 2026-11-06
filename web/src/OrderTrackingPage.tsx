/**
 * The public customer tracking page.
 *
 * A customer opens the link the shop shared (usually in WhatsApp) and sees
 * where their order is, what it costs, what is still due and when it will be
 * ready — without creating an account. They can also confirm their fitting
 * details or ask the shop a question, and the answer lands on the order in
 * the business workspace.
 *
 * The page is deliberately narrow: one order, no internal notes, no other
 * customers, nothing the customer did not already know about their own work.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CustomerMessageKind } from '@tailor/shared/tracking';
import { ApiError } from './api';
import { trackingApi, type PublicTracking } from './tracking-api';

const MESSAGE_LABELS: Record<CustomerMessageKind, string> = {
  FITTING_CONFIRMED: 'My details are correct',
  QUESTION: 'I have a question',
  CHANGE_REQUESTED: 'I want to request a change',
};

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMoney(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function OrderTrackingPage({ token }: { token: string | null }) {
  const [tracking, setTracking] = useState<PublicTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [kind, setKind] = useState<CustomerMessageKind>('FITTING_CONFIRMED');
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError('This tracking link is not valid. Please ask the shop for a new link.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setTracking(await trackingApi.publicOrder(token));
    } catch (cause) {
      setError(cause instanceof ApiError
        ? cause.message
        : 'This tracking link could not be opened. Please check the link or call the shop.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const trimmed = body.trim();
    if (kind !== 'FITTING_CONFIRMED' && !trimmed) {
      setNotice('Please write your message before sending it.');
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      await trackingApi.sendPublicMessage(token, { kind, ...(trimmed ? { body: trimmed } : {}) });
      setBody('');
      setTracking(await trackingApi.publicOrder(token));
      setNotice('Thank you — the shop has received your message.');
    } catch (cause) {
      setNotice(cause instanceof ApiError ? cause.message : 'Your message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <main className="tracking-page">
        <div className="tracking-card" role="status">
          <span className="spinner" aria-hidden="true" />
          <p>Loading your order…</p>
        </div>
      </main>
    );
  }

  if (error || !tracking) {
    return (
      <main className="tracking-page">
        <div className="tracking-card">
          <h1>Tracking link unavailable</h1>
          <p className="muted">{error ?? 'This tracking link is not valid.'}</p>
          <p className="fine-print">Ask the shop to share the tracking link again — it may have been replaced.</p>
        </div>
      </main>
    );
  }

  const { business, order } = tracking;
  const needsMessage = Number(order.outstanding) > 0;

  return (
    <main className="tracking-page">
      <header className="tracking-header">
        {business.logoUrl ? (
          <img className="tracking-logo" src={business.logoUrl} alt="" />
        ) : null}
        <div>
          <p className="eyebrow">Order tracking</p>
          <h1>{business.name}</h1>
          <p className="muted">Hello {tracking.customerName} — here is your order {order.orderNumber}.</p>
        </div>
      </header>

      <section className="tracking-card" aria-label="Order status">
        <div className="tracking-status">
          <span className="tracking-status-label">Current stage</span>
          <strong className="tracking-status-value">{order.statusLabel}</strong>
        </div>
        <dl className="tracking-facts">
          <div><dt>Ready by</dt><dd>{formatDate(order.promisedAt)}</dd></div>
          <div><dt>Ordered on</dt><dd>{formatDate(order.createdAt)}</dd></div>
          <div><dt>Total</dt><dd>{formatMoney(order.total, order.currency)}</dd></div>
          <div><dt>Paid</dt><dd>{formatMoney(order.paid, order.currency)}</dd></div>
          <div className={needsMessage ? 'tracking-due' : undefined}>
            <dt>Balance due</dt><dd>{formatMoney(order.outstanding, order.currency)}</dd>
          </div>
        </dl>
        {order.ready ? (
          <p className="tracking-ready">Your order is ready. Please call the shop to arrange pickup.</p>
        ) : null}
        {business.contactPhone ? (
          <a className="button button-primary" href={`tel:${business.contactPhone}`}>Call the shop</a>
        ) : null}
      </section>

      <section className="tracking-card" aria-label="Items">
        <h2>Items</h2>
        <ul className="tracking-items">
          {order.items.map((item) => (
            <li key={item.name}>
              <div className="tracking-item-head">
                <strong>{item.quantity} × {item.name}</strong>
                <span>{formatMoney(String(Number(item.unitPrice) * item.quantity), order.currency)}</span>
              </div>
              {item.measurements ? (
                <p className="fine-print">
                  {item.measurements.template}: {Object.entries(item.measurements.values)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(' · ')}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="tracking-card" aria-label="Progress">
        <h2>Progress</h2>
        <ol className="tracking-timeline">
          {order.timeline.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span className="tracking-timeline-dot" aria-hidden="true" />
              <div>
                <strong>{entry.label}</strong>
                <p className="fine-print">{formatDate(entry.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="tracking-card" aria-label="Messages">
        <h2>Messages</h2>
        {order.messages.length === 0 ? (
          <p className="muted">No messages yet. Confirm your details or ask a question below.</p>
        ) : (
          <ul className="tracking-messages">
            {order.messages.map((message) => (
              <li key={message.id}>
                <strong>{MESSAGE_LABELS[message.kind]}</strong>
                {message.body ? <p className="muted">{message.body}</p> : null}
                <p className="fine-print">
                  {formatDate(message.createdAt)}{message.status === 'RESOLVED' ? ' · Answered by the shop' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        <form className="tracking-form" onSubmit={(event) => void sendMessage(event)}>
          <label htmlFor="tracking-kind">What would you like to tell the shop?</label>
          <select id="tracking-kind" value={kind} onChange={(event) => setKind(event.target.value as CustomerMessageKind)}>
            {Object.entries(MESSAGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <label htmlFor="tracking-message">Message</label>
          <textarea
            id="tracking-message"
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={kind === 'FITTING_CONFIRMED' ? 'Optional: anything the shop should know' : 'Write your message'}
            maxLength={1000}
            required={kind !== 'FITTING_CONFIRMED'}
          />
          <button className="button button-primary" type="submit" disabled={sending}>
            {sending ? 'Sending…' : 'Send to the shop'}
          </button>
          {notice ? <p className="fine-print">{notice}</p> : null}
        </form>
      </section>

      <p className="fine-print tracking-footer">
        This page shows one order only. For anything else, please contact {business.name} directly.
      </p>
    </main>
  );
}
