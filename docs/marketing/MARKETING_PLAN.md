# Bizora marketing plan

## 1. Positioning

**Positioning statement**

> For owners of small and mid-sized service, trade and made-to-order
> businesses, **Bizora** is a business management platform that gives each
> business its own workspace for customers, orders, jobs, payments and
> accounts. Unlike a single-industry app, Bizora starts from a business
> template and is then configured — modules, stages, item types, fields and
> team roles — so the software fits the business instead of the business
> changing to fit the software.

**Tagline:** One platform. Every business.

**Three words the brand should own:** organised · configured · professional.

**The competitive frame.** The real competitor is not another app. It is the
combination most owners run today: a paper register, a WhatsApp thread and a
diary. Every asset in this kit opens by naming that scattered state, because it
is the one thing every prospect recognises immediately.

---

## 2. Audiences

| Audience | Who they are | What keeps them up at night | The promise we make |
| --- | --- | --- | --- |
| **Service businesses** | Workshops, carpentry, repair and installation teams working job by job | "Nobody knows the status of a job except me." | Every job moves through your stages with a history anyone on the team can read |
| **Made-to-order makers** | Furniture, printing and production businesses where no two orders are alike | "Every order is different, so nothing fits a template." | Your item types, your stages, your custom fields — configured, not forced |
| **Growing small businesses** | Owners who have outgrown paper and chat and now employ people | "I cannot delegate because the information is in my head." | Delegate safely: roles, permissions and an audit history behind every action |
| **Referrers and partners** (secondary) | Accountants, consultants, trade associations | "My clients cannot give me clean records." | One system per business, records exportable as CSV and invoice PDFs |

---

## 3. Message architecture

**Master message:** Your business is not disorganised — it is scattered. Bizora
gathers it into one workspace, configured for the way you already work.

### The four pillars

| Pillar | Claim | Proof point |
| --- | --- | --- |
| **Organise** | Customers, orders, jobs, payments and accounts in one place | One record per customer, job and payment; web + Android |
| **Configure** | The platform adapts to the business | Business templates, terminology, workflow stages, item types, custom fields, modules |
| **Clarity** | The day starts with six numbers | New, due today, overdue, in progress, outstanding, collected today — in the business timezone |
| **Control** | Delegate without losing control | Roles and granular permissions, append-only audit history, server-side enforcement |

### Pain → promise → proof

| Pain (say their words) | Promise | Proof to show on screen |
| --- | --- | --- |
| "Orders are in a register." | One record per job, visible to the team | Orders board moving through stages |
| "Updates are on WhatsApp." | Status lives with the order, not in a chat | Order status and workflow history |
| "Money is in a diary." | Every payment recorded against the order, invoices exported | Payments list, invoice PDF |
| "Only I know what is happening." | Six numbers open the day | Dashboard widgets |
| "I cannot trust new staff with everything." | Give the smallest role that does the job | Roles, permissions, audit history |

---

## 4. Campaigns

### Campaign A — "Organise" (always on)

The master brand campaign. Runs everywhere, all the time.
Headline: **Your business, in one place.**
Assets: `02-social/ad-01-organise.png`, `story-01-organise.png`,
`fb-feed-01.png`, `listing-01-cover.png`, the flyer front, the 60-second promo.

### Campaign B — "Configure" (objection handler)

For prospects who say *"my business is different."*
Headline: **Software that fits your business. Not the other way around.**
Assets: `02-social/ad-02-configure.png`, `listing-05-templates.png`,
the explainer video, the brochure inside spread.

### Campaign C — "Control" (consideration)

For owners who already have software or staff and worry about switching.
Headline: **Know what is due, what is overdue and what was collected — today.**
Assets: `02-social/ad-03-control.png`, `story-03-proof.png`,
`listing-04-modules.png`.

### Campaign D — Industry cut-downs (targeting)

Same platform story, told in the trade's own words, used for narrow targeting
and for walk-ins. The brand is always Bizora; the trade is the hook.

