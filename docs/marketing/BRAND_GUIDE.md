# Bizora brand guide

## The brand in one line

**Bizora** is a multi-business management platform. The brand is the platform —
never a trade.

- **Name:** Bizora
- **Tagline:** One platform. Every business.
- **One-liner:** Run your business in one organised workspace — on web and
  mobile.
- **Voice:** plain before clever · trade-neutral · honest by default · warm,
  not corporate

---

## The mark

Three ascending modules inside a tile, with a gold point marking the module you
add next. It reads as *one platform assembled from the parts each business
needs* — which is literally how Bizora is configured.

Files in [`05-brand/`](05-brand/):

| File | Use |
| --- | --- |
| `logo-primary.svg` | Primary mark on light backgrounds |
| `logo-white.svg` | Reversed mark for dark backgrounds |
| `logo-mono.svg` | Single-colour printing, stamps, favicons |
| `logo-square.svg` | App icon and avatar variants (no corner radius) |
| `logo-primary.png` / `logo-white.png` | 1600×500 lockups (mark + wordmark + tagline) |
| `logo-mark.png` | 512×512 mark only |
| `brand-board.png` | One-page reference: mark, clear space, palette, type, voice, and the "never" list |

**Clear space:** keep at least 25% of the mark's height empty on every side.
**Minimum size:** 24px for the mark, 96px wide for the lockup.
**Never:** stretch, outline, rotate, add shadows, or recolour the mark outside
the palette below.

---

## Colour

The two brand colours are the platform's own defaults
(`DEFAULT_APPLICATION_BRANDING` in `packages/shared/src/index.ts`) so the
marketing and the product always agree.

| Name | Hex | Use |
| --- | --- | --- |
| Bizora Green | `#117A5C` | Primary brand, buttons, primary headlines on light |
| Green Light | `#1A9B72` | Gradient start |
| Green Deep | `#0B5C45` | Gradient end, dark UI surfaces |
| Bizora Gold | `#C08A33` | Accent, highlights, step numbers on light |
| Gold Soft | `#F3E3C7` | Tints, sticky-note accents |
| Ink | `#0E1A16` | Body text on light |
| Ink 2 | `#3E5749` | Secondary text |
| Ink 3 | `#5F7468` | Labels, captions |
| Canvas | `#F3F7F5` | Page background |
| Surface | `#FFFFFF` | Cards |
| Line | `#E2EBE6` | Borders and dividers |
| Night | `#0A1712` | Dark backgrounds for ads and video |

**Text on gold:** gold is a light mid-tone. Use Ink `#0E1A16` on gold fills, and
`#8A5F14` for gold text on white. White on gold only passes at large sizes.
Every asset in this kit is checked for WCAG AA contrast at its real rendered
size.

---

## Type

**Plus Jakarta Sans** for everything — 800 for headlines, 500–600 for body.

- Headline tracking: −0.03em to −0.035em
- Body line height: 1.45–1.55
- Labels and kickers: uppercase, 0.08–0.20em tracking, 700 weight
- Smallest type allowed in any artwork: 9.5px effective (after any scaling)

The webfont files used by the generator live in `.build/assets/`
(Plus Jakarta Sans, SIL Open Font License).

---

## Photography and product shots

- Show the **product**: dashboards, order boards, settings, tables.
- Show **business owners and their work**, generically — a workshop, a
  showroom, a counter. Never stage Bizora as a tailoring brand.
- Screens are **recreations built from the shipped design system** using
  neutral, multi-industry demo data (Al-Noor Furniture, Zahid Auto Workshop,
  Karachi Print House…). They are accurate representations of the interface,
  not screenshots of a live customer account. Swap in real screenshots as soon
  as you have a reference customer who agrees.
- Never use stitching, measuring tape, garment or clothing imagery as the
  default brand identity. A tailor-template campaign may show the template
  screen; it may not become the brand.

---

## Layout principles

1. **One idea per asset.** One headline, one supporting line, one CTA.
2. **Generous space.** The premium feel comes from padding, not decoration.
3. **Brand green for action, gold for emphasis** — gold is an accent, never the
   main fill.
4. **The logo sits top-left, the CTA and URL bottom-left.** The eye reads the
   headline, the product shot, then the ask.
5. **Every asset carries a way to act**: *Book a free demo* + the domain.

---

## Tri-fold panel map

`04-print/brochure-trifold.pdf` is two pages, printed double-sided on A4
landscape (297×210 mm) and then folded into three 99 mm columns.

**Page 1 — outside.** Columns left to right:

| Column | Panel |
| --- | --- |
| Left | Inner flap — "Six numbers that run your day" (seen the moment the cover opens) |
| Middle | Back cover — contact block, demo ask, address space |
| Right | **Front cover** — headline, tagline, brand lockup |

**Page 2 — inside.** The full spread, left to right:

| Column | Panel |
| --- | --- |
| Left | What Bizora is + what is configurable |
| Middle | How it works — the three onboarding steps |
| Right | Businesses it fits + the demo call to action |

Fold the left column in first, then the right column over it. Print a single
copy on plain paper and fold it before sending the job to a printer — tri-fold
panel order is the one thing that is easy to get backwards.

---

## Things this brand never does

- Never calls Bizora a tailor app, or implies it is built for one trade.
- Never uses tailoring imagery as the brand identity.
- Never invents a testimonial, statistic, customer count or integration.
- Never advertises a capability that is not in
  [`FACT_SHEET.md`](FACT_SHEET.md).
- Never prints a price that has not been agreed.
