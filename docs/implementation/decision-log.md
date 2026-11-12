# Bizora — Decision Log

Decisions needed from the owner. Implementation phases start after approval of the
three-phase plan; individual decisions gate the tasks noted. `OPEN` = awaiting owner.

| ID | Decision | Options | Recommendation | Gates | Status |
| --- | --- | --- | --- | --- | --- |
| D-1 | Offline sync direction (F-004) | (a) Wire mobile outbox to existing sync API; (b) retire sync backend + model; (c) leave as-is | (b) now if shops have reliable connectivity, (a) if offline work is a selling point. (c) is not acceptable long-term. | Phase 2 task 2.3 | **RESOLVED 2026-10-19: retire sync (option b)** |
| D-2 | Permanent deletion policy (F-002) | Which entities may ever be hard-deleted (e.g. never-used businesses, test tenants, unused templates), retention period before delete is offered, confirmation style (type-name vs checkbox+count) | Archive-first everywhere; permanent delete only for entities with zero financial history, SUPER_ADMIN-only, after 30-day archive, with typed confirmation. Financial records: never. | Phase 1 task 1.3 | **RESOLVED 2026-10-19: archive-only, never permanent delete** |
| D-3 | Password-reset delivery (F-001) | (a) Transactional email provider; (b) admin-initiated reset only (owner/platform sets a temporary password); (c) both; (d) WhatsApp-delivered reset code (infrastructure partially exists) | (c) if an email provider exists, else (b)+(d). (b) alone is the minimum viable fix and needs no external service. | Phase 1 task 1.1 | **RESOLVED 2026-10-19: admin-initiated reset only (option b)** |
| D-4 | Employee scope (G-001) | Login-less worker records + wage tracking in scope? | Defer unless owners ask for it; current staff=system users covers access control. | Phase 2 task 2.6 | OPEN |
| D-5 | File uploads (G-002) | Add storage for payment proofs / expense receipts? Which storage (S3-compatible, local)? | Only with D-3/D-4 priorities settled; adds storage, scanning and retention obligations. | Phase 2 task 2.6 | OPEN |
| D-6 | Brand defaults (F-015) | Set "Bizora" as default brand name/title/app name (runtime branding already configurable)? | Yes — defaults should match the sold product name. | Phase 1 task 1.9 | OPEN |
| D-7 | Subscription enforcement default | Keep `enforcementEnabled` opt-in per platform setting, or on for new deployments? | Keep opt-in; flipping default affects existing tenants' access unexpectedly. | Phase 1 task 1.7 (test both modes) | OPEN |
| D-8 | Web refactor appetite (F-009) | (a) Code-split only (lazy views); (b) also split `main.tsx` into view modules incrementally | (a) in Phase 2; (b) opportunistically when a view is touched. No big-bang rewrite. | Phase 2 task 2.4 | OPEN |
| D-9 | User-guide languages | English only; English + Roman Urdu; + Urdu script (mobile already supports all three) | English + Roman Urdu side-by-side, matching the owner's requirement; reuse mobile i18n patterns. | Phase 3 tasks 3.1–3.2 | OPEN |
| D-10 | Database verification environment (S-001/S-002/S-004) | Rely on GitHub CI (Postgres service) as the DB evidence path, and/or provide a local/staging Postgres + staging deployment for rehearsal | CI as the always-on evidence; a staging rehearsal before release (Phase 3 task 3.5). This sandbox cannot download Prisma engines or run Postgres. | Phase 1 task 1.7, Phase 3 | OPEN |

## Resolved during audit (no owner input needed)

- Stack unchanged (Express/Prisma/React/Expo) — no compelling reason to replace; tenant
  isolation and money handling are already well-built on it.
- Screenshots in `docs/screenshots/` are stale vs current UI — Phase 3 recaptures; they are
  not used as evidence of current behaviour anywhere in this plan.
- `tools/demo-api` and `tools/preview-api` remain dev-only fixtures, never product code.

## Approval record

