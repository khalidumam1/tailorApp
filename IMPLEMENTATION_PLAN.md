# Tailor Management System Implementation Plan

## Architecture

- Three independently installable application roots: `backend` (Express REST API), `web` (React/Vite), and `mobile` (Expo), each with its own lockfile and CI. The top-level npm workspace remains for cross-app development; backend and web carry local shared Zod contract copies so each can be split into a repository.
- PostgreSQL is authoritative. Prisma owns schema, migrations and transactional persistence; SQLite on-device persists explicitly supported customer, measurement and order operations.
- Versioned `/api/v1` routes use a common JSON envelope, Zod validation, pagination, structured errors and request IDs. Services are responsible for authorization-aware tenant scoping; repositories never infer tenant identity from request data.
- Deploy the API and admin as independently buildable applications, and the mobile client through Expo. No microservices or customer portal in the MVP.

## Data model

Businesses own memberships, customers, garment templates, measurement profiles/revisions, orders/items/status events, alterations, payments, audit events, settings and sync operations. Users are distinct from business memberships: platform roles and explicitly granted platform permissions do not imply business access. Composite tenant foreign keys and unique constraints reinforce scoped access. Monetary amounts use PostgreSQL `Decimal`; posted payments are immutable and corrections are auditable.

## Authorization

Authenticate users with Argon2id passwords, short-lived signed access tokens and hashed, rotating/revocable refresh tokens. Enforce platform permissions separately from tenant membership permissions on every protected server request. Tenant IDs come from the authenticated membership context, never from an untrusted body or query parameter. Deny by default. Log privileged changes and security events without credentials or tokens.

## Multi-business migration plan

1. **Preserve and classify the existing product.** Keep customers, payments, subscriptions, WhatsApp, audit, and the existing Tailor workflows as core capabilities. Treat Tailor labels, measurement fields, garment types, and order stages as the initial Tailor template. Refactor Tailor-only assumptions from shared order contracts and screens only when the generic workflow engine can replace them without changing stored records.
2. **Add configuration foundations safely.** Add reusable business templates, tenant-scoped configuration, normalized custom-field and workflow entities, and seed Tailor plus Furniture, Carpenter, Auto Workshop, Printing, and Generic templates. Link existing businesses to Tailor in a forward-only migration; retain current currency, timezone, subscriptions, records, and enum-based order statuses.
3. **Expose authorized configuration APIs.** Add super-admin template management and tenant-scoped configuration read/write endpoints. Keep platform grants separate from business roles, validate field/workflow references, and audit published configuration changes.
4. **Wire the existing clients.** Use the same resolved configuration in web and mobile for branding, modules, terminology, fields, item types, and workflows. Keep offline operations tenant-bound and defer remote notifications until committed server-side mutations.
5. **Generalize operational models incrementally.** Migrate order/item types and stage transitions behind compatibility adapters, then retire Tailor-specific contracts only after old and new workflows pass database-backed regression tests.
6. **Verify every increment.** Run generated-client validation, migration checks, API and tenant-isolation tests, type checks, web/mobile builds, and the Tailor/Furniture/Auto configuration acceptance flows. Do not claim full multi-business support until these workflows are end-to-end and online/offline safe.

### Initial audit classification

- **A — Reusable core:** tenant-scoped customers, memberships and permissions, financial ledger, subscription lifecycle, WhatsApp sender/history, audit trail, and idempotent synchronization.
- **B — Tailor template:** measurement terminology/templates, garment item labels, the current order status vocabulary, dashboard copy, and tailor staff labels.
- **C — Refactor incrementally:** globally fixed order/payment/notification enums, web/mobile Tailor labels and screens, and the currently incomplete mobile offline operation coverage. Preserve their behavior until generic replacements are fully verified.

### Multi-business foundation delivered in this increment

- Added a forward-only database migration that seeds Tailor, Furniture, Carpenter, Auto Workshop, Printing, and Generic templates; assigns existing businesses to Tailor; projects existing measurement-template fields into normalized tenant field definitions; and adds normalized template/business fields, workflow stages, and transitions.
- Added permission-checked platform template APIs and tenant-scoped configuration read/publish APIs with optimistic configuration versions and audit events. New platform-created businesses select a template.
- Added a Super Admin template editor/preview and a Business Admin settings screen for branding, terminology, enabled modules, payment methods, and dashboard widgets.
- Updated mobile configuration loading to use the same API response and persist a business-keyed copy in a WatermelonDB v1-to-v2 migration. The client applies configured module visibility, terminology, currency, and workflow display while offline.
- **At the initial foundation checkpoint, not yet generalized:** order/payment/notification enums, operational custom fields, non-Tailor transitions, and notification-template dispatch. Later continuation entries below supersede this status for generic order fields and configured workflows; notification dispatch and several administration surfaces remain incomplete.

