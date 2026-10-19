# Bizora — Test Matrix

Baseline measured 2026-10-19 in the audit sandbox (Node 22.22.3). Legend: ✅ pass ·
❌ fail · ⏭️ blocked/skipped with reason · — not run.

## Current automated coverage (baseline)

| Suite | Where | Count | Baseline result | Notes |
| --- | --- | --- | --- | --- |
| Backend unit (domain, finance, inventory costing, modules, templates, branding, shared) | `backend/test/*.test.ts` (node:test via tsx) | 50 tests across 16 files | ✅ 42 / ❌ 8 / ⏭️ 0 locally | All 8 local failures are one environmental cause: Prisma client not generated (`binaries.prisma.sh` unreachable in sandbox → `Prisma.Decimal is not a constructor`, `@prisma/client did not initialize`). Same suites are green in GitHub CI on `main` (run 38898201989: typecheck + tests + migrations + build). |
| Backend DB integration (tenant isolation, templates acceptance, isolated-DB safety) | `tenant.integration.test.ts`, `business-templates.acceptance.test.ts`, `isolated-test-database.test.ts` | ~17 tests | ⏭️ locally (no Postgres, no Prisma engines) | Gated by `RUN_DB_TESTS` + guarded `TEST_DATABASE_URL`; run in CI with its Postgres service. |
| Mobile logic (erp-mapping, logic, storage-keys, android-build-config) | `mobile/src/data/__tests__/` | 31 tests | ✅ 31 / ❌ 0 / ⏭️ 0 | `npm run test --workspace @tailor/mobile`. |
| Mobile live-API contract tests | `mobile/src/data/__tests__/live-api.test.ts` | 18 tests | ⏭️ excluded from default run (`test:live`) | Needs a running API + DB. |
| Web tests | — | 0 | — | None exist (F-008). Phase 1 adds Vitest smoke suite. |
| E2E / browser | — | 0 | — | None exist. Phase 3 adds Playwright critical journeys. |
| Typecheck | root `npm run typecheck` | shared ✅, web ✅, mobile ✅ | backend ⏭️ locally | Backend `tsc` reports 610 lines of "Prisma namespace" errors from the ungenerated client stub — environmental, CI green. |
| Builds | web `vite build` ✅ (584 kB single chunk — F-009) | mobile export not run in sandbox | — | Android APK via EAS (BUILD_APK_GUIDE.md). |
| Dependency audit | `npm audit` | api/web/shared: ✅ 0 vulns | full tree: 15 high (Expo/Metro build tooling — F-014) | CI audits api/web/shared only. |
| Lint | — | — | — | No ESLint config exists (F-008). Phase 1 adds it. |

## Critical workflows — coverage by phase

| Workflow | Unit | API/Integration | Web/Mobile UI | E2E | Phase to complete |
| --- | --- | --- | --- | --- | --- |
| Sign-in, scope/business selection, refresh rotation, logout | partial (mobile api tests) | ✅ CI | manual | P3 | Mostly covered; E2E in P3 |
| Password reset / admin reset (F-001) | — | P1 | P1 | P3 | Phase 1 builds it |
| Customer create/edit/archive/restore (F-003) | ✅ | ✅ CI (create/edit) | manual | P3 | Restore arrives P1 |
| Measurements revisions | ✅ | ✅ CI | manual | — | — |
| Order create, workflow transitions, cancellations | ✅ | ✅ CI | manual | P3 | S-002 dual-status check P1 |
| Payments, reversals, receipts (PDF), ledger | ✅ | ✅ CI | manual | P3 | — |
| Alterations (F-006) | — | create only | — | — | Phase 2 builds it |
| Catalog/items + custom fields | ✅ | ✅ CI | manual | — | — |
| Inventory movements, costing, reorder | ✅ | partial (CI) | manual | — | S-004 cross-check P1 |
| Suppliers, purchasing, settlements | ✅ (erp-finance) | partial (CI) | manual | — | S-004 P1 |
| Cashbook, journals, trial balance/P&L/balance sheet | ✅ | partial (CI) | manual | — | S-004 P1 |
| Subscriptions: submit → review → activate/expire (S-001) | partial | ✅ CI (review) | manual | P3 | Lifecycle matrix P1 |
| Platform: businesses, owners, members, staff, templates, plans, branding | partial | ✅ CI | manual | P3 | Deletion matrix P1 |
| Platform archive/restore/permanent delete (F-002) | — | P1 | P1 | P3 | Phase 1 builds it |
| WhatsApp notifications (queue, retry, opt-out, webhook) | ✅ (4) | partial | manual | — | Needs Meta test number for live proof — external blocker, stays manual |
| Offline sync (F-004) | ✅ | ✅ CI | n/a (no client) | per D-1 | Phase 2 decision |
| Exports & order invoice (F-007) | — | P2 | P2 | — | Phase 2 builds it |
| User guide links/steps (Phase 3) | — | — | P3 checklist | P3 | Every step verified vs real UI |

