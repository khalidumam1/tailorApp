# Bizora — Three-Phase Implementation Plan

Status: **awaiting owner approval** (no implementation starts before approval).
Effort units: focused dev-days for one senior engineer/agent incl. tests and docs.
Findings referenced by ID from `docs/audit/findings-register.md`.

---

## PHASE 1 — Stability, Security and Foundation

Goal: everything that exists is correct, recoverable, authorized and testable.
Exit gate: no open High findings; CI green incl. DB integration tests; regression suite in place.

| # | Task | Findings | Depends on | Effort | Measurable exit criteria |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Password recovery: token reset flow (hashed, expiring, single-use, revokes sessions, audit) + admin-initiated reset (Business Owner → own staff; Platform Admin → any user). Web + mobile UI. | F-001 | D-3 | 4 d | New API tests pass: happy path, expired/reused/foreign token rejected, all sessions revoked, audit rows written; negative authz tests for both admin paths. |
| 1.2 | Archive/restore lifecycle: archived-customer list + restore (API + web + mobile); resolve order `deletedAt` dead path (implement order archive/restore or remove consistently). | F-003 | — | 3 d | Archive→restore round-trip tests; archived data excluded from operational lists, included in archived list; order/payment history intact after restore. |
| 1.3 | Platform Admin control matrix (documented in this plan's appendix before coding): archive/restore for businesses, users, plans, templates, catalog, inventory items, suppliers; permanent delete only per D-2 with SUPER_ADMIN + explicit permission, impact-count confirmation, lockout guards (cannot delete self, last platform operator, required system config); full audit trail. | F-002, F-012 | D-2 | 6 d | Positive+negative API test per sensitive operation × role (super admin / staff without grant / business admin / anonymous), incl. direct-API attempts; UI confirmations show entity + affected-record counts. |
| 1.4 | Timezone correctness: dashboard/report day ranges and plan-limit month boundaries use `Business.timezone` via `domain/business-time.ts`. | F-005 | — | 1 d | Unit tests for UTC, UTC+3, Asia/Karachi tenants pass; no hardcoded `Asia/Karachi`/`+05:00` remains outside defaults. |
| 1.5 | Security hardening pass: per-account login backoff (email+IP) without enumeration leaks; review refresh-reuse strictness; confirm rate-limit behaviour behind proxy (`TRUST_PROXY_HOPS` doc). | F-013 | — | 2 d | Rate-limit tests: account-scoped trigger doesn't lock out other accounts; no response oracle for account existence. |
| 1.6 | Test foundation: ESLint across workspaces; Vitest web smoke tests (session restore, API parsers, permission-based nav); backend regression test per Phase-1 fix; keep node:test backend suites. | F-008 | — | 3 d | `npm run lint` clean; web tests run in CI; every Phase-1 fix has a failing-then-passing regression test recorded in the phase report. |
| 1.7 | Database verification harness: provision isolated Postgres (name contains `test`), apply full migration chain from empty, run seed with test-only identities, run `RUN_DB_TESTS` suites + ERP ledger cross-check (S-004) + subscription lifecycle matrix (S-001) + dual-status check (S-002). In this sandbox Prisma engines/Postgres are unavailable → execute via GitHub CI (already green on `main`) plus any owner-provided local DB; never against unknown/production data. | S-001, S-002, S-004 | D-10 | 3 d | Recorded run: migrations apply cleanly from empty; integration suites pass; ERP cross-check numbers reconcile; defects found become findings with fixes or explicit deferrals. |
| 1.8 | Shared-contract drift guard in CI (`diff -r` across the 4 copies). | F-011 | — | 0.5 d | CI fails on deliberate divergence (proven), passes on main. |
| 1.9 | Brand defaults: Bizora name/title/app-name defaults (keeps runtime branding system). | F-015 | D-6 | 0.5 d | Fresh boot shows Bizora in web `<title>`/login and mobile app metadata. |

**Phase 1 total ≈ 23 dev-days.**
Phase exit criteria: F-001, F-002, F-003, F-005 closed with tests; F-013, F-011, F-015 closed;
S-001/S-002/S-004 either closed or converted to confirmed findings with owners; full CI green;
phase completion report written with actual test counts (pass/fail/skip) and migration notes
(no schema change expected except possibly PasswordResetToken indexes — forward-only, reversible).

## PHASE 2 — Complete Business Features and User Experience

Goal: close real business-workflow gaps and web/mobile parity, without scope creep.
Entry gate: Phase 1 exit criteria met. Each feature follows the acceptance checklist
(real persistence, server authz, loading/empty/error states, tests, guide notes for Phase 3).

| # | Task | Findings | Depends on | Effort | Measurable exit criteria |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Alterations workflow: list + complete/reopen endpoints; web + mobile UI per order; dashboard count reflects reality. | F-006 | — | 3 d | API tests for transitions + permissions; UI flow verified; dashboard OPEN count decrements on completion. |
| 2.2 | Exports & invoice: CSV exports (customers, orders, payments, ledgers) with permission/module/date-range gates; order invoice PDF (items, payments, balance) reusing receipt pipeline; web + mobile entry points. | F-007 | — | 4 d | Export totals reconcile with report endpoints on a test tenant; invoice arithmetic test (total − paid = balance) passes. |
| 2.3 | Offline/sync decision execution: either wire mobile outbox→sync API with conflict UX, **or** retire sync backend (migration, tests, docs). No third state. | F-004 | D-1 | 3 d (retire) / 12 d (wire) | Retire: CI green, no dangling references. Wire: offline create/edit syncs on reconnect; conflict surfaces to user; device/emulator test recorded. |
| 2.4 | Web performance & maintainability: route-level code-splitting (platform console, ERP, settings), initial-chunk budget in CI; persist web form drafts per user+business. | F-009, F-016 | D-8 | 4 d | Initial JS chunk reduced (target < 300 kB) with all views smoke-tested; refresh mid-order-form restores draft, submit clears it. |
| 2.5 | Parity & UX consistency pass: web↔mobile feature matrix re-checked screen-by-screen after 2.1–2.4; terminology from business templates respected everywhere; confirmation dialogs for destructive actions; error messages name the fix. Platform console remains web-only (documented); mobile platform-scope accounts get the existing clear message. | F-002 (UI part) | 1.3 | 3 d | Parity matrix in `docs/testing/test-matrix.md` all rows ✅ or explicitly web-only/mobile-only with reason; destructive actions all confirmed + audited. |
| 2.6 | Conditional features (only if approved): login-less employee records/wages (G-001); payment-proof upload with storage (G-002); in-app notification centre beyond WhatsApp history (G-004). Each needs its own mini-design + financial rules before code. | G-001/2/4 | D-4, D-5 | 4–8 d each | Per-feature acceptance checklist incl. tests; skipped entirely if not approved (recorded in decision log). |
| 2.7 | Documentation refresh: README status, plan-doc archive marking, module inventory aligned to code. | F-010 | — | 1 d | README describes the product as it exists; no stale "pending" claims. |

**Phase 2 total ≈ 18 dev-days (+9 if sync is wired, +4–8 per approved conditional feature).**
Phase exit criteria: F-004, F-006, F-007, F-009, F-010, F-016 closed; parity matrix complete;
financial rules for any money-touching addition are written and test-covered *before* UI ships.

## PHASE 3 — Visual User Guide, Final QA and Release Readiness

Goal: a beginner can run their shop from the guide alone; release is evidence-based.
Entry gate: Phase 2 exit criteria met (guide must describe the final UI).

| # | Task | Depends on | Effort | Measurable exit criteria |
| --- | --- | --- | --- | --- |
| 3.1 | Help Center in product: `Help / User Guide` entry in web sidebar + mobile More screen; role-based sections (Platform Admin, Business Admin, Staff); Quick Start, glossary, FAQ/troubleshooting, search; contextual "?" links from major pages to the matching tutorial. Content lives in `docs/user-guide/` and is rendered/searched in-app. Simple English first; Roman Urdu explanations alongside (mobile already ships English/اردو/Roman Urdu). | 2.5 | 5 d | Every nav item in web + mobile has a matching guide page (coverage checklist); every guide link tested against the running app; search returns the right tutorial for module names. |
| 3.2 | Per-module visual tutorials: onboarding, customers, measurements, orders/jobs, catalog, inventory, purchasing, payments & receipts, cashbook, accounting reports, WhatsApp notifications, subscription & billing, settings, staff & roles, platform administration (incl. safe deletion). Each: what it is, where to tap, numbered steps, what to type, what happens next, common mistakes, permission warnings. | 3.1 | 6 d | Tutorial per module in the agreed list; every button named in a tutorial exists in the current build (step-by-step verification pass recorded). |
| 3.3 | Real screenshots: recapture from the **current** UI on a seeded demo tenant (no real customer/financial data, no credentials), annotated (arrows, numbered highlights). Retire stale `docs/screenshots/` set or replace it. Capture requires a running real stack or the fixture API for business screens (label platform screenshots as requiring the real API, since the fixture doesn't stub platform routes). | 3.2 | 3 d | Screenshot inventory matches tutorial steps 1:1; zero screenshots contain real data; stale set removed/replaced. |
| 3.4 | Final QA: Playwright E2E for critical journeys (sign-in/scope selection, customer→order→payment→receipt, subscription submit→approve→access restored, ERP post→report, platform archive/restore/delete guards) against isolated test DB; authorization & tenant-isolation negative suite; mobile smoke on emulator (offline case if 2.3 wired it). | 1.6, 2.x | 5 d | E2E suite green in CI; test matrix records actual pass/fail/skip counts; skipped items named with reasons (e.g. no device farm). |
| 3.5 | Release readiness: migration rehearsal on a copy of realistic data + rollback note per migration; backup/restore drill (`pg_dump`/`pg_restore` into a separate DB, timed); dependency audit (mobile toolchain tracked, Expo upgrade if available — F-014); performance spot-check (S-005) with results recorded; release checklist + known-issues list; guide-sync checklist added to the feature acceptance template. | 1.7 | 3 d | Restore drill succeeds and is timed; release report signed off against the acceptance checklist; no Critical/High findings open. |

**Phase 3 total ≈ 22 dev-days.**
Final exit criteria (whole programme): all Critical/High findings closed; Medium closed or
explicitly deferred by the owner in the decision log; CI green (typecheck, unit, integration,
E2E, build, audit); guide coverage checklist complete; phase completion reports filed.

---

## D. Specialist workstreams (simulated — single agent, explicit passes)

No sub-agents exist in this environment; the following are run as separate, labelled review
passes by the lead agent, each producing notes that the lead reconciles (conflicts resolved
in `docs/implementation/decision-log.md`):

1. **Architecture/Code Review** — module boundaries, duplication (incl. shared-contract copies), dead code (sync, legacy status), refactor safety.
2. **Backend/API/Database** — route authz, tenant isolation, transactions, Decimal money rules, migrations, indexes.
3. **Web UI** — states (loading/empty/error/success), forms, navigation, accessibility, bundle.
4. **Mobile UI** — parity, offline behaviour, SecureStore/session handling, device ergonomics.
5. **Security** — auth/session, IDOR, rate limits, secrets, audit logging, deletion guards.
6. **QA/Automation** — test matrix, regression per fix, CI evidence, E2E.
7. **Documentation/Release** — guide accuracy vs UI, README, release checklist, rollback notes.

## E. Test strategy, database safety, rollback

- **Pyramid:** pure unit (domain/finance/inventory/modules) → API/integration on isolated
  Postgres (tenant isolation, permissions, idempotency, money) → web unit/smoke (Vitest) →
  Playwright E2E (Phase 3) → manual device/emulator checks labelled as such.
- **Environments:** tests only against a dedicated DB whose name contains `test`/`acceptance`
  on localhost (enforced by `backend/src/testing/isolated-test-database.ts`); CI provides the
  same with its Postgres service. **Never** run migrations/tests against production or unknown
  databases; no destructive operation without a verified backup first.
- **This sandbox's limits (honest):** `binaries.prisma.sh` and Postgres are unreachable here,
  so Prisma generate/migrate/DB tests cannot run locally; GitHub Actions (green on `main`,
  run 38898201989) is the DB-backed evidence until a local/owner environment is provided.
- **Migrations:** forward-only, reviewed SQL, applied to isolated DB first; each migration
  ships with a rollback note (compensating migration or restore point). Preserve all
  legitimate customer/order/payment/financial records — corrections via reversal workflows,
  never silent edits of posted history.
- **Per-change protocol:** reproduce → root-cause → failing test → fix → formatters/typecheck/
  lint/tests → diff review (no accidental deletions, no hardcoded secrets, no swallowed errors)
  → regression pass → report actual counts.

## Appendix — Platform Admin permission matrix (to finalize in Phase 1, task 1.3)

Legend: V view · C create · E edit · A archive · R restore · D permanent delete · — none.
All D actions: SUPER_ADMIN + explicit grant + impact confirmation + audit, subject to D-2.

| Entity | Business Admin (own tenant) | Platform Staff (granted) | Super Admin |
| --- | --- | --- | --- |
| Business | V (own) | V, C, E, A/R | V, C, E, A/R, D* |
| Business owner/members | E (staff module) | V, E (activate/deactivate) | V, E, A/R, D* (membership records) |
| Users (accounts) | C/E own staff | C platform staff, E grants (no escalation) | C/E all, deactivate, D* (subject to retention) |
| Roles & permissions | C/E/D custom roles (own) | — | V (all tenants) |
| Templates | V (assigned) | C/E with `platform:templates:manage` | C/E, A/R, D* (unused templates only) |
| Plans | V (own offers) | C/E with `platform:plans:manage` | C/E, A/R |
| Subscriptions & payments | V own, submit payments | V, review queue (review = Super Admin) | full lifecycle, approve/reject, adjustments |
| Customers/Orders/Payments (tenant data) | full own-tenant per grants | — (support access only if owner approves a future break-glass design) | — same |
| Inventory/Suppliers/Purchases/Ledger | full own-tenant per grants | — | — |
| Platform settings/branding/billing | — | per explicit grants | full |
| Audit history | V own tenant (`audit:read`) | V all (`platform:audit:read`) | V all |

\* D* only for entities approved in D-2; financial/posted records are never hard-deleted —
they are reversed/archived with history retained.
