# Video plan

Three concepts. Each one has a different job to do, a different audience and a
different publishing format. The scripts, on-screen text and shot direction
below are the source of truth for the rendered videos and storyboards in this
folder — they are also stored in `.build/bizora.js` so the rendered frames can
never drift from the plan.

**Standing rules for every video**

- Sell the platform, never a single trade. Trade-specific shots are cut-downs
  of the platform story.
- Show only capabilities listed as verified in
  [`../FACT_SHEET.md`](../FACT_SHEET.md).
- No invented statistics or testimonials anywhere on screen.
- Every video ends on one action: **Book a free demo** + the domain.

---

## Published files

| File | Format | Length | Where it goes |
| --- | --- | --- | --- |
| `bizora-promo-60s-16x9.mp4` | 1920×1080 | 52s | YouTube, LinkedIn, website, Facebook landscape |
| `bizora-promo-60s-9x16.mp4` | 1080×1920 | 52s | Instagram/Facebook reels, WhatsApp status |
| `bizora-reel-30s-9x16.mp4` | 1080×1920 | ~25s | Reels, TikTok, story ads |
| `bizora-explainer-45s-16x9.mp4` | 1920×1080 | ~40s | Website, YouTube, sales follow-up |
| `bizora-promo-60s-16x9.srt` and friends | captions | — | Upload alongside; most viewers watch muted |
| `*-poster.png` | stills | — | Thumbnail fallback and link previews |

Each cut is assembled from the rendered scene frames (`.build/frames/`) with a
slow 6% push-in, held for exactly as long as its narration line plus a short
tail. Rebuild with `node .build/build-video.mjs`.

---

# 1. Promo — "One platform. Every business."

| | |
| --- | --- |
| **Length** | 52 seconds (8 shots) |
| **Formats** | 16:9 and 9:16 |
| **Audience** | Owners of small and mid-sized service, trade and made-to-order businesses, 25–55, currently running on registers, chat threads and memory. Also used by the sales team as the standard paid-social asset. |
| **Key message** | Bizora is not an app for one trade — it is one platform that gets configured for each business, so customers, orders, jobs, payments and accounts finally live in one place. |
| **Tone** | Calm, confident, concrete. No hype, no stock-footage smiles. |
| **CTA** | Book a free demo · bizora.app |

### Script

1. Every business runs on the same three things: the work, the money, and the
   people waiting on both.
2. Most owners keep those in three different places. Orders in a register.
   Updates in a chat thread. Balances in a diary.
3. Bizora puts them in one workspace — built for your business, not a generic
   one.
4. Your trade, your words. Start from a template, name your stages, and switch
   on only the modules you use.
5. Customers, orders and jobs, payments, inventory and accounts — all in one
   place, on web and on mobile.
6. Every job moves stage by stage, with a history you can check. Every payment
   is recorded. Every action is logged.
7. Your team gets access with the right limits. You get the morning in six
   numbers: new, due today, overdue, in progress, outstanding, collected.
8. One platform. Every business. Book a free demo at Bizora.

### Scene sequence

| # | Time | Visual | On-screen text | Direction |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | Register, chat thread and diary, desaturated | Three places. One business. | Slow push in on the mess. No Bizora branding yet — earn it. |
| 2 | 0:06 | Bizora dashboard, clean desk, warm light | Or this. | Hard cut, snap zoom, subtle whoosh. Colour warms as the logo lands. |
| 3 | 0:12 | Template chips animating across frame | Start from a template built for your trade. | Chips slide in left to right, one beat apart, gold on the active chip. |
| 4 | 0:20 | Module toggles in Business settings; the menu reflows | Switch on only what you use. | Screen-recording feel — real cursor, real toggles, no fake UI. |
| 5 | 0:30 | Orders board: a job card moves stage, history line appears | Every job, stage by stage. | Follow the card. Hold on the history entry for half a beat. |
| 6 | 0:40 | Payments list, invoice PDF, then inventory and cashbook | Payments, stock and accounts — when you need them. | Quick cuts, one module per beat, all inside the same workspace chrome. |
| 7 | 0:48 | Dashboard widgets lighting up one by one | Six numbers that run your day. | Count-up on each figure. Beat the voiceover to the last number. |
| 8 | 0:55 | Web and phone side by side, then the lockup | BOOK A FREE DEMO · bizora.app | Hold a clean end card for 5 seconds. Mark, wordmark, URL, CTA. |

### Production notes

