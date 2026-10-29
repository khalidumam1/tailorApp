# Bizora marketing kit

Everything needed to sell **Bizora — a multi-business management platform** —
on social media, in marketplaces, on paper and on video.

> **Bizora is not a tailor app.** Tailoring is one of six business templates the
> platform ships with. Every asset here sells the platform and its configurable
> templates, and no asset uses tailoring imagery as the brand identity.

---

## Replace these before anything goes live

The kit ships with stand-in contact details so every asset is complete and
reviewable. Change one file — `.build/bizora.js`, the `CONTACT` block — and
re-run `node .build/render.mjs` to update every image, flyer and video frame.

| Placeholder | Used in | Replace with |
| --- | --- | --- |
| `bizora.app` | every ad, flyer, brochure, video end card | your real domain |
| `hello@bizora.app` | flyer, brochure, business card, video | your real inbox |
| `+92 300 0000000` | flyer, brochure, business card, WhatsApp status | your real WhatsApp Business number |
| `Karachi` | copy references | your operating city |
| Pricing | deliberately absent | see note below |

**No price appears anywhere in this kit on purpose.** Every call to action is
*Book a free demo*. Adding a price is a one-line change to `COPY.ctas` once the
commercial terms are fixed — until then, nothing in the kit can contradict your
pricing.

---

## What is in each folder

| Folder | Contents |
| --- | --- |
| [`01-strategy/`](01-strategy/) | Ad copy variants, social captions and hashtags, the marketplace listing, outreach scripts, and the 4-week campaign calendar |
| [`02-social/`](02-social/) | Instagram/Facebook feed ads, story and reel covers, LinkedIn post and banner, YouTube thumbnail, WhatsApp status, and four industry cut-downs |
| [`03-marketplace/`](03-marketplace/) | Eight 2000×2000 images for an Etsy/Gumroad style listing page |
| [`04-print/`](04-print/) | A4 flyer (2-sided), A3 poster, tri-fold brochure (outside + inside) and business card — print PDFs plus PNGs for WhatsApp sharing |
| [`05-brand/`](05-brand/) | Brand board, logo lockups and the mark as SVG |
| [`06-video/`](06-video/) | The video plan, storyboard frames, finished MP4s, captions and posters |

Start with [`MARKETING_PLAN.md`](MARKETING_PLAN.md) for the strategy and
[`FACT_SHEET.md`](FACT_SHEET.md) for the list of claims that are safe to make.

---

## Asset sizes

| Asset | Size | Where it goes |
| --- | --- | --- |
| `02-social/ad-*.png` | 1080×1080 | Instagram feed, Facebook feed, WhatsApp |
| `02-social/story-*.png` | 1080×1920 | Instagram/Facebook stories and reels covers |
| `02-social/fb-feed-*.png` | 1200×630 | Facebook link ads, website OG image |
| `02-social/linkedin-post.png` | 1200×627 | LinkedIn single-image post |
| `02-social/banner-linkedin.png` | 1584×396 | LinkedIn company page banner |
| `02-social/youtube-thumbnail.png` | 1280×720 | YouTube thumbnail |
| `02-social/whatsapp-status.png` | 1080×1920 | WhatsApp status, Roman Urdu |
| `03-marketplace/listing-*.png` | 2000×2000 | Etsy / Gumroad listing gallery |
| `04-print/flyer-a4.pdf` | 210×297 mm, 2 pages | Print front/back, or send the PNG on WhatsApp |
| `04-print/brochure-trifold.pdf` | 297×210 mm, 2 pages | Print double-sided, then fold (see [`BRAND_GUIDE.md`](BRAND_GUIDE.md#tri-fold-panel-map)) |
| `04-print/poster-a3.pdf` | 297×420 mm | Shop windows, expo stands |
| `04-print/business-card.pdf` | 85×55 mm, 2 pages | Standard business card |
| `06-video/*.mp4` | 1920×1080 / 1080×1920, H.264 + AAC | Instagram, Facebook, YouTube, WhatsApp |

---

## Rebuilding the kit

The kit is generated, not hand-drawn, so a copy change cannot leave one asset
out of date.

```bash
cd docs/marketing/.build
npm init -y && npm i @sparticuz/chromium puppeteer-core @ffmpeg-installer/ffmpeg pdf-lib
cp -r <fontsource files>/plus-jakarta-sans-*.woff2 assets/
node render.mjs          # every image, flyer, brochure and storyboard
node video.mjs           # full-bleed video scene frames
node build-video.mjs     # cuts the frames + voiceover into MP4s
```

`render.mjs` reports, for every asset: elements clipped by the artboard, text
under 9.5px effective size, and WCAG contrast failures. The committed kit
reports **zero of all three** across 56 assets.

Copy lives in `bizora.js` only. Layouts live in `render.mjs` and `video.mjs`.
Product screens are **recreations built from the shipped design system** with
neutral, multi-industry demo data — they are labelled as such in the docs so
nobody mistakes them for screenshots of a live customer's account.

---

## Accuracy rules this kit follows

1. Only capabilities that exist in the shipped platform are advertised. See
   [`FACT_SHEET.md`](FACT_SHEET.md) for the verified / not-verified split.
2. No invented testimonials, customer counts, statistics, awards or
   integrations.
3. Bizora is never described as a tailor-only app, and tailoring imagery is
   never used as the brand identity.
4. Industry campaigns are cut-downs of the platform story — the brand is always
   Bizora, never the trade.
