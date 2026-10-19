# Phase 1 Completion Report — Stability, Security and Foundation

Date: 2026-10-19 · Branch: `arena/b04a4d5b-tailorapp` · Base: `c467df0` + audit commit `5cffe90`
Scope executed: **Phase 1 only**, as approved by the owner on 2026-10-19.
Phases 2 and 3 were not started and return for separate approval.

## 1. Tasks

| Task | Status | Summary |
| --- | --- | --- |
| 1.1 Admin password reset (F-001, F-017, F-012) | ✅ Done (CI verification pending) | Per decision D-3 (admin-initiated only): Business Owner resets own staff; Platform Admin resets any user; both audited with all sessions revoked and `mustChangePassword` forced. Change-password UI shipped on web + mobile (forced + voluntary). Last-operator guards added. |
| 1.2 Archive/restore: customers & orders (F-003) | ✅ Done (CI verification pending) | `archived=true` list filters, restore endpoints, optimistic `version` locks, WhatsApp queue cleanup on order archive, audit events; archived toggles + Archive/Restore in web and mobile. Archive-only per D-2. |
| 1.3 Platform Admin archive matrix (F-002) | ✅ Done (CI verification pending) | `BusinessStatus.ARCHIVED` + migration; platform businesses status filter (All/Active/Pending/Suspended/Archived); archive via the status endpoint (audit `from`→`to`), restore requires an active owner (existing guard); platform user account activate/deactivate with self/last-super-admin/last-staff-manager guards. Archived businesses are rejected at login, refresh and every authenticated request (`business.status !== 'ACTIVE'` checks). |
| 1.4 Timezone correctness (F-005) | ✅ Done | Tenant timezone now drives day/month boundaries in reports, dashboard, plan limits, subscriptions, receipt PDFs and WhatsApp scheduling. Unit-tested for multiple zones. |
| 1.5 Per-account login backoff (F-013) | ✅ Done | Exponential per-(email, IP) backoff, no enumeration oracle, 429 `ACCOUNT_THROTTLED` + `Retry-After`; per-IP limiter retained. |
| 1.6 Lint + web tests (F-008 partial) | ✅ Done | ESLint flat config in web (0 errors; 9 warnings kept as the recorded baseline). First web test suite: Vitest, 11 tests over the API client contract. CI now runs lint + web + mobile tests. |
| 1.7 Isolated-DB verification | ⏳ In progress | By design this runs in GitHub CI (isolated PostgreSQL service): migrations, full backend typecheck, DB-backed suite. Results appended below when the Phase 1 PR runs. Local DB execution is impossible in the sandbox (Prisma engine downloads are blocked — recorded in Errors & Dead Ends of the audit). |
| 1.8 Shared-contract drift guard (F-011) | ✅ Done | `tools/check-shared-drift.mjs` + `sync-shared` in CI. First run caught a real stray artifact (`mobile/shared/package-lock.json`). |
| 1.9 Brand defaults (F-015) | ⏸ Parked | Owner decision D-6 still open; untouched, as planned. |

## 2. Tests actually executed (exact counts)

| Check | Command | Result |
| --- | --- | --- |
| Timezone unit tests | `npx tsx --test test/business-time.test.ts` (backend) | **4/4 pass** |
| Login-throttle unit tests | `npx tsx --test test/login-throttle.test.ts` (backend) | **3/3 pass** |
| Web API-client tests | `npm run test --workspace @tailor/web` (Vitest) | **11/11 pass** (1 file) |
| Mobile tests | `npm run test --workspace @tailor/mobile` | **31/31 pass** |
| Web lint | `npx eslint src` (web) | **exit 0 — 0 errors, 9 warnings** (exhaustive-deps + 3 type-only schema vars; pre-existing, recorded as baseline) |
| Web typecheck | `npm run typecheck --workspace @tailor/web` | **exit 0** |
| Mobile typecheck | `npm run typecheck --workspace @tailor/mobile` | **exit 0** |
| Web production build | `npm run build --workspace @tailor/web` | **exit 0** (pre-existing >500 kB chunk warning; F-009 is Phase 2) |
| Shared drift guard | `npm run check:shared-drift` + intentional-corruption negative test | Pass; negative test exits 1 as designed |
| Backend syntax scan | esbuild parse of every changed backend/mobile file | No syntax errors (full backend typecheck requires the Prisma client → CI) |
| Backend DB suite + migrations + full typecheck | GitHub CI on the Phase 1 PR | ⏳ See §6 |

