# Selling Bizora as a self-serve SaaS

**Question this answers:** how do we sell Bizora online as a subscription, at a
fixed published price, with no bargaining and no back-and-forth conversation?

**The answer in one line:** put the price on a page, take the payment through a
link, and let the software create the workspace and send the credentials — so
there is nobody to haggle with.

This document separates three things, and it matters which is which:

- **Verified** — checked against the code in this repository. Safe to publish.
- **Proposed** — my recommendation. Needs your sign-off before it goes public.
- **To build** — does not exist yet. Everything in this group is real work.

Pricing is **Proposed** throughout. `docs/marketing/FACT_SHEET.md` deliberately
forbids publishing a price that has not been agreed internally, so nothing
below goes on a website until you say yes. Once you do, the agreed numbers move
into the fact sheet and become publishable.

---

## 1. What we are actually selling

Verified, from `docs/marketing/FACT_SHEET.md` and the code it cites:

| What | Detail |
| --- | --- |
| Product | A multi-tenant business management platform: every business gets its own workspace, members and roles |
| Consoles | Business workspace (owners and staff) + platform console (Bizora operations) |
| Clients | Web dashboard and an Android app built with Expo |
| Templates | Six: Tailor, Furniture, Carpenter, Auto Workshop, Printing, Generic |
| Modules | customers, orders, catalog, measurements, payments, notifications, reports, inventory, suppliers, purchasing, cashbook, accounting |
| Per business, no code | Terminology, modules switched on, item types, workflow stages, payment methods, dashboard widgets |
| Customer-facing extras | Order tracking links, invoice PDFs, CSV exports, light and dark themes |
| Defaults | Per-business timezone and currency; `Business.status` starts `PENDING`; a 14-day Starter trial is seeded |

*Note for accuracy: the fact sheet's module list is the one to advertise.
`backend/src/business-module-policy.ts` maps eleven permission families to
modules; `catalog` is real (migration `20261005140000_generic_catalog_fields`
enables it) but is gated through a different family. If you ever tune plan
features per module, work from the database values, not from the policy file.*

**Where the differentiation really lives.** The plan model
(`backend/prisma/schema.prisma`, `SubscriptionPlan`) carries `features` and
`limits` as JSON, and the README confirms the API enforces "customer, staff and
monthly order limits" plus module access. So a tier can differ in exactly four
ways today: **staff seats, customer records, orders per month, and which
modules are switched on.** Every price table below is built only from those
four levers. Do not sell a tier on any other axis until the code supports it.

---

## 2. Pricing (Proposed — needs your sign-off)

All prices published as-is, no "contact us for a quote". Three tiers is enough
for self-serve; a fourth only dilutes the choice.

### Pakistan (PKR, per month)

| | Starter | Growth | Scale |
| --- | --- | --- | --- |
| Price / month | **2,500** | **6,000** | **15,000** |
| Price / year (2 months free) | 25,000 | 60,000 | 150,000 |
| Staff seats | 3 | 10 | 30 |
| Customer records | 200 | 2,000 | Unlimited |
| Orders / month | 100 | 1,000 | 5,000 |
| Core: customers, orders, catalog, measurements, payments, reports | Yes | Yes | Yes |
| Notifications, inventory | No | Yes | Yes |
| Suppliers, purchasing, cashbook, accounting | No | No | Yes |
| Trial | 14 days, no card | 14 days, no card | 14 days, no card |

### International (USD, per month)

| | Starter | Growth | Scale |
| --- | --- | --- | --- |
| Price / month | **12** | **29** | **79** |
| Price / year | 120 | 290 | 790 |
| Everything else | same as PKR table | | |

**These tiers have to exist in the database before the page means anything.**
A fresh database has one active plan — the migration's Starter, priced 0 with
unlimited limits, which is a trial plan rather than a paid tier. The signup
form loads its plan list from the API, so without the other tiers a buyer sees
three prices and then finds one in the dropdown. `backend/scripts/seed-plans.sql`
creates Growth and Scale and turns Starter into the paid entry tier. It is
idempotent, so it is also how you edit the prices later.

