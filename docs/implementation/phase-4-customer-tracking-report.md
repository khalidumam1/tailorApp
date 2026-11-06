# Phase 4 Completion Report — Customer Order-Tracking Link (public customer portal)

Date: 2026-11-06 · Branch: `arena/eeb872c6-tailorapp` · Phase 4 feature
selected by the owner from the "next feature" recommendation round
(`customer_portal`).

## 1. What was built and why

The owner asked which feature would make the business easier and give customers
the most value. The recommendation list was:

| Tier | Feature | Effort |
| --- | --- | --- |
| 1 | Live WhatsApp verification (Meta test number) | 1–2 d |
| 1 | One-tap **Reorder** from a past order | 1.5–2 d |
| 1 | **Customer Order-Tracking Link** (public portal) ← chosen | 5–7 d |
| 1 | Payment-proof upload (customer sends a screenshot) | 4–6 d |
| 2 | Automatic reminders + worker/wage records | 3–4 d |
| 3 | QR garment tags, WhatsApp broadcast campaigns, voice→order, profit report | later |

The owner chose the **Customer Order-Tracking Link**. The problem it removes is
the daily "bhaiya, order ready hua?" phone call: the customer gets a private
link for **one** order and can see the stage, the promised date, the items, the
total, what is paid, what is due, their own measurements and the progress
timeline — without an account, without an app and without a password. They can
also confirm their measurements or ask a question, and the message lands on the
order in the workspace.

Deliberate scope limits (recorded as decisions D-11 … D-15 in
`docs/implementation/decision-log.md`):

- **D-11** — a token link, not a customer account. No signup, no login, no
  customer-facing identity store.
- **D-12** — a deliberately narrow public payload: no internal notes, no staff
  names, no cost/margin data, no other customer, no other order.
- **D-13** — a new business permission `orders:share` for create/rotate/revoke;
  reading the link and the messages stays on `orders:read`.
- **D-14** — it is **not** a paid mutation: an expired subscription must not cut
  off a customer who is already following an order in progress.
- **D-15** — `PUBLIC_WEB_BASE_URL` is optional; without it the API returns the
  path and the client builds the URL from the origin the staff member is on.

## 2. What ships

| Area | Detail |
| --- | --- |
| Data | `OrderTrackingLink` (token, order, created-by, revoked-at, view count, last viewed) and `OrderCustomerMessage` (kind, body, status, resolved-at) + two enums; one link per order (unique on `businessId + orderId`), unique token |
| Migration | `backend/prisma/migrations/20261104120000_order_tracking_links/migration.sql` — forward-only; inserts the `orders:share` permission and backfills it to existing Owner roles; rollback = drop the two tables and the permission (see §6) |
| Backend | `src/domain/order-tracking.ts` (token, path/url, labels, timeline, measurement summary), `src/routes/order-tracking.routes.ts` (business side), `src/routes/public-tracking.routes.ts` (public side), mounted in `src/app.ts` |
| Public API | `GET /api/v1/public/tracking/:token`, `POST /api/v1/public/tracking/:token/messages` — rate limited, `Cache-Control: no-store`, no auth by design (the token is the credential) |
| Business API | `GET/POST/DELETE /api/v1/orders/:orderId/tracking-link`, `GET /api/v1/orders/:orderId/customer-messages`, `PATCH /api/v1/orders/:orderId/customer-messages/:messageId` — tenant-scoped, audited |
| Web | Public page `/track/:token` (`OrderTrackingPage`, own lazy chunk) + the staff section on the order card (`OrderTrackingSection`, own lazy chunk) + `web/src/tracking-api.ts` (client + response schemas) |
| Mobile | Order screen: open the tracking link, copy it, open WhatsApp, read customer messages, create/revoke the link |
| Docs | New guide page `docs/user-guide/customer-tracking.md`, `orders.md` cross-link, coverage checklist updated, README + backend README sections, FACT_SHEET claim table, decision log D-11…D-15 |

### API surface (final)

```
GET    /api/v1/orders/:orderId/tracking-link          orders:read
POST   /api/v1/orders/:orderId/tracking-link          orders:share   (regenerate: rotate)
DELETE /api/v1/orders/:orderId/tracking-link          orders:share   (revoke)
GET    /api/v1/orders/:orderId/customer-messages      orders:read
PATCH  /api/v1/orders/:orderId/customer-messages/:id  orders:write   (OPEN | RESOLVED)
GET    /api/v1/public/tracking/:token                 public, rate limited
POST   /api/v1/public/tracking/:token/messages        public, rate limited
```

### Privacy and safety

- The token is `randomBytes(24).toString('base64url')` — 32 URL-safe
  characters, unguessable and carrying no data.
- The public response exposes exactly one order: shop name/logo/phone, the
  customer's first name, stage, promised date, items, total, paid, outstanding,
  the customer's own measurements, the timeline and the messages. Nothing else.
