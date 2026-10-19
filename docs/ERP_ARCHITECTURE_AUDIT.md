# ERP architecture audit and implementation status

> **Historical document (archived 2026-10-19).** Preserved as the record of its audit/fix cycle; some statements are superseded by the phase reports in `docs/implementation/`. See `README.md` for current status.

- **Initial audit:** 2026-10-13
- **Implementation update:** 2026-10-14
- **Repository:** `khalidumam1/tailorApp`
- **Scope:** tenant-scoped inventory, purchasing, suppliers, cash/bank accounts and double-entry bookkeeping across the existing API, web and mobile apps.

## Executive summary

TailorApp already had a useful multi-tenant foundation: authenticated business memberships and permissions, platform permissions, industry templates, a non-stock catalog, orders, decimal-valued customer payments and an append-only audit trail. This work extends those systems rather than replacing them.

The ERP source increment now adds inventory and supplier/purchasing models and APIs, cashbook and accounting ledgers, platform/business module gates, report endpoints, and web/mobile workflows. A forward-only Prisma migration is present but **has not been applied or validated against PostgreSQL**. The web and mobile typechecks and focused non-database checks pass; the backend full typecheck and all DB-backed ERP assertions remain blocked by the environment described below. Treat the current result as implementation in source, not a database-verified release.

## Audited and reused architecture

| Area | Existing stack / reusable surface | Design consequence |
| --- | --- | --- |
| API and database | Express 4, TypeScript, PostgreSQL, Prisma 6, Zod, `/api/v1` JSON routes | Additive schema/migrations and transaction-scoped domain services; never rebuild the API. |
| Web | React 19, Vite 8, existing authenticated workspace/navigation | ERP modules extend current screens and shared session/API patterns. Global web styling has been adapted to the user-supplied shadcn-admin visual reference, not just the ERP area; visual/pixel-level acceptance still needs browser review. |
| Mobile | Expo 57, React Native 0.86, existing workspace/navigation and local database | ERP workflows reuse the current app and stay online for financial/stock mutations; no unverified offline posting queue was added. |
| Tenant/auth | Business membership context, business roles/permissions and separate platform grants | Tenant identity comes from authenticated request context; new APIs add explicit tenant predicates and tenant-composite foreign keys. |
| Business configuration | Templates, tenant configuration, business settings and module selections | Effective module access intersects template support, platform allow-list and tenant selection. Turning a module off does not erase its records. |
| Catalog/orders/payments | `BusinessItem` catalog, immutable order/payment history, existing sync and audit mechanisms | Stock linkage is optional; unpaid order sales post to receivables, not cash. Existing records remain intact. |
| Money and dates | PostgreSQL `Decimal`, business timezone configuration | Amounts/costs are persisted and totaled with Decimal arithmetic; reports use business-local period boundaries. |

## Delivered ERP source increment

### Inventory

- Stock items, variants/SKUs, units, reorder thresholds, locations, balances and append-only movement history.
- Opening balances (first-time setup only), receipts, consumption, customer returns, supplier returns, wastage, transfers and manual adjustments. Negative inventory is rejected.
- Weighted-average costing and server-side valuation/reorder-alert endpoints. Sales items can optionally link to a stock variant; linked order creation consumes stock transactionally with idempotent source keys, while order cancellation posts an audited return rather than deleting movements.
- Manual movement reversal is restricted to safe/latest eligible history; movement records are retained. Positive manual adjustments use the location's current average cost when no override is supplied; a cost is required when the location has no stock.
- The web valuation table uses the typed server-calculated row value. Client-side quantity and purchase settlement displays avoid doing financial/stock arithmetic from persisted decimal strings.

### Suppliers and purchasing

- Tenant-scoped suppliers with archive/reactivate support, contact details, supplier ledger and running balance.
- Purchase orders/lines, partial receipt records and receipt lines; received quantities update inventory at receipt time, not order-draft time.
- Supplier payments and refunds are separately recorded, linked to a cash/bank account, and reflected in payable/journal postings. Open line quantity, supplier outstanding and refundable capacity are computed server-side.

### Cashbook and double-entry accounting

- Cash, bank and other financial accounts; first-time opening balances; receipts, expenses, transfers and editable account/category metadata.
- Journal entries and lines with idempotent posting sources, Decimal balance validation, immutable posted history and explicit linked reversals. New journal lines require active accounts; reversal workflows can reference inactive historical accounts when necessary.
- Bank-statement reconciliation records and transaction matching/closure workflow.
- Transactional posting integration for order sales/receivables, customer receipts/refunds, inventory and purchase activity, supplier settlements, expenses and account transfers. An unpaid sale is not cash received.
- Reports for trial balance, profit and loss, balance sheet, inventory valuation, reorder alerts, cashbook and supplier ledger.

### Entitlements and clients

