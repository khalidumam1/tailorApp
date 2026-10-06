# UI/UX audit — designing for a shopkeeper who struggles to read

**Context:** this app is used by tailors/shop owners in Karachi, some of whom are
not confident readers (the app already ships English, Urdu script, and Roman
Urdu for this reason). The goal: a professional, good-looking product that
someone can operate almost entirely by *recognising pictures and shapes*,
without relying on reading dense text.

## The core rule I used

> If you turned the sound off and covered every word, could the person still
> tell what a button does and what just happened?

That means: every action needs a literal, recognisable picture (not an
abstract icon or a lonely letter), colour is never the *only* signal, touch
targets are big, and the amount of text per screen stays low.

## What I found wrong

1. **The bottom tab bar in the mobile app had no icons at all** — just plain
   text labels at **9px**. For someone who can't read confidently, that's the
   single worst part of the app: the main way to move around gave them
   nothing to recognise.
2. **The sidebar/nav icons on the web app were abstract, non-literal
   symbols** — a chess pawn (♙) for "Customers", a lightning bolt (⌁) for
   "Measurements", a box-with-dot (◫) for "Overview". These don't mean
   anything on sight; they only work if you can already read the label next
   to them, which defeats the point of having an icon.
3. **Text was consistently too small for comfortable, confident reading**:
   table rows (.83rem/~13px), form labels (.79rem), status badges (.68rem),
   helper text (.78rem), and on mobile, metadata as small as 9–11px
   throughout. Small text reads as "fine print you can skip," which is the
   opposite of what a shopkeeper needs from the one or two numbers that
   actually matter (amount due, order status, date).
4. **Buttons and tap targets were on the small side** (34–40px) for someone
   using a budget touchscreen phone with imprecise taps.
5. **A real layout bug**: on narrow/mobile web, the sidebar becomes a fixed
   bottom bar with a hard-coded 5-column grid. Any business with more than 5
   visible sections (orders, catalog, customers, measurements, payments,
   notifications, subscription, settings — several businesses show all of
   these) silently overflowed the fixed-height bar, so extra tabs became
   invisible/unreachable. Fixed as part of this pass.

## What "professional, not childish" means here

Low-literacy-friendly does not mean cartoonish. I kept:
- One consistent icon *style* everywhere (thin, rounded-stroke line icons,
  same weight, same corner radius) instead of mixing emoji, symbols, and
  system glyphs — that consistency is what makes an app look designed
  rather than assembled.
- The existing calm green/neutral palette, generous white space, soft
  shadows and rounded cards — already a solid, trustworthy visual language.
- Icons always paired with a short label (never icon-only), so literate
  staff get the fast text scan and non-confident readers get the picture.

## What I changed in this pass

**Web app (`web/`)**
- Added `web/src/Icons.tsx`: one shared set of literal pictograms — a
  shirt for Orders, a ruler for Measurements, two people for Customers, a
  banknote for Payments, a chat bubble for WhatsApp notifications, a gear
  for Settings, a building for Businesses, etc. — rendered as crisp inline
  SVG so they stay sharp at any size and recolor automatically
  (active/inactive, dark sidebar vs light panel).
- Replaced every unicode/emoji glyph used for navigation, dashboard metric
  cards, platform metrics, sign-out, and empty states with this icon set.
- Raised font sizes and tap targets across the board: buttons (40→46px
  min-height, larger label text), table cells (the actual data people read),
  form labels/inputs, status pills, nav items, muted/help text.
- Fixed the mobile-web bottom nav so it scrolls horizontally with clearly
  sized icon+label tabs instead of silently hiding tabs past the 5th.
- Added `web/design-preview.html` — a static, no-login page (served by the
  same dev server) so the new look can be reviewed without a database.

**Mobile app (`mobile/`)**
- Added `mobile/src/Icons.tsx` (same pictogram set, via `react-native-svg`,
  newly added as a dependency).
- The bottom tab bar now shows a real icon above every label, plus a
  highlighted pill background on the active tab — previously it was text
  only, with a plain 3px line as the "active" indicator.
- Raised font sizes across the app: page titles, section titles, card
  values/labels, inputs, buttons, error/help text, chips. Nothing was
  shrunk — hierarchy (what's biggest = most important) is preserved, just
  scaled up so the important numbers and names are confidently legible.

Both apps still type-check cleanly (`tsc --noEmit`) after these changes.

## Recommended next steps (not done in this pass — flag if you want these)

1. **Icon-first onboarding**: a one-time first-run tour that points at each
   bottom tab icon with its meaning, in the user's chosen language/script.
2. **Voice/audio cues**: since Roman Urdu / Urdu script / English are
   already supported, a "read this screen aloud" button for key screens
   (new order, payment) would help a lot — this is a bigger feature, not a
   style tweak.
3. **Photo-based garment picker**: instead of typing/choosing garment names
   from a dropdown, let the tailor tap a photo tile (shirt, kurta, lehnga…)
   — much faster and needs no reading at all for the most repeated action.
4. **Bigger number pad for amounts**: a custom numeric keypad for price/
   payment fields avoids the full keyboard and reduces input mistakes.
5. Apply the same icon set to the remaining admin-heavy screens
   (`BusinessStructureEditors.tsx`, `BusinessTeamAdmin.tsx`) for full
   consistency — lower priority since those are typically used by platform
   staff, not the shop owner.
