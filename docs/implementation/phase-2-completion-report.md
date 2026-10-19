# Phase 2 Completion Report — Complete Business Features and User Experience

Date: 2026-10-19 · Branch: `arena/b04a4d5b-tailorapp` · Includes Phase 1 (same branch/PR)
Scope executed: **Phase 2**, approved by the owner on 2026-10-19 after the Phase 1 report.
Phase 3 was not started and returns for separate approval.

## 1. Tasks

| Task | Status | Summary |
| --- | --- | --- |
| 2.1 Alterations workflow (F-006) | ✅ Done | List + complete/reopen endpoints with tenant checks and audit; shared contract; web order-card panel + mobile order-card section; dashboard OPEN count decrements on completion. |
| 2.2 Exports & invoice (F-007) | ✅ Done | CSV exports (customers, orders, payments, ledger) — tenant-scoped, permission/module gated, tenant-local date ranges, 5000-row cap with `X-Export-Truncated`; order invoice PDF reusing the receipt visual pipeline, payment section gated by `payments:read`; web + mobile entry points. Financial rules written first and unit-tested (see §3). |
| 2.3 Retire offline-sync backend (F-004, D-1) | ✅ Done | Routes unmounted/deleted, `SyncOperation` model/enum dropped by forward migration, shared schema removed, all tests re-based (retired-route 404 assertion; order-create idempotency now tested on `POST /orders`). No dangling references. |
| 2.4 Web performance & maintainability (F-009, F-016) | ⚠️ Partial | Code-splitting done (ERP, chat, settings editors lazy): entry chunk 584 kB → 502 kB (147 → 130 kB gzip); CI bundle budget guards 510 kB. **< 300 kB target not met** — the rest is `main.tsx` (platform console interleaved in one App component); extraction is the D-8(b) refactor, not attempted without browser verification. F-016 done: order-form drafts persist per user+business, restored with notice, cleared on empty/submit. |
| 2.5 Parity & UX consistency (F-002 UI part) | ✅ Done | Parity matrix refreshed in `docs/testing/test-matrix.md` (platform console web-only by design); destructive-action confirmation audit found every flow confirmed or reason-gated; no code gaps to fix. |
| 2.6 Conditional features (G-001/G-002/G-004) | ⏸ Skipped (per plan) | Decisions D-4/D-5 were never approved; the plan allows these only with separate approval. Recorded in decision log. |
| 2.7 Documentation refresh (F-010) | ✅ Done | README status rewritten to the shipped product; stale sync/pending claims removed; four historical docs banner-marked as archives. Screenshot recapture remains Phase 3. |

## 2. Tests actually executed (exact counts, local)

| Check | Result |
| --- | --- |
| CSV writer + invoice arithmetic unit tests (`backend/test/csv.test.ts`, `invoice.test.ts`) | **6/6 pass** |
| Backend shared-contract tests (post sync-schema removal) | **5/5 pass** |
| Business-time + login-throttle unit tests (regression) | **7/7 pass** |
| Web Vitest (`web/src/api.test.ts`, incl. alterations + exports/invoice requests) | **14/14 pass** |
| Mobile tests | **31/31 pass** |
| Web ESLint | **exit 0** (0 errors; 9-warning baseline unchanged) |
| Typechecks | shared ✅, web ✅, mobile ✅ (backend tsc requires the generated Prisma client → CI) |
| Builds | web production build ✅ (entry 502,020 B / 129,676 B gzip; lazy chunks: ERP 68.5 kB, Chat 14.7 kB, editors 10.3 + 9.3 kB); bundle budget check ✅ |
| Shared drift guard | ✅ (also after shared schema removal + re-sync) |
| Backend DB suite + migrations + full typecheck | GitHub CI — see §6 |

Not executed locally (no PostgreSQL/Prisma engines/browser in the sandbox): the
DB-backed alteration/export/invoice tests (run in CI), interactive UI flows,
mobile device behaviour. Nothing here claims those as locally verified.

## 3. Financial rules for money-touching additions (written before UI, per plan)

Invoice arithmetic (`backend/src/domain/invoice.ts`, exact integer cents):
line total = quantity × unit price; invoice total = the server-recorded order
total; paid = PAYMENT minus REVERSAL/REFUND rows (the `calculateNetPaid` rule);
balance = total − paid, never negative. Covered by unit tests incl. reversal
and overpayment-clamp cases. Exports never recompute money differently from
the screens: orders export Paid/Outstanding come from the same finance helpers
as the dashboard; amounts are the stored Decimal strings.