- 2026-10-19: Owner approved **Phase 1 only**; Phases 2–3 return for approval after the
  Phase 1 completion report. D-1 = retire sync (Phase 2). D-2 = archive-only.
  D-3 = admin-initiated password reset only. D-6 remains OPEN → task 1.9 parked.

## Phase 2 execution notes (2026-10-19)

- D-1 executed: sync backend retired (task 2.3). No client ever called it.
- D-8: followed the recorded default (a) code-split only. ERP/settings/chat are
  lazy chunks; the platform console remains in the entry chunk (502 kB) because
  extracting it from the single App component is the (b) incremental refactor.
  F-009's < 300 kB target therefore remains open under D-8.
- D-4/D-5 never approved → task 2.6 (G-001/G-002/G-004) skipped entirely, per plan.
- D-6 still open → Phase 1 task 1.9 (brand defaults) remains parked.

## Phase 3 execution notes (2026-10-19)

- D-9: followed the recorded default — English guide with a Roman Urdu summary
  on every page (mobile already ships full Urdu; the guide can add it later
  without restructuring). D-9 itself remains OPEN for owner confirmation.
- D-10: CI's Postgres service remained the DB evidence path (isolated `e2e`
  schema for browser tests; guarded `tailor` database for the DB suite). No
  staging environment was provided; a staging rehearsal is still recommended
  before production rollout, together with the device/emulator smoke test.
- New findings from E2E: F-018 (seed order-counter bug) fixed in Phase 3; the
  business-help audience mix-up was fixed the same day (see findings register).

## Growth feature 1 — Customer order-tracking links (2026-11-04)

- Owner chose "Customer Order-Tracking Link (public portal)" from the
  recommended feature list (2026-11-04) as the first growth feature.
- **D-11: the customer surface is a token link, not an account.** The MVP
  promise of "no customer portal" is kept: a customer follows exactly one
  order through an unguessable, revocable token and never signs in. A full
  customer account system stays out of scope until the business model changes.
- **D-12: the public payload is deliberately narrow.** It carries the shop
  name, the customer's first name, the order's stage, items, the customer's own
  measurements, total/paid/outstanding, the promised date, the progress
  timeline and the customer's own messages. No internal notes, no staff names,
  no cost or margin data, no customer phone number, no other order.
- **D-13: sharing is a permission of its own (`orders:share`).** Creating or
  revoking a link needs it; reading needs `orders:read`; answering a customer
  message needs `orders:write`. Existing business owner roles receive the
  grant through the migration backfill; new businesses get it from the
  platform's owner provisioning, which grants every business permission.
- **D-14: a link is a customer-service surface, not a paid feature.** It is
  therefore not treated as a paid mutation: an expired subscription must not
  cut a customer off from an order that is already in progress. The `orders`
  module still has to be enabled for the business.
- **D-15: `PUBLIC_WEB_BASE_URL` on the API makes the shared link absolute.**
  Without it the API returns the `/track/<token>` path and the apps build the
  URL from the origin they already run on, so a development deployment works
  without extra configuration.

## Deploy fix — standalone lockfiles (2026-11-06)

- **D-16: the app folders are installed on their own, so they need their own
  lockfile - and CI has to police them.** The container build that failed on
  2026-11-06 ran `npm ci && npm run db:generate && npm run build:shared &&
  npm run build` inside `backend/` (all three scripts exist in
  `backend/package.json`), not at the repository root. That install reads
  `backend/package-lock.json`, which PR #37 left behind: it still pinned
  `zod@3.24.2` while `backend/package.json` and `backend/shared/package.json`
  had moved to `4.6.7`. The build therefore died with
  `Invalid: lock file's zod@3.24.2 does not satisfy zod@4.6.7` before a
  single line of application code was compiled.
- The fix regenerates all four standalone lockfiles (`backend/`, `web/`,
  `mobile/`, `mobile/shared/`) with the same npm the deploy image uses
  (npm 10.9.9 on `node:22-bookworm-slim`), so `npm ci` succeeds in every one
  of those folders. `web/` was worse than stale: it was missing `eslint`,
  `vitest`, `playwright` and `@playwright/test` entirely and still pinned
  `vite@8.3.1` against the required `8.3.5`.