- Music: none is bundled. Add a restrained, mid-tempo bed at −18 dB under the
  voice if you have a licensed track — the cut is timed so it works either way.
- Captions: burn in the SRT for silent autoplay, keep it to two lines.
- Cut-downs: shots 1–2 + 7–8 make a 20-second version for story ads.

---

# 2. Reel — "Three places. One business."

| | |
| --- | --- |
| **Length** | ~25 seconds (4 shots) |
| **Format** | 9:16 only |
| **Audience** | Small business owners scrolling Instagram/Facebook in Urdu and English. Cold reach — assume no prior knowledge and no sound. |
| **Key message** | Your business is not disorganised, it is scattered. Bizora gathers it into one workspace. |
| **CTA** | Link in bio — book a free demo |

### Script

1. Your business is not disorganised. It is scattered.
2. Orders in a register. Updates in a chat thread. Money in a diary.
3. Bizora puts customers, jobs, payments and accounts in one workspace —
   configured for your trade.
4. One platform. Every business. Link in bio.

### Scene sequence

| # | Time | Visual | On-screen text | Direction |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | Fast three-shot montage: register, chat, diary | Orders. Updates. Money. | Hard cuts on the beat, slight handheld grain. |
| 2 | 0:05 | Phone UI scrolling dashboard → orders → payment | One workspace. | One continuous take, no cuts. |
| 3 | 0:20 | Template chips and module toggles flashing past | Configured for your business. | Motion blur between frames; keep the green lockup pinned bottom. |
| 4 | 0:26 | End card on brand green | BOOK A FREE DEMO · bizora.app | Logo pop, hold to the end. |

### Production notes

- The first 2 seconds carry the whole reel. Keep the montage tight — no slow
  intro, no logo animation at the start.
- Text must be readable at thumbnail size: two lines maximum per card.
- Post with the caption in
  [`../01-strategy/SOCIAL_CAPTIONS.md`](../01-strategy/SOCIAL_CAPTIONS.md).

---

# 3. Explainer — "How onboarding works"

| | |
| --- | --- |
| **Length** | ~40 seconds (5 shots) |
| **Format** | 16:9 |
| **Audience** | Warm leads who clicked an ad or replied to outreach and want to know what happens after they say yes. Also sent as a follow-up after a demo. |
| **Key message** | You are not buying software to configure yourself — Bizora configures it with you. |
| **CTA** | Book a free demo · bizora.app |

### Script

1. Setting up Bizora takes three steps, and the first two are ours.
2. Step one: tell us your business. What you sell, how work moves, who works
   with you.
3. Step two: we configure your workspace. Modules, stages, item types, payment
   methods, custom fields and your branding.
4. Step three: you run it. Sign in on the web or the Android app, invite your
   team, and move every job stage by stage.
5. Book a free demo and we will show you the same screens, set up for your
   trade.

### Scene sequence

| # | Time | Visual | On-screen text | Direction |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | Three numbered cards; 01 and 02 carry the mark, 03 a business owner | Two steps are ours. One is yours. | Cards stack from the bottom with a soft spring. |
| 2 | 0:08 | Intake conversation: sticky notes with business name, items, stages, team | Tell us your business. | Warm human footage — hands, notebook, a real workshop in the background. |
| 3 | 0:18 | Configuration pass: modules, stages reordering, fields, branding on an invoice | We configure your workspace. | Screen recording with a real cursor, speed-ramped 1.6×. |
| 4 | 0:32 | Owner signs in on laptop and phone; a job card moves stage | You run it — everywhere. | Cut between devices on the word "everywhere". |
| 5 | 0:40 | End card | BOOK A FREE DEMO · bizora.app | Hold 5 seconds with URL and email. |

### Production notes

- This is the video sales sends. Keep it lower-key than the promo — no music
  swell, just a clean walkthrough.
- Shot 2 is the only place for live footage in the whole kit. If you cannot
  shoot it, replace it with a short screen recording of an intake form — the
  message is the same.

---

## Storyboards

`storyboard-<concept>-NN.png` in this folder are the shot-by-shot boards: time,
visual, on-screen text and direction on one page, ready to hand to an editor or
to review internally before anyone books a shoot.

## Re-recording the voiceover

The voiceover lines are plain text in `.build/bizora.js`
(`COPY.video.<concept>.voiceover`). Drop replacement audio into
`.build/audio/<concept>-NN.mp3` in the same order and re-run
`node .build/build-video.mjs` — the cut lengths follow the new audio
automatically.
