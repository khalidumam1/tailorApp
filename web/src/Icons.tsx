/**
 * Simple, bold, instantly-recognisable pictograms for navigation.
 *
 * Design rules (kept deliberately strict so the app stays usable for
 * people who cannot read, or are not confident readers):
 *  - Every icon is a literal, familiar object (a shirt, a ruler, a
 *    person) — never an abstract shape, letter or logo-only mark.
 *  - One consistent stroke weight and corner style across the whole set,
 *    so the app still looks like one professional product, not a mix of
 *    icon packs.
 *  - Icons always render with `currentColor`, so the surrounding
 *    nav item controls colour/contrast (active vs inactive, dark vs light
 *    sidebar) without needing extra icon variants.
 */
import type { JSX } from 'react';

const common = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export type IconName =
  | 'dashboard'
  | 'orders'
  | 'catalog'
  | 'customers'
  | 'measurements'
  | 'payments'
  | 'notifications'
  | 'subscription'
  | 'configuration'
  | 'businesses'
  | 'templates'
  | 'staff'
  | 'audit'
  | 'health'
  | 'billing'
  | 'plans'
  | 'paymentQueue'
  | 'billingSettings'
  | 'settings'
  | 'branding'
  | 'sun'
  | 'moon'
  | 'reports'
  | 'signOut'
  | 'home'
  | 'inbox'
  | 'plus'
  | 'clock'
  | 'progress'
  | 'warning'
  | 'trendUp'
  | 'check';

