# Guide coverage checklist (Phase 3, tasks 3.1–3.2)

Every navigation item in the shipped apps must have a matching guide page, and
every button the guide names must exist in the current build. Guide sources live
in `docs/user-guide/*.md`; run `npm run build:guide` after editing and commit the
regenerated `web/src/guide-content.ts` / `mobile/src/guide-content.ts` (CI fails
if they are stale).

## Coverage — web, business workspace

| Navigation item | Guide page |
| --- | --- |
| Dashboard | `quick-start.md`, `faq.md` |
| Orders | `orders.md` |
| Catalog | `catalog.md` |
| Customers | `customers.md` |
| Measurements | `measurements.md` |
| Payments (incl. ledger, receipts, invoice PDF) | `payments.md` |
| WhatsApp notifications | `whatsapp.md` |
| Operations & finance — Inventory | `inventory.md` |
| Operations & finance — Suppliers / Purchasing | `purchasing.md` |
| Operations & finance — Cashbook | `cashbook.md` |
| Operations & finance — Accounting | `accounting.md` |
| Subscription & billing | `subscription.md` |
| Business settings (incl. Team) | `settings.md`, `staff-roles.md` |
| Help / User Guide | `quick-start.md` (start here) |
| Account: Change password | `staff-roles.md`, `faq.md` |

## Coverage — web, platform console

| Navigation item | Guide page |
| --- | --- |
| Overview | `platform-admin.md` |
| Businesses (archive/restore) | `platform-admin.md` |
| Templates, Staff, Audit history, Health, Billing & plans, Payment queue, Application settings | `platform-admin.md` |
| User Guide | `platform-admin.md` |

## Coverage — mobile

| Tab / More item | Guide page |
| --- | --- |
| Home, Orders, Payments, Activity | `quick-start.md`, `orders.md`, `payments.md` |
| More → Analytics | `accounting.md` (reports overview) |
| More → Customers / Measurements / Catalog | `customers.md`, `measurements.md`, `catalog.md` |
| More → Notifications | `whatsapp.md` |
| More → Operations & finance | `inventory.md`, `purchasing.md`, `cashbook.md`, `accounting.md` |
| More → Subscription | `subscription.md` |
| More → Business settings | `settings.md` |
| More → Help / User Guide | this guide |
| More → Settings (incl. Password) | `staff-roles.md` |

## Button-name verification (task 3.2 exit)

Method: extracted every **bold** action name from the 18 guide pages and searched
the shipped web/mobile sources for the exact label (2026-10-19, Phase 3 build).

- 114 bold names matched UI labels verbatim (e.g. **Save revision**, **Create
  order**, **Export CSV**, **Show archived**, **Reset password**, **New order**).
- Remaining hits were navigation paths (reworded from `More → X` arrows to plain
  text so they are not mistaken for button names) or glossary terms, which are
  definitions, not buttons.
- Guide wording was corrected where it drifted from the shipped labels
  (**Add a customer**, **Save customer**, movement labels in inventory).

Re-run this check after any UI rename: extract `\*\*…\*\*` phrases from
`docs/user-guide/*.md` and grep `web/src`, `mobile/src`.

## Known gaps

- Screenshots: pending real recapture — see `docs/screenshots/README.md` (task 3.3).
- Language: English with a Roman Urdu summary per page (decision D-9 default;
  full Urdu/Arabic-script translation not yet approved).