## Rules

- Every bug fix lands with a failing-then-passing regression test; counts are reported as
  actual pass/fail/skip in each phase completion report. Skips always carry a reason.
- DB tests only ever run against the guarded isolated test database (localhost, name
  contains `test`/`acceptance`). CI's Postgres service is the standing DB evidence path
  until the owner provides a staging environment (D-10).
- Browser/device verification is labelled separately from static/build verification;
  fixture-API runs (`tools/preview-api`) verify web UI behaviour only, never persistence.

## Web ↔ mobile parity matrix (Phase 2 task 2.5, refreshed 2026-10-19 after Phases 1–2)

Legend: ✅ both · 🌐 web-only (reason) · 📱 mobile-only (reason) · — absent.
"Platform console remains web-only" is a documented product decision; mobile
platform-scope sign-in shows a clear message instead of a broken workspace.

| Feature | Web | Mobile | Notes |
| --- | --- | --- | --- |
| Sign-in / scope selection / session restore | ✅ | ✅ | |
| Forced + voluntary password change | ✅ | ✅ | Phase 1 (F-017) |
| Business staff password reset | ✅ | ✅ | Settings → Team (F-001) |
| Customers CRUD + measurements link | ✅ | ✅ | |
| Customer archive/restore | ✅ | ✅ | Phase 1 (F-003) |
| Orders, workflow transitions, payments | ✅ | ✅ | |
| Order archive/restore | ✅ | ✅ | Phase 1 |
| Alterations (add, done, reopen) | ✅ | ✅ | Phase 2 (F-006) |
| CSV exports (customers/orders/payments/ledger) | ✅ | ✅ | Phase 2 (F-007); server-generated both sides |
| Order invoice PDF | ✅ | ✅ | Phase 2; payment section gated by payments:read |
| Payment receipts PDF + WhatsApp send | ✅ | ✅ | Mobile also builds a local ledger PDF |
| Catalog, inventory, suppliers, purchasing | ✅ (ERP) | ✅ (ERP screen) | |
| Cashbook + accounting reports | ✅ (ERP) | ✅ (ERP screen) | |
| WhatsApp notification history | ✅ | ✅ | |
| Subscription view + payment submission | ✅ | ✅ | |
| Business settings, branding, modules, workflow | ✅ | ✅ | |
| Roles & staff management | ✅ | ✅ | |
| Platform console (businesses, templates, plans, staff, billing, audit) | 🌐 | — | Web-only by design; mobile platform sign-in shows an explanatory message |
| Order-form draft persistence | ✅ | — | Mobile forms are single-session flows; web refresh-restore added in Phase 2 (F-016) |
| Chat assistant | ✅ | ✅ | Mobile ChatScreen |
| Offline-sync API | — | — | Retired in Phase 2 (D-1, F-004); no client ever used it |

Destructive-action confirmation audit (Phase 2): every archive/remove/
deactivate/reverse/cancel action on web and mobile either asks for explicit
confirmation (window.confirm / Alert with destructive style) or requires a
reason in a deliberate form (subscription status, inventory reversal, member
removal). Financial records are never deleted — corrections are reversals.
