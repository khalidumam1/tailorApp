# Tailor Management System Implementation Plan

## Architecture

- TypeScript npm-workspace monorepo using the existing paths: `backend` (Express REST API), `web` (React/Vite), `mobile` (Expo), and `packages/shared` (Zod schemas and API contracts).
- PostgreSQL is authoritative. Prisma owns schema, migrations and transactional persistence; SQLite on-device persists explicitly supported customer, measurement and order operations.
- Versioned `/api/v1` routes use a common JSON envelope, Zod validation, pagination, structured errors and request IDs. Services are responsible for authorization-aware tenant scoping; repositories never infer tenant identity from request data.
- Deploy the API and admin as independently buildable applications, and the mobile client through Expo. No microservices or customer portal in the MVP.

## Data model

Businesses own memberships, customers, garment templates, measurement profiles/revisions, orders/items/status events, alterations, payments, audit events, settings and sync operations. Users are distinct from business memberships: platform roles and explicitly granted platform permissions do not imply business access. Composite tenant foreign keys and unique constraints reinforce scoped access. Monetary amounts use PostgreSQL `Decimal`; posted payments are immutable and corrections are auditable.

## Authorization

Authenticate users with Argon2id passwords, short-lived signed access tokens and hashed, rotating/revocable refresh tokens. Enforce platform permissions separately from tenant membership permissions on every protected server request. Tenant IDs come from the authenticated membership context, never from an untrusted body or query parameter. Deny by default. Log privileged changes and security events without credentials or tokens.

## Offline synchronization

SQLite stores supported customer, measurement and order records plus an outbox of unique client operation IDs. The API records idempotency results transactionally and returns a sync cursor/version. Retry transient failures with capped exponential backoff. Immutable measurement revisions and financial records are appended, not overwritten. Concurrent edits to the same mutable record return a conflict containing server version and local operation; surface the conflict for deliberate review. Payments and account/session operations require connectivity. Show network state, queued changes, errors and last successful sync.

## Milestones

1. **Workspace and database:** TypeScript workspaces, shared validation contracts, Express/Prisma/PostgreSQL foundations, Docker Compose, environment template, health/readiness and setup documentation.
2. **Authentication, tenancy and RBAC:** account/session lifecycle, memberships, server-side permission checks, platform/business role separation and tenant-isolation tests.
3. **Customers and measurements:** scoped customer CRUD/search/duplicate checks; garment templates and append-only, dated measurement revisions.
4. **Orders and workflow:** human-readable per-business order numbers, item snapshots, status history, transition validation and alterations/repeats.
5. **Payments and reports:** transactional idempotent posting, immutable ledger/receipts, balance calculations and date-range reports.
6. **Mobile offline sync:** Expo navigation/authenticated workflows, SQLite outbox, idempotent synchronization, conflict UX and sync status.
7. **Admin web:** accessible responsive tenant and platform administration wired to the real API, with no frontend-only authorization.
8. **Security, verification and operations:** integration/E2E coverage, CI, lint/typecheck/build scripts, structured logging, backup/restore and deployment runbooks.

## Current implementation status

- **A — Substantially implemented:** npm workspaces, exact root lockfile, shared Zod contracts, Prisma PostgreSQL schema/initial migration, Compose, environment validation and health/readiness routes. Live migration/seed execution requires PostgreSQL.
- **B — Partially implemented:** bcrypt login/password change, business/platform scope separation, short-lived access JWTs, hashed rotating refresh tokens, tenant permission middleware, explicit platform grants, one-time production super-admin bootstrap and composite membership/role constraints. Password-reset delivery, business employee/role administration and complete authorization integration coverage are pending.
- **C — Implemented at API/admin level:** tenant-scoped customers, phone normalization/duplicate constraints, garment templates and append-only measurement revisions/history. No mobile forms yet.
- **D — Implemented at API/admin level:** business order numbering, server-sourced measurement snapshots, status history and validated optimistic transitions. Alteration creation is API-only; repeat-order and alteration-management UI remain pending.
- **E — Implemented at API/admin level:** Decimal balances, transactional idempotent payments, reversal ledger entries, printable receipts, dashboard/collection reports and audit records. Correction UI and live database financial tests remain pending.
- **F — Not complete:** Expo/SQLite schema and network indicator are present; authentication, actual offline forms/outbox, retry/cursors and conflict resolution are pending.
- **G — Partially implemented:** business dashboard, customers, measurements, orders, payments and receipts are wired to the API; platform business onboarding/status, platform staff grants, audit and health screens are wired as well. Business employee/role management and settings remain pending.
- **H — Partially implemented:** CI workflow, unit/shared/API middleware tests, opt-in PostgreSQL tenant tests, typecheck/build/audit commands and recovery documentation are present. CI has not been run from this environment; E2E tests, monitoring, automated backup/recovery and production deployment validation remain pending.

## Acceptance criteria

- A new checkout can install with the documented Node version, start PostgreSQL, migrate and seed, and run API/admin/mobile development commands.
- Every business-owned API read/write derives and enforces tenant scope from authenticated server-side membership; platform permissions are independently checked.
- Order transitions are validated server-side; financial totals use decimal arithmetic, payment writes are atomic/idempotent and posted history cannot be silently deleted.
- Offline-supported changes survive app restarts, retry safely, and report conflicts without silent data loss.
- The admin and mobile screens make only implemented actions available, provide accessible loading/empty/error states and use PKR and Asia/Karachi display conventions.
- CI and local instructions cover formatting, lint, typecheck, migrations, tests and builds. Production readiness is claimed only after those checks and operational controls have been verified.