| Cut-down | Hook | Stage list used in the creative |
| --- | --- | --- |
| Auto Workshop | Every vehicle, every job card | Inspection → Estimate → Approved → Repair → Quality check → Ready → Completed |
| Furniture | From design to delivery | New → Design → Material confirmation → Production → Finishing → Ready → Completed |
| Printing | Every print job, spec and stage | New → Design → Production → Finishing → Ready → Completed |
| Carpenter | Jobs, materials, dimensions | New → Design → Material confirmation → Production → Finishing → Ready → Completed |

### Campaign E — Local / WhatsApp (Pakistan)

Roman Urdu, built for forwarding. One asset, one ask: message us for a free
demo. Assets: `02-social/whatsapp-status.png`, the WhatsApp broadcast script in
[`01-strategy/OUTREACH.md`](01-strategy/OUTREACH.md).

---

## 5. Channels and how each is used

| Channel | Format | Cadence | Primary CTA |
| --- | --- | --- | --- |
| Instagram | Feed ads (1080²), stories/reels (1080×1920) | 3 posts + 5 stories a week | Book a free demo (link in bio) |
| Facebook | Feed ads (1200×630), same creative into groups | 3 posts a week, boosted | Book a free demo |
| WhatsApp Business | Status (1080×1920), broadcast messages, flyer PNG | 2 broadcasts a week | Message us |
| LinkedIn | Single-image post (1200×627) + company banner | 2 posts a week | Book a free demo |
| YouTube | 60s promo + 45s explainer, 1280×720 thumbnail | As available | Book a free demo |
| Marketplace listing | 8 × 2000×2000 images + listing copy | Always on | Order / message |
| Print | A4 flyer, tri-fold brochure, A3 poster, business card | Local outreach, expos, walk-ins | Book a free demo |

---

## 6. Four-week launch calendar

**Week 1 — Establish the problem.** Publish Campaign A. Post
`ad-01-organise.png`, run `story-01-organise.png` as a story, publish the
60-second promo, send the first WhatsApp broadcast in Roman Urdu. Goal: reach
and saves, not leads.

**Week 2 — Answer "my business is different."** Publish Campaign B and the
explainer video. Post `ad-02-configure.png` and `listing-05-templates.png`.
Start the industry cut-downs, two trades per week. Goal: profile visits and DMs.

**Week 3 — Prove the day-to-day.** Publish Campaign C and `story-03-proof.png`.
Run the auto-workshop and furniture cut-downs. Send the follow-up WhatsApp
broadcast with the flyer PNG. Goal: demo bookings.

**Week 4 — Convert and expand.** Re-target everyone who engaged with the demo
CTA. Publish the 30-second reel. Hand the brochure to walk-ins and referral
partners. Ask every demo attendee for one referral. Goal: signed businesses.

Measure weekly: reach, saves/shares, profile visits, DMs received, demos
booked, demos held, businesses activated. Track the real numbers — this plan
deliberately contains no invented results.

---

## 7. Launch checklist

- [ ] Replace `CONTACT` in `.build/bizora.js` (domain, email, WhatsApp, city)
- [ ] Re-run `node .build/render.mjs` and `node .build/video.mjs`
- [ ] Decide pricing, or keep *Book a free demo* everywhere
- [ ] Set up the marketplace listing from
      [`01-strategy/MARKETPLACE_LISTING.md`](01-strategy/MARKETPLACE_LISTING.md)
- [ ] Load the captions from
      [`01-strategy/SOCIAL_CAPTIONS.md`](01-strategy/SOCIAL_CAPTIONS.md) into a
      scheduler
- [ ] Print the flyer and brochure from `04-print/` (double-sided; see the
      panel map in [`BRAND_GUIDE.md`](BRAND_GUIDE.md))
- [ ] Publish the two videos with their SRT captions
- [ ] Brief anyone who posts on the accuracy rules in
      [`FACT_SHEET.md`](FACT_SHEET.md)

---

## 8. Guardrails

1. Never describe Bizora as a tailor-only app.
2. Never use tailoring, stitching or measuring-tape imagery as the brand
   identity — the brand is the platform, not a trade.
3. Never invent testimonials, statistics, customer counts or integrations.
4. Show only capabilities listed as verified in
   [`FACT_SHEET.md`](FACT_SHEET.md).
5. When in doubt, sell the demo, not the feature: the demo can be honest about
   what ships today and what is on the roadmap.
