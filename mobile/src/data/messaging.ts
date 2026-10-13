/**
 * Helpers for the customer-contact actions (WhatsApp, call) and receipt text.
 * WhatsApp opens the user's own WhatsApp with the message prepared; the user
 * presses send there. Nothing is sent silently from the device.
 */
import { normalizePhone } from './phone';

/** WhatsApp chat URL for a stored phone number, or null when there is no usable number. */
export function whatsappUrl(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  const digits = normalizePhone(phone);
  if (digits.length < 8) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

/** Dialer URL for a stored phone number, or null when there is no usable number. */
export function telUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = normalizePhone(phone);
  if (digits.length < 8) return null;
  return `tel:+${digits}`;
}

export function receiptMessage(input: {
  businessName: string;
  receiptLabel: string;
  receiptNumber: string;
  amount: string;
  date: string;
  customerName: string;
}): string {
  return [
    input.businessName,
    `${input.receiptLabel}: ${input.receiptNumber}`,
    `${input.customerName}`,
    `${input.amount} · ${input.date}`,
  ].join('\n');
}
