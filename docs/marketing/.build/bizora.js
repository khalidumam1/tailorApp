/**
 * Bizora — marketing source of truth.
 *
 * Every asset in docs/marketing is generated from this file, so the words on
 * the flyer, the brochure, the ad and the video can never drift apart.
 *
 * ACCURACY RULE: only capabilities that exist in the shipped platform are
 * written here. See FACT_SHEET.md for the "verified / not verified" split that
 * this copy was checked against.
 */

/* ------------------------------------------------------------------ */
/* placeholders — replace these before anything goes to print          */
/* ------------------------------------------------------------------ */

export const CONTACT = {
  website: 'bizora.app',
  email: 'hello@bizora.app',
  whatsapp: '+92 300 0000000',
  city: 'Karachi',
  cta: 'Book a free demo',
  ctaShort: 'Book a demo',
};

export const REPLACE_BEFORE_SHIPPING = [
  ['CONTACT.website', 'Your real domain (used on every ad, flyer and brochure)'],
  ['CONTACT.email', 'Your real sales/support inbox'],
  ['CONTACT.whatsapp', 'Your real WhatsApp Business number'],
  ['CONTACT.city', 'Your operating city'],
  ['Pricing figures', 'Filled as "Book a free demo" on purpose — no price is claimed anywhere'],
];

/* ------------------------------------------------------------------ */
/* brand                                                               */
/* ------------------------------------------------------------------ */