Not executed locally (no local PostgreSQL/Docker available in the sandbox, Prisma
engines unreachable): DB-backed API tests, migration application, end-to-end
browser flows. Nothing above is claimed as DB/browser evidence — CI is the
evidence path for those, per the plan.

## 3. Findings fixed in code

F-001, F-002 (platform archive matrix core), F-003, F-005, F-012, F-013, F-017 —
full detail in `docs/audit/findings-register.md` ("Resolution status — Phase 1").
F-008 and F-011 partially addressed (lint/tests/guard shipped; bundle split and
copy elimination remain Phase 2/F-009/F-011 follow-ups). All other findings are
unchanged and scheduled in their approved phases.

## 4. Migrations and rollback

Two forward-only, additive migrations (never edit applied migrations):

1. `20261019120000_admin_password_reset` — `ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false`. Existing users are unaffected; rollback = drop the column (safe: nothing else reads it until the new code deploys).
2. `20261019123000_business_archived_status` — `ALTER TYPE "BusinessStatus" ADD VALUE 'ARCHIVED'`. No data changes. Rollback note: PostgreSQL cannot remove an enum value; rollback is "stop setting ARCHIVED" (rows can be set back to SUSPENDED/ACTIVE first). No rows are migrated to ARCHIVED automatically.

Rollback order for a bad deploy: revert the app deploy first (old code ignores
the new column/enum value), then optionally drop the column. The enum value is
harmless to old code.

## 5. Files changed

34 files modified + 7 created (≈2,400 insertions). Highlights:

- Backend: `src/login-throttle.ts` (new), `src/password-reset.ts` (new),
  `src/domain/business-time.ts`, routes `auth`, `staff`, `platform`, `customer`,
  `order`, `report`, `payment`, `subscription`, `platform-billing`,
  `src/plan-limits.ts`, `src/whatsapp.ts`; 2 migrations; 2 new test files
  (18 backend test files total).
- Shared contracts: `archived` query params added once in `packages/shared` and
  synced byte-identically to `backend/shared`, `web/shared`, `mobile/shared`.
- Web: `src/api.ts` (password/archive/platform methods), `src/main.tsx`
  (forced + voluntary password change, archived views, platform status filter,
  archive/restore, member/staff account actions), `src/BusinessTeamAdmin.tsx`
  (staff password reset), `src/api.test.ts` + `vitest.config.ts` +
  `eslint.config.mjs` (new), `src/ChatAssistant.tsx` (unsafe `any` casts replaced
  with runtime narrowing — no behaviour change intended).
- Mobile: `src/screens/ChangePasswordScreen.tsx` (new), forced-change gate in
  `App.tsx`, voluntary change in Settings, staff reset in Business Settings,
  archived toggles + Archive/Restore in Customers/Orders, `mustChangePassword`
  through `api.ts`/`useWorkspace`.
- Tooling/CI: `tools/check-shared-drift.mjs`, `tools/sync-shared.mjs`,
  root `check:shared-drift`/`sync:shared` scripts, CI steps for drift check,
  web lint, web + mobile tests.

## 6. CI verification (task 1.7)

⏳ Pending the Phase 1 pull request. This section and the findings register
will be updated with the CI run URL, migration result, full typecheck result
and the backend DB-suite counts before Phase 2 approval is requested.

## 7. Remaining risks and known limitations

- Backend typecheck, migrations and the DB-backed test suite have **not yet run
  anywhere** for this branch — CI is the first execution. Defects that only a
  real database exposes (e.g. S-004 ERP ledger, S-001 subscription lifecycle)
  remain unverified until CI reports.
- UI flows were verified by typecheck + production build only; no browser or
  device was available in the sandbox. Interactive verification (forced
  password-change flow, archived toggles) should be smoke-tested on the CI
  preview or by the owner before production rollout.
- `mobile/shared/package-lock.json` remains tracked as a standalone-install
  artifact; the drift guard excludes lockfiles by documented rule.
- The in-memory login throttle is per-process (resets on restart, not shared
  across API replicas). Acceptable for the current single-instance deployment;
  move to the database/Redis if the API is ever scaled horizontally.
- ESLint warnings baseline (9) is debt to burn down, not enforced-clean.
- Open decisions D-4–D-10 (incl. D-6 brand defaults → task 1.9) still need
  owner input; none block Phase 2 planning except D-6 for 1.9.
- User Guide update is a Phase 3 deliverable; the new Phase 1 features
  (password reset/change, archive/restore, platform status filter) are
  documented in §1–§3 of this report as source material for the guide.
