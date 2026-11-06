/**
 * Customer order-tracking links.
 *
 * A tracking link is an opaque token that lets a customer follow one order
 * without an account. The token is random, carries no data and is stored
 * alongside the order, so:
 *   - a leaked link cannot be enumerated (there is nothing to guess from it),
 *   - revoking a link immediately stops access,
 *   - nothing in the public payload can reach another tenant's data.
 */
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { env } from '../config.js';

/** Where the public page lives on the web app (served as a SPA route). */
export const TRACKING_PATH_PREFIX = '/track';

/**
 * 24 random bytes → 32 URL-safe characters. Long enough that guessing is
 * hopeless, short enough to paste into a WhatsApp message.
 */
export function generateTrackingToken(): string {
  return randomBytes(24).toString('base64url');
}

/** The path on the web app that renders the public tracking page. */
export function trackingPath(token: string): string {
  return `${TRACKING_PATH_PREFIX}/${token}`;
}

/**
 * The absolute link to share with the customer. It is only absolute when the
 * deployment knows its public web origin; otherwise the caller gets the path
 * and builds the URL against the origin the staff member is already using.
 */
export function trackingUrl(token: string): string | null {
  const base = env.PUBLIC_WEB_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}${trackingPath(token)}`;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Order placed',
  MEASUREMENT_CONFIRMED: 'Measurements confirmed',
  CUTTING: 'Cutting',
  STITCHING: 'Stitching',
  FINISHING: 'Finishing',
  READY_FOR_PICKUP: 'Ready for pickup',
  COLLECTED: 'Collected',
  CANCELLED: 'Cancelled',
};

/** Human label for the legacy order status enum. */
export function orderStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export interface TrackingTimelineEntry {
  label: string;
  at: string;
}

/**
 * The customer-facing progress timeline: the order itself, then every stage
 * it moved through. Internal notes and staff names are deliberately absent.
 */
export function buildTrackingTimeline(order: {
  createdAt: Date;
  workflowHistory: Array<{ toStageLabel: string; createdAt: Date }>;
  statusHistory: Array<{ toStatus: string; createdAt: Date }>;
}): TrackingTimelineEntry[] {
  const timeline: TrackingTimelineEntry[] = [
    { label: 'Order placed', at: order.createdAt.toISOString() },
  ];
  if (order.workflowHistory.length > 0) {
    for (const entry of order.workflowHistory) {
      timeline.push({ label: entry.toStageLabel, at: entry.createdAt.toISOString() });
    }
  } else {
    for (const entry of order.statusHistory) {
      timeline.push({ label: orderStatusLabel(entry.toStatus), at: entry.createdAt.toISOString() });
    }
  }
  return timeline;
}

/**
 * The customer's own measurements for one order item. Only the measurement
 * values the customer gave are exposed — never the revision id or who
 * measured them.
 */
export function measurementSummary(snapshot: Prisma.JsonValue | null | undefined): {
  template: string;
  values: Record<string, unknown>;
} | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const record = snapshot as Record<string, unknown>;
  const values = record.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
  const template = typeof record.template === 'string' && record.template.trim()
    ? record.template
    : 'Measurements';
  return {
    template,
    values: values as Record<string, unknown>,
  };
}

/**
 * The customer's first name only. A public link should greet the customer
 * without exposing the full name of the person who ordered.
 */
export function customerDisplayName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return 'Customer';
  const first = trimmed.split(/\s+/)[0];
  return first.length > 40 ? first.slice(0, 40) : first;
}
