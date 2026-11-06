/**
 * The customer link section on an order card.
 *
 * It lives in its own lazy chunk: only staff who reach an order card with the
 * customer link download it, so the workspace entry bundle does not grow with
 * the feature (the CI bundle budget guards that baseline).
 */
import { useCallback, useEffect, useState } from 'react';
import { normalizePakistanPhone } from '@tailor/shared';
import { ApiError } from './api';
import { trackingApi, type CustomerMessage, type OrderTrackingLink } from './tracking-api';

/** How a customer message reads in the business workspace. */
const CUSTOMER_MESSAGE_LABELS: Record<CustomerMessage['kind'], string> = {
  FITTING_CONFIRMED: 'Customer confirmed the details',
  QUESTION: 'Customer asked a question',
  CHANGE_REQUESTED: 'Customer requested a change',
};

/** The WhatsApp share link for a tracking link (empty when the phone is unusable). */
function whatsappTrackingUrl(phone: string, orderNumber: string, url: string): string | null {
  const digits = normalizePakistanPhone(phone);
  if (!digits || digits.length < 8) return null;
  const text = `Assalam-o-Alaikum, you can follow your order ${orderNumber} here: ${url}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export interface OrderTrackingSectionProps {
  order: { id: string; orderNumber: string; customer: { name: string; phone: string } };
  permissions: { has: (permission: string) => boolean };
  disabled: boolean;
  withSession: <T>(action: (token: string) => Promise<T>) => Promise<T>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

export function OrderTrackingSection({
  order,
  permissions,
  disabled,
  withSession,
  onNotice,
  onError,
}: OrderTrackingSectionProps) {
  const { id: orderId, orderNumber, customer } = order;
  const canShare = permissions.has('orders:share');
  const canWrite = permissions.has('orders:write');
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<OrderTrackingLink | null>(null);
  const [messages, setMessages] = useState<CustomerMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await withSession(async (token) => {
        const [linkResult, messageResult] = await Promise.all([
          trackingApi.link(token, orderId),
          trackingApi.messages(token, orderId),
        ]);
        return { link: linkResult.link, messages: messageResult.messages };
      });
      setLink(loaded.link);
      setMessages(loaded.messages);
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : 'The tracking link could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [onError, orderId, withSession]);

  // The link and the messages are only fetched when the panel is opened — an
  // order list must not fire two requests per card.
  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  const linkUrl = link ? (link.url ?? `${window.location.origin}${link.path}`) : '';

  const createLink = async () => {
    setWorking(true);
    try {
      const result = await withSession((token) => trackingApi.create(token, orderId));
      setLink(result.link);
      const url = result.link.url ?? `${window.location.origin}${result.link.path}`;
      try {
        await navigator.clipboard?.writeText(url);
        onNotice(`Tracking link created and copied. Order ${orderNumber} can now be followed by the customer.`);
      } catch {
        onNotice(`Tracking link created for order ${orderNumber}.`);
      }
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : 'The tracking link could not be created.');
    } finally {
      setWorking(false);
    }
  };

  const revokeLink = async () => {
    setWorking(true);
    try {
      await withSession((token) => trackingApi.revoke(token, orderId));
      setLink(null);
      onNotice(`Tracking link for order ${orderNumber} revoked. The customer can no longer open it.`);
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : 'The tracking link could not be revoked.');
    } finally {
      setWorking(false);
    }
  };

  const setMessageStatus = async (message: CustomerMessage, status: CustomerMessage['status']) => {
    setWorking(true);
    try {
      await withSession((token) => trackingApi.setMessageStatus(token, orderId, message.id, status));
      setMessages((current) => current.map((item) => (item.id === message.id
        ? { ...item, status, resolvedAt: status === 'RESOLVED' ? new Date().toISOString() : null }
        : item)));
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : 'The message could not be updated.');
    } finally {
      setWorking(false);
    }
  };

  const shareUrl = whatsappTrackingUrl(customer.phone, orderNumber, linkUrl);

  const linkBody = !canShare ? (
    <p className="muted">You do not have permission to share tracking links.</p>
  ) : link && !link.revokedAt ? (
    <>
      <p className="muted">Share this link so the customer can follow the order without calling the shop.</p>
      <code className="tracking-url">{linkUrl}</code>
      <div className="row-actions">
        <button
          className="button button-secondary"
          disabled={working}
          onClick={() => {
            void navigator.clipboard?.writeText(linkUrl);
            onNotice('Tracking link copied.');
          }}
        >Copy link</button>
        {shareUrl ? (
          <a className="button button-secondary" href={shareUrl} target="_blank" rel="noreferrer">Send on WhatsApp</a>
        ) : null}
        <button className="button button-danger-quiet" disabled={working} onClick={() => void revokeLink()}>Revoke link</button>
      </div>
      <p className="fine-print">
        Opened {link.viewCount} time(s)
        {link.lastViewedAt ? ` · last opened ${new Date(link.lastViewedAt).toLocaleDateString()}` : ''}
      </p>
    </>
  ) : (
    <>
      <p className="muted">
        No tracking link for this order yet. Create one and send it to {customer.name}.
      </p>
      <button className="button button-primary" disabled={working} onClick={() => void createLink()}>
        Create tracking link
      </button>
    </>
  );

  return (
    <div className="tracking-block">
      <button
        className="button button-secondary"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? 'Hide customer link' : 'Customer link'}
      </button>
      {open ? (
        <div className="tracking-panel">
          {loading ? <p className="muted">Loading the customer link…</p> : linkBody}
          <div className="customer-messages">
            <h4>Customer messages</h4>
            {messages.length === 0 ? (
              <p className="muted">No messages from the customer yet.</p>
            ) : messages.map((message) => (
              <div className="customer-message" key={message.id}>
                <div>
                  <strong>{CUSTOMER_MESSAGE_LABELS[message.kind]}</strong>
                  {message.body ? <p className="muted">{message.body}</p> : null}
                  <p className="fine-print">
                    {new Date(message.createdAt).toLocaleDateString()} · {message.status === 'RESOLVED' ? 'Answered' : 'Waiting for a reply'}
                  </p>
                </div>
                {canWrite ? (message.status === 'OPEN'
                  ? <button className="button button-secondary" disabled={working} onClick={() => void setMessageStatus(message, 'RESOLVED')}>Mark answered</button>
                  : <button className="button button-secondary" disabled={working} onClick={() => void setMessageStatus(message, 'OPEN')}>Reopen</button>) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