- **Regenerating a standalone lockfile has to happen outside this repository.**
  Inside it, `npm` walks up to the workspace root and rewrites the *root*
  lockfile instead, leaving the standalone one untouched - which is how the
  drift survived in the first place. `tools/check-lockfiles.mjs` copies each
  folder into a throw-away directory, checks it there and fails CI when a
  lockfile and its package.json disagree.

## Deploy fix — the customer link was a 404 (2026-11-06)

- **D-17: a customer link is a deep link, so the web host has to serve the app
  shell for it.** The tracking link is `https://<web-host>/track/<token>`. The
  web app is a Vite single-page app, so the host must answer that path with
  `index.html` and let the client render the customer page. The Vercel project
  answered it with `404 NOT_FOUND` instead: the repository shipped no
  `vercel.json`, so Vercel served static files only and every deep link was
  dead. The customer who received the link saw "This page doesn't exist".
- The rewrite now ships as `vercel.json` in the repository root **and** in
  `web/`, because the Vercel project can be rooted at either one and Vercel
  only reads the file that sits in the project root. `/api/` and `/backend/`
  stay out of the rewrite so a same-origin API keeps working.
- `tools/check-spa-routing.mjs` fails CI when no usable rewrite is in place,
  and the route parsing moved out of the render entry into
  `web/src/tracking-route.ts` with its own test, so the decision "is this the
  customer page?" is covered by a unit test instead of living inside
  `main.tsx`.
- Operational note: the Vercel *production* deployment that served the link
  was still an older build (its page title and marketing copy no longer exist
  in the repository). A deploy of `main` is required for the tracking page to
  be in the bundle at all - the rewrite alone is not enough.

## Workspace fix — the "Manage" order window (2026-11-10)

- **D-18: the order card belongs in a real dialog, not in a side panel.** The
  **Manage** action of the orders table used to be a `<details>` element whose
  content was a fixed panel pinned to the right edge of the screen
  (`workspace-theme.css`). The panel was 660 px wide and the order card inside
  it is a two-column flex card, so the card did not fit: it spilled out of the
  panel, was cut in half on the left and the workspace behind painted over the
  clipped part. The customer link, the alterations panel and the action
  buttons were unreachable - a customer-facing feature was effectively lost
  behind a broken overlay.
- The action opens a real dialog now: a dimmed backdrop, a centred sheet that
  never grows wider than the screen, a header that stays in sight, a body that
  scrolls on its own, a close button, `Esc` to close and a click outside to
  close. Inside the dialog the order card drops the kanban chrome and lays
  itself out in one column, so nothing overflows on a phone either.
- The dead popover styles are gone, and `web/e2e/orders.spec.ts` keeps the
  window inside the viewport - the regression that was reported is now a test.

## Workspace fix — the orders screen no longer nags about a switched-off module (2026-11-11)

- **D-19: the app must not call a module-gated API it knows will be refused.**
  A business can switch modules off (the measurement book, the customer book),
  and the API answers those endpoints with HTTP 403 "The <module> module is
  disabled for this business". The orders screen nevertheless asked for the
  customer's measurement profiles every time it was opened - the customer
  selection is part of the order draft, so the call fired on every visit - and
  the refusal was put on the screen as an error banner. A shop owner could not
  do anything about it: the message was about a module they had deliberately
  switched off (or that their template never had).
- The measurement profiles are now loaded only when the module is on, the
  permission is held and a customer is selected. The decision lives in
  `web/src/module-access.ts` (`shouldLoadMeasurementProfiles`) with unit tests,
  and a refused call is swallowed instead of becoming a banner.
- The same hardening covers the customer list in the orders and measurement
  screens: with the customers module off the list is simply empty, and the
  order list still loads instead of the whole screen failing.