export const BRAND = {
  name: 'Bizora',
  /** Primary lockup line. */
  tagline: 'One platform. Every business.',
  /** Longer form used on brochures and the marketplace listing. */
  promise: 'A business management platform that gives your business one organised workspace for customers, orders, jobs, payments and accounts — configured to the way you already work.',
  /** Shortest possible description (meta, app store, bio). */
  oneLiner: 'Run your business in one organised workspace — on web and mobile.',

  color: {
    green: '#117A5C',      // shipped default primary (application branding)
    greenLight: '#1A9B72', // gradient stop
    greenDark: '#0B5C45',
    gold: '#C08A33',       // shipped default accent
    goldSoft: '#F3E3C7',
    ink: '#0E1A16',
    ink2: '#3E5749',
    ink3: '#5F7468',
    ink4: '#94A69B',
    canvas: '#F3F7F5',
    surface: '#FFFFFF',
    line: '#E2EBE6',
    night: '#0A1712',
    night2: '#12231C',
    night3: '#1B3128',
  },

  font: {
    display: "'Plus Jakarta Sans', system-ui, sans-serif",
    body: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
};

/**
 * The Bizora mark: three ascending modules inside a tile, with a gold accent.
 * "Built block by block" — one platform assembled from the modules each
 * business actually needs.
 */
export function markSvg({ size = 64, tile = true, mono = null, radius = 18 } = {}) {
  const bar = mono ?? '#FFFFFF';
  const tileFill = tile
    ? `<defs><linearGradient id="bzg" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="${BRAND.color.greenLight}"/>
         <stop offset="1" stop-color="${BRAND.color.greenDark}"/>
       </linearGradient></defs>
       <rect width="64" height="64" rx="${radius}" fill="url(#bzg)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none">
  ${tileFill}
  <rect x="14" y="38" width="18" height="8" rx="4" fill="${bar}" opacity="0.55"/>
  <rect x="14" y="27" width="26" height="8" rx="4" fill="${bar}" opacity="0.8"/>
  <rect x="14" y="16" width="34" height="8" rx="4" fill="${bar}"/>
  <circle cx="52" cy="20" r="3.6" fill="${BRAND.color.gold}"/>
</svg>`;
}

/** Horizontal lockup: mark + wordmark (+ optional tagline). */
export function logoLockup({ size = 64, color = BRAND.color.ink, tagline = false, weight = 800, letterSpacing = '-0.025em' } = {}) {
  const fs = size * 0.52;
  return `<span style="display:inline-flex;align-items:center;gap:${size * 0.22}px">
    ${markSvg({ size })}
    <span style="display:inline-flex;flex-direction:column;line-height:1">
      <span style="font-family:${BRAND.font.display};font-weight:${weight};font-size:${fs}px;letter-spacing:${letterSpacing};color:${color}">${BRAND.name}</span>
      ${tagline ? `<span style="font-family:${BRAND.font.body};font-weight:600;font-size:${fs * 0.34}px;letter-spacing:0.12em;text-transform:uppercase;color:${color};opacity:.62;margin-top:${fs * 0.16}px">${BRAND.tagline}</span>` : ''}
    </span>
  </span>`;
}

/* ------------------------------------------------------------------ */
/* product facts (all verified against the shipped code)               */
/* ------------------------------------------------------------------ */

/** Business templates seeded by the platform migrations. */
export const TEMPLATES = [
  {
    key: 'tailor', name: 'Tailor', category: 'Service',
    blurb: 'Garment orders, measurements and fittings.',
    stages: ['New', 'Measurement', 'Cutting', 'Stitching', 'Finishing', 'Ready for pickup', 'Completed'],
    modules: ['Customers', 'Measurements', 'Orders', 'Payments', 'Reports', 'Notifications'],
  },
  {
    key: 'furniture', name: 'Furniture', category: 'Product',
    blurb: 'Custom furniture production and delivery preparation.',
    stages: ['New', 'Design', 'Material confirmation', 'Production', 'Finishing', 'Ready', 'Completed'],
    modules: ['Customers', 'Orders', 'Payments', 'Reports', 'Notifications'],
  },
  {
    key: 'carpenter', name: 'Carpenter', category: 'Service',
    blurb: 'Carpentry jobs, materials and dimensions.',
    stages: ['New', 'Design', 'Material confirmation', 'Production', 'Finishing', 'Ready', 'Completed'],
    modules: ['Customers', 'Orders', 'Payments', 'Reports', 'Notifications'],
  },
  {
    key: 'auto-workshop', name: 'Auto Workshop', category: 'Service',
    blurb: 'Vehicle inspection, estimates and repair jobs.',
    stages: ['Inspection', 'Estimate', 'Approved', 'Repair', 'Quality check', 'Ready', 'Completed'],
    modules: ['Customers', 'Orders', 'Payments', 'Reports', 'Notifications'],
  },
  {
    key: 'printing', name: 'Printing', category: 'Product',
    blurb: 'Print jobs, specifications and production stages.',
    stages: ['New', 'Design', 'Production', 'Finishing', 'Ready', 'Completed'],
    modules: ['Customers', 'Orders', 'Payments', 'Reports', 'Notifications'],
  },
  {
    key: 'generic', name: 'Generic', category: 'General',
    blurb: 'A configurable customer, order and payment workspace.',
    stages: ['New', 'Completed'],
    modules: ['Customers', 'Orders', 'Payments', 'Reports'],
  },
];

/** Modules a business can switch on. `note` explains the template-aware name. */
export const MODULES = [
  { key: 'customers', label: 'Customers', line: 'Every customer record, contact detail and note in one searchable place.' },
  { key: 'orders', label: 'Orders & jobs', line: 'One record per job, moving through the stages you define, with full status history.' },
  { key: 'catalog', label: 'Catalog', line: 'The items or services you sell, with your own names and types.' },
  { key: 'measurements', label: 'Details & specs', line: 'Measurements, dimensions, inspections or specifications — named the way your trade says it.' },
  { key: 'payments', label: 'Payments', line: 'Cash, bank and digital payments against every order, with invoice PDFs and CSV exports.' },
  { key: 'reports', label: 'Reports', line: 'Reporting in your business timezone, with the numbers that drive the day.' },
  { key: 'notifications', label: 'Notifications', line: 'Reusable message templates for the updates your customers wait for.' },
  { key: 'inventory', label: 'Inventory', line: 'Stock items and variants, locations, balances and every movement recorded.' },
  { key: 'suppliers', label: 'Suppliers', line: 'Who you buy from, what you owe, and settlements as you pay them.' },
  { key: 'purchasing', label: 'Purchasing', line: 'Purchase orders and goods receipts that update stock when they land.' },
  { key: 'cashbook', label: 'Cashbook', line: 'Day-to-day cash in and out, with opening balances and account-wise records.' },
  { key: 'accounting', label: 'Accounting', line: 'Financial accounts, journal entries and bank reconciliation in double entry.' },
];

/** Dashboard widgets shipped with every template. */
export const WIDGETS = ['New orders', 'Due today', 'Overdue', 'In progress', 'Outstanding', 'Collected today'];

/** Platform-console capabilities (the Bizora operating team). */
export const PLATFORM = [
  ['Onboard businesses', 'Create a business on the right template with its own workspace, owner and status.'],
  ['Business templates', 'Maintain templates — terminology, modules, item types, stages, widgets — and roll changes out.'],
  ['Plans & subscriptions', 'Define plans and limits; track every subscription period and its history.'],
  ['Payment review', 'Match each submitted payment to the real receipt before approving and issuing the invoice.'],
  ['Billing reports', 'Platform-level reporting across businesses and periods.'],
  ['Platform staff & audit', 'Granular staff grants, plus an append-only audit history of privileged actions.'],
];

/** What a business owner can set up without writing code. */
export const CONFIGURABLE = [
  ['Business name & branding', 'The name, colours and logo customers see on invoices.'],
  ['Modules', 'Switch on only what you use — hidden modules disappear from everyone’s menu.'],
  ['Item types', 'What you actually sell, in your own words.'],
  ['Workflow stages', 'The steps a job passes through, with the rules for moving between them.'],
  ['Payment methods', 'Cash, bank, digital — whichever you accept.'],
  ['Custom fields', 'Extra boxes your work always needs: text, number, currency, date, dropdown, multi-select, yes/no, measurement, reference, notes.'],
  ['Team & roles', 'Invite staff and give each person the smallest role that lets them do the job.'],
];

/* ------------------------------------------------------------------ */
/* copy                                                                */
/* ------------------------------------------------------------------ */

export const COPY = {
  eyebrow: 'BIZORA — BUSINESS MANAGEMENT PLATFORM',

  hero: {
    headline: 'Run your whole business from one place.',
    sub: 'Bizora gives your business a digital workspace for customers, orders, jobs, payments and accounts — set up on a template that matches the way you already work.',
    proofLine: 'Web dashboard · Android app · Configured for your trade',
  },

  problem: {
    heading: 'Sound familiar?',
    items: [
      'Orders live in a register, updates live in WhatsApp, money lives in a diary.',
      'Only you know which job is ready — and what is still owed on it.',
      'A new employee takes weeks to understand how work actually moves.',
    ],
    kicker: 'Nothing is lost. It is just scattered — and scattered is expensive.',
  },

  valueProps: [
    {
      title: 'One organised workspace',
      body: 'Every customer, job, payment and note in one place — on the web dashboard and on the Android app. Nothing depends on one person’s memory.',
    },
    {
      title: 'Configured for your trade',
      body: 'Start from a business template, then use your own words, your own stages and only the modules you actually use. It adapts to the business, not the other way round.',
    },
    {
      title: 'A clear picture every morning',
      body: 'New orders, due today, overdue, in progress, outstanding and collected today — the six numbers that run your day, reported in your business timezone.',
    },
    {
      title: 'Your team, with the right limits',
      body: 'Invite staff with roles and granular permissions. Every privileged action is written to an audit history you can check.',
    },
  ],

  /** The onboarding journey, used on the brochure, flyer and video 3. */
  steps: [
    { n: '01', title: 'Tell us your business', body: 'What you do, what you sell, who works with you. We pick the template that fits — or start from a configurable workspace.' },
    { n: '02', title: 'We configure your workspace', body: 'Modules, workflow stages, item types, payment methods, custom fields and your branding. Your words, your process.' },
    { n: '03', title: 'You run it, everywhere', body: 'Sign in on the web or the Android app, invite your team, and watch every job move stage by stage.' },
  ],

  audiences: [
    { label: 'Service businesses', line: 'Workshops, carpentry, installation and repair teams that run job by job.' },
    { label: 'Made-to-order makers', line: 'Furniture, printing and production businesses where every order is different.' },
    { label: 'Growing small businesses', line: 'Owners who have outgrown the register and need one clear system.' },
  ],

  closers: [
    'One platform. Every business.',
    'Your business, organised — on web and mobile.',
    'From register to dashboard, without changing how you work.',
  ],

  ctas: {
    primary: CONTACT.cta,
    secondary: 'See how it works',
    url: CONTACT.website,
    email: CONTACT.email,
  },

  /* ---- Instagram / Facebook ---- */

  social: {
    igCaption: `Your business has outgrown the register. 📒➡️📊

Bizora puts customers, orders, jobs, payments and accounts in one organised workspace — configured to the way you already work, on web and mobile.

✅ Start from a template built for your trade
✅ Switch on only the modules you use
✅ Track every job stage by stage
✅ Give your team access with the right limits
✅ See due, overdue and collected today at a glance

${CONTACT.cta} — link in bio.

#Bizora #BusinessManagement #SmallBusiness #SME #BusinessSoftware #DigitalBusiness #Productivity #BusinessOwner #Karachi #Pakistan #SMEPakistan #BusinessGrowth #Operations #ERP #MadeForBusiness`,

    fbCaption: `Most small businesses are not disorganised — they are just scattered.

Orders in a register. Updates on WhatsApp. Money in a diary. Stock in someone's head.

Bizora brings it into one workspace: customers, orders and jobs, payments, inventory and accounts — configured around your trade, your words and your stages. Your team sees the same picture you do, and every action is recorded.

Workshops, furniture makers, printers, carpenters and service teams already fit the same platform — because the platform is configured per business, not one-size-fits-all.

${CONTACT.cta}: ${CONTACT.website}

#Bizora #SmallBusiness #BusinessManagement #DigitalTransformation #SME`,

    linkedinCaption: `Scattered is expensive.

When orders sit in a register, updates sit in chat and balances sit in a diary, the business is running on one person's memory. That works — until it doesn't.

Bizora is a multi-business management platform. Each business is onboarded onto its own workspace, built from a template and then configured: modules, workflow stages, item types, payment methods, custom fields, branding and team roles.

What that gives an owner:
· One record per customer, job and payment
· A stage-by-stage view of work in progress
· Six daily numbers — new, due today, overdue, in progress, outstanding, collected today
· Role-based access for the team, with an audit history behind it
· Web dashboard and Android app, reporting in the business timezone

It is not one app per industry. It is one platform that is configured per business.

${CONTACT.cta}: ${CONTACT.website}

#BusinessManagement #SME #Operations #DigitalTransformation #Bizora`,

    whatsappBroadcast: `*Bizora* — ${BRAND.tagline}

Apna business ek hi jagah chalayein:
• Customers aur orders ek record mein
• Har job stage by stage
• Payments, outstanding aur collected today
• Team ko roles ke sath access
• Web + Android app

Templates: Tailor, Furniture, Carpenter, Auto Workshop, Printing — ya aap ke business ke hisaab se configure.

Free demo ke liye message karein: ${CONTACT.whatsapp}
${CONTACT.website}`,

    hashtagBank: [
      '#Bizora', '#BusinessManagement', '#BusinessPlatform', '#SmallBusiness',
      '#SME', '#SMEPakistan', '#Karachi', '#Pakistan', '#BusinessOwner',
      '#BusinessSoftware', '#Operations', '#DigitalBusiness', '#ERP',
      '#BusinessGrowth', '#MadeForBusiness', '#WorkshopManagement',
      '#FurnitureBusiness', '#PrintingBusiness', '#Productivity',
    ],
  },

  /* ---- ad copy variants (3 angles) ---- */

  ads: [
    {
      angle: 'Organise',
      headline: 'Your business, in one place.',
      primary: 'Customers, orders, jobs, payments and accounts — one organised workspace, on web and mobile.',
      description: 'Stop running your business across a register, a chat thread and a diary.',
      cta: CONTACT.cta,
    },
    {
      angle: 'Configure',
      headline: 'Software that fits your business. Not the other way around.',
      primary: 'Start from a template for your trade, then switch on the modules you use, name your stages, and work in your own words.',
      description: 'One platform for workshops, makers, printers and service teams.',
      cta: CONTACT.cta,
    },
    {
      angle: 'Control',
      headline: 'Know what is due, what is overdue and what was collected — today.',
      primary: 'Six numbers open the day: new, due today, overdue, in progress, outstanding, collected. Reported in your business timezone.',
      description: 'Give your team access with roles, and keep an audit history behind every action.',
      cta: CONTACT.cta,
    },
  ],

  /* ---- marketplace listing (Etsy-style digital product) ---- */

  listing: {
    title: 'Bizora Business Management System — Digital Workspace Setup & Onboarding for Your Business',
    subtitle: 'Multi-business management platform · configured for your trade · web + Android',
    description: `Run your business from one organised workspace instead of a register, a chat thread and a diary.

Bizora is a business management platform. Your business gets its own digital workspace, built from a business template and then configured around the way you already work — your words, your stages, your items, your team.

WHAT YOU GET
• Your business onboarded on Bizora, on the template that fits your trade
• Configuration of the modules you actually use
• Your workflow stages, item types, payment methods and custom fields set up
• Your business name and branding applied to invoices
• Team invitations with roles and permissions
• Web dashboard plus Android app access
• A walkthrough of the daily numbers: new, due today, overdue, in progress, outstanding, collected today

WHO IT IS FOR
• Service businesses running job by job — workshops, carpentry, repair and installation teams
• Made-to-order makers — furniture, printing and production businesses
• Owners who have outgrown paper and chat and want one clear system

HOW IT WORKS
1. You tell us about your business — what you sell, how work moves, who works with you.
2. We configure your workspace — modules, stages, item types, fields, branding.
3. You run it — sign in on web or Android, invite your team, and move every job stage by stage.

MODULES AVAILABLE
Customers · Orders & jobs · Catalog · Details & specs · Payments · Reports · Notifications · Inventory · Suppliers · Purchasing · Cashbook · Accounting — switch on only what you use.

BUSINESS TEMPLATES
Tailor · Furniture · Carpenter · Auto Workshop · Printing · Generic (configurable workspace)

NOTES
This is a digital setup and onboarding service for a software platform. No physical item is shipped. Access is delivered to the email address you provide. Ongoing subscription terms are confirmed with you before activation — no charges are applied inside this listing.

Questions before ordering? Send us a message — we will tell you honestly whether Bizora fits your business.`,
    tags: [
      'business management system', 'business management platform', 'small business software',
      'business operations software', 'job tracking system', 'order management system',
      'customer management', 'inventory management', 'small business tool', 'digital business setup',
      'business automation', 'SME software', 'workshop management', 'business dashboard',
    ],
    faq: [
      ['Is this a physical product?', 'No. This is a digital onboarding and setup service for the Bizora platform. Access details are sent by email.'],
      ['Which businesses does it suit?', 'Service businesses that run job by job, made-to-order makers, and any small business that needs customers, orders, payments and stock in one place.'],
      ['Do I have to use every module?', 'No — that is the point. You switch on the modules you use, and the rest stay out of the menu.'],
      ['Can I use my own words and stages?', 'Yes. Item types, workflow stages, custom fields, payment methods and branding are all configurable per business.'],
      ['Do I need new hardware?', 'No. Bizora runs in a web browser and on Android phones.'],
      ['What do you need from me?', 'Your business name, what you sell, the stages a job passes through, the payment methods you accept, and who needs access.'],
    ],
  },

  /* ---- flyer ---- */

  flyer: {
    headline: 'Your business, organised — at last.',
    sub: 'Customers, orders, jobs, payments and accounts in one workspace you can open from anywhere.',
    sidePanelTitle: 'Six numbers that run your day',
    backHeadline: 'Built around your business, not a generic template.',
    checklist: [
      'One record per customer, job and payment',
      'Stage-by-stage progress with full history',
      'Payments, invoices and CSV exports',
      'Optional inventory, purchasing, cashbook and accounting',
      'Roles and permissions for your team',
      'Web dashboard and Android app',
    ],
  },

  /* ---- brochure ---- */

  brochure: {
    coverHeadline: 'One platform. Every business.',
    coverSub: 'A business management platform, configured for the way you already work.',
    panels: {
      what: {
        title: 'What Bizora is',
        body: 'Bizora is a multi-business management platform. We onboard your business onto its own digital workspace and configure it around how you actually work — then you run your customers, orders, jobs, payments and accounts from one place, on web and mobile.',
      },
      how: {
        title: 'How it works',
        body: 'Each business is created on a template that fits its trade. From there your workspace is configured: modules, workflow stages, item types, payment methods, custom fields, branding and team roles. Nothing is one-size-fits-all — and nothing needs code.',
      },
      benefits: {
        title: 'Why owners move',
        body: 'Work stops depending on one person’s memory. Your team sees the same status you do. Every job has a history, every payment a record, every privileged action an audit entry. And the day starts with six numbers instead of guesswork.',
      },
      businesses: {
        title: 'Businesses it fits',
        body: 'Templates ship for tailor, furniture, carpenter, auto workshop and printing, plus a configurable generic workspace. New business types are configured on the platform rather than built from scratch.',
      },
      platform: {
        title: 'Behind the platform',
        body: 'The Bizora operating console handles onboarding, templates, plans and subscriptions, payment review against real receipts, billing reports, platform staff and an append-only audit history.',
      },
    },
    backHeadline: CONTACT.cta,
    backBody: 'Tell us what your business does and how work moves through it. We will show you the same screens, set up for your trade — no obligation.',
  },

  /* ---- video ---- */

  video: {
    promo: {
      title: 'Bizora — One platform. Every business.',
      duration: '60 seconds',
      audience: 'Owners of small and mid-sized service, trade and made-to-order businesses (25–55) who currently run on registers, chat threads and memory; plus the platform’s own sales team for paid social.',
      keyMessage: 'Bizora is not an app for one trade — it is one platform that gets configured for each business, so customers, orders, jobs, payments and accounts finally live in one place.',
      cta: `${CONTACT.cta} — ${CONTACT.website}`,
      voiceover: [
        'Every business runs on the same three things: the work, the money, and the people waiting on both.',
        'Most owners keep those in three different places. Orders in a register. Updates in a chat thread. Balances in a diary.',
        'Bizora puts them in one workspace — built for your business, not a generic one.',
        'Your trade, your words. Start from a template, name your stages, and switch on only the modules you use.',
        'Customers, orders and jobs, payments, inventory and accounts — all in one place, on web and on mobile.',
        'Every job moves stage by stage, with a history you can check. Every payment is recorded. Every action is logged.',
        'Your team gets access with the right limits. You get the morning in six numbers: new, due today, overdue, in progress, outstanding, collected.',
        'One platform. Every business. Book a free demo at Bizora.',
      ],
      scenes: [
        { t: '0:00 – 0:06', visual: 'Split screen of the scattered office: paper register, phone chat, handwritten diary. Desaturated, slightly cool grade.', onScreen: 'Three places. One business.', direction: 'Slow push in on the mess. No Bizora branding yet — we earn it.' },
        { t: '0:06 – 0:12', visual: 'Hard cut to the Bizora dashboard on a clean desk. Warm light, device in hand.', onScreen: 'Or this.', direction: 'Snap zoom + subtle whoosh. Colour warms up as the logo lands.' },
        { t: '0:12 – 0:20', visual: 'Template chips animate across the screen: Tailor · Furniture · Carpenter · Auto Workshop · Printing · Generic.', onScreen: 'Start from a template built for your trade.', direction: 'Chips slide in left to right, one beat apart. Gold accent on the active chip.' },
        { t: '0:20 – 0:30', visual: 'Module switches toggling on in Business settings, then the menu reflowing to match.', onScreen: 'Switch on only what you use.', direction: 'Screen recording feel — real cursor, real toggles, no fake UI.' },
        { t: '0:30 – 0:40', visual: 'Orders board: a job card dragged from Design to Production. Status pill updates, history line appears.', onScreen: 'Every job, stage by stage.', direction: 'Follow the card. Hold on the history entry for half a beat.' },
        { t: '0:40 – 0:48', visual: 'Payments list with an invoice PDF opening; then the Inventory and Cashbook modules cut in as optional add-ons.', onScreen: 'Payments, stock and accounts — when you need them.', direction: 'Quick cuts, one module per beat, all inside the same workspace chrome.' },
        { t: '0:48 – 0:55', visual: 'Dashboard widgets light up one by one: New orders, Due today, Overdue, In progress, Outstanding, Collected today.', onScreen: 'Six numbers that run your day.', direction: 'Count-up animation on each figure. Beat the voiceover to the last number.' },
        { t: '0:55 – 1:00', visual: 'Web dashboard and phone side by side, then the lockup on the brand green.', onScreen: `${CONTACT.cta.toUpperCase()} · ${CONTACT.website}`, direction: 'Hold a clean 5-second end card. Mark, wordmark, URL, CTA button.' },
      ],
    },

    reel: {
      title: 'Three places. One business. (vertical reel)',
      duration: '30 seconds',
      audience: 'Instagram Reels / TikTok / Facebook Reels — small business owners scrolling in Urdu and English.',
      keyMessage: 'Your business is not disorganised, it is scattered. Bizora gathers it into one workspace.',
      cta: 'Link in bio — book a free demo',
      voiceover: [
        'Your business is not disorganised. It is scattered.',
        'Orders in a register. Updates in a chat thread. Money in a diary.',
        'Bizora puts customers, jobs, payments and accounts in one workspace — configured for your trade.',
        'One platform. Every business. Link in bio.',
      ],
      scenes: [
        { t: '0:00 – 0:05', visual: 'Fast three-shot montage: register, WhatsApp thread, diary page.', onScreen: 'Orders. Updates. Money.', direction: 'Hard cuts on the beat. Slight handheld grain.' },
        { t: '0:05 – 0:20', visual: 'Vertical phone screen: Bizora dashboard → orders board → payment recorded.', onScreen: 'One workspace.', direction: 'Scroll the phone UI in one continuous take, no cuts.' },
        { t: '0:20 – 0:26', visual: 'Template chips + module toggles flash past.', onScreen: 'Configured for your business.', direction: 'Motion blur between frames; keep the green lockup pinned bottom.' },
        { t: '0:26 – 0:30', visual: 'End card on brand green with the mark.', onScreen: `${CONTACT.cta.toUpperCase()} · ${CONTACT.website}`, direction: 'Logo pop at 0:26, hold to the end.' },
      ],
    },

    explainer: {
      title: 'How onboarding works (3 steps)',
      duration: '45 seconds',
      audience: 'Warm leads who clicked the ad and want to know what happens after they say yes.',
      keyMessage: 'You are not buying software to configure yourself — Bizora configures it with you.',
      cta: `${CONTACT.cta} — ${CONTACT.website}`,
      voiceover: [
        'Setting up Bizora takes three steps, and the first two are ours.',
        'Step one: tell us your business. What you sell, how work moves, who works with you.',
        'Step two: we configure your workspace. Modules, stages, item types, payment methods, custom fields and your branding.',
        'Step three: you run it. Sign in on the web or the Android app, invite your team, and move every job stage by stage.',
        'Book a free demo and we will show you the same screens, set up for your trade.',
      ],
      scenes: [
        { t: '0:00 – 0:08', visual: 'Three numbered cards animate in: 01, 02, 03. Cards 01 and 02 carry the Bizora mark, card 03 carries a business owner silhouette.', onScreen: 'Two steps are ours. One is yours.', direction: 'Cards stack from the bottom with a soft spring.' },
        { t: '0:08 – 0:18', visual: 'A short intake conversation: sticky notes with business name, items, stages, team.', onScreen: 'Tell us your business.', direction: 'Warm, human footage — hands, notebook, real workshop in the background.' },
        { t: '0:18 – 0:32', visual: 'Configuration pass: modules toggling, stages reordering, custom fields being added, branding applied to an invoice.', onScreen: 'We configure your workspace.', direction: 'Screen recording with a real cursor; speed-ramped 1.6x.' },
        { t: '0:32 – 0:40', visual: 'Owner signs in on laptop and phone; a job card moves stage by stage.', onScreen: 'You run it — everywhere.', direction: 'Cut between devices on the word "everywhere".' },
        { t: '0:40 – 0:45', visual: 'End card.', onScreen: `${CONTACT.cta.toUpperCase()} · ${CONTACT.website}`, direction: 'Hold for 5 seconds with the URL and email.' },
      ],
    },
  },
};

/* ------------------------------------------------------------------ */
/* sample data used to recreate real product screens                   */
/* Screen visuals are rebuilt from the shipped design system with      */
/* neutral, multi-industry demo data — never tailor-only content.      */
/* ------------------------------------------------------------------ */

export const DEMO = {
  business: 'Al-Noor Furniture',
  currency: 'Rs',
  dashboard: {
    greeting: 'Good morning, Bilal',
    date: 'Monday, 27 October',
    kpis: [
      { label: 'New orders', value: '12', delta: '+4', up: true },
      { label: 'Due today', value: '5', delta: '-2', up: false },
      { label: 'Overdue', value: '3', delta: '+1', up: false },
      { label: 'In progress', value: '18', delta: '+6', up: true },
    ],
    money: [
      { label: 'Outstanding', value: '184,500' },
      { label: 'Collected today', value: '42,300' },
    ],
    chart: [38, 52, 44, 61, 55, 72, 66],
    chartLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    recent: [
      ['#1042', 'Zahid Interiors', 'Production', 'Rs 62,000'],
      ['#1041', 'Sana Ahmed', 'Design', 'Rs 18,500'],
      ['#1040', 'Khan Carpentry', 'Ready', 'Rs 27,400'],
      ['#1039', 'Bilal Motors', 'Finishing', 'Rs 41,900'],
    ],
  },
  orders: {
    columns: [
      { name: 'New', tone: 'info', items: [
        { id: '#1045', title: 'Office desk — oak', customer: 'Zahid Interiors', meta: 'Due 3 Nov', amount: 'Rs 48,000' },
        { id: '#1046', title: 'Wall unit — 6ft', customer: 'Sana Ahmed', meta: 'Due 6 Nov', amount: 'Rs 72,500' },
      ] },
      { name: 'Production', tone: 'warn', items: [
        { id: '#1042', title: 'Dining set — 8 seat', customer: 'Zahid Interiors', meta: 'Due 30 Oct', amount: 'Rs 62,000' },
        { id: '#1043', title: 'Wardrobe — sliding', customer: 'Ayesha Khan', meta: 'Due 1 Nov', amount: 'Rs 88,000' },
      ] },
      { name: 'Finishing', tone: 'brand', items: [
        { id: '#1039', title: 'Reception counter', customer: 'Bilal Motors', meta: 'Due 29 Oct', amount: 'Rs 41,900' },
      ] },
      { name: 'Ready', tone: 'ok', items: [
        { id: '#1040', title: 'Bookshelf — walnut', customer: 'Khan Carpentry', meta: 'Collected', amount: 'Rs 27,400' },
      ] },
    ],
  },
  customers: [
    ['Zahid Interiors', '+92 300 1122334', '#1042', 'Rs 62,000', 'Active'],
    ['Sana Ahmed', '+92 321 4455667', '#1046', 'Rs 0', 'Active'],
    ['Ayesha Khan', '+92 333 7788990', '#1043', 'Rs 12,000', 'Active'],
    ['Bilal Motors', '+92 345 2211098', '#1039', 'Rs 41,900', 'Active'],
    ['Khan Carpentry', '+92 300 9988776', '#1040', 'Rs 0', 'Active'],
  ],
  inventory: [
    ['Oak board 18mm', 'Main store', '64', 'Rs 96,000'],
    ['Walnut veneer', 'Main store', '22', 'Rs 51,700'],
    ['Drawer slides — soft close', 'Workshop', '180', 'Rs 34,200'],
    ['PU matte lacquer 5L', 'Chemical store', '9', 'Rs 27,450'],
  ],
  accounting: [
    ['27 Oct', 'Sales revenue', 'Rs 42,300', '—'],
    ['27 Oct', 'Cash in hand', 'Rs 42,300', '—'],
    ['26 Oct', 'Supplier payment — Timber Co.', '—', 'Rs 58,000'],
    ['26 Oct', 'Bank — MCB 0042', '—', 'Rs 58,000'],
  ],
  platformBusinesses: [
    ['Al-Noor Furniture', 'Furniture', 'Bilal Ahmed', 'Active'],
    ['Zahid Auto Workshop', 'Auto Workshop', 'Zahid Iqbal', 'Active'],
    ['Karachi Print House', 'Printing', 'Sana Ahmed', 'Active'],
    ['Khan Carpentry', 'Carpenter', 'Khan Sahib', 'Trial'],
    ['Sana Stitch Studio', 'Tailor', 'Sana Yousuf', 'Pending'],
  ],
  activity: [
    ['Payment recorded', 'Rs 42,300 · #1040', '2m ago'],
    ['Stage changed', '#1043 → Finishing', '18m ago'],
    ['New order', '#1046 · Wall unit 6ft', '1h ago'],
    ['Stock received', 'PO-0091 · 40 boards', '3h ago'],
  ],
};