**Why these numbers.** They are anchored on what a Pakistani SME pays for a
shopkeeper's time, not on what global SaaS charges: a part-time munshi or a
spreadsheet-and-WhatsApp habit costs a business owner more than PKR 2,500 a
month in mistakes alone. Growth at PKR 6,000 is priced under one employee-day
per month. Scale at PKR 15,000 is still below the cost of any custom software
quote. If you want higher, raise the seats and order limits, not the story.

**The no-bargaining rules** — these are the point of the whole exercise:

1. The price is on the page. There is no "request a quote" button anywhere.
2. Two currencies, one table, one toggle. No per-country pricing.
3. Annual is a published 2-months-free, not a negotiated discount.
4. No coupon field in the first 90 days. A coupon field invites the question
   "can I get one?", which is the conversation we are removing.
5. The FAQ answers "Do you offer a discount?" with: *No. The price is the same
   for everyone, which is why we can keep it low and answer support in hours
   rather than days.* Saying that out loud ends the negotiation before it
   starts, and it is the honest reason.
6. One exception, stated publicly: **NGOs and registered educational
   institutions get 50% off, applied automatically at signup on a verified
   institutional email.** Publishing one narrow exception protects the rule
   everywhere else — otherwise every prospect believes they are the exception.

---

## 3. The self-serve funnel, and where today's code stands

| # | Stage | Status today | What it needs |
| --- | --- | --- | --- |
| 1 | Landing page explaining the product | **To build** — the web app is only the ERP workspace (`web/src/ErpWorkspace.tsx`); there is no public site | A marketing site. Build it in the repo or as a separate static site |
| 2 | Pricing page | **To build** — nothing exists | The tables above, plus a comparison row per limit |
| 3 | Public plan list | **Verified** — `GET /api/v1/public/plans` (unauthenticated, active plans only, no internal fields) | Nothing. `site/signup.html` already loads it |
| 4 | Self-signup | **Verified** — `POST /api/v1/public/signup` creates the business ACTIVE, its owner, an Owner role with every business permission, and the default plan's trial. Off until the `signup` platform setting is switched on (`backend/scripts/self-signup-switch.sql`). `site/signup.html` is the form | Nothing for the API. A signup screen inside the app itself would let the returned session be stored without a redirect |
| 5 | Provisioning | **Verified** — templates, workflow stages and item types are seeded | Signup calls the same configuration path the platform console uses today; no new domain logic |
| 6 | Trial expiry | **Verified** — server-side authorisation blocks business writes after the grace period; expiry alerts exist but "no external email/SMS reminder provider is configured" | An email provider so the expiry alerts actually reach people |
| 7 | Payment | **To build** — billing is manual: businesses submit a transaction reference, a Super Admin reviews and approves (`POST /payments/:paymentId/review`) | A gateway plus a webhook that creates the `SubscriptionPayment` and approves it without a human |
| 8 | Credentials to the customer | **To build** — no email exists anywhere in the backend | Transactional email: welcome + sign-in link, trial-ending, payment received, invoice, payment failed |
| 9 | Onboarding without a human | **Partly verified** — in-app `HelpGuide`, `ChatAssistant`, and the compiled user guide under `docs/user-guide` all exist | Signup tour, sample data toggle, a 3-email drip pointing at the guide |
| 10 | Renewal and dunning | **Verified** for enforcement (grace snapshot, write blocking); **To build** for messaging | Gateway handles card retries; we send the reminder emails |
| 11 | Cancellation | **To build** for self-serve | A "cancel" button in the business billing screen that sets `CANCELLED` at period end |
| 12 | Reporting | **Verified** — platform billing dashboard and `GET /platform/billing/report.csv` | Nothing, until you want MRR charts |

**Read that table as the scope of the project.** Stages 1–2 and 7–8 are the
build; 3–6, 10 and 12 are done. Stages 9 and 11 are small.

Two details in stage 4 worth knowing, because both were decided deliberately:

- The new business is created **ACTIVE**, not PENDING like the platform
  console creates it. Sign-in only offers memberships in ACTIVE businesses, so
  a PENDING business would leave a brand-new owner staring at an empty
  workspace picker. Trial expiry is what gates writes, not the business status.
- The endpoint is **off until you switch it on**. It is public by definition,
  and merging to main deploys the backend, so it fails closed: a missing
  `signup` platform setting means 403. `backend/scripts/self-signup-switch.sql`
  turns it on and off.