- Revoking is instant (`revokedAt`), and the public route answers 404 for a
  revoked link, an archived order or an unknown token — a single message for
  every failure so the endpoint cannot be used as an oracle.
- Every business-side action writes an audit event
  (`order.tracking_link.created|regenerated|revoked`,
  `order.customer_message.resolved|reopened`).
- The panel is only reachable with `orders:read`; creating/rotating/revoking
  needs `orders:share`.

## 3. Tests actually executed

**Local (this sandbox):**

- web typecheck ✅ · web ESLint **0 errors**, 9 pre-existing warnings ✅
- web Vitest **31/31** (4 files — 16 `api.test.ts` + 4 `tracking-api.test.ts`
  + `theme` + `DataTable`) ✅
- mobile typecheck ✅ · mobile suite **31/31** ✅
- shared-contract drift ✅ (`backend/`, `web/`, `mobile/` copies byte-identical
  to `packages/shared`, 5 files each)
- guide compile ✅ 19 pages, regenerated into web + mobile
- production web build ✅ — **entry chunk 531,682 B** (budget 545,000 B) ✅

The branch was rebased onto the current `main` before the final run: `main`
moved to zod 4.6.7 (PR #37) while this feature was in flight, so the tracking
contracts, the routes and the web client were checked against **zod 4**
(`z.ZodIssueCode` → `code: 'custom'`, `z.string().uuid()` → the shared
`uuidSchema` that accepts the deterministic ids older rows carry).

**Not runnable locally, and why:** the backend typecheck, the Prisma migrate
rehearsal and the database integration suite need the Prisma engines and a
PostgreSQL server; `binaries.prisma.sh` is not reachable from this sandbox and
there is no local Postgres. **CI is the evidence path** for the backend, as in
Phase 1–3. The new database suite
(`backend/test/order-tracking.integration.test.ts`, 10 cases) runs there against
the isolated CI schema:

1. creating a link returns a token and a path;
2. the token is unique and matches the shared contract pattern;
3. a second create reuses the same link (the customer's copy keeps working);
4. `regenerate` rotates the token and the old one stops working;
5. revoke makes the public route answer 404;
6. the public payload contains the order progress but no internal notes;
7. the public payload never leaks another tenant's order;
8. a customer message is stored, listed and resolvable;
9. a message for a foreign order is refused (tenant isolation);
10. a message without a body is refused for a question/change request.

**CI:** see §8 for the run that backs this report.

## 4. Bundle budget (the F-009 ratchet)

The first working build of this feature pushed the entry chunk to **516,010 B**
— 6,010 B over the 510,000 B ratchet that was in force at the time. The budget
was **not** raised for this feature; it was made to fit instead:

| Change | Entry chunk (zod 3 baseline) |
| --- | --- |
| baseline on `main` (measured on this branch's base commit) | 509,013 B |
| first build with the feature (tracking contracts in the entry chunk) | 516,010 B |
| response schemas moved out of `@tailor/shared` into the lazy client | 510,659 B |
| tracking contracts moved to their own shared entry point (`@tailor/shared/tracking`) | 510,393 B |
| the order-card section moved into its own lazy component (`OrderTrackingSection`) | 510,057 B |
| simpler public-route check + shorter component names | **509,818 B** ✅ |

So the feature cost **+805 B** of entry chunk (the route check and two
lazy-import stubs); the heavy part (6.5 kB page, 4.5 kB staff section, 1.8 kB
API client) is downloaded only when it is used. Two shared-contract modules now
exist: `@tailor/shared` (the root barrel) and `@tailor/shared/tracking` (the
tracking contracts) — all four copies stay byte-identical, and the drift check
covers the new file.

`main` then moved to zod 4.6.7 (PR #37), which costs ~23 kB in the entry chunk
because `z` is a namespace object no bundler can tree-shake; that PR raised the
ratchet to **545,000 B** and recorded the reason in
`tools/check-web-bundle.mjs`. After rebasing onto it, this feature's final
entry chunk is **531,682 B** against that 545,000 B budget — i.e. the tracking
feature still costs well under 1 kB of entry chunk (531,682 B vs the 531,925 B
`main` baseline recorded in the budget file).

## 5. Guide and marketing honesty

- `docs/user-guide/customer-tracking.md` is a full guide page (what it is,
  where to find it, create/share, what the customer sees, messages, revoke,
  common mistakes, permission warnings, Roman Urdu summary) and is compiled into
  the web and mobile apps.
- `docs/user-guide/coverage-checklist.md` maps every new surface to a page.
- `docs/marketing/FACT_SHEET.md` gained a **verified-claim** row per capability
  and explicit **do-not-claim** rows: there is no customer account or portal,
  no online ordering, no online payment page. The public page shows the order
  and takes a message; it does not take money.

## 6. Migrations and rollback

One forward-only migration,
`20261104120000_order_tracking_links/migration.sql`:

1. creates the two enums and the two tables with their indexes and foreign
   keys (`ON DELETE CASCADE` for business/order, `SET NULL` for the message →
   link reference);
2. inserts the `orders:share` permission (`ON CONFLICT (key) DO UPDATE` on the
   description, which is the source of truth in `backend/src/permissions.ts`);
3. backfills `orders:share` to the existing Owner roles (`isSystem = true`,
   `businessId IS NOT NULL`) so no shop loses access after the upgrade. Other
   roles are untouched on purpose — a shop decides who may share a link.

**Rollback note (programme rule unchanged):** migrations are forward-only; a
rollback is a restore from a pre-release `pg_dump`, never a down-migration
against live data. If the feature itself must be withdrawn, the forward path is
to revoke the links (`DELETE /api/v1/orders/:orderId/tracking-link` per order)
and to remove the permission grants; the tables can then be dropped by a new
forward migration.

## 7. Files changed (Phase 4)

Backend: `prisma/schema.prisma`, the migration above, `src/domain/order-tracking.ts`,
`src/routes/order-tracking.routes.ts`, `src/routes/public-tracking.routes.ts`,
`src/app.ts`, `src/config.ts` (`PUBLIC_WEB_BASE_URL`), `src/permissions.ts`
(`orders:share`), `prisma/seed.ts` (staff role grant), `test/order-tracking.integration.test.ts`.
Shared: `packages/shared/src/{index,tracking}.ts` + `package.json` (new
`./tracking` entry point) and the three mirrored copies.
Web: `src/OrderTrackingPage.tsx`, `src/OrderTrackingSection.tsx`,
`src/tracking-api.ts`, `src/tracking-api.test.ts`, `src/main.tsx`,
`src/api.ts`, `src/styles.css`, `src/guide-content.ts`.
Mobile: `src/api.ts`, `src/hooks/useWorkspace.tsx`, `src/screens/OrdersScreen.tsx`,
`src/guide-content.ts`.
Docs: `docs/user-guide/{customer-tracking,orders,coverage-checklist}.md`,
`docs/implementation/decision-log.md` (D-11…D-15), `docs/marketing/FACT_SHEET.md`,
`README.md`, `backend/README.md`, `.env.example`, `backend/.env.example`,
`mobile/.env.example`, this report.

## 8. CI

- **Run 179** (`42190128389`, commit `7cd2336`, pull-request event) —
  **green**: every gate passed — shared-drift, guide-freshness, `npm ci`,
  `prisma generate`, `prisma migrate deploy`, typecheck ×4 (shared, api, web,
  mobile), web lint, the backend database suite (migrations + the new tracking
  suite), web Vitest, the mobile suite, the production build, the bundle
  budget, `npm audit`, the Playwright E2E journeys and the timed
  backup/restore drill.
- Three real defects were found by CI (and are fixed in this branch):
  1. **The one-to-one relation was invalid.** `Order.trackingLink` is a 1:1
     relation, and Prisma requires the unique index on the defining side to
     use the *same field order* as the relation fields. `@@unique([businessId,
     orderId])` next to `fields: [orderId, businessId]` was rejected
     (P1012) and the schema engine aborted the whole `prisma generate` step
     without a usable message. The index is now `@@unique([orderId,
     businessId])` and the migration creates the matching index.
  2. **The new test double-prefixed the bearer token** (`Bearer Bearer …`),
     so every staff call answered 401.
  3. **The test shops had no subscription.** Billing enforcement ships
     enabled, so answering a customer message (`orders:write`, a paid
     mutation) was refused with 402 until the fixtures used the default plan.

  Lesson recorded: a Prisma schema problem shows up as a *silent* CI failure
  in `prisma generate`, and the fastest way to see the real error is
  `prisma validate` on the schema (the CLI prints the P1012 message) — the
  validate step is worth running locally before pushing.

## 9. Remaining risks and known limitations

- **The link is a bearer credential.** Anyone who has it can see that one
  order. That is the deliberate trade-off of a no-account link (D-11); the
  mitigations are the unguessable token, the narrow payload, the view counter
  and instant revocation. A link sent to a WhatsApp *group* leaks to the group —
  the guide says so in Roman Urdu as well.
- **No expiry.** A link stays valid until it is revoked; the owner decision was
  to keep it simple. A `expiresAt` column is the natural next step if a shop
  complains.
- **Messages are one-way.** The customer can write; the answer goes back over
  WhatsApp (the guide says to mark it answered). A real reply thread from the
  public page is deliberately out of scope for this phase.
- **Not run locally:** the browser E2E suite and the mobile emulator smoke (no
  browser/device in this sandbox). The tracking flow has no Playwright spec yet
  — the public page and the staff panel are covered by unit tests plus the
  database suite; a browser spec for "open a link, send a message" is recorded
  as residual QA debt.
- **Screenshots** of the new page are still outstanding (the Phase 3 recapture
  procedure applies to the new screens as well).