const paths: Record<IconName, JSX.Element> = {
  // House — "overview / home base".
  dashboard: (
    <>
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6 9.8V20h12V9.8" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  home: (
    <>
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6 9.8V20h12V9.8" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  // Folded shirt — orders/garments.
  orders: (
    <path d="M9 4h6l1.6 2.1L19 7.6l-2.3 2.3-.7-.6V19a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9.3l-.7.6L5 7.6l2.4-1.5L9 4Z" />
  ),
  // Price tag — catalog.
  catalog: (
    <>
      <path d="M12.6 3.6 20 11l-8.4 8.4a2 2 0 0 1-2.8 0L4 14.6a2 2 0 0 1 0-2.8L12.6 3.6Z" />
      <path d="M4 14.6 12.6 6" />
      <circle cx="14.7" cy="8.9" r="1.3" />
    </>
  ),
  // Two people — customers.
  customers: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <circle cx="17" cy="8.5" r="2.3" />
      <path d="M15.3 14.8c2.6.2 4.7 2.3 4.7 5.2" />
    </>
  ),
  // Ruler — measurements.
  measurements: (
    <>
      <rect x="3.3" y="7.8" width="17.4" height="8.4" rx="1.4" transform="rotate(-18 12 12)" />
      <path d="m8.1 9.8.9 2.4M11.2 8.7l.9 2.4M14.3 7.6l.9 2.4" />
    </>
  ),
  // Bank note / rupee — payments.
  payments: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.3 6.5v11M17.7 6.5v11" />
    </>
  ),
  // Chat bubble — WhatsApp notifications.
  notifications: (
    <>
      <path d="M12 4a8 8 0 0 0-6.9 12.1L4 20l4-1a8 8 0 1 0 4-15Z" />
      <path d="M9 11.2c.3 1.9 2 3.6 3.9 3.9" />
    </>
  ),
  // Credit card — subscription/billing.
  subscription: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
      <path d="M3 10h18" />
      <path d="M6.5 14.3h4" />
    </>
  ),
  // Gear — settings/configuration.
  configuration: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.3M12 18.2v2.3M4.9 6.4l1.6 1.6M17.5 16l1.6 1.6M3.5 12h2.3M18.2 12h2.3M4.9 17.6l1.6-1.6M17.5 8l1.6-1.6" />
    </>
  ),
  // Sliders — platform settings.
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </>
  ),
  // Building — platform businesses.
  businesses: (
    <>
      <path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V20" />
      <path d="M15 11h3.5A1.5 1.5 0 0 1 20 12.5V20" />
      <path d="M5 20h15" />
      <path d="M8 7.5h1M8 11h1M8 14.5h1M11.5 7.5h1M11.5 11h1M11.5 14.5h1M16.5 14.5h1" />
    </>
  ),
  // Layout grid — business templates.
  templates: (
    <>
      <rect x="3.5" y="3.5" width="8" height="8" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.2" />
      <rect x="13.5" y="10.5" width="7" height="10" rx="1.2" />
      <rect x="3.5" y="13.5" width="8" height="7" rx="1.2" />
    </>
  ),
  // Person with badge — platform staff.
  staff: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
      <path d="M12 12.5v3M10.6 14h2.8" />
    </>
  ),
  // Clipboard with check — audit history.
  audit: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16" rx="1.6" />
      <path d="M9 4.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.5" />
      <path d="m9 13 2 2 4-4.2" />
    </>
  ),
  // Heart with pulse — system health.
  health: (
    <>
      <path d="M12 19.5s-7-4.3-7-9.8A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7 2.6c0 5.5-7 9.8-7 9.8Z" />
      <path d="M8.3 12.3h2l1.2-2.2 1.4 3.6 1-1.4h1.8" />
    </>
  ),
  // Receipt — subscriptions/billing (platform).
  billing: (
    <>
      <path d="M6 3.5h12v17l-2.2-1.5-2 1.5-1.8-1.5-2 1.5-2-1.5-2 1.5v-17Z" />
      <path d="M8.5 8h7M8.5 11.3h7M8.5 14.6h4.5" />
    </>
  ),
  // Stacked layers — plans.
  plans: (
    <>
      <path d="m12 3.5 8 4.2-8 4.2-8-4.2 8-4.2Z" />
      <path d="m4 12 8 4.2 8-4.2" />
      <path d="m4 15.8 8 4.2 8-4.2" />
    </>
  ),
  // Wallet — payment review queue.
  paymentQueue: (
    <>
      <path d="M4 7.3A1.8 1.8 0 0 1 5.8 5.5h11.4A1.8 1.8 0 0 1 19 7.3V9H4V7.3Z" />
      <path d="M4 9h16v8.7a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 17.7V9Z" />
      <circle cx="15.5" cy="13.5" r="1.4" />
    </>
  ),
  // Sliders — billing settings.
  billingSettings: (
    <>
      <path d="M5 6.5h14M5 12h14M5 17.5h14" />
      <circle cx="9" cy="6.5" r="1.9" />
      <circle cx="16" cy="12" r="1.9" />
      <circle cx="10.5" cy="17.5" r="1.9" />
    </>
  ),
  branding: (
    <>
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4m9.2 9.2L18 18M18 6l-1.4 1.4m-9.2 9.2L6 18" />
      <circle cx="12" cy="12" r="4.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2M12 19.2v2M4.8 4.8l1.4 1.4m11.6 11.6 1.4 1.4M2.8 12h2m14.4 0h2M4.8 19.2l1.4-1.4M17.8 6.2l1.4-1.4" />
    </>
  ),
  moon: <path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z" />,
  // Bar chart — reports.
  reports: (
    <>
      <path d="M4 20V10.5M10 20V6M16 20v-7M20 20H4" />
    </>
  ),
  // Door with arrow — sign out.
  signOut: (
    <>
      <path d="M13 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" />
      <path d="M11 12h9m0 0-3-3m3 3-3 3" />
    </>
  ),
  // Open tray — "nothing here yet" empty states.
  inbox: (
    <>
      <path d="M4 12.5 6.3 5h11.4l2.3 7.5" />
      <path d="M4 12.5h5.2l1 2.2h3.6l1-2.2H20V18a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 18v-5.5Z" />
    </>
  ),
  // Plus — new/added today.
  plus: <path d="M12 5v14M5 12h14" />,
  // Clock — due / time-based metrics.
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3.2 2" />
    </>
  ),
  // Circular arrows — work in progress.
  progress: (
    <>
      <path d="M19 7.5A7.9 7.9 0 0 0 12 4a8 8 0 0 0-7.6 5.5" />
      <path d="M5 4.3v3.8h3.8" />
      <path d="M5 16.5A7.9 7.9 0 0 0 12 20a8 8 0 0 0 7.6-5.5" />
      <path d="M19 19.7v-3.8h-3.8" />
    </>
  ),
  // Triangle with exclamation — overdue / attention needed.
  warning: (
    <>
      <path d="M12 4.2 21 19H3L12 4.2Z" />
      <path d="M12 10.2v3.6" />
      <circle cx="12" cy="16.6" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth="2.6" />
    </>
  ),
  // Upward trend — collected / growth metrics.
  trendUp: (
    <>
      <path d="m4 16 5.2-5.4 3.4 3 6.4-7" />
      <path d="M14 6.6h5v5" />
    </>
  ),
  // Checkmark — active / approved states.
  check: <path d="m4.5 12.5 4.8 4.8L19.5 6.5" />,
};

export function Icon({ name, className }: { name: IconName; className?: string }): JSX.Element {
  return (
    <svg
      {...common}
      width="21"
      height="21"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
