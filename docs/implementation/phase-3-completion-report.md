# Phase 3 Completion Report — Visual User Guide, Final QA and Release Readiness

Date: 2026-10-19 · Branch: `arena/b04a4d5b-tailorapp` (PR #27) · Phase 3 of
`docs/implementation/three-phase-plan.md`, approved by the owner ("start Phase 3").

## 1. Tasks

| Task | Status | Evidence |
| --- | --- | --- |
| 3.1 Help Center in product | ✅ | `Help / User Guide` in the web sidebar + platform console, `Help / User Guide` in the mobile More tab; role-filtered (business/platform/shared), full-text search, contextual `? Guide` links on Orders/Customers/Payments |
| 3.2 Per-module visual tutorials | ✅ | 18 canonical pages in `docs/user-guide/`; `docs/user-guide/coverage-checklist.md` maps every web + mobile navigation item to a page; 114 guide button names verified verbatim against the shipped UI (guideline: button names in the guide must exist in the build) |
| 3.3 Real screenshots | ⛔ Deferred (honest) | No browser/device exists in this environment and fabricated images are not acceptable. The 24 stale pre-Phase-1 screenshots were retired; `docs/screenshots/README.md` is the exact recapture procedure against a seeded demo tenant (~1 h, owner/staging). Exit criterion "stale set removed/replaced": removed ✅, replaced ⏳ |
| 3.4 Playwright E2E in CI | ✅ | `web/e2e/` — setup project (one real sign-in; the login limiter is 10/15 min per IP, F-013) + 8 tests: sign-in success, wrong-password rejection, guide search/open, guide empty state, contextual `? Guide`, customer→order→payment→Invoice PDF journey, anonymous-401 negatives, business-token-kept-out-of-platform negative. Runs in CI against an isolated `e2e` Postgres schema seeded with CI-only throwaway accounts |
| 3.5 Release readiness | ✅ (with named exceptions) | Timed `pg_dump`/`pg_restore` drill in CI (populated e2e schema → throwaway DB → row counts asserted → dropped; step ≈ 1 s on CI hardware); migration rehearsal = fresh `prisma migrate deploy` into the empty e2e schema on every run; dependency audit (below); performance spot-check (below); `docs/implementation/release-checklist.md` |

## 2. Bugs the E2E suite caught (the point of task 3.4)

1. **Business Help opened the platform guide** (`audience="platform"` mounted in the
   business branch of `web/src/main.tsx`). Business users would have seen only the
   platform + shared pages. Fixed; covered by the guide E2E tests.
2. **Seeded demo tenants could not create orders (F-018).** The seed plants demo
   orders `KARACHI-000001/-000002` (and `-000001` in the other demo tenants) but
   left `orderSequence` at 0, so the first staff-created order violated the
   `(businessId, orderNumber)` unique index → HTTP 500. Backend suites never saw
   it because they provision their own tenants. The seed now raises each demo
   tenant's counter past its highest seeded order number (derived, idempotent
   on reseed). Regression coverage: the E2E journey itself (fails before the
   fix, passes after — both observed in CI).

Getting the browser suite to run in CI also surfaced and preserved three
deliberate product guards (documented, not bypassed): the seed refuses
`NODE_ENV=production`; production boot rejects the default localhost CORS
origin; the login limiter caps a shared test IP at 10 attempts/15 min.

## 3. Tests actually executed (exact counts)

- **GitHub CI run 39233433526** — first fully-green run including E2E; run
  **39233848872** re-verified with the restore drill, which completed its step
  in ≈ 1 s (E2E step 20 s). All pre-existing gates green in both: shared/web/
  mobile/api typechecks, web ESLint (0 errors, 9 pre-existing warnings), backend
  DB suite on the isolated CI database (incl. migrations + sync-retirement),
  web Vitest, mobile suite, production builds, bundle budget, `npm audit`
  (api/web/shared), shared-drift + guide-freshness checks, Playwright E2E
  (1 setup + 8 tests, Chromium), restore drill.