## Offline synchronization

The backend exposes tenant-scoped `POST /api/v1/sync/operations` for idempotent customer create/update, measurement revision append, and order create, plus a per-entity paginated `GET /api/v1/sync/changes` cursor feed. Operation receipts and audit entries commit with each mutation. Optimistic version conflicts are recorded and returned instead of overwriting server data. A client resolving a conflict must submit the resolved edit under a new client operation ID; replaying the old ID returns its recorded result. The Expo client now persists supported customer/order operations in a durable outbox, retries synchronization and preserves dynamic values. Payments and account/session operations require connectivity; broader mobile conflict-resolution UX remains incomplete.

## Milestones

1. **Workspace and database:** TypeScript workspaces, shared validation contracts, Express/Prisma/PostgreSQL foundations, Docker Compose, environment template, health/readiness and setup documentation.
2. **Authentication, tenancy and RBAC:** account/session lifecycle, memberships, server-side permission checks, platform/business role separation and tenant-isolation tests.
3. **Customers and measurements:** scoped customer CRUD/search/duplicate checks; garment templates and append-only, dated measurement revisions.
4. **Orders and workflow:** human-readable per-business order numbers, item snapshots, status history, transition validation and alterations/repeats.
5. **Payments and reports:** transactional idempotent posting, immutable ledger/receipts, balance calculations and date-range reports.
6. **Offline synchronization:** tenant-scoped backend sync push/pull endpoints and idempotency/conflict persistence; Expo authenticated outbox, backoff, cursor persistence, conflict UX and sync status remain pending.
7. **Admin web:** accessible responsive tenant and platform administration wired to the real API, with no frontend-only authorization.
8. **Security, verification and operations:** integration/E2E coverage, CI, lint/typecheck/build scripts, structured logging, backup/restore and deployment runbooks.

## Current implementation status

- **A — Substantially implemented:** npm workspaces, exact root lockfile, shared Zod contracts, Prisma PostgreSQL schema/initial migration, Compose, environment validation and health/readiness routes. Live migration/seed execution requires PostgreSQL.
- **B — Partially implemented:** bcrypt login/password change, business/platform scope separation, short-lived access JWTs, hashed rotating refresh tokens, tenant permission middleware, explicit platform grants, one-time production super-admin bootstrap and composite membership/role constraints. Password-reset delivery, business employee/role administration and complete authorization integration coverage are pending.
- **C — Implemented at API/admin level:** tenant-scoped customers, phone normalization/duplicate constraints, garment templates and append-only measurement revisions/history. No mobile forms yet.
- **D — Implemented at API/admin level:** business order numbering, server-sourced measurement snapshots, status history and validated optimistic transitions. Alteration creation is API-only; repeat-order and alteration-management UI remain pending.
- **E — Implemented at API/admin level:** Decimal balances, transactional idempotent payments, reversal ledger entries, printable receipts, dashboard/collection reports and audit records. Correction UI and live database financial tests remain pending.
- **F — Backend and core mobile sync implemented:** API push/pull supports tenant-scoped customer, measurement and order changes with replay receipts and version conflicts. Expo stores supported dynamic customer/order payloads in a durable outbox and synchronizes them; conflict-resolution coverage and database-backed mobile sync tests remain incomplete.
- **G — Partially implemented:** business dashboard, customers, measurements, orders, payments and receipts are wired to the API; platform business onboarding/status, platform staff grants, audit and health screens are wired as well. Business employee/role administration and richer business-level field/workflow editing remain pending.
- **H — Partially implemented:** CI workflow, unit/shared/API middleware tests, opt-in PostgreSQL tenant tests, typecheck/build/audit commands and recovery documentation are present. Current local typecheck, web/API build and non-database tests pass. Database-backed acceptance tests require an explicitly configured isolated test datasource; E2E tests, monitoring, automated backup/recovery and production deployment validation remain pending.

## Acceptance criteria

- A new checkout can install with the documented Node version, start PostgreSQL, migrate and seed, and run API/admin/mobile development commands.
- Every business-owned API read/write derives and enforces tenant scope from authenticated server-side membership; platform permissions are independently checked.
- Order transitions are validated server-side; financial totals use decimal arithmetic, payment writes are atomic/idempotent and posted history cannot be silently deleted.
- Offline-supported changes survive app restarts, retry safely, and report conflicts without silent data loss.
- The admin and mobile screens make only implemented actions available, provide accessible loading/empty/error states and use PKR and Asia/Karachi display conventions.
- CI and local instructions cover formatting, lint, typecheck, migrations, tests and builds. Production readiness is claimed only after those checks and operational controls have been verified.

