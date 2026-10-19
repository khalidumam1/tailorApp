---
title: Platform administration
audience: platform
keywords: platform, super admin, businesses, templates, plans, billing review, staff, archive, suspend, audit, health, reports
---

# Platform administration

## What this is
The console for the platform team: every business on the system, subscription review, templates, plans, platform staff and audit history. It exists on the web only; signing in with a platform account on mobile shows an explanatory message by design.

## Where to find it
Sign in and choose **Platform** when asked (or your platform account lands here directly). Sections: Overview, Businesses, Business templates, Subscriptions, Plans, Payment review, Billing reports, Platform settings, Platform staff, Audit history, System health.

## Businesses: suspend, archive, restore
- **Suspend** blocks sign-in immediately (billing disputes, abuse). **Archive** parks a business under the **Archived** filter with all data kept; an archived business fails sign-in, refresh and every API call. Both ask for confirmation.
- **Restore or reactivate** needs an active business owner in place. Nothing at platform level is permanently deleted — corrections happen through status and audit, by design.

## Subscription payments: review queue
1. Open **Payment review**. Each submission shows business, plan, amount and the transaction reference the business typed.
2. Match it against the actual bank/mobile receipt. **Approve** extends the period transactionally and issues the invoice; **Reject** requires a reason the business can act on.
3. Only a **SUPER_ADMIN** holding **platform:payments:review** can approve. Refunds/adjustments are recorded from the business billing page and stay internal audit entries.

## Templates and plans
Template changes roll to businesses using that template; businesses with their own overrides keep them. Plan prices and limits apply on the next period — never silently rewrite a running period.

## Platform staff
Create staff with explicit grants only (never by habit). Deactivating staff signs them out; the console refuses to deactivate the last active super admin or the last holder of **platform:staff:manage**, so the platform can never lock itself out. Any admin can reset any user's password from the business members view or staff cards; the user must choose their own at next sign-in.

## Audit and health
**Audit history** is the immutable story of privileged actions — check it before believing any "the system changed X" claim. **System health** separates "process up" from "database reachable"; reports need **platform:reports:read**.

## Permission warnings
Every section checks a granular **platform:*** permission on the server, not just the hidden button. Direct API calls without the grant fail, including for staff accounts.

## Roman Urdu mein
Platform console sirf web par hai: tamam businesses, subscription review, plans, staff aur audit yahan se manage hote hain. Business delete nahi hota — suspend ya archive hota hai, data mehfooz rehta hai. Approval se pehle transaction reference asal receipt se zaroor milayein.