---

## 4. Getting paid from Pakistan (the part that stops most people)

This is the crux. Two separate problems: *collecting* in dollars from abroad,
and *collecting* in rupees at home. They need different providers.

Checked against current public information (September 2026); the links are at
the end of this section so you can re-check before you commit to any of it.

### Taking international money

| Route | Reality in 2026 |
| --- | --- |
| **Paddle** — Merchant of Record | Published 5% + $0.50 per checkout, no monthly fee, and that flat rate covers international cards and subscriptions. Paddle acts as the seller of record: it collects, handles VAT/sales tax in every jurisdiction, manages chargebacks and issues the invoice. Account verification is a manual review, quoted at roughly 1–7 business days. **Best fit here.** |
| **Lemon Squeezy** — Merchant of Record | Same published 5% + $0.50 base and the same tax handling, with same-day signup. But it stacks extras on top of the base: about +1.5% international, +0.5% subscriptions, +1.5% PayPal. A Pakistani founder selling internationally on a recurring plan pays the base plus both of the first two, which is why it ends up dearer than Paddle for exactly this shape of business. Stripe acquired it in July 2024 and its Node SDK has not moved since late 2024, so treat long-term API investment as an open question. |
| **Stripe** | Still not available to a Pakistani-registered entity on its own. The usual route is a foreign company (a US LLC, then Stripe), which adds annual compliance cost. Worth it later, not now. |
| **Polar** | A newer option aimed at developers selling digital products and SaaS globally. Smaller and less proven than the two above; worth a look, not worth betting the launch on. |

### Taking Pakistani money

| Route | Reality in 2026 |
| --- | --- |
| **Safepay** | The strongest local option for this. Karachi-registered, Y Combinator S20, Stripe-backed, and it received a **commercial State Bank of Pakistan e-commerce payment-gateway licence in April 2025** (it had pilot approval before that). Products: domestic and international cards, wallets, Raast, hosted or embedded checkout, **payment links**, **subscriptions**, APIs and SDKs, plus WooCommerce and Shopify options. Published pricing is roughly 2.9% + Rs 30 domestic; international cards about 3.2% + Rs 30. ~5-day onboarding, T+2/T+3 settlement in PKR, and transaction reporting you can use for FBR filing. **This is the PKR primary.** |
| **PayFast** (Avanza Premier Payment Services) | Also SBP-licensed as a PSP. A reasonable second quote to hold against Safepay. |
| **JazzCash / EasyPaisa** | Where the mass market's money actually is — both are SBP-licensed PSOs with merchant portals and plugins. Subscriptions are their weak point. Use them as a *top-up* rail ("add six months"), not as the billing engine. |
| **2Checkout** | Mentioned as the common dedicated international processor for Pakistani merchants with heavy foreign traffic. Only relevant if you outgrow Paddle. |
| **Bank transfer + manual approval** | This is what Bizora does today. Keep it for annual invoices, not as the default. |

### Recommended: two rails, in this order

1. **Paddle for USD and international.** One payment link per tier — a plain
   URL behind a button. It handles the tax you would otherwise owe in every
   country you sell into, and its flat rate suits recurring international
   billings better than Lemon Squeezy's stacked fees.
2. **Safepay for PKR.** It is SBP-licensed, settles to a Pakistani bank, and —
   importantly — already has a subscriptions API, so a Pakistani customer can
   be on a real recurring plan rather than a manual top-up. Verify the
   subscription API against our trial-to-paid logic before you commit.
3. **JazzCash / EasyPaisa later**, as a top-up method, once local volume
   justifies another merchant account.
4. Keep today's **manual review** for annual invoices and bank transfers.

**One thing to expect either way:** with a merchant of record the customer sees
*Paddle* or *Safepay* on their card statement, not *Bizora*, and a few of them
will not recognise it. Put one line on the pricing page — "your statement will
show PADDLE" — and that ticket type mostly disappears.

**On the money landing in your account.** Paddle pays out by bank transfer,
Payoneer or Wise; Safepay settles to a Pakistani bank. Keep the payout
currency, the fee and the date on every statement — you need that trail both
for your own MRR numbers and for the FBR, which expects documentation for
transactions above PKR 25,000 for registered businesses. If the amounts become
meaningful, look at PSEB registration: software exports attract a reduced
income-tax rate and the registration is what lets you claim it. This part is a
question for an accountant, not for me — but do not discover it a year late.

