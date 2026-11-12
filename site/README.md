# The Bizora marketing site

The public page: what the product is, what it costs, and a button that takes
the money. It is step **(a)** of the plan in
[`docs/business/SELF_SERVE_SAAS.md`](../docs/business/SELF_SERVE_SAAS.md).

It is deliberately **plain HTML, CSS and a little JavaScript** — no framework,
no dependencies, no build step. Three reasons:

1. It cannot affect the web app's bundle budget, which is checked in CI.
2. It adds nothing to `npm audit`, which we only just got to zero.
3. It deploys anywhere as a folder of static files, and it loads fast — which
   is most of what a landing page is for.

Brand colours, type and logo come from
[`docs/marketing/BRAND_GUIDE.md`](../docs/marketing/BRAND_GUIDE.md), and the
copies of the SVGs in `assets/` are the same files as
`docs/marketing/05-brand/`. Every claim on the page comes from
[`docs/marketing/FACT_SHEET.md`](../docs/marketing/FACT_SHEET.md).

---

## Look at it

**Windows (PowerShell):**

```powershell
cd C:\Users\umam.khalid\Projects\tailorapp\tailor
npx serve site
```

Or, if you have Python:

```powershell
python -m http.server 8000 --directory site
```

Then open the address it prints.

---

## Before you go live

Everything that needs changing is in **`config.js`**. Every value in it is a
placeholder using the reserved `.example` domain, which can never belong to
anyone — so a half-finished deploy cannot point at a stranger's site.

| In `config.js` | Set it to |
| --- | --- |
| `appUrl` | Where the product is hosted, e.g. `https://app.yourdomain.com` |
| `apiBaseUrl` | Where the API is served, e.g. `https://api.yourdomain.com`. `signup.html` reads its plans and templates from here and posts the new business to it |
| `signupUrl` | The signup form — `signup.html` in this folder by default |
| `supportEmail` | The inbox you will actually answer |
| `city` | Your operating city |
| `statementDescriptor` | What the customer sees on their card statement — `PADDLE` if you use Paddle, `SAFEPAY` for Safepay. Leave it empty and the sentence disappears |
| `checkout.starter` / `.growth` / `.scale` | The payment link for each plan |

**Payment links are optional.** While they are empty, every plan button starts a
free trial instead, so the page is safe to publish before the checkout links
exist. Add them one at a time and the button switches to taking payment with no
other change.

**One thing the API needs from you.** `signup.html` calls the API from the
browser, so the API has to allow this site's origin. Add it to `CORS_ORIGINS`
on the backend (Shiper: environment settings) or every request the form makes
will be blocked by the browser:

```sh
CORS_ORIGINS=https://www.yourdomain.com,https://app.yourdomain.com
```

Then switch the endpoint on — it is off until you do, which is why it is safe
to deploy the code first:

```powershell
psql "$DATABASE_URL" -f backend\scripts\self-signup-switch.sql
```

Two other things to replace:

- **`index.html`, the footer legal links** — `Terms of service`, `Privacy
  policy` and `Refund policy` are marked `data-todo` and point at `#`. They
  need the pages from the legal pack in the playbook.
- **`og:image`** — the meta tag points at `assets/logo.png`, a copy of the
  1600×500 brand lockup. It works, but a 1200×630 share image made for the
  purpose will look better when a link is pasted into WhatsApp or LinkedIn.

---

## Changing the prices

The prices are in **`index.html`**, in the `<!-- PRICING -->` section. Each
plan carries both figures:

```html
<span class="amount"><span data-monthly>6,000</span><span data-yearly hidden>60,000</span></span>
```

Change both. The monthly/yearly switch shows one and hides the other, so the
page works with JavaScript switched off — it just always shows monthly.

**Those numbers are a proposal, not a decision.** They are the figures from the
playbook, and `docs/marketing/FACT_SHEET.md` forbids printing a price that has
not been agreed. Once you have approved them, say so and I will move them into
the fact sheet as publishable.

---

## What is deliberately not on this page

From the brand guide's "never" list, which is worth re-reading before you
change any copy:

- **No testimonials.** We have no customers quoting us, so there are none.
- **No statistics.** No "trusted by 500 businesses", no uptime numbers. The
  fact strip counts things that are literally true: six templates, twelve
  modules, two consoles, web plus Android.
- **No integrations we do not have**, and no capability outside the fact sheet.
- **No phone number and no "book a call".** Support is written and
  asynchronous on purpose; that is part of how the price stays low.
- **No "contact us for a quote".** The entire point of this page is a fixed
  price with nobody to negotiate with.

The hero and the tracking panel are **recreations of the interface** built in
HTML and CSS from the shipped design system, with the neutral multi-industry
sample data the brand guide specifies (Al-Noor Furniture, Zahid Auto Workshop,
Karachi Print House). They are labelled "Workspace shown with sample data."
They are not screenshots of a live account. When you have real screenshots from
a seeded demo tenant — see [`docs/screenshots/README.md`](../docs/screenshots/README.md)
— swap them in; that README explains why fabricated screenshots are worse than
none.

---

## Deploying

It is a folder of static files. Any host will do.

**Cloudflare Pages or Netlify** — connect the repo, set the build command to
empty and the publish directory to `site`.

**Vercel** — a second project, because the existing one builds `web/`. Root
directory `site`, no build command, output directory left empty.

**GitHub Pages** — push to `main`, then Settings → Pages → deploy from branch,
folder `/site`.

Then point your domain at it and put that domain into `config.js` and into
`CONTACT.website` in `docs/marketing/.build/bizora.js` so the print and video
assets say the same thing as the site.

---

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page. All copy and all prices live here |
| `signup.html` | The signup form. Calls `GET /api/v1/public/templates`, `GET /api/v1/public/plans` and `POST /api/v1/public/signup` |
| `signup.js` | Form logic: loads the options, posts the signup, maps API errors to plain English |
| `signup.css` | Styling for the form, using the palette in `styles.css` |
| `styles.css` | All styling, using the brand palette as CSS variables |
| `config.js` | Your URLs, support inbox, statement descriptor, payment links |
| `main.js` | Monthly/yearly switch, mobile menu, wiring the config into the page |
| `assets/` | Copies of the brand SVGs |