## 4. Migrations and rollback

One forward-only migration: `20261020100000_retire_offline_sync` —
`DROP TABLE "SyncOperation"; DROP TYPE "SyncOperationStatus";`
The table held replay receipts for an API no shipped client called (verified
by grep across web/mobile). Rollback: redeploy the previous release; the table
is not recreated automatically — restoring it means re-applying the old model
from git history, and it comes back empty (no business data is lost; the
dropped rows were machine receipts for an unused endpoint). No other schema
changes in Phase 2.

## 5. Files changed (Phase 2 only; 6 commits)

- Retire: `backend/src/app.ts`, deleted `backend/src/routes/sync.routes.ts`,
  `backend/prisma/schema.prisma` + migration, shared contracts (4 copies),
  tests (`app.test.ts`, `business-templates.acceptance.test.ts`,
  `tenant.integration.test.ts`, `shared.test.ts`).
- Alterations: `backend/src/routes/order.routes.ts`, shared contract,
  `web/src/api.ts`, `web/src/main.tsx`, `web/src/styles.css`,
  `mobile/src/hooks/useWorkspace.tsx`, `mobile/src/screens/OrdersScreen.tsx`,
  DB tests in `tenant.integration.test.ts`.
- Exports/invoice: new `backend/src/csv.ts`, `backend/src/domain/invoice.ts`,
  `backend/src/domain/invoice-pdf.ts`, `backend/src/routes/export.routes.ts`;
  invoice endpoint in `order.routes.ts`; unit tests `csv.test.ts`,
  `invoice.test.ts`; web api/UI; mobile `api.ts` download helper,
  `data/downloads.ts`, Customers/Orders/Payments screens.
- Performance/drafts: `web/src/main.tsx` (lazy + drafts), `tools/check-web-bundle.mjs`, CI.
- Parity/docs: `docs/testing/test-matrix.md`, `README.md`,
  `IMPLEMENTATION_PLAN.md`, `AUDIT_FIX_REPORT.md`, `UI_UX_AUDIT.md`,
  `docs/ERP_ARCHITECTURE_AUDIT.md`, findings register, decision log.

## 6. CI verification — ✅ Complete

Pull request: https://github.com/khalidumam1/tailorApp/pull/27 (retitled to
cover Phases 1–2). Green run:
https://github.com/khalidumam1/tailorApp/actions/runs/39216110295 — every step
passed on the isolated PostgreSQL service: drift check, `npm ci`, Prisma
generate, full migration chain (incl. the sync-retirement drop), all
typechecks, web lint, backend DB suite (incl. the new alteration-lifecycle,
CSV-export and invoice tests), web 14/14, mobile 31/31, production builds,
bundle budget, dependency audit.

The road there is part of the record (runs 39214282202 → 39216110295):
1. First failure was the payments export returning 403 — the tenant-test role
   never held `payments:read` (implementation correct; fixture extended, and
   the ledger assertion became a module-gate negative test once it was clear
   the tailor template has no cashbook module).
2. Then the bundle-budget step failed: CI had set `NODE_ENV=test` job-wide,
   so Vite bundled the development React build (entry 810 kB in CI vs
   502 kB locally). This pre-dated Phase 2 (main's CI builds had the same
   flaw, invisible without a budget) and is now fixed by scoping `NODE_ENV`
   to the test steps and `production` to the build step.
To make these failures diagnosable without log downloads, CI now emits tsc
errors, failing TAP test names, and bundle-check output as check annotations.

## 7. Remaining risks and known limitations

- **F-009 not fully closed**: entry chunk 502 kB vs < 300 kB target. Closing it
  needs the platform-console extraction from `main.tsx` (D-8(b)) — scoped,
  recorded, and deliberately deferred rather than done blind without a browser.
- DB-backed Phase 2 tests (alteration lifecycle, CSV content/isolation,
  invoice PDF) have now run green in CI; UI flows (alteration panels, export
  downloads, draft restore) were verified by typecheck/build only — an
  interactive smoke pass is still recommended before production use.
- CSV exports are capped at 5,000 rows (flagged via header, never silent);
  businesses with larger history need paginated exports — future work.
- Invoice payment section requires `payments:read` + payments module; other
  holders get items + total with an explicit note (by design).
- WhatsApp live delivery, performance at scale, and the S-001/S-002/S-004
  suspected items remain unverified scenario work for Phase 3/follow-ups.
- Guide (Phase 3) should cover: alterations, exports, invoice PDFs, draft
  restore, and the retired sync API's absence.