Sources, so you can verify rather than take my word:
[Paddle vs Lemon Squeezy (2026)](https://solodevstack.com/blog/paddle-vs-lemonsqueezy-solo-developers),
[Paddle vs Lemon Squeezy — tax compliance](https://processorverdict.com/blog/paddle-vs-lemon-squeezy-for-tax-compliance),
[Safepay review and licence history](https://paymentpop.com/merchant-accounts/safepay-customer-reviews/),
[Payment gateways in Pakistan, checked August 2026](https://www.metacyberguru.com/2026/08/07/payment-gateways-that-work-in-pakistan/),
[Pakistani gateways and FBR documentation](https://hamrix.com/resources/payment-gateways-guide).

**On the money landing in your account.** A Merchant of Record pays out to a
Pakistani bank account or to Payoneer/Wise. Whatever you use, keep the payout
currency, the fee and the date on every statement — you will need that trail
for the FBR and for your own MRR numbers. If the amounts become meaningful,
register with the PSEB: software exports attract a reduced income-tax rate and
the registration is what lets you claim it. This is a question for an
accountant, not for me, but do not discover it a year late.

---

## 5. The silent funnel — how to start this week with almost no code

The full build in section 3 is a month of work. This gets you selling in days
while it is being built, and it still involves no bargaining:

1. **One page** with the product, the three tiers, the prices, and a Buy button
   per tier. No contact form, no phone number, no "let's talk".
2. **The button is a payment link** from Paddle or Lemon Squeezy. The customer
   pays a fixed amount and gets a receipt from the processor. Nobody asked
   anybody for a discount because there was nobody to ask.
3. **The processor emails you on every sale.** That email is your provisioning
   queue.
4. **You create the workspace** in the platform console and send one templated
   email with the sign-in details. Two minutes, zero negotiation — you never
   spoke to the customer, so there was nothing to haggle over.
5. **The customer's first screen is the guide**, not a call.

The only thing a human does is step 4, and it is mechanical. Automating it is
stages 4, 7 and 8 of the table above — which is exactly the build list.

Two things make this work honestly: the price is public before anyone clicks,
and the trial is 14 days with no card, so the customer is not paying to
evaluate. A self-serve funnel that demands a card up front converts worse and
produces more refund requests.

---

## 6. Onboarding with no human in the loop

Every question a new customer would otherwise ask you has to already be
answered on screen. The material exists:

- `docs/user-guide` is a compiled guide — link it from the welcome email and
  from the empty states of every module.
- `web/src/HelpGuide.tsx` and `web/src/ChatAssistant.tsx` are in the app
  already. Wire the assistant to the guide content so it answers the first
  tier of questions without you.
- The six templates are the strongest part of the product: signup asks *what
  kind of business are you?* and lands them in a workspace already speaking
  their trade's vocabulary. That question is worth more than any onboarding
  call.

The three emails that do the work of a salesperson:

1. **Immediately** — sign-in link, what to do in the first ten minutes, one
   link to the guide. No "let me know if you need anything".
2. **Day 4 of the trial** — the one thing most people miss (importing or
   creating their first customer and order), one link.
3. **Day 12 of the trial** — trial ends in two days, here is what happens to
   your data, here is the button to continue. State plainly that the data stays
   and the account goes read-only; that removes the panic that generates
   support email.

---

## 7. Support that is not "dealing"

The point of self-serve is that support is asynchronous and written, never a
phone call.

- **Publish an email address and a response window** ("we answer within one
  working day"), not a number.
- Keep a **canned-reply file** for the six questions you will actually get:
  how do I add staff, how do I change my template, can I export my data, how do
  I cancel, how do I get an invoice, why is my account read-only. Canned
  replies are not laziness — they are how one person serves two hundred
  accounts without a conversation.
- **Never negotiate in support.** If someone asks for a discount, the answer is
  the published line from section 2, pasted.
- Log recurring questions and fix the page or the empty state that caused them.
  Every repeated question is a documentation bug.

---

## 8. Legal pack (needed for self-serve, not optional)

Self-serve means nobody signs anything, so the terms have to be on the site and
accepted at signup. Drafts of these are the next thing to produce after this
document:

| Document | Why you need it | Must cover |
| --- | --- | --- |
| Terms of Service | The contract you have instead of a signature | What the service is, acceptable use, suspension for non-payment, IP ownership of customer data, limitation of liability, governing law |
| Privacy Policy | Legally required the moment you hold personal data | What you store, where, how long, who processes it (your host, your email provider, your payment processor), deletion on request |
| Refund Policy | Removes the argument before it happens | 14 days, first payment only, one line |
| Service level statement | Sets expectations honestly | Say what you can actually guarantee. Do **not** promise 99.9% unless you have monitoring that proves it — a promise you cannot evidence is a liability |
| Data Processing Addendum | Business customers ask for it | Sub-processors, data location, breach notification |
| Acceptable Use | Protects the platform | No spam, no illegal content, no reselling of accounts |

Data hosting is the part to get right early: your database sits on managed
PostgreSQL, your payment processor is in another country, and your email
provider is a fourth party. Name all of them in the privacy policy.

---

## 9. Numbers to watch

The platform console already has a billing dashboard and
`GET /platform/billing/report.csv`, so most of this is free.

| Metric | What it tells you | Healthy early sign |
| --- | --- | --- |
| Signup → trial | Is the landing page honest about what the product is | Above 40% of visitors who reach the pricing table |
| Trial → paid | Is the product or the onboarding the problem | 15–25% for SME self-serve; below 10% means onboarding, not price |
| MRR and net MRR | The business | Track new, expansion and churned separately |
| Logo churn / month | Whether the product holds | Under 3% monthly for SME |
| Time to first order | The single best predictor of conversion | Under one day |
| Support tickets per new account | Whether the docs are doing their job | Falling month over month |

If trial-to-paid is low, do **not** cut the price. Fix the first-ten-minutes
experience. A price cut on a product the customer never started using buys you
a customer who leaves anyway.

---

## 10. Ninety days

**Days 1–7 — decide and publish.** Approve the pricing (it moves into
`docs/marketing/FACT_SHEET.md` the moment you do). Open the merchant-of-record
account. Ship one page: what it is, three prices, buy buttons. Start the
silent funnel from section 5.

**Days 8–21 — remove yourself from provisioning.** Public plans endpoint,
public signup with template choice, transactional email with the first three
templates. Gateway webhook that approves the payment and extends the
subscription without a human.

**Days 22–45 — remove yourself from support.** In-app tour, empty states that
link to the guide, canned replies, the legal pack, self-serve cancellation.

**Days 46–90 — grow.** Annual plans, the institutional discount, JazzCash or
EasyPaisa for PKR top-ups, MRR reporting in the platform console, and a second
acquisition channel that is not you sending messages.

---

## 11. Risks, stated plainly

- **Payment friction is the whole game in Pakistan.** A self-serve funnel that
  cannot take a local rupee payment will sell abroad before it sells at home.
  Decide early which market you are actually serving first.
- **Tax and compliance are on you** once money arrives, and a merchant of
  record only solves the foreign VAT half of it.
- **Hosting cost per tenant is real.** One container and one database serving
  every business keeps the margin; per-tenant infrastructure does not work at
  PKR 2,500 a month.
- **Churn is the number that decides this.** SME software is churned out of,
  not competed away. Onboarding quality is the defence.
- **Do not overpromise.** The fact sheet exists for a reason. Six templates,
  twelve modules, web plus Android, order tracking links. Anything else is not
  shipped and must not appear on the pricing page.

---

## 12. What I can build next

Say which and I will do it, in this order of usefulness:

1. ~~**The landing and pricing page**~~ — done, in `site/`.
2. ~~**Public plans endpoint** and **self-signup**~~ — done, together with a
   signup form at `site/signup.html`.
3. **Transactional email** — provider wiring, the three trial emails, the
   welcome email, and the payment receipts.
4. **Gateway webhooks** — Paddle for USD and Safepay for PKR, each
   auto-approving a `SubscriptionPayment` and extending the subscription so
   nobody reviews anything by hand, with signature verification and
   idempotency on the webhook id.
5. **The legal pack** — the six documents in section 8, drafted for this
   product.
