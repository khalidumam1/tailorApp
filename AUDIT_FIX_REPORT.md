# Audit & fix report — refresh-to-login bug + full-stack integration check

> **Historical document (archived 2026-10-19).** Preserved as the record of its audit/fix cycle; some statements are superseded by the phase reports in `docs/implementation/`. See `README.md` for current status.

Date: 2026-10-15 · Branch: `arena/4bdc6491-tailorapp`

## 1. The reported bug: "refreshing redirects me to the login screen"

**Root cause (web app).** The sign-in session lived only in React memory:
`useState<Session | null>(null)` in `web/src/main.tsx`, never written to any
storage. Every page reload, tab restore, or browser restart discarded it, so
the app booted straight to the login screen — even though the backend issues
a **30-day refresh token** precisely so clients can resume, and the mobile
app already persists its session in SecureStore and restores it on launch.
The login page footer even documented the behaviour ("Your session stays in
memory on this device").

**Fix (`web/src/main.tsx`).**

- The token pair is now persisted in **`sessionStorage`**
  (`tailorapp.session.v1`) and restored synchronously on load, so a refresh
  resumes the workspace instead of showing the login screen. `sessionStorage`
  was chosen over `localStorage` deliberately: it survives reloads and tab
  restores, but is still cleared when the tab closes — keeping the previous
  "this visit on this device" security boundary while fixing the complaint.
- The **last open view** (business view / platform view) is stored with the
  session, so a refresh also returns you to the screen you were on.
- Token rotation is handled: `withSession` already refreshes an expired
  15-minute access token and retries; the rotated pair is written back to
  storage on every renewal. If the refresh token is genuinely dead (revoked,
  or older than 30 days), the app falls back to the login screen with a
  "session expired" message, as before.
- **Cross-tab safety:** the backend rotates the refresh token on every
  refresh and revokes *all* of a user's sessions if an already-rotated token
  is replayed (theft detection). A `storage` listener now makes open tabs
  adopt each other's rotated pair and sign out together, so two tabs can no
  longer knock each other (and every device session) out.
- All storage access is try/catch-guarded: in private-browsing modes where
  storage throws, the app falls back to the old memory-only behaviour.
- Login footer copy updated to match the new behaviour.

**Mobile was already correct here:** the session is stored in
`expo-secure-store`, restored during boot (`readSession` in
`mobile/src/api.ts`), the access token is refreshed proactively before
requests, and a network failure during refresh does **not** sign you out —
only a real 401 does. No change needed.

## 2. Other bugs found and fixed

| # | Where | Bug | Fix |
|---|-------|-----|-----|
| 1 | `mobile/src/api.ts` | Any `403 PERMISSION_DENIED` response (e.g. a tailor-role user reaching a payments-gated call) triggered `notifySessionExpired()` + `clearSession()` — the user was **signed out of the whole app for one forbidden request**. | Only membership-level failures (`MEMBERSHIP_INACTIVE`, `BUSINESS_ACCESS_DENIED`) end the session now; a permission denial is surfaced as an error and the user stays signed in. |
| 2 | `packages/shared`, `web/shared` | Shared-contract drift: `createPaymentSchema` accepted `financialAccountId` in the backend and mobile copies but not in the root/web copies, so the four "identical" shared packages had silently diverged (backend payment route does accept and use the field). | Added `financialAccountId: z.string().uuid().optional()` to the two lagging copies. **All four shared copies are now byte-identical.** |
| 3 | `backend/src/app.ts` | Two different CORS policies: the configured policy on `app.use(cors(...))`, but a second default `cors()` on `app.options(/.*/, ...)` answered preflights with a wildcard origin the real request would not honour. | One `corsPolicy` instance now serves both. |

## 3. Integration check — every API, web + mobile vs backend

- **Route surface:** extracted every client call (web `web/src/api.ts`,
  mobile `mobile/src/api.ts`, `mobile/src/sync.ts`, ERP screens) and matched
  it against every mounted Express route. All web and mobile calls resolve
  to real backend routes under `/api/v1/*`, including sync
  (`/sync/operations`, `/sync/changes`), ERP (inventory / suppliers /
  purchases / cashbook / accounting), platform billing, and receipts (PDF/CSV
  blob downloads). No dangling endpoints found.
- **Response contracts:** the web client validates every response with Zod
  and hard-fails on mismatch, so I checked the risky mappers by hand:
  orders list/detail (Decimal→string, `paid`/`outstanding` only when the
  user may read payments), payments + receipts, dashboard counters,
  catalog `customFields`, subscription payments (plan `{name}` vs full
  plan), and the payment-review response. All match the backend serializers.
- **Auth flows:** business login, platform scope/business selection,
  refresh-token rotation with reuse detection, logout revocation, and
  password change (revokes all refresh tokens) are consistent between
  backend and both clients. Mobile always logs in with `scope: 'business'`
  and correctly refuses platform-only accounts; web handles the
  scope/business picker round-trips.
- **UI/UX:** builds on the earlier `UI_UX_AUDIT.md` pass (icon set, type
  floors, 44px targets, scrollable tab bars). No new visual regressions;
  the only copy change is the login footer mentioned above.

## 4. How this was verified

| Check | Result |
|-------|--------|
| `npm run typecheck --workspace @tailor/web` | ✅ pass |
| `npm run typecheck --workspace @tailor/mobile` | ✅ pass |
| `npm run build --workspace @tailor/web` | ✅ pass (one pre-existing >500 kB chunk-size warning; code-splitting is a possible future optimisation) |
| `npm run test --workspace @tailor/mobile` | ✅ 9/9 logic tests pass |
| Backend syntax (transpile check, all 49 `backend/src` files) | ✅ pass |
| Live flow via `tools/preview-api` + Vite proxy | ✅ login → `/auth/me` → token refresh rotation → dashboard/orders all succeed; the served bundle contains the new session persistence |
| All four `@tailor/shared` copies | ✅ identical after the drift fix |

**Not run here:** the real backend + database test suite
(`npm test`, `npm run typecheck` for `@tailor/api`). This sandbox cannot
download Prisma's engine binaries (`binaries.prisma.sh` is unreachable), so
`prisma generate` — and therefore the backend typecheck/tests and any live
PostgreSQL verification — could not execute. The backend changes in this
pass are limited to the CORS wiring above (syntax-checked); please run the
commands below once in your environment to confirm.

## 5. Recommended follow-ups (not changed, with reasons)

1. **Run the backend suite in CI/your machine:** `npm ci && npm run db:generate && npm run typecheck && npm test` (tenant integration tests with `RUN_DB_TESTS=true` against a disposable database).
2. **Form drafts on web** are still lost on refresh (only the session and
   current view are restored). If order-form data loss matters, persist the
   in-progress form the same way — deliberately left out here to keep this
   fix focused.
3. **Rate limits behind one shop router/proxy:** `/auth/refresh` allows
   30 requests / 15 min per IP. Many staff devices behind one NAT IP plus
   multiple tabs could approach this; if that ever bites, raise the refresh
   limit (it is already token-authenticated) rather than the login limit.
4. **Refresh-token reuse strictness** revokes *all* sessions on replay.
   Correct for theft detection, and now safe for multi-tab web use, but be
   aware a very old open tab waking up can still sign the user out
   everywhere; a short server-side rotation grace window would soften this
   if it ever becomes a support issue.

## 6. Follow-up: backend `typecheck` TS2339 on `financialAccountId`

Running `npm run typecheck` failed in `backend/src/routes/payment.routes.ts`
(3 × TS2339: `Property 'financialAccountId' does not exist`). Root cause,
reproduced exactly in the sandbox before fixing:

- In a **monorepo install**, npm resolves the backend's
  `"@tailor/shared": "file:./shared"` dependency to the root workspace
  **`packages/shared`** (the workspace wins the package name; there is no
  `backend/node_modules/@tailor/shared`). The compiler therefore reads
  `packages/shared/dist` — not `backend/shared`.
- On `main`, `packages/shared` was the copy missing `financialAccountId`
  (the section-2 drift), so the monorepo typecheck was already broken; it
  only passed with a standalone backend install. After pulling the section-2
  source fix, the same error persisted whenever `packages/shared/dist` was
  stale, because the backend `typecheck` only rebuilt `backend/shared`.

**Fix:** backend and mobile now have `scripts/build-shared.mjs` (the script
the web app already had), which builds *every* shared copy that exists
(`./shared` and `../packages/shared`), and their `build:shared` /
`typecheck` / `start` scripts use it. Whichever copy the compiler resolves
is always freshly built from the (now identical) sources.

**Verification:** reproduced the 3 errors with a stale `packages/shared/dist`,
then ran the new build — both dists regenerated and the backend typecheck
reports **0** `financialAccountId` errors. (In this sandbox the only
remaining backend errors are the expected "Prisma Client not generated"
class, since `binaries.prisma.sh` is unreachable here; on a normal machine
`db:generate` runs first, as in the reported log, and the typecheck passes.)

**To apply locally:** pull this branch, then from the repo root run
`npm ci` once (refreshes workspace links) followed by `npm run typecheck`.
Running `npm run typecheck` from inside `backend/` also works now.

## Files changed

- `web/src/main.tsx` — session + view persistence, cross-tab adoption, footer copy
- `mobile/src/api.ts` — permission denial no longer destroys the session
- `packages/shared/src/index.ts`, `web/shared/src/index.ts` — payment contract aligned
- `backend/src/app.ts` — single CORS policy for preflight and requests
- `backend/scripts/build-shared.mjs`, `mobile/scripts/build-shared.mjs` (new) and
  `backend/package.json`, `mobile/package.json` — always build every shared copy,
  so a stale `packages/shared/dist` can no longer break the backend/mobile typecheck