- Platform-controlled per-business module allow-lists and server-side permission/module enforcement for inventory, suppliers, purchasing, cashbook and accounting. New admin role grants are seeded by the migration; business staff still depend on their assigned permissions.
- Web and mobile ERP module navigation, beginner-oriented setup/entry/history screens, supplier-ledger access, and reporting views.
- Web can download starter inventory and supplier CSV worksheets. **There is no automatic CSV import workflow.**

## Schema and migration artifact

The new migration is `backend/prisma/migrations/20261013100000_inventory_purchasing_accounting/migration.sql`. It creates the ERP enums/tables and constraints, adds order/payment linkage columns, grants ERP permissions to business admin roles, enables the module keys in template/platform defaults, and creates a default inventory location for each business. The Prisma schema is updated to match.

This migration is forward-only in design. **It has not been applied, inspected by a successful Prisma migration run, or tested on an isolated database in this continuation.** No existing business data was intentionally deleted or rewritten by the source changes. Before rollout, review the migration against a disposable schema snapshot and then the deployment's actual migration state; never use the shared application datasource for tests.

## Tenant safety and posting invariants

- Routes derive `businessId` and actor identity from authenticated membership context; request bodies cannot select another tenant.
- Queries and relational constraints carry tenant scope. Cross-business supplier, variant, location, account, order, journal or reconciliation references are rejected by scoped lookups/constraints.
- Stock and financial effects are transaction-bound to their source record and idempotency key; race/concurrency outcomes are mapped to conflicts for retry rather than silently duplicated.
- Opening stock/account balances are one-time operations. Posted events are not edited/deleted to correct history; use supported reversal/adjustment workflows.
- Feature visibility in a client is not the security boundary: API middleware checks permissions and effective module access on requests.

## Verification and environment limits

**Run during the 2026-10-14 continuation:**

- `npm run typecheck --workspace @tailor/web` — passed.
- `npm run typecheck --workspace @tailor/mobile` — passed.
- `npm run build --workspace @tailor/web` — passed; Vite emitted only its >500 kB chunk-size warning.
- `npm run test --workspace @tailor/mobile` — 9 passed, 0 failed.
- Focused backend non-database tests (`erp-finance`, `inventory-costing`, `business-modules`, `isolated-test-database`) — 13 passed, 0 failed.
- TypeScript syntax/transpile check across `backend/src` and `backend/test` — 63 files, 0 syntax diagnostics. This is not a backend typecheck.
- `git diff --check` — passed.

**Not verified:**

- Backend full typecheck: Prisma client generation fails before TypeScript checking because the Prisma schema engine/checksum download previously failed with a TLS/network disconnect. Do not report this as a passing backend check.
- The new migration, any seed, database-backed tests, transaction/concurrency behavior and persisted ERP reports: no isolated `TEST_DATABASE_URL`, local PostgreSQL or Docker is available. No migration, seed, or database-backed test has run for this ERP continuation.
- Browser-based end-to-end flows or visual comparison of all web routes against `https://shadcn-admin.netlify.app/`.

## Remaining release work

1. Provision a disposable local PostgreSQL database and seed-only identities. Generate Prisma client, apply the full migration chain there, then run the ERP tenant-isolation, idempotency, concurrent stock, reversal, partial receipt/payment, one-time opening balance, reconciliation and report cross-check tests.
2. Review database migration state and ledger mappings against preserved business history before deployment. Verify sales/receivable, collection/cash, purchase/payable, stock and refunds reconcile across journals and subledgers.
3. Exercise platform module switches and business staff permission combinations in web and mobile, including disabled-module API denials and direct navigation.
4. Perform browser/design acceptance of the global web theme against the supplied reference and test the web/mobile workflows on realistic but isolated tenant data.
5. CSV import, real online-bank integration, tax calculation, statutory compliance certification and regulatory/accounting review are not implemented or claimed.

## Isolated database test setup

Use only an empty local PostgreSQL database whose name includes `test` or `acceptance`; the guarded runner rejects non-local/shared targets. Example PowerShell setup (replace placeholders locally; never put real credentials in chat or commit them):

```powershell
$env:TEST_DATABASE_URL = 'postgresql://<local-user>:<url-encoded-password>@127.0.0.1:5432/tailor_test?schema=public'
$env:SEED_OWNER_EMAIL = 'owner-test@example.test'
$env:SEED_OWNER_PASSWORD = '<unique-test-password-at-least-16-characters>'
$env:SEED_STAFF_EMAIL = 'staff-test@example.test'
$env:SEED_STAFF_PASSWORD = '<different-test-password-at-least-16-characters>'
$env:SEED_PLATFORM_ADMIN_EMAIL = 'platform-test@example.test'
$env:SEED_PLATFORM_ADMIN_PASSWORD = '<unique-test-password-at-least-20-characters>'
npm run test:db
```

Do not set `TEST_DATABASE_URL` to the configured application datasource. The test run applies migrations and seed data to the isolated database only.
