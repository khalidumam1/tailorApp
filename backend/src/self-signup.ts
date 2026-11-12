/**
 * The pure half of public self-signup.
 *
 * Kept apart from the route on purpose: these are the rules a public endpoint
 * has to get right with no safety net — a slug that is always unique and
 * always URL-shaped, a kill switch that fails closed, and a plan payload that
 * shows a buyer the price and nothing else — and keeping them free of express,
 * config and the database lets them be tested with nothing running.
 */

import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';

/** Where the platform console's self-signup switch lives. */
export const SELF_SIGNUP_SETTING_KEY = 'signup';

/** Lowercase, ASCII, hyphen-separated, trimmed to the column width. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/**
 * First free slug at or after `base`: `acme`, then `acme-2`, `acme-3`...
 * Returns a random-suffixed slug if the first fifty are all taken, so a busy
 * base never turns into an unbounded loop.
 */
export async function findAvailableSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const candidates = [base];
  for (let index = 2; index <= 50; index += 1) candidates.push(`${base}-${index}`);
  for (const candidate of candidates) {
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${randomBytes(4).toString('hex')}`.slice(0, 80).replace(/-+$/, '');
}

/**
 * Self-signup is opt-in. A missing setting means off, so shipping this code
 * never silently opens a public endpoint on an existing deployment — which
 * matters here because merging to main deploys the backend.
 */
export function isSelfSignupEnabled(value: unknown): boolean {
  return typeof value === 'object'
    && value !== null
    && 'enabled' in value
    && (value as { enabled: unknown }).enabled === true;
}

export interface PublicPlanInput {
  id: string;
  name: string;
  description: string | null;
  monthlyPrice: Prisma.Decimal;
  yearlyPrice: Prisma.Decimal;
  currency: string;
  trialDays: number;
  features: Prisma.JsonValue;
  limits: Prisma.JsonValue;
}

/** Only what a buyer needs to choose a plan. Nothing internal. */
export function toPublicPlan(plan: PublicPlanInput) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice.toFixed(2),
    yearlyPrice: plan.yearlyPrice.toFixed(2),
    currency: plan.currency,
    trialDays: plan.trialDays,
    features: plan.features,
    limits: plan.limits,
  };
}