## Production-safety continuation checkpoint

- Historical snapshot before the generic operational continuation: configured stages and custom-field definitions were not yet attached to operational order/customer records, and non-Tailor workflows were previews. The additive generic operational work below supersedes this snapshot. Legacy Tailor order columns and the `OrderStatus` enum remain intentionally present for compatibility.
- Notification persistence and delivery still support only the existing three WhatsApp event kinds and fixed Meta parameter layouts; the business notification-template configuration is not consumed by dispatch.
- No operational schema, API, or data migration was applied in this continuation. The earlier foundation migration `20261005110000_business_templates` is already recorded as applied by the prior work; it included assigning existing businesses to Tailor and projecting existing garment-template fields. Those production records were not re-audited in this continuation, so preserve that migration as-is and reconcile its effects against business records before any follow-up transformation. The configured `.env` database target is non-local, and Docker/PostgreSQL tooling for an isolated database is unavailable here. Database-backed integration tests were skipped; they must not be enabled against the configured application datasource.
- Hardened the opt-in integration-test harness: `RUN_DB_TESTS=true` now requires `TEST_DATABASE_URL` pointing to a local PostgreSQL database whose name includes `test` or `acceptance`, and rejects the configured `DATABASE_URL` if it is the same target.
- Safest next implementation path: provision a disposable local PostgreSQL database, apply the existing migrations there, and verify a production-schema snapshot/record counts before designing additive operational columns/tables. Keep legacy order status and garment fields intact; add generic workflow/item/custom-value storage alongside them, dual-read/write during rollout, and defer any backfill until Tailor-to-template mappings are reconciled. Then exercise API, web, mobile sync, tenant isolation, and notification outbox against that isolated database before a reviewed production migration.

## Generic operational continuation

- Added and applied `20261005120000_generic_operational_engine` and `20261005130000_generic_item_catalog` to the configured development/test database. The first migration adds workflow-stage links/history and typed custom-field values while retaining legacy order columns/enums. The second backfills the verified legacy order-item snapshots into tenant-scoped catalog items and links each order item to its catalog row. Both migrations are transactional; the catalog migration has a uniqueness guard.
- Verified post-migration totals remain 2 businesses, 3 customers, 3 orders, and 3 order items; all 3 order items link to catalog items and the 15 legacy status-history entries have corresponding workflow-history rows. Existing order statuses remain `NEW`/`COLLECTED`; the generic workflow labels now resolve from Tailor configuration. No customer/order/payment rows were rewritten or deleted.
- Online and offline order creation now validates configured item types and dynamic order/order-item fields server-side, persists typed values and workflow history, links item snapshots to a generic business catalog, and starts at the configured initial stage. The tenant-scoped workflow transition API checks configured transitions, role restrictions, versions, and writes audit/history records.
- The existing web order form renders configured item types and dynamic order/item fields and uses configured workflow transitions. Expo renders configured item types, order/item/custom fields, customer fields, and transition actions from the same cached server configuration. Offline customer/order creates remain local-first and carry dynamic field values in the durable outbox; remote effects occur on server replay.
- Customer create/update APIs and offline customer sync now validate and persist configured customer custom fields. The web and mobile customer forms render customer-scoped fields.
- Template updates now preserve stable field/stage IDs, deactivate removed fields/stages rather than deleting referenced history/value records, increment template versions, and reject stage removal or stranded active orders. Configuration responses expose a separate cache version while preserving the optimistic configuration version expected by existing editors.
- Earlier verification passed the database-backed backend suite against the explicitly authorized development/test datasource (38/38 at that point). After the latest order-detail and integration-test edits, workspace typecheck, API/web build and `npm test` pass (38 discovered: 30 passed, 8 database-backed tests skipped because no database test environment variables are configured). Added integration assertions cover required/invalid customer fields and synced item custom-field serialization; those new assertions still need execution against an isolated migrated test database. Expo Android and iOS exports both pass when run from the `mobile` workspace. `expo export --platform all` is not supported by the current dependency set because `react-native-web` is not installed.
- **Still incomplete:** the notification worker still dispatches the legacy fixed Meta templates and does not consume configured notification templates; standalone catalog CRUD/forms are not wired; Business Admin custom-field/workflow editing and full configuration publishing/version history remain incomplete; customer/item detail/edit flows are partial; and the five real Tailor/Furniture/Carpenter/Auto/Printing operational acceptance runs have not been performed. Keep the legacy Tailor fields/status enum until those remaining consumers are migrated and verified.
