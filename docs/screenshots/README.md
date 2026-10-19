# Screenshots — recapture required (Phase 3, task 3.3)

**Status: DEFERRED — pending a browser/device session against a seeded demo tenant.**
The previous 24 screenshots (pre-Phase-1 UI, from the base commit) were retired in
Phase 3 because they no longer match the shipped interface and could mislead users.
They remain recoverable from git history (`git log -- docs/screenshots/`).

No replacement images are committed yet on purpose: screenshots must be **real
captures of the current UI**. Fabricated or AI-generated "screenshots" are worse
than none, and this environment has no browser to capture them.

## Recapture procedure (owner/staging, ~1 hour)

1. Start the stack (`docker compose up -d` or the staged deployment) and seed the
   demo tenant only: `npm run seed --workspace @tailor/backend` (never production data).
2. Sign in as the demo **business** user and capture, at 1440×900, light theme:
   `00-login.png`, `01-business-overview.png`, `02-business-orders.png` (incl. the
   alterations panel), `03-business-catalog.png`, `04-business-customers.png`,
   `05-business-measurements.png`, `06-business-payments.png` (incl. invoice PDF
   download), `07-business-notifications.png`, `08-business-subscription.png`,
   `09-business-settings.png`, `10-help-guide.png` (new — the User Guide screen),
   and one dark-theme overview shot.
3. Sign in as the demo **platform** user and capture: overview, businesses
   (incl. archive/restore), templates, subscriptions & payment review, plans,
   staff, audit, health, application settings, and the platform **User Guide** view.
   Label these clearly as requiring a platform account.
4. Mobile (Expo/emulator, demo data only): home, orders (alterations), payments,
   More screen, and the new Guide screen with search.
5. Privacy pass before committing: no real names, phone numbers, balances,
   tokens or URLs with credentials; demo-tenant data only. Blur is a last resort —
   prefer re-seeding clean demo data.
6. File names must match the steps in `docs/user-guide/`; update this README with
   the capture date and build commit, and tick task 3.3 in the coverage checklist.
