# Bizora fact sheet

**What you may claim in any ad, flyer, brochure or video.**

Every line below was checked against the shipped code in this repository. If a
claim is not on the first list, do not put it in marketing material — add it
here first, with the file that proves it.

---

## The one-sentence description

> Bizora is a business management platform: each business gets its own digital
> workspace, configured around the way it already works, for customers, orders,
> jobs, payments and accounts — on web and mobile.

---

## Verified — safe to advertise

### The platform

| Claim | Where it comes from |
| --- | --- |
| Multi-tenant platform: each business gets its own workspace, members and roles | `backend/prisma/schema.prisma` (`Business`, `Membership`, `Role`) |
| Two consoles: the **business workspace** (owners and staff) and the **platform console** (Bizora operations) | `web/src/main.tsx` — two navigation trees |
| Web dashboard plus an Android app (Expo) | `mobile/app.json`, `mobile/src/screens/` |
| Light and dark themes | `web/src/styles.css`, `mobile/src/theme/` |

### Business templates

Six templates are seeded by the platform migrations
(`backend/prisma/migrations/20261005110000_business_templates/migration.sql`):

| Template | Category | What it covers |
| --- | --- | --- |
| Tailor | Service | Garment orders, measurements and fittings |
| Furniture | Product | Custom furniture production and delivery preparation |
| Carpenter | Service | Carpentry jobs, materials and dimensions |
| Auto Workshop | Service | Vehicle inspection, estimates and repair jobs |
| Printing | Product | Print jobs, specifications and production stages |
| Generic | General | A configurable customer, order and payment workspace |

Each template sets the **terminology** (what a customer, item, order and
measurement are called in that trade), the **modules** switched on, the **item
types**, the **workflow stages**, the **payment methods** and the **dashboard
widgets**.

> Say: *"New business types are configured on the platform rather than built
> from scratch."* Do **not** name a template that is not in the table above —
> solar, salon, clinic and others are not shipped yet.

### Modules a business can switch on

`customers`, `orders`, `catalog`, `measurements`, `payments`, `notifications`,
`reports`, `inventory`, `suppliers`, `purchasing`, `cashbook`, `accounting`
(source: `backend/src/business-module-policy.ts`).

How to describe them in copy:

| Module | Plain-English wording that is accurate |
| --- | --- |
| Customers | Every customer record, contact detail and note in one searchable place |
| Orders | One record per job, moving through the stages you define, with full status history |
| Catalog | The items or services you sell, with your own names and types |
| Measurements | Measurements, dimensions, inspections or specifications — named the way your trade says it |
| Payments | Cash, bank and digital payments against every order, with invoice PDFs and CSV exports |
| Reports | Reporting in your business timezone |
| Notifications | Reusable message templates for the updates customers wait for |
| Inventory | Stock items and variants, locations, balances and every movement recorded |
| Suppliers | Who you buy from and what you owe, with settlements as you pay them |
| Purchasing | Purchase orders and goods receipts that update stock when they land |
| Cashbook | Day-to-day cash in and out, with opening balances |
| Accounting | Financial accounts, journal entries and bank reconciliation |

> The **measurements** module is real and every template renames it (Dimensions,
> Inspections, Specifications, Details). Say "details and specs" in generic
> copy — that is what the template terminology actually does.

### Configured per business, without code

`docs/user-guide/onboarding.md`, `backend/src/business-modules.ts`:

- Business name, colours and logo as customers see them on invoices
- Modules — switched off modules disappear from everyone's menu
- Item types — what the business actually sells, in its own words
- Workflow stages and the rules for moving between them
- Payment methods: cash, bank, digital
- Custom fields: short text, long text, number, currency, date, date and time,
  dropdown, multiple choice, yes/no, measurement, reference, notes
- Team invitations with roles and granular permissions

### Working day and control

- Dashboard widgets on every template: **new orders, due today, overdue, in
  progress, outstanding, collected today**
- Reporting in the business timezone
- Order status history and workflow history kept per order
- Invoice PDFs and CSV exports
- Append-only audit history of privileged actions
- Roles and permissions enforced on the server, not just hidden in the UI
- Password reset with a forced change at next sign-in, login throttling
- Archive and restore for customers, orders and businesses (nothing is hard
  deleted)
- Platform-side: manual payment review against the real bank receipt before a
  subscription period is extended

### Customer order-tracking link (2026-11-04)

| Claim | Where it comes from |
| --- | --- |
| A revocable, shareable link per order that lets a customer follow that order without an account | `backend/src/routes/order-tracking.routes.ts`, `backend/src/routes/public-tracking.routes.ts` |
| The customer sees the stage, items, their own measurements, total, paid, balance due and the promised date | `GET /api/v1/public/tracking/:token`, `backend/src/domain/order-tracking.ts` |
| The customer can confirm their details, ask a question or request a change, and the shop sees it on the order | `OrderCustomerMessage`, `GET /api/v1/orders/:orderId/customer-messages` |
| The shop can revoke a link at any time; a revoked link stops working immediately | `DELETE /api/v1/orders/:orderId/tracking-link` |

Say: *"Your customer can check the order themselves — status, total and what is
still due — without calling the shop."* Do **not** say "customer portal",
"customer app" or "customer login": there is no customer account, only a
token link to a single order.

---

## Not verified — do **not** advertise

| Do not claim | Why |
| --- | --- |
| Live WhatsApp delivery to customers | Templates exist; live delivery needs a Meta test number and is not production-verified |
| Any third-party integration (payment gateways, accounting packages, e-commerce, banks, ERPs) | None exist in the codebase |
| A customer portal, customer accounts, customer login or a customer app | The tracking link covers one order for one customer; there is no customer identity or account system |
| A customer-facing catalogue, ordering or payment page | Not built — customers can follow and reply, not order or pay online |
| Delivery, rider, fleet or field-service features | Not built |
| Any AI capability | The in-app chat assistant routes you to screens; it is not AI |
| Uptime, speed, scale or performance figures | Never measured in production |
| Customer counts, revenue, testimonials, case studies, awards | None exist yet |
| "Free forever", pricing, plan names, discounts | No commercial terms are fixed; the kit deliberately uses *Book a free demo* |
| Business templates other than the six above | Not seeded |

---

## Stock phrases that are safe

- "One platform. Every business."
- "A business management platform, configured for the way you already work."
- "Customers, orders, jobs, payments and accounts in one organised workspace."
- "Switch on only the modules you use."
- "Your words, your stages, your items."
- "Six numbers that run your day."
- "Web dashboard and Android app."
- "Two of the three setup steps are ours."

## Stock phrases to avoid

- "The #1 platform for…" / "Trusted by thousands of businesses"
- "Integrates with…" (nothing to integrate with yet)
- "A customer portal" or "your customers log in" (there is a tracking link, not an account)
- "Automated WhatsApp updates to your customers" (not production-verified)
- "Built for tailors" (Bizora is built for *businesses*; tailoring is one
  template)
