/**
 * The customer tracking API client.
 *
 * It lives outside `api.ts` on purpose: the tracking screens are lazy
 * chunks, so their request/response schemas must not sit in the workspace
 * entry bundle (the CI bundle budget guards that baseline).
 */
import { z } from 'zod';
import { uuidSchema } from '@tailor/shared';
import {
  customerMessageKindSchema,
  customerMessageStatusSchema,
  type CustomerMessageKind,
} from '@tailor/shared/tracking';
import { request } from './api';

/**
 * The response contracts for the tracking endpoints. They live here, next to
 * the only client that uses them, so their schemas stay out of the workspace
 * entry chunk (the CI bundle budget guards that baseline) — the same pattern
 * the other response schemas in this app already follow.
 */
const orderTrackingLinkSchema = z.object({
  id: uuidSchema,
  token: z.string(),
  path: z.string(),
  url: z.string().nullable(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
  lastViewedAt: z.string().nullable(),
  viewCount: z.number().int(),
});
export type OrderTrackingLink = z.infer<typeof orderTrackingLinkSchema>;

const customerMessageSchema = z.object({
  id: uuidSchema,
  orderId: uuidSchema,
  kind: customerMessageKindSchema,
  body: z.string().nullable(),
  status: customerMessageStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type CustomerMessage = z.infer<typeof customerMessageSchema>;

const publicCustomerMessageSchema = z.object({
  id: uuidSchema,
  kind: customerMessageKindSchema,
  body: z.string().nullable(),
  status: customerMessageStatusSchema,
  createdAt: z.string(),
});

const publicTrackingSchema = z.object({
  business: z.object({
    name: z.string(),
    logoUrl: z.string().nullable(),
    contactPhone: z.string().nullable(),
    currency: z.string(),
  }),
  customerName: z.string(),
  order: z.object({
    orderNumber: z.string(),
    statusLabel: z.string(),
    stageLabel: z.string().nullable(),
    promisedAt: z.string(),
    createdAt: z.string(),
    total: z.string(),
    paid: z.string(),
    outstanding: z.string(),
    currency: z.string(),
    ready: z.boolean(),
    items: z.array(z.object({
      name: z.string(),
      quantity: z.number().int(),
      unitPrice: z.string(),
      measurements: z.object({
        template: z.string(),
        values: z.record(z.string(), z.unknown()),
      }).nullable(),
    })),
    timeline: z.array(z.object({
      label: z.string(),
      at: z.string(),
    })),
    messages: z.array(publicCustomerMessageSchema),
  }),
});
export type PublicTracking = z.infer<typeof publicTrackingSchema>;

export const trackingApi = {
  /** The link the shop shares with the customer for this order. */
  link(token: string, orderId: string) {
    return request(`/orders/${orderId}/tracking-link`, z.object({ link: orderTrackingLinkSchema.nullable() }), { token });
  },
  create(token: string, orderId: string, regenerate = false) {
    return request(`/orders/${orderId}/tracking-link`, z.object({ link: orderTrackingLinkSchema }), {
      token,
      method: 'POST',
      body: { regenerate },
    });
  },
  revoke(token: string, orderId: string) {
    return request(`/orders/${orderId}/tracking-link`, z.object({ revoked: z.boolean() }), {
      token,
      method: 'DELETE',
    });
  },
  messages(token: string, orderId: string) {
    return request(`/orders/${orderId}/customer-messages`, z.object({ messages: z.array(customerMessageSchema) }), { token });
  },
  setMessageStatus(token: string, orderId: string, messageId: string, status: CustomerMessage['status']) {
    return request(`/orders/${orderId}/customer-messages/${messageId}`, z.object({
      updated: z.boolean(),
      message: customerMessageSchema.optional(),
    }), {
      token,
      method: 'PATCH',
      body: { status },
    });
  },
  /** The public page: one order, no account, the token in the link. */
  publicOrder(trackingToken: string) {
    return request(`/public/tracking/${encodeURIComponent(trackingToken)}`, publicTrackingSchema);
  },
  sendPublicMessage(trackingToken: string, input: { kind: CustomerMessageKind; body?: string }) {
    return request(`/public/tracking/${encodeURIComponent(trackingToken)}/messages`, z.object({
      message: publicCustomerMessageSchema,
    }), {
      method: 'POST',
      body: input,
    });
  },
};