- **Local this phase:** web typecheck ✅; ESLint 0 errors / 9 pre-existing
  warnings; web Vitest 14/14; web production build ✅ — entry chunk
  **503,083 B** (budget 510,000; was 502,020 before Phase 3, +1 kB of guide
  wiring), `HelpGuide` lazy chunk 38,438 B, ERP chunk 68,501 B; mobile
  typecheck ✅; mobile tests 31/31; E2E specs typecheck ✅ and
  `playwright test --list` shows 9 tests. **Not run locally:** the browser
  suite itself (no browser binaries available here) and the full backend
  typecheck/DB suite (no Prisma engines/PostgreSQL in this sandbox) — CI is
  the evidence path, as recorded since Phase 1.
- **Skipped, named:** screenshot recapture (3.3 — needs a browser/device
  session); mobile emulator smoke incl. offline run (no emulator here; the
  guide content is bundled into the app by construction, so guide-offline is
  structural — verify on device before rollout). Browser-level E2E for
  subscription-approval, ERP-posting and platform-delete guards from the
  original 3.4 wish list: **not** added — those lifecycles remain covered by
  the backend DB suite and API-level negatives; recorded as residual QA debt
  in the test matrix.

## 4. Performance spot-check (S-005)

Production web build (local, same numbers CI enforces): entry 503,083 B /
≈130 kB gzip against the 510 kB ratchet; every heavy surface is lazy
(ERP 68.5 kB, HelpGuide 38.4 kB, chat, team, structure editors). The F-009
remainder (platform console inside the entry chunk; <300 kB target) stays
open under D-8 default (a) — the budget ratchet prevents regression.
Backend response timing was not re-measured (no local PostgreSQL); CI
request logs during E2E showed 1–3 ms API responses on seeded data.

## 5. Dependency audit (F-014)

- api/web/shared: **0 vulnerabilities** (CI gate).
- Mobile: 15 high, **all in the Expo/Metro build toolchain** (braces,
  micromatch, metro packages, node-forge via `@expo/code-signing-certificates`).
  `npm audit fix` fails with ERESOLVE in this monorepo and `--force` proposes
  breaking downgrades (Expo 44 / RN 0.72) — not applied. No advisory reaches
  the shipped app runtime. Expo SDK 57 (current line) is in use. F-014 stays
  open as a toolchain-upgrade task with an owner-accepted risk note in the
  release checklist; re-audit on the next SDK upgrade.

## 6. Migrations and rollback

No new migrations in Phase 3. The seed change is data-only and forward-safe;
re-running the seed keeps counters correct (guard only raises them).
Rollback note (unchanged programme rule): migrations are forward-only; any
rollback is a restore from a pre-release `pg_dump`, never a down-migration
against live data. The restore drill above proves that path works.

## 7. Files changed (Phase 3)

Guide content/compiler/in-app help: `docs/user-guide/*.md` (18 pages) +
`coverage-checklist.md`, `tools/build-guide.mjs`, root `build:guide` script,
`web/src/HelpGuide.tsx`, `web/src/guide-content.ts`,
`mobile/src/guide-content.ts`, `mobile/src/screens/GuideScreen.tsx`,
`web/src/main.tsx` + `web/src/styles.css` (Help views, contextual links),
`mobile/App.tsx`, `mobile/src/navigation.ts`, `mobile/src/screens/MoreScreen.tsx`,
CI guide-freshness step.
E2E: `web/e2e/*` (5 files), `web/playwright.config.ts`,
`web/tsconfig.e2e.json`, `@playwright/test` devDependency, CI E2E step.
Release: `backend/prisma/seed.ts` (F-018 fix), CI backup/restore drill,
`docs/screenshots/` (24 stale PNGs retired + README procedure),
`docs/implementation/release-checklist.md`, this report.

## 8. Remaining risks and known limitations

- Guide language is English + Roman Urdu summary per page (D-9 default);
  full Urdu/Arabic-script translation awaits owner confirmation (D-9 open).
- Screenshots and the mobile emulator smoke are the only unexecuted Phase 3
  items; both are procedurally documented and honestly labelled deferred.
- PR #27 still awaits owner merge; nothing in Phase 3 was merged to `main`.
