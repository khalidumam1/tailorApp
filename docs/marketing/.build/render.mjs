/**
 * Renders every Bizora marketing visual from bizora.js.
 *
 * Text-heavy pieces are laid out as HTML and rasterised with headless
 * Chromium, so typography stays crisp and on-brand at any size. Product
 * screens are recreated from the shipped design system with neutral,
 * multi-industry demo data (never tailor-only content).
 *
 * Run:  node --experimental-default-type=module .build/render.mjs
 *       (needs CHROME_LIB pointing at the extracted chromium libs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import {
  BRAND, CONTACT, COPY, DEMO, MODULES, TEMPLATES, WIDGETS, PLATFORM, CONFIGURABLE,
  markSvg, logoLockup,
} from './bizora.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..');
const ASSETS = path.join(HERE, 'assets');
const C = BRAND.color;
const FONT = `file://${path.join(ASSETS, 'plus-jakarta-sans-latin-wght-normal.woff2')}`;
const FONTI = `file://${path.join(ASSETS, 'plus-jakarta-sans-latin-wght-italic.woff2')}`;

for (const d of ['01-strategy', '02-social', '03-marketplace', '04-print', '05-brand', '06-video']) {
  fs.mkdirSync(path.join(OUT, d), { recursive: true });
}

/* ------------------------------------------------------------------ */
/* base styles                                                         */
/* ------------------------------------------------------------------ */

const BASE = `
@font-face{font-family:PJS;src:url('${FONT}') format('woff2-variations');font-weight:200 800;font-style:normal;font-display:block;}
@font-face{font-family:PJS;src:url('${FONTI}') format('woff2-variations');font-weight:200 800;font-style:italic;font-display:block;}
:root{
  --green:${C.green}; --green-l:${C.greenLight}; --green-d:${C.greenDark};
  --gold:${C.gold}; --gold-s:${C.goldSoft};
  --ink:${C.ink}; --ink2:${C.ink2}; --ink3:${C.ink3}; --ink4:${C.ink4};
  --canvas:${C.canvas}; --surface:${C.surface}; --line:${C.line};
  --night:${C.night}; --night2:${C.night2}; --night3:${C.night3};
}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;}
body{
  font-family:PJS,system-ui,sans-serif; color:var(--ink); background:#fff;
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  overflow:hidden;
}
.wrap{position:relative;width:100%;height:100%;overflow:hidden;}
.grid{position:absolute;inset:0;opacity:.5;
  background-image:linear-gradient(rgba(17,122,92,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(17,122,92,.07) 1px,transparent 1px);}
.glow{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55;}
h1,h2,h3{font-weight:800;letter-spacing:-.032em;line-height:1.02;}
.kicker{font-weight:700;font-size:15px;letter-spacing:.20em;text-transform:uppercase;color:var(--green);}
.kicker.gold{color:var(--gold);}
.kicker.onDark{color:#7fd8b6;}
.sub{font-weight:500;line-height:1.5;color:var(--ink2);}
.onDark .sub{color:#a9c4b8;}
.eyebrow-pill{display:inline-flex;align-items:center;gap:9px;padding:8px 16px;border-radius:999px;
  background:rgba(17,122,92,.10);border:1px solid rgba(17,122,92,.18);font-weight:700;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--green);}
.eyebrow-pill.dark{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#8fe0c0;}
.cta{display:inline-flex;align-items:center;gap:12px;padding:17px 30px;border-radius:14px;
  background:linear-gradient(135deg,var(--green-l),var(--green-d));color:#fff;font-weight:700;font-size:19px;letter-spacing:-.01em;
  box-shadow:0 18px 34px -16px rgba(11,92,69,.65);}
.cta.gold{background:linear-gradient(135deg,#e6b25c,var(--gold));color:#2a1b06;box-shadow:0 18px 34px -16px rgba(192,138,51,.6);}
.cta.small{font-size:15px;padding:13px 22px;border-radius:11px;}
.url{font-weight:700;letter-spacing:-.01em;}
.rule{height:1px;background:var(--line);}
.chip{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;background:#fff;
  border:1px solid var(--line);font-weight:600;font-size:15px;color:var(--ink2);box-shadow:0 6px 16px -10px rgba(14,26,22,.35);}
.chip b{font-weight:800;color:var(--ink);}
.dot{width:8px;height:8px;border-radius:50%;background:var(--green);flex:none;}
.dot.gold{background:var(--gold);}
.card{background:#fff;border:1px solid var(--line);border-radius:22px;box-shadow:0 26px 50px -30px rgba(14,26,22,.30);}
.tick{display:flex;align-items:flex-start;gap:13px;}
.tick .box{width:24px;height:24px;border-radius:8px;flex:none;margin-top:2px;display:grid;place-items:center;
  background:rgba(17,122,92,.12);color:var(--green);font-weight:800;font-size:13px;}
.num{font-weight:800;color:#8A5F14;letter-spacing:-.02em;}
`;

const page = (body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}${extra}</style></head><body>${body}</body></html>`;

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

const mm = (n) => Math.round(n * 3.7795); // mm → css px @96dpi
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TICK = '<span class="box">&#10003;</span>';

function scaled(content, w, h, k) {
  return `<div style="width:${Math.round(w * k)}px;height:${Math.round(h * k)}px;overflow:hidden" data-clip="1">
    <div style="width:${w}px;height:${h}px;transform:scale(${k});transform-origin:top left">${content}</div></div>`;
}

/* ------------------------------------------------------------------ */
/* product UI (recreated from the shipped design system)               */
/* ------------------------------------------------------------------ */

const APP_NAV = ['Overview', 'Orders', 'Catalog', 'Customers', 'Payments', 'Operations & finance', 'Business settings'];

function appShell({ nav = 'Overview', business = DEMO.business, user = 'Bilal Ahmed', body, width = 1180, height = 760, dark = false }) {
  const s = dark
    ? { bg: '#101714', panel: '#171f1a', line: 'rgba(229,242,233,.10)', ink: '#f0f5f1', ink2: '#a8b9ae', side: '#131a16' }
    : { bg: '#f3f7f5', panel: '#ffffff', line: '#e2ebe6', ink: '#14231c', ink2: '#5f7468', side: '#ffffff' };
  const navItems = APP_NAV.map((n) => `<div style="display:flex;align-items:center;gap:11px;padding:10px 13px;border-radius:11px;
      font-size:14.5px;font-weight:${n === nav ? 700 : 500};color:${n === nav ? s.ink : s.ink2};
      background:${n === nav ? (dark ? 'rgba(17,122,92,.20)' : '#e8f4ef') : 'transparent'};
      box-shadow:${n === nav ? 'inset 3px 0 0 ' + C.green : 'none'}">
      <span style="width:17px;height:17px;border-radius:5px;flex:none;background:${n === nav ? C.green : (dark ? '#3b4f45' : '#cbd7d0')}"></span>${esc(n)}</div>`).join('');
  return `<div style="width:${width}px;height:${height}px;display:flex;background:${s.bg};font-family:PJS,sans-serif;color:${s.ink}">
    <div style="width:238px;flex:none;background:${s.side};border-right:1px solid ${s.line};padding:22px 16px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;gap:11px;padding:6px 6px 20px">
        ${markSvg({ size: 34 })}
        <div><div style="font-weight:800;font-size:17px;letter-spacing:-.02em">${BRAND.name}</div>
        <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${s.ink2};opacity:.8;margin-top:2px">${esc(business)}</div></div>
      </div>
      ${navItems}
      <div style="margin-top:auto;padding:12px;border-radius:12px;background:${dark ? 'rgba(255,255,255,.05)' : '#f6f9f7'};border:1px solid ${s.line}">
        <div style="font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${s.ink2}">Plan</div>
        <div style="font-size:14px;font-weight:700;margin-top:4px">Growth · Trial</div>
      </div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;min-width:0">
      <div style="height:70px;flex:none;display:flex;align-items:center;gap:14px;padding:0 26px;background:${s.panel};border-bottom:1px solid ${s.line}">
        <div style="font-size:19px;font-weight:800;letter-spacing:-.02em">${esc(nav)}</div>
        <div style="flex:1"></div>
        <div style="width:280px;height:38px;border-radius:10px;background:${dark ? 'rgba(255,255,255,.05)' : '#f3f7f5'};border:1px solid ${s.line};display:flex;align-items:center;padding:0 13px;font-size:13.5px;color:${s.ink2}">Search customers, orders…</div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,${C.greenLight},${C.greenDark});display:grid;place-items:center;color:#fff;font-weight:800;font-size:13px">BA</div>
          <div style="font-size:13.5px;font-weight:600">${esc(user)}</div>
        </div>
      </div>
      <div style="flex:1;padding:24px 26px;overflow:hidden">${body}</div>
    </div>
  </div>`;
}

const kpiCard = (k) => `<div style="padding:17px 18px;border-radius:16px;background:#fff;border:1px solid ${C.line};box-shadow:0 12px 26px -20px rgba(14,26,22,.5)">
  <div style="font-size:12.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.ink3}">${esc(k.label)}</div>
  <div style="display:flex;align-items:baseline;gap:9px;margin-top:9px">
    <div style="font-size:31px;font-weight:800;letter-spacing:-.03em">${esc(k.value)}</div>
    <div style="font-size:13.5px;font-weight:700;color:${k.up ? '#167151' : '#b42318'}">${esc(k.delta)}</div>
  </div></div>`;

const moneyCard = (m, accent) => `<div style="flex:1;padding:17px 18px;border-radius:16px;background:${accent ? 'linear-gradient(135deg,' + C.greenDark + ',' + C.green + ')' : '#fff'};border:1px solid ${accent ? 'transparent' : C.line};color:${accent ? '#fff' : C.ink}">
  <div style="font-size:12.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.75">${esc(m.label)}</div>
  <div style="font-size:29px;font-weight:800;letter-spacing:-.03em;margin-top:8px">Rs ${esc(m.value)}</div></div>`;

function barChart(series, labels, w = 470, h = 176) {
  const max = Math.max(...series);
  const bw = w / series.length;
  return `<div style="display:flex;align-items:flex-end;gap:${bw * 0.24}px;width:${w}px;height:${h}px">
    ${series.map((v, i) => `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:6px">
      <div style="height:${Math.round((v / max) * (h - 26))}px;border-radius:7px;background:${i === series.length - 2 ? `linear-gradient(180deg,${C.greenLight},${C.greenDark})` : 'rgba(17,122,92,.22)'}"></div>
      <div style="text-align:center;font-size:11px;font-weight:600;color:${C.ink3}">${esc(labels[i] ?? '')}</div></div>`).join('')}
  </div>`;
}

const uiDashboard = (dark = false) => appShell({
  nav: 'Overview', dark,
  body: `<div style="display:flex;flex-direction:column;gap:18px">
    <div style="display:flex;align-items:flex-end;gap:12px">
      <div><div style="font-size:23px;font-weight:800;letter-spacing:-.025em">${esc(DEMO.dashboard.greeting)}</div>
      <div style="font-size:14px;font-weight:500;color:${C.ink3};margin-top:4px">${esc(DEMO.dashboard.date)} · ${esc(DEMO.business)}</div></div>
      <div style="flex:1"></div>
      <div style="padding:10px 16px;border-radius:11px;background:${C.green};color:#fff;font-size:14px;font-weight:700">New order</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">${DEMO.dashboard.kpis.map(kpiCard).join('')}</div>
    <div style="display:flex;gap:14px">${moneyCard(DEMO.dashboard.money[0], false)}${moneyCard(DEMO.dashboard.money[1], true)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="padding:18px;border-radius:16px;background:#fff;border:1px solid ${C.line}">
        <div style="font-size:15px;font-weight:800;letter-spacing:-.02em">Orders this week</div>
        <div style="margin-top:14px">${barChart(DEMO.dashboard.chart, DEMO.dashboard.chartLabels, 400, 168)}</div>
      </div>
      <div style="padding:18px;border-radius:16px;background:#fff;border:1px solid ${C.line}">
        <div style="font-size:15px;font-weight:800;letter-spacing:-.02em;margin-bottom:12px">Recent orders</div>
        ${DEMO.dashboard.recent.map((r) => `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid ${C.line}">
          <div style="font-size:13px;font-weight:800;color:${C.green};width:52px">${esc(r[0])}</div>
          <div style="flex:1;font-size:14px;font-weight:600">${esc(r[1])}</div>
          <div style="padding:4px 10px;border-radius:999px;background:#e8f4ef;color:${C.green};font-size:11.5px;font-weight:700">${esc(r[2])}</div>
          <div style="font-size:13.5px;font-weight:700;width:82px;text-align:right">${esc(r[3])}</div></div>`).join('')}
      </div>
    </div>
  </div>`,
});

const TONES = {
  info: ['#eef6fb', '#246caa'], warn: ['#fff8e9', '#9b6818'], ok: ['#edf8f2', '#167151'], brand: ['#e8f4ef', C.greenDark],
};

const uiOrders = () => appShell({
  nav: 'Orders',
  body: `<div style="display:flex;gap:14px;height:100%">
    ${DEMO.orders.columns.map((col) => `<div style="flex:1;background:#f6f9f7;border:1px solid ${C.line};border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:center;gap:8px;padding:0 4px">
        <div style="font-size:13.5px;font-weight:800;letter-spacing:-.01em">${esc(col.name)}</div>
        <div style="font-size:12px;font-weight:700;color:${C.ink3}">${col.items.length}</div>
      </div>
      ${col.items.map((it) => `<div style="background:#fff;border:1px solid ${C.line};border-radius:13px;padding:13px;box-shadow:0 10px 20px -16px rgba(14,26,22,.5)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;font-weight:800;color:${TONES[col.tone][1]}">${esc(it.id)}</span>
          <span style="padding:3px 9px;border-radius:999px;background:${TONES[col.tone][0]};color:${TONES[col.tone][1]};font-size:11px;font-weight:700">${esc(it.meta)}</span>
        </div>
        <div style="font-size:14.5px;font-weight:700;margin-top:9px;letter-spacing:-.01em">${esc(it.title)}</div>
        <div style="font-size:13px;color:${C.ink3};margin-top:5px">${esc(it.customer)}</div>
        <div style="display:flex;align-items:center;margin-top:11px">
          <div style="font-size:14px;font-weight:800">${esc(it.amount)}</div>
          <div style="flex:1"></div>
          <div style="display:flex;gap:-4px">
            <div style="width:22px;height:22px;border-radius:50%;background:${C.green};opacity:.85"></div>
            <div style="width:22px;height:22px;border-radius:50%;background:${C.gold};margin-left:-6px"></div>
          </div>
        </div></div>`).join('')}
    </div>`).join('')}
  </div>`,
});

const uiTable = (nav, head, rows) => appShell({
  nav,
  body: `<div style="background:#fff;border:1px solid ${C.line};border-radius:16px;overflow:hidden">
    <div style="display:grid;grid-template-columns:${head.map(() => '1fr').join(' ')};padding:14px 18px;background:#f6f9f7;border-bottom:1px solid ${C.line}">
      ${head.map((h, i) => `<div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${C.ink3};text-align:${i === head.length - 1 ? 'right' : 'left'}">${esc(h)}</div>`).join('')}
    </div>
    ${rows.map((r) => `<div style="display:grid;grid-template-columns:${head.map(() => '1fr').join(' ')};padding:15px 18px;border-bottom:1px solid ${C.line};align-items:center">
      ${r.map((cell, i) => `<div style="font-size:14px;font-weight:${i === 0 ? 700 : 500};color:${i === 0 ? C.ink : C.ink2};text-align:${i === r.length - 1 ? 'right' : 'left'}">${esc(cell)}</div>`).join('')}
    </div>`).join('')}
  </div>`,
});

const uiModules = () => appShell({
  nav: 'Business settings',
  body: `<div style="display:flex;flex-direction:column;gap:16px">
    <div style="padding:18px 20px;border-radius:16px;background:#fff;border:1px solid ${C.line}">
      <div style="font-size:16px;font-weight:800;letter-spacing:-.02em">Modules</div>
      <div style="font-size:13.5px;color:${C.ink3};margin-top:5px">Switch on only what you use — hidden modules disappear from everyone’s menu.</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px">
        ${MODULES.map((m, i) => `<div style="display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:12px;background:${i < 8 ? '#e8f4ef' : '#f6f9f7'};border:1px solid ${i < 8 ? 'rgba(17,122,92,.25)' : C.line}">
          <div style="width:34px;height:20px;border-radius:999px;background:${i < 8 ? C.green : '#cbd7d0'};position:relative;flex:none">
            <div style="position:absolute;top:2.5px;${i < 8 ? 'right:2.5px' : 'left:2.5px'};width:15px;height:15px;border-radius:50%;background:#fff"></div></div>
          <div style="font-size:13.5px;font-weight:700;color:${i < 8 ? C.ink : C.ink3}">${esc(m.label)}</div></div>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="padding:18px 20px;border-radius:16px;background:#fff;border:1px solid ${C.line}">
        <div style="font-size:15px;font-weight:800;letter-spacing:-.02em;margin-bottom:12px">Workflow stages</div>
        ${TEMPLATES[1].stages.map((s, i) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0">
          <div style="width:22px;height:22px;border-radius:50%;background:${i === 0 ? C.green : '#e8f4ef'};color:${i === 0 ? '#fff' : C.green};display:grid;place-items:center;font-size:11px;font-weight:800">${i + 1}</div>
          <div style="font-size:14px;font-weight:600">${esc(s)}</div></div>`).join('')}
      </div>
      <div style="padding:18px 20px;border-radius:16px;background:#fff;border:1px solid ${C.line}">
        <div style="font-size:15px;font-weight:800;letter-spacing:-.02em;margin-bottom:12px">Custom fields</div>
        ${[['Wood type', 'Dropdown'], ['Finish', 'Dropdown'], ['Delivery date', 'Date'], ['Advance paid', 'Currency'], ['Fitting required', 'Yes / no']].map((f) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid ${C.line}">
          <div style="flex:1;font-size:14px;font-weight:600">${esc(f[0])}</div>
          <div style="padding:3px 10px;border-radius:999px;background:#f3f7f5;border:1px solid ${C.line};font-size:11.5px;font-weight:700;color:${C.ink3}">${esc(f[1])}</div></div>`).join('')}
      </div>
    </div>
  </div>`,
});

const uiMobile = () => {
  const w = 390, h = 780;
  return `<div style="width:${w}px;height:${h}px;background:#f3f7f5;font-family:PJS,sans-serif;display:flex;flex-direction:column">
    <div style="padding:26px 22px 14px;background:#fff;border-bottom:1px solid ${C.line}">
      <div style="display:flex;align-items:center;gap:10px">
        ${markSvg({ size: 30 })}
        <div style="flex:1"><div style="font-size:12px;font-weight:600;color:${C.ink3}">${esc(DEMO.business)}</div>
        <div style="font-size:19px;font-weight:800;letter-spacing:-.025em">Overview</div></div>
        <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,${C.greenLight},${C.greenDark});display:grid;place-items:center;color:#fff;font-weight:800;font-size:12px">BA</div>
      </div>
    </div>
    <div style="flex:1;padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="padding:16px;border-radius:18px;background:linear-gradient(135deg,${C.greenDark},${C.green});color:#fff">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.8">Outstanding</div>
        <div style="font-size:30px;font-weight:800;letter-spacing:-.03em;margin-top:6px">Rs 184,500</div>
        <div style="font-size:12.5px;opacity:.85;margin-top:6px">Collected today Rs 42,300</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${[['New orders', '12'], ['Due today', '5'], ['Overdue', '3'], ['In progress', '18']].map((k) => `<div style="padding:14px;border-radius:16px;background:#fff;border:1px solid ${C.line}">
          <div style="font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.ink3}">${esc(k[0])}</div>
          <div style="font-size:25px;font-weight:800;letter-spacing:-.03em;margin-top:6px">${esc(k[1])}</div></div>`).join('')}
      </div>
      <div style="padding:15px;border-radius:18px;background:#fff;border:1px solid ${C.line};flex:1">
        <div style="font-size:14px;font-weight:800;letter-spacing:-.02em;margin-bottom:10px">Recent activity</div>
        ${DEMO.activity.map((a) => `<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid ${C.line}">
          <span class="dot" style="margin-top:6px"></span>
          <div style="flex:1"><div style="font-size:13.5px;font-weight:700">${esc(a[0])}</div>
          <div style="font-size:12.5px;color:${C.ink3};margin-top:2px">${esc(a[1])}</div></div>
          <div style="font-size:11.5px;color:${C.ink4};white-space:nowrap">${esc(a[2])}</div></div>`).join('')}
      </div>
    </div>
    <div style="display:flex;padding:9px 0 14px;background:#fff;border-top:1px solid ${C.line}">
      ${['Overview', 'Orders', 'Customers', 'Payments', 'More'].map((t, i) => `<div style="flex:1;text-align:center;font-size:10.5px;font-weight:${i === 0 ? 800 : 600};color:${i === 0 ? C.green : C.ink4}">
        <div style="width:20px;height:20px;border-radius:6px;margin:0 auto 4px;background:${i === 0 ? C.green : '#dfe9e4'}"></div>${esc(t)}</div>`).join('')}
    </div>
  </div>`;
};

/* device frames ---------------------------------------------------- */

function browserFrame(inner, { w = 1180, h = 760, url = `${CONTACT.website}/overview`, chrome = true } = {}) {
  const bar = chrome ? `<div style="height:42px;background:#eef3f0;display:flex;align-items:center;padding:0 16px;gap:8px;border-bottom:1px solid rgba(14,26,22,.08)">
      <div style="width:9px;height:9px;border-radius:50%;background:#f0655a"></div>
      <div style="width:9px;height:9px;border-radius:50%;background:#f2bf4f"></div>
      <div style="width:9px;height:9px;border-radius:50%;background:#5fcf7d"></div>
      <div style="flex:1;margin:0 10px;height:22px;border-radius:6px;background:#fff;display:flex;align-items:center;padding:0 10px;font-size:11px;color:${C.ink3};font-weight:600">${esc(url)}</div>
    </div>` : '';
  const total = h + (chrome ? 42 : 0);
  return `<div class="fit" data-w="${w}" data-h="${total}" style="width:${w}px;height:${total}px;border-radius:20px;overflow:hidden;background:#fff;
      box-shadow:0 40px 80px -34px rgba(10,23,18,.55),0 0 0 1px rgba(14,26,22,.08);" data-clip="1">
    ${bar}
    <div style="width:${w}px;height:${h}px;overflow:hidden" data-clip="1">${inner}</div>
  </div>`;
}

function phoneFrame(inner, { w = 390, h = 780, chrome = true } = {}) {
  const pad = 11;
  const totalW = w + pad * 2, totalH = h + pad * 2;
  return `<div class="fit" data-w="${totalW}" data-h="${totalH}" style="width:${totalW}px;height:${totalH}px;border-radius:46px;
      padding:${pad}px;background:linear-gradient(160deg,#2b3a33,#101a15);
      box-shadow:0 46px 90px -36px rgba(10,23,18,.65),0 0 0 1px rgba(255,255,255,.10);" data-clip="1">
    <div style="width:${w}px;height:${h}px;border-radius:35px;overflow:hidden;position:relative" data-clip="1">
      ${inner}
      ${chrome ? `<div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);width:86px;height:22px;border-radius:999px;background:#101a15"></div>` : ''}
    </div></div>`;
}

/** A box that scales its `.fit` children down until they fit. */
const fitbox = (content, { row = false, gap = 40, align = 'center', justify = 'center', flex = '1 1 0', extra = '' } = {}) =>
  `<div class="fitbox" style="flex:${flex};min-height:0;min-width:0;overflow:hidden;display:flex;
    flex-direction:${row ? 'row' : 'column'};align-items:${align};justify-content:${justify};gap:${gap}px;${extra}">${content}</div>`;

/** Wrap arbitrary (non-device) artwork so the same auto-fit applies to it. */
const fitArt = (content, w = 720, h = 620) =>
  `<div class="fit" data-w="${w}" data-h="${h}" style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center">${content}</div>`;

/* ------------------------------------------------------------------ */
/* composition helpers                                                 */
/* ------------------------------------------------------------------ */

const bgLight = `<div class="wrap" data-bg="#ffffff" style="background:linear-gradient(180deg,#ffffff 0%,${C.canvas} 100%)">
  <div class="grid"></div>
  <div class="glow" style="width:720px;height:720px;top:-320px;right:-240px;background:rgba(17,122,92,.20)"></div>
  <div class="glow" style="width:520px;height:520px;bottom:-260px;left:-200px;background:rgba(192,138,51,.14)"></div>`;

const bgDark = `<div class="wrap onDark" data-bg="${C.night}" style="background:radial-gradient(1200px 800px at 78% 8%,${C.night3} 0%,${C.night} 52%,#060f0c 100%);color:#fff">
  <div class="grid" style="opacity:.35;background-image:linear-gradient(rgba(143,224,192,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(143,224,192,.06) 1px,transparent 1px)"></div>
  <div class="glow" style="width:760px;height:760px;top:-300px;right:-260px;background:rgba(17,122,92,.34)"></div>
  <div class="glow" style="width:520px;height:520px;bottom:-260px;left:-220px;background:rgba(192,138,51,.16)"></div>`;

const bgGreen = `<div class="wrap" data-bg="${C.green}" style="background:linear-gradient(135deg,${C.greenDark} 0%,${C.green} 58%,${C.greenLight} 100%);color:#fff">
  <div class="grid" style="opacity:.30;background-image:linear-gradient(rgba(255,255,255,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.10) 1px,transparent 1px)"></div>
  <div class="glow" style="width:640px;height:640px;bottom:-280px;right:-180px;background:rgba(192,138,51,.30)"></div>`;

const foot = (dark = false, scale = 1) => `<div style="display:flex;align-items:center;gap:18px">
  ${logoLockup({ size: 42 * scale, color: dark ? '#ffffff' : C.ink, weight: 800 })}
  <div style="flex:1"></div>
  <div class="url" style="font-size:${17 * scale}px;color:${dark ? '#8fe0c0' : C.green}">${esc(CONTACT.website)}</div>
</div>`;

/* ------------------------------------------------------------------ */
/* jobs                                                                */
/* ------------------------------------------------------------------ */

const jobs = [];
const job = (dir, name, w, h, html) => jobs.push({ dir, name, w, h, html });

/* ---- 05-brand ---- */

job('05-brand', 'brand-board.png', 2400, 1500, page(`${bgLight}
  <div style="position:relative;padding:78px 88px;height:100%;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:26px">
      ${logoLockup({ size: 92, color: C.ink, weight: 800 })}
      <div style="flex:1"></div>
      <div style="text-align:right">
        <div class="kicker">Brand board</div>
        <div style="font-size:26px;font-weight:700;color:${C.ink2};margin-top:6px">${esc(BRAND.tagline)}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1.05fr 1fr;gap:46px;margin-top:56px;flex:1">
      <div style="display:flex;flex-direction:column;gap:26px">
        <div class="card" style="padding:44px;display:flex;align-items:center;gap:40px">
          ${markSvg({ size: 190 })}
          <div>
            <div style="font-size:30px;font-weight:800;letter-spacing:-.03em">Primary mark</div>
            <div style="font-size:19px;color:${C.ink2};margin-top:10px;line-height:1.45">Three ascending modules inside a tile — one platform, assembled from the parts each business needs. The gold point marks the module you add next.</div>
          </div>
        </div>
        <div class="card" style="padding:44px;display:flex;gap:56px;align-items:center">
          ${markSvg({ size: 96, tile: false, mono: C.ink })}
          ${markSvg({ size: 96, tile: true })}
          ${markSvg({ size: 96, tile: false, mono: '#ffffff' })}
          <div style="font-size:18px;color:${C.ink2};line-height:1.5">Mono · primary · reversed<br><span style="color:${C.ink3}">Keep clear space ≥ 25% of the mark on every side.</span></div>
        </div>
        <div class="card" style="padding:44px">
          <div style="font-size:24px;font-weight:800;letter-spacing:-.02em">Palette</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:22px">
            ${[['Bizora Green', C.green, '#fff'], ['Green Deep', C.greenDark, '#fff'], ['Bizora Gold', C.gold, C.ink], ['Ink', C.ink, '#fff'], ['Canvas', C.canvas, C.ink], ['Surface', C.surface, C.ink], ['Line', C.line, C.ink], ['Night', C.night, '#fff']]
              .map(([n, hex, fg]) => `<div style="border-radius:14px;overflow:hidden;border:1px solid ${C.line}">
                <div style="height:88px;background:${hex};display:flex;align-items:flex-end;padding:12px">
                  <div style="font-size:14px;font-weight:800;color:${fg};letter-spacing:-.01em">${esc(n)}</div></div>
                <div style="padding:9px 12px;background:#fff;font-size:14px;font-weight:700;color:${C.ink2}">${esc(hex)}</div></div>`).join('')}
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:26px">
        <div class="card" style="padding:44px;flex:1">
          <div style="font-size:24px;font-weight:800;letter-spacing:-.02em">Type</div>
          <div style="font-size:74px;font-weight:800;letter-spacing:-.035em;margin-top:20px;line-height:1">Aa Bb Cc</div>
          <div style="font-size:21px;color:${C.ink2};margin-top:14px;line-height:1.5">Plus Jakarta Sans — 800 for headlines, 600–500 for body. Tight tracking (−0.03em) on display sizes, generous line height (1.5) in paragraphs.</div>
          <div class="rule" style="margin:28px 0"></div>
          <div style="font-size:24px;font-weight:800;letter-spacing:-.02em">Voice</div>
          <div style="display:flex;flex-direction:column;gap:11px;margin-top:18px">
            ${[['Plain before clever', 'Say what the product does, in the order an owner would ask.'], ['Trade-neutral', 'Never tailor-first. Templates adapt to the business; the brand does not.'], ['Honest by default', 'If a capability is not shipped, it is not in the ad.'], ['Warm, not corporate', 'Owners, not enterprises. Short sentences, real nouns.']]
              .map(([t, d]) => `<div class="tick"><span class="box" style="background:rgba(192,138,51,.16);color:${C.gold}">&#9679;</span>
                <div><div style="font-size:19px;font-weight:800;letter-spacing:-.02em">${esc(t)}</div>
                <div style="font-size:17px;color:${C.ink2};margin-top:3px;line-height:1.45">${esc(d)}</div></div></div>`).join('')}
          </div>
        </div>
        <div class="card" style="padding:44px;background:${C.night};border-color:transparent;color:#fff">
          <div style="font-size:24px;font-weight:800;letter-spacing:-.02em;color:#fff">Never</div>
          <div style="display:flex;flex-direction:column;gap:12px;margin-top:18px">
            ${['Describe Bizora as a tailor-only app.', 'Use stitching, measuring tape or clothing imagery as the brand identity.', 'Invent testimonials, statistics or integrations.', 'Stretch, outline or recolour the mark outside this palette.']
              .map((t) => `<div style="display:flex;gap:13px;font-size:18px;color:#c9ded4;line-height:1.45">
                <span style="color:#ff8a7a;font-weight:800">&#10007;</span><span>${esc(t)}</span></div>`).join('')}
          </div>
        </div>
      </div>
    </div>
    <div style="margin-top:34px">${foot(false, 1.15)}</div>
  </div>
</div>`));

/* ---- 02-social ---- */

const adLight = ({ kicker, headline, sub, chips = [], cta = CONTACT.cta, ui, uiScale = 0.42, w = 1080, h = 1080, dark = false }) => {
  const pad = Math.round(w * 0.062);
  const fs = (n) => Math.round(n * (w / 1080));
  return `${dark ? bgDark : bgLight}
  <div style="position:relative;padding:${pad}px;height:100%;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:16px">
      ${logoLockup({ size: fs(54), color: dark ? '#fff' : C.ink })}
      <div style="flex:1"></div>
      <div class="eyebrow-pill ${dark ? 'dark' : ''}">${esc(kicker)}</div>
    </div>
    <div style="margin-top:${fs(38)}px;max-width:${fs(880)}px">
      <h1 style="font-size:${fs(72)}px;color:${dark ? '#fff' : C.ink}">${esc(headline)}</h1>
      <div class="sub" style="font-size:${fs(25)}px;margin-top:${fs(20)}px;max-width:${fs(830)}px;${dark ? 'color:#a9c4b8' : ''}">${esc(sub)}</div>
    </div>
    ${chips.length ? `<div style="display:flex;flex-wrap:wrap;gap:${fs(12)}px;margin-top:${fs(28)}px">
      ${chips.map((c) => `<div class="chip" style="font-size:${fs(17)}px;padding:${fs(10)}px ${fs(18)}px;${dark ? 'background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#d8ebe1' : ''}"><span class="dot"></span>${esc(c)}</div>`).join('')}
    </div>` : ''}
    ${fitbox(ui, { align: 'flex-end', gap: 0, extra: `padding-top:${fs(26)}px` })}
    <div style="display:flex;align-items:center;gap:${fs(22)}px;margin-top:${fs(30)}px">
      <div class="cta" style="font-size:${fs(22)}px">${esc(cta)}</div>
      <div class="url" style="font-size:${fs(21)}px;color:${dark ? '#8fe0c0' : C.green}">${esc(CONTACT.website)}</div>
    </div>
  </div>`;
};

job('02-social', 'ad-01-organise.png', 1080, 1080, page(adLight({
  kicker: 'Bizora · Business platform',
  headline: COPY.ads[0].headline,
  sub: COPY.ads[0].primary,
  chips: ['Customers', 'Orders & jobs', 'Payments', 'Inventory', 'Accounting'],
  ui: browserFrame(uiDashboard(), { scale: 0.46 }),
})));

job('02-social', 'ad-02-configure.png', 1080, 1080, page(adLight({
  kicker: 'Configured for your trade',
  headline: COPY.ads[1].headline,
  sub: COPY.ads[1].primary,
  chips: TEMPLATES.slice(0, 5).map((t) => t.name),
  ui: browserFrame(uiModules(), { scale: 0.46 }),
})));

job('02-social', 'ad-03-control.png', 1080, 1080, page(adLight({
  kicker: 'Daily clarity',
  headline: COPY.ads[2].headline,
  sub: COPY.ads[2].primary,
  chips: WIDGETS,
  dark: true,
  ui: browserFrame(uiDashboard(true), { scale: 0.46 }),
})));

job('02-social', 'ad-04-modules.png', 1080, 1080, page(`${bgDark}
  <div style="position:relative;padding:64px;height:100%;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:16px">
      ${logoLockup({ size: 54, color: '#fff' })}
      <div style="flex:1"></div>
      <div class="eyebrow-pill dark">Switch on what you use</div>
    </div>
    <h1 style="font-size:64px;color:#fff;margin-top:34px;max-width:900px">Twelve modules.<br>One workspace.</h1>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:36px">
      ${MODULES.map((m) => `<div style="padding:17px 19px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)">
        <div style="display:flex;align-items:center;gap:9px">
          <span class="dot gold"></span>
          <div style="font-size:19px;font-weight:800;letter-spacing:-.02em;color:#fff">${esc(m.label)}</div></div>
        <div style="font-size:14.5px;color:#a9c4b8;margin-top:8px;line-height:1.42">${esc(m.line)}</div></div>`).join('')}
    </div>
    <div style="flex:1"></div>
    <div style="display:flex;align-items:center;gap:22px">
      <div class="cta gold">${esc(CONTACT.cta)}</div>
      <div class="url" style="font-size:20px;color:#8fe0c0">${esc(CONTACT.website)}</div>
    </div>
  </div>
</div>`));

job('02-social', 'ad-05-industries.png', 1080, 1080, page(`${bgGreen}
  <div style="position:relative;padding:64px;height:100%;display:flex;flex-direction:column;color:#fff">
    <div style="display:flex;align-items:center;gap:16px">
      ${logoLockup({ size: 54, color: '#fff' })}
      <div style="flex:1"></div>
      <div class="eyebrow-pill dark" style="color:#ffffff">One platform · many trades</div>
    </div>
    <h1 style="font-size:70px;color:#fff;margin-top:40px;max-width:900px">Built for the business you actually run.</h1>
    <div style="display:flex;flex-direction:column;gap:14px;margin-top:38px">
      ${TEMPLATES.slice(0, 5).map((t) => `<div style="display:flex;align-items:center;gap:18px;padding:18px 22px;border-radius:16px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18)">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.90);display:grid;place-items:center;color:${C.greenDark};font-weight:800;font-size:17px">${esc(t.name.slice(0, 2).toUpperCase())}</div>
        <div style="flex:1">
          <div style="font-size:23px;font-weight:800;letter-spacing:-.02em">${esc(t.name)}</div>
          <div style="font-size:15px;opacity:.88;margin-top:3px">${esc(t.blurb)}</div></div>
        <div style="font-size:13.5px;font-weight:700;opacity:.85;text-align:right;max-width:210px">${esc(t.stages.slice(0, 4).join(' → '))}</div>
      </div>`).join('')}
      <div style="display:flex;align-items:center;gap:18px;padding:18px 22px;border-radius:16px;background:rgba(6,20,14,.30);border:1px dashed rgba(255,255,255,.35)">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.20);display:grid;place-items:center;font-weight:800;font-size:17px">＋</div>
        <div style="flex:1"><div style="font-size:23px;font-weight:800;letter-spacing:-.02em">Your trade next</div>
        <div style="font-size:15px;opacity:.88;margin-top:3px">New business types are configured on the platform — not built from scratch.</div></div>
      </div>
    </div>
    <div style="flex:1"></div>
    <div style="display:flex;align-items:center;gap:22px">
      <div class="cta gold">${esc(CONTACT.cta)}</div>
      <div class="url" style="font-size:20px;color:#fff;opacity:.92">${esc(CONTACT.website)}</div>
    </div>
  </div>
</div>`));

/* story / reel covers */
const storyJob = (name, { kicker, headline, sub, ui, chips = [], dark = true }) => job('02-social', name, 1080, 1920, page(`${dark ? bgDark : bgLight}
  <div style="position:relative;padding:78px 66px;height:100%;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:18px">
      ${logoLockup({ size: 62, color: dark ? '#fff' : C.ink })}
      <div style="flex:1"></div>
      <div class="eyebrow-pill ${dark ? 'dark' : ''}">${esc(kicker)}</div>
    </div>
    <h1 style="font-size:86px;margin-top:56px;color:${dark ? '#fff' : C.ink}">${esc(headline)}</h1>
    <div class="sub" style="font-size:30px;margin-top:26px;line-height:1.45;${dark ? 'color:#a9c4b8' : ''}">${esc(sub)}</div>
    ${chips.length ? `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:32px">
      ${chips.map((c) => `<div class="chip" style="font-size:20px;padding:12px 20px;${dark ? 'background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#d8ebe1' : ''}"><span class="dot"></span>${esc(c)}</div>`).join('')}
    </div>` : ''}
    ${fitbox(ui, { gap: 0, extra: 'padding:40px 0' })}
    <div class="cta" style="font-size:26px;align-self:flex-start">${esc(CONTACT.cta)}</div>
    <div class="url" style="font-size:24px;margin-top:18px;color:${dark ? '#8fe0c0' : C.green}">${esc(CONTACT.website)}</div>
  </div>
</div>`));

storyJob('story-01-organise.png', {
  kicker: 'Bizora', headline: 'Three places.\nOne business.',
  sub: 'Orders in a register. Updates in a chat thread. Money in a diary. Bizora gathers them into one workspace.',
  ui: phoneFrame(uiMobile(), { scale: 1.02 }),
});

storyJob('story-02-steps.png', {
  kicker: 'Onboarding', headline: 'Live in three steps.',
  sub: 'Two of them are ours.',
  dark: false,
  ui: fitArt(`<div style="display:flex;flex-direction:column;gap:20px;width:100%">
    ${COPY.steps.map((s) => `<div class="card" style="padding:30px 32px;display:flex;gap:24px;align-items:flex-start">
      <div class="num" style="font-size:44px">${esc(s.n)}</div>
      <div><div style="font-size:29px;font-weight:800;letter-spacing:-.025em">${esc(s.title)}</div>
      <div style="font-size:20px;color:${C.ink2};margin-top:8px;line-height:1.45">${esc(s.body)}</div></div></div>`).join('')}
  </div>`, 860, 620),
});

storyJob('story-03-proof.png', {
  kicker: 'Every day', headline: 'Six numbers\nthat run\nyour day.',
  sub: 'New · Due today · Overdue · In progress · Outstanding · Collected today — reported in your business timezone.',
  ui: fitArt(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;width:100%">
    ${[...DEMO.dashboard.kpis.map((k) => [k.label, k.value]), ...DEMO.dashboard.money.map((m) => [m.label, 'Rs ' + m.value])]
      .map(([l, v], i) => `<div style="padding:${i < 2 ? 34 : 34}px 28px;border-radius:22px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14)">
        <div style="font-size:17px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8fe0c0">${esc(l)}</div>
        <div style="font-size:52px;font-weight:800;letter-spacing:-.03em;color:#fff;margin-top:10px">${esc(v)}</div></div>`).join('')}
  </div>`, 860, 620),
});

/* facebook / linkedin / youtube */
job('02-social', 'fb-feed-01.png', 1200, 630, page(`${bgLight}
  <div style="position:relative;height:100%;display:flex;padding:52px 56px;gap:44px">
    <div style="flex:1;display:flex;flex-direction:column">
      ${logoLockup({ size: 48, color: C.ink })}
      <h1 style="font-size:52px;margin-top:34px;max-width:560px">${esc(COPY.ads[0].headline)}</h1>
      <div class="sub" style="font-size:20px;margin-top:18px;max-width:540px">${esc(COPY.ads[0].primary)}</div>
      <div style="flex:1"></div>
      <div style="display:flex;align-items:center;gap:20px">
        <div class="cta small" style="font-size:17px">${esc(CONTACT.cta)}</div>
        <div class="url" style="font-size:17px;color:${C.green}">${esc(CONTACT.website)}</div>
      </div>
    </div>
    ${fitbox(browserFrame(uiDashboard()), { gap: 0 })}
  </div>
</div>`));

job('02-social', 'fb-feed-02.png', 1200, 630, page(`${bgDark}
  <div style="position:relative;height:100%;display:flex;padding:52px 56px;gap:44px;align-items:center">
    <div style="flex:1;display:flex;flex-direction:column">
      <div class="eyebrow-pill dark" style="align-self:flex-start">Scattered is expensive</div>
      <h1 style="font-size:50px;margin-top:26px;color:#fff;max-width:560px">Not disorganised.<br>Just scattered.</h1>
      <div style="display:flex;flex-direction:column;gap:11px;margin-top:26px">
        ${COPY.problem.items.map((p) => `<div style="display:flex;gap:13px;font-size:18px;color:#c9ded4;line-height:1.4">
          <span style="color:#8fe0c0;font-weight:800">&#8594;</span><span>${esc(p)}</span></div>`).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:20px;margin-top:30px">
        <div class="cta gold small" style="font-size:17px">${esc(CONTACT.cta)}</div>
        <div class="url" style="font-size:17px;color:#8fe0c0">${esc(CONTACT.website)}</div>
      </div>
    </div>
    ${fitbox(browserFrame(uiOrders()), { gap: 0 })}
  </div>
</div>`));

job('02-social', 'linkedin-post.png', 1200, 627, page(`${bgLight}
  <div style="position:relative;height:100%;display:flex;flex-direction:column;padding:50px 58px">
    <div style="display:flex;align-items:center;gap:16px">
      ${logoLockup({ size: 46, color: C.ink })}
      <div style="flex:1"></div>
      <div class="kicker">Multi-business management platform</div>
    </div>
    <div style="display:flex;gap:40px;margin-top:34px;flex:1">
      <div style="flex:1">
        <h1 style="font-size:46px;max-width:520px">${esc(COPY.hero.headline)}</h1>
        <div class="sub" style="font-size:18px;margin-top:16px;max-width:520px">${esc(COPY.valueProps[1].body)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:20px">
          ${TEMPLATES.slice(0, 5).map((t) => `<div class="chip" style="font-size:15px;padding:8px 15px">${esc(t.name)}</div>`).join('')}
        </div>
      </div>
      ${fitbox(browserFrame(uiModules()), { gap: 0 })}
    </div>
    <div style="display:flex;align-items:center;gap:20px">
      <div class="cta small" style="font-size:16px">${esc(CONTACT.cta)}</div>
      <div class="url" style="font-size:16px;color:${C.green}">${esc(CONTACT.website)}</div>
    </div>
  </div>
</div>`));

job('02-social', 'youtube-thumbnail.png', 1280, 720, page(`${bgDark}
  <div style="position:relative;height:100%;display:flex;align-items:center;padding:60px 66px;gap:50px">
    <div style="flex:1">
      ${logoLockup({ size: 58, color: '#fff' })}
      <h1 style="font-size:74px;color:#fff;margin-top:34px">One platform.<br>Every business.</h1>
      <div class="sub" style="font-size:25px;margin-top:22px;color:#a9c4b8;max-width:620px">See how Bizora is configured for your trade — in 60 seconds.</div>
      <div class="cta gold" style="margin-top:34px">${esc(CONTACT.cta)}</div>
    </div>
    ${fitbox(phoneFrame(uiMobile()), { gap: 0, flex: '0 0 34%', extra: 'align-self:stretch' })}
  </div>
</div>`));

job('02-social', 'banner-linkedin.png', 1584, 396, page(`${bgGreen}
  <div style="position:relative;height:100%;display:flex;align-items:center;padding:0 64px;gap:56px">
    <div style="flex:1">
      <h1 style="font-size:56px;color:#fff">${esc(COPY.hero.headline)}</h1>
      <div style="font-size:22px;color:rgba(255,255,255,.90);margin-top:14px">${esc(BRAND.tagline)} · Web dashboard & Android app</div>
    </div>
    <div style="display:flex;gap:14px">
      ${TEMPLATES.slice(0, 4).map((t) => `<div style="padding:14px 22px;border-radius:14px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);color:#fff;font-size:20px;font-weight:700">${esc(t.name)}</div>`).join('')}
    </div>
    <div>${logoLockup({ size: 66, color: '#fff' })}</div>
  </div>
</div>`));

job('02-social', 'whatsapp-status.png', 1080, 1920, page(`${bgGreen}
  <div style="position:relative;height:100%;display:flex;flex-direction:column;padding:96px 76px;color:#fff">
    ${logoLockup({ size: 74, color: '#fff' })}
    <h1 style="font-size:96px;margin-top:70px">Apna business<br>ek hi jagah.</h1>
    <div style="font-size:34px;margin-top:34px;line-height:1.5;opacity:.95">Customers, orders, payments aur accounts — ek organised workspace mein. Web aur Android dono par.</div>
    <div style="display:flex;flex-direction:column;gap:18px;margin-top:56px">
      ${['Har customer aur job ka ek record', 'Har job stage by stage', 'Due, overdue aur collected today', 'Team ko roles ke sath access', 'Templates: Tailor · Furniture · Carpenter · Auto Workshop · Printing']
        .map((t) => `<div style="display:flex;gap:18px;align-items:flex-start">
          <span style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.22);display:grid;place-items:center;font-weight:800;flex:none;margin-top:3px">&#10003;</span>
          <div style="font-size:31px;font-weight:600;line-height:1.45">${esc(t)}</div></div>`).join('')}
    </div>
    <div style="flex:1"></div>
    <div style="padding:34px 40px;border-radius:22px;background:rgba(6,20,14,.34);border:1px solid rgba(255,255,255,.25)">
      <div style="font-size:30px;font-weight:800">Free demo ke liye message karein</div>
      <div style="font-size:27px;margin-top:10px;opacity:.95">${esc(CONTACT.whatsapp)} · ${esc(CONTACT.website)}</div>
    </div>
  </div>
</div>`));

/* industry campaign cut-downs */
for (const t of [TEMPLATES[3], TEMPLATES[1], TEMPLATES[4], TEMPLATES[2]]) {
  job('02-social', `industry-${t.key}.png`, 1080, 1080, page(`${bgLight}
  <div style="position:relative;padding:62px;height:100%;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:16px">
      ${logoLockup({ size: 52, color: C.ink })}
      <div style="flex:1"></div>
      <div class="eyebrow-pill">${esc(t.name)} businesses</div>
    </div>
    <h1 style="font-size:66px;margin-top:36px;max-width:900px">${esc(t.blurb)}</h1>
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:30px">
      ${t.stages.map((s, i) => `<div style="display:flex;align-items:center;gap:12px">
        ${i ? `<span style="color:${C.ink4};font-weight:800">&#8594;</span>` : ''}
        <div style="padding:11px 19px;border-radius:999px;background:#fff;border:1px solid ${C.line};font-size:18px;font-weight:700;color:${C.ink2}">${esc(s)}</div></div>`).join('')}
    </div>
    ${fitbox(browserFrame(uiOrders()), { gap: 0, extra: 'padding-top:26px' })}
    <div style="display:flex;align-items:center;gap:22px;padding:24px 28px;border-radius:18px;background:${C.night};margin-top:26px">
      ${logoLockup({ size: 46, color: '#fff' })}
      <div style="flex:1;font-size:19px;color:#c9ded4">${esc(t.name)} is one of the templates configured on Bizora — the same platform runs every trade.</div>
      <div class="cta small">${esc(CONTACT.ctaShort)}</div>
    </div>
  </div>
</div>`));
}

/* ---- 03-marketplace ---- */

const listingShell = (n, total, title, body, dark = false) => `${dark ? bgGreen : bgLight}
  <div style="position:relative;padding:88px;height:100%;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:18px">
      ${logoLockup({ size: 64, color: dark ? '#fff' : C.ink })}
      <div style="flex:1"></div>
      <div style="font-size:22px;font-weight:700;color:${dark ? 'rgba(255,255,255,.8)' : C.ink3}">${n} / ${total}</div>
    </div>
    <div class="kicker" style="font-size:20px;margin-top:52px;color:${dark ? '#FFE9C4' : C.green}">${esc(title.kicker)}</div>
    <h1 style="font-size:${title.size ?? 84}px;margin-top:22px;color:${dark ? '#fff' : C.ink};max-width:1500px">${esc(title.text)}</h1>
    ${title.sub ? `<div class="sub" style="font-size:30px;margin-top:22px;max-width:1400px;${dark ? 'color:rgba(255,255,255,.9)' : ''}">${esc(title.sub)}</div>` : ''}
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:44px 0">${body}</div>
    <div style="display:flex;align-items:center;gap:22px">
      <div class="cta ${dark ? 'gold' : ''}" style="font-size:26px">${esc(CONTACT.cta)}</div>
      <div class="url" style="font-size:24px;color:${dark ? '#fff' : C.green}">${esc(CONTACT.website)}</div>
    </div>
  </div>
</div>`;

job('03-marketplace', 'listing-01-cover.png', 2000, 2000, page(listingShell(1, 8, {
  kicker: 'Bizora — business management platform', text: 'Run your business from one organised workspace.',
  sub: 'Customers, orders, jobs, payments and accounts — configured for the way you already work. Web dashboard and Android app.',
}, fitbox(`${phoneFrame(uiMobile())}${browserFrame(uiDashboard())}`, { row: true, gap: 44 }))));

job('03-marketplace', 'listing-02-problem.png', 2000, 2000, page(listingShell(2, 8, {
  kicker: 'Sound familiar?', text: 'Your business is not disorganised. It is scattered.',
}, `<div style="display:flex;flex-direction:column;gap:34px">
    ${COPY.problem.items.map((p) => `<div style="display:flex;gap:28px;align-items:flex-start;padding:36px 42px;border-radius:24px;background:#fff;border:1px solid ${C.line};box-shadow:0 26px 50px -34px rgba(14,26,22,.4)">
      <span style="width:52px;height:52px;border-radius:16px;background:rgba(180,35,24,.10);color:#b42318;display:grid;place-items:center;font-weight:800;font-size:24px;flex:none">!</span>
      <div style="font-size:40px;font-weight:600;line-height:1.4;color:${C.ink}">${esc(p)}</div></div>`).join('')}
    <div style="padding:36px 42px;border-radius:24px;background:${C.night};color:#fff;font-size:38px;font-weight:700;line-height:1.45">
      Nothing is lost. It is just scattered — and scattered is expensive.</div>
  </div>`)));

job('03-marketplace', 'listing-03-what-you-get.png', 2000, 2000, page(listingShell(3, 8, {
  kicker: 'What you get', text: 'Your workspace, set up for your business.',
}, `<div style="display:grid;grid-template-columns:1fr 1fr;gap:26px">
    ${[['Onboarded on the right template', 'We set your business up on the template that matches your trade.'],
      ['Modules you actually use', 'Switch on only what you need; the rest stay out of the menu.'],
      ['Your stages, your words', 'Workflow stages, item types, payment methods and custom fields — in your language.'],
      ['Your branding on invoices', 'Business name, colours and logo where your customers see them.'],
      ['Team access with limits', 'Invite staff with roles and granular permissions.'],
      ['Web + Android', 'Same workspace on the dashboard and on your phone.']]
      .map(([t, d]) => `<div style="padding:36px 40px;border-radius:24px;background:#fff;border:1px solid ${C.line}">
        <div class="tick" style="gap:18px">${'<span class="box" style="width:38px;height:38px;border-radius:12px;font-size:18px">&#10003;</span>'}
          <div><div style="font-size:35px;font-weight:800;letter-spacing:-.025em">${esc(t)}</div>
          <div style="font-size:27px;color:${C.ink2};margin-top:10px;line-height:1.45">${esc(d)}</div></div></div></div>`).join('')}
  </div>`)));

job('03-marketplace', 'listing-04-modules.png', 2000, 2000, page(listingShell(4, 8, {
  kicker: 'Modules', text: 'Twelve modules. Switch on what you use.',
}, `<div style="display:grid;grid-template-columns:1fr 1fr;gap:22px">
    ${MODULES.map((m) => `<div style="padding:30px 34px;border-radius:22px;background:#fff;border:1px solid ${C.line}">
      <div style="display:flex;align-items:center;gap:14px">
        <span class="dot" style="width:12px;height:12px"></span>
        <div style="font-size:34px;font-weight:800;letter-spacing:-.025em">${esc(m.label)}</div></div>
      <div style="font-size:25px;color:${C.ink2};margin-top:12px;line-height:1.45">${esc(m.line)}</div></div>`).join('')}
  </div>`)));

job('03-marketplace', 'listing-05-templates.png', 2000, 2000, page(listingShell(5, 8, {
  kicker: 'Business templates', text: 'One platform. Many trades.',
  sub: 'Each template sets the terminology, modules, item types and workflow stages a business starts from.',
}, `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
    ${TEMPLATES.map((t) => `<div style="padding:34px 38px;border-radius:24px;background:#fff;border:1px solid ${C.line}">
      <div style="display:flex;align-items:center;gap:16px">
        <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,${C.greenLight},${C.greenDark});color:#fff;display:grid;place-items:center;font-weight:800;font-size:20px;flex:none">${esc(t.name.slice(0, 2).toUpperCase())}</div>
        <div><div style="font-size:36px;font-weight:800;letter-spacing:-.03em">${esc(t.name)}</div>
        <div style="font-size:22px;font-weight:700;color:${C.gold};letter-spacing:.06em;text-transform:uppercase;margin-top:2px">${esc(t.category)}</div></div>
      </div>
      <div style="font-size:25px;color:${C.ink2};margin-top:16px;line-height:1.45">${esc(t.blurb)}</div>
      <div style="font-size:22px;color:${C.ink3};margin-top:16px;line-height:1.5">${esc(t.stages.join(' → '))}</div>
    </div>`).join('')}
  </div>`)));

job('03-marketplace', 'listing-06-screens.png', 2000, 2000, page(listingShell(6, 8, {
  kicker: 'Inside the workspace', text: 'The screens you will use every day.',
}, `<div style="flex:1 1 0;min-height:0;display:flex;flex-direction:column;gap:30px">
    ${fitbox(browserFrame(uiDashboard()), { gap: 0, flex: '1.35 1 0' })}
    ${fitbox(`${browserFrame(uiOrders())}${phoneFrame(uiMobile())}`, { row: true, gap: 30 })}
  </div>`)));

job('03-marketplace', 'listing-07-steps.png', 2000, 2000, page(listingShell(7, 8, {
  kicker: 'How it works', text: 'Three steps. The first two are ours.',
}, `<div style="display:flex;flex-direction:column;gap:30px">
    ${COPY.steps.map((s) => `<div class="card" style="padding:44px 48px;display:flex;gap:36px;align-items:flex-start">
      <div class="num" style="font-size:76px;line-height:.9">${esc(s.n)}</div>
      <div><div style="font-size:48px;font-weight:800;letter-spacing:-.03em">${esc(s.title)}</div>
      <div style="font-size:31px;color:${C.ink2};margin-top:12px;line-height:1.45">${esc(s.body)}</div></div>
    </div>`).join('')}
  </div>`)));

job('03-marketplace', 'listing-08-cta.png', 2000, 2000, page(listingShell(8, 8, {
  kicker: 'Questions before you order?', text: CONTACT.cta,
  sub: 'Tell us what your business does and how work moves through it. We will show you the same screens, set up for your trade — and tell you honestly if Bizora is not the right fit.',
}, `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
    ${COPY.listing.faq.slice(0, 4).map(([q, a]) => `<div style="padding:34px 38px;border-radius:24px;background:#fff;border:1px solid ${C.line};color:${C.ink}">
      <div style="font-size:34px;font-weight:800;letter-spacing:-.025em">${esc(q)}</div>
      <div style="font-size:26px;color:${C.ink2};margin-top:12px;line-height:1.45">${esc(a)}</div></div>`).join('')}
  </div>`, true)));

/* ---- 04-print ---- */

const A4W = mm(210), A4H = mm(297);

const flyerFront = () => `${bgLight}
  <div class="shrink" style="position:relative;width:${A4W}px;min-height:${A4H}px;padding:${mm(12)}px;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:16px">
      ${logoLockup({ size: 46, color: C.ink })}
      <div style="flex:1"></div>
      <div class="kicker" style="font-size:11px">${esc(COPY.eyebrow)}</div>
    </div>

    <div style="margin-top:${mm(8)}px">
      <h1 style="font-size:${mm(11.5)}px;max-width:${mm(150)}px">${esc(COPY.flyer.headline)}</h1>
      <div class="sub" style="font-size:${mm(4.1)}px;margin-top:${mm(3.5)}px;max-width:${mm(150)}px">${esc(COPY.flyer.sub)}</div>
    </div>

    <div style="display:flex;gap:${mm(6)}px;margin-top:${mm(6)}px">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:${mm(3)}px">
        ${COPY.flyer.checklist.map((c) => `<div class="tick">
          ${`<span class="box" style="width:${mm(4.6)}px;height:${mm(4.6)}px;border-radius:${mm(1.4)}px;font-size:${mm(2.6)}px">&#10003;</span>`}
          <div style="font-size:${mm(3.6)}px;font-weight:600;line-height:1.4;color:${C.ink2}">${esc(c)}</div></div>`).join('')}
      </div>
      <div style="flex:0 0 ${mm(58)}px;min-width:0;border-radius:${mm(4)}px;background:${C.night};color:#fff;padding:${mm(5)}px" data-bg2="1">
        <div style="font-size:${mm(4.2)}px;font-weight:800;letter-spacing:-.02em">${esc(COPY.flyer.sidePanelTitle)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:${mm(3)}px;margin-top:${mm(5)}px">
          ${[...DEMO.dashboard.kpis.map((k) => [k.label, k.value]), ...DEMO.dashboard.money.map((m) => [m.label, m.value])]
            .map(([l, v]) => `<div style="padding:${mm(3.4)}px;border-radius:${mm(2.2)}px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13)">
              <div style="font-size:${mm(2.9)}px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:#8fe0c0">${esc(l)}</div>
              <div style="font-size:${mm(5.6)}px;font-weight:800;margin-top:${mm(1.4)}px">${esc(v)}</div></div>`).join('')}
        </div>
      </div>
    </div>

    ${fitbox(browserFrame(uiDashboard()), { gap: 0, flex: '1 1 0', extra: `margin-top:${mm(5)}px` })}

    <div style="flex:1"></div>

    <div style="display:flex;align-items:center;gap:${mm(6)}px;margin-top:${mm(5)}px;padding:${mm(5)}px;border-radius:${mm(4)}px;background:linear-gradient(135deg,${C.greenDark},${C.green});color:#fff" data-bg2="1">
      <div style="flex:1">
        <div style="font-size:${mm(6.4)}px;font-weight:800;letter-spacing:-.02em">${esc(CONTACT.cta)}</div>
        <div style="font-size:${mm(3.4)}px;margin-top:${mm(1.6)}px;opacity:.95">Web dashboard · Android app · Configured for your trade</div>
      </div>
      <div style="text-align:right">
        <div class="url" style="font-size:${mm(4.6)}px">${esc(CONTACT.website)}</div>
        <div style="font-size:${mm(3.6)}px;margin-top:${mm(1.4)}px;opacity:.92">${esc(CONTACT.email)}</div>
        <div style="font-size:${mm(3.6)}px;margin-top:${mm(0.8)}px;opacity:.92">${esc(CONTACT.whatsapp)}</div>
      </div>
    </div>
  </div>
</div>`;

const flyerBack = () => `${bgGreen}
  <div class="shrink" style="position:relative;width:${A4W}px;min-height:${A4H}px;padding:${mm(12)}px;display:flex;flex-direction:column;color:#fff">
    <div style="display:flex;align-items:center;gap:16px">
      ${logoLockup({ size: 52, color: '#fff' })}
      <div style="flex:1"></div>
      <div style="font-size:${mm(3.4)}px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.85">${esc(BRAND.tagline)}</div>
    </div>

    <h1 style="font-size:${mm(11)}px;margin-top:${mm(10)}px;max-width:${mm(160)}px">${esc(COPY.flyer.backHeadline)}</h1>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:${mm(5)}px;margin-top:${mm(8)}px">
      ${COPY.valueProps.map((v) => `<div style="padding:${mm(5)}px;border-radius:${mm(3)}px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.22)">
        <div style="font-size:${mm(4.8)}px;font-weight:800;letter-spacing:-.02em">${esc(v.title)}</div>
        <div style="font-size:${mm(3.5)}px;margin-top:${mm(2)}px;line-height:1.45;opacity:.93">${esc(v.body)}</div></div>`).join('')}
    </div>

    <div style="padding:${mm(5.5)}px;border-radius:${mm(3)}px;background:rgba(6,20,14,.28);border:1px solid rgba(255,255,255,.24);margin-top:${mm(6)}px">
      <div style="font-size:${mm(3.2)}px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Business templates</div>
      <div style="display:flex;flex-wrap:wrap;gap:${mm(2.2)}px;margin-top:${mm(3)}px">
        ${TEMPLATES.map((t) => `<div style="padding:${mm(1.8)}px ${mm(3.4)}px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);font-size:${mm(3.6)}px;font-weight:700">${esc(t.name)}</div>`).join('')}
      </div>
      <div style="font-size:${mm(3.3)}px;margin-top:${mm(3)}px;opacity:.9;line-height:1.45">Each template sets the terminology, modules, item types and workflow stages a business starts from. New business types are configured on the platform rather than built from scratch.</div>
    </div>

    <div style="display:flex;gap:${mm(5)}px;margin-top:${mm(7)}px;align-items:center">
      <div style="flex:1">
        ${COPY.steps.map((s) => `<div style="display:flex;gap:${mm(3)}px;align-items:flex-start;padding:${mm(2.4)}px 0;border-bottom:1px solid rgba(255,255,255,.18)">
          <div style="font-size:${mm(5)}px;font-weight:800;color:#ffffff;line-height:1.1">${esc(s.n)}</div>
          <div><div style="font-size:${mm(4.2)}px;font-weight:800;letter-spacing:-.02em">${esc(s.title)}</div>
          <div style="font-size:${mm(3.3)}px;opacity:.9;margin-top:${mm(1)}px;line-height:1.4">${esc(s.body)}</div></div>
        </div>`).join('')}
      </div>
      ${fitbox(phoneFrame(uiMobile()), { gap: 0, flex: `0 0 ${mm(52)}px` })}
    </div>

    <div style="flex:1"></div>
    <div style="display:flex;align-items:center;gap:${mm(6)}px;padding-top:${mm(5)}px;border-top:1px solid rgba(255,255,255,.25)">
      ${logoLockup({ size: 44, color: '#fff' })}
      <div style="flex:1;font-size:${mm(3.5)}px;opacity:.9">${esc(BRAND.promise)}</div>
      <div style="text-align:right;font-size:${mm(4)}px;font-weight:800">${esc(CONTACT.website)}<br><span style="font-weight:600">${esc(CONTACT.email)}</span></div>
    </div>
  </div>
</div>`;

const TRI_W = mm(297), TRI_H = mm(210), PANEL = mm(99);

const brochureOutside = () => `<div class="shrink" style="width:${TRI_W}px;min-height:${TRI_H}px;display:flex;font-family:PJS,sans-serif;background:#fff">
  <!-- left column: inner flap (seen the moment the cover opens) -->
  <div style="width:${PANEL}px;padding:${mm(12)}px;background:${C.night};color:#fff;display:flex;flex-direction:column">
    ${logoLockup({ size: 46, color: '#fff' })}
    <div style="font-size:${mm(6.6)}px;font-weight:800;letter-spacing:-.025em;margin-top:${mm(12)}px">Six numbers<br>that run<br>your day.</div>
    <div style="display:flex;flex-direction:column;gap:${mm(3)}px;margin-top:${mm(8)}px">
      ${WIDGETS.map((w) => `<div style="display:flex;align-items:center;gap:${mm(2.6)}px;padding:${mm(2.6)}px 0;border-bottom:1px solid rgba(255,255,255,.16)">
        <span class="dot gold" style="width:${mm(1.8)}px;height:${mm(1.8)}px"></span>
        <div style="font-size:${mm(4)}px;font-weight:600">${esc(w)}</div></div>`).join('')}
    </div>
    <div style="flex:1"></div>
    <div style="font-size:${mm(3.3)}px;color:#a9c4b8;line-height:1.45">Reported in your business timezone, on the dashboard and the Android app.</div>
  </div>
  <!-- middle column: back cover -->
  <div style="width:${PANEL}px;padding:${mm(12)}px;background:${C.canvas};border-left:1px solid ${C.line};border-right:1px solid ${C.line};display:flex;flex-direction:column">
    <div class="kicker" style="font-size:${mm(3)}px">${esc(COPY.brochure.backHeadline)}</div>
    <div style="font-size:${mm(4.2)}px;font-weight:600;color:${C.ink2};margin-top:${mm(5)}px;line-height:1.5">${esc(COPY.brochure.backBody)}</div>
    <div style="display:flex;flex-direction:column;gap:${mm(3.4)}px;margin-top:${mm(8)}px">
      ${[['Website', CONTACT.website], ['Email', CONTACT.email], ['WhatsApp', CONTACT.whatsapp]].map(([l, v]) => `<div>
        <div style="font-size:${mm(2.8)}px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${C.ink3}">${esc(l)}</div>
        <div style="font-size:${mm(4.6)}px;font-weight:800;letter-spacing:-.02em;margin-top:${mm(1)}px">${esc(v)}</div></div>`).join('')}
    </div>
    <div style="flex:1"></div>
    <div style="padding:${mm(4.5)}px;border-radius:${mm(2.6)}px;background:#fff;border:1px solid ${C.line}">
      <div style="font-size:${mm(3.4)}px;font-weight:700;color:${C.ink2};line-height:1.45">${esc(DEMO.platformBusinesses.length)} sample businesses, one platform — ${esc(TEMPLATES.length)} templates, each with its own terminology, modules and stages.</div>
    </div>
    <div style="margin-top:${mm(6)}px">${logoLockup({ size: 40, color: C.ink })}</div>
  </div>
  <!-- right column: front cover -->
  <div style="width:${PANEL}px;padding:${mm(12)}px;background:linear-gradient(160deg,${C.greenDark} 0%,${C.green} 62%,${C.greenLight} 100%);color:#fff;display:flex;flex-direction:column;position:relative;overflow:hidden">
    <div class="grid" style="opacity:.28;background-image:linear-gradient(rgba(255,255,255,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.12) 1px,transparent 1px)"></div>
    <div class="glow" style="width:${mm(80)}px;height:${mm(80)}px;bottom:${-mm(30)}px;right:${-mm(26)}px;background:rgba(192,138,51,.34)"></div>
    <div style="position:relative">${logoLockup({ size: 54, color: '#fff', tagline: true })}</div>
    <h1 style="font-size:${mm(12.5)}px;margin-top:${mm(26)}px;position:relative">${esc(COPY.brochure.coverHeadline)}</h1>
    <div style="font-size:${mm(4.4)}px;margin-top:${mm(6)}px;line-height:1.5;opacity:.95;position:relative">${esc(COPY.brochure.coverSub)}</div>
    <div style="flex:1"></div>
    <div style="position:relative;padding:${mm(4.5)}px;border-radius:${mm(2.6)}px;background:rgba(6,20,14,.28);border:1px solid rgba(255,255,255,.24)">
      <div style="font-size:${mm(3.9)}px;font-weight:800">${esc(COPY.eyebrow)}</div>
      <div style="font-size:${mm(3.4)}px;margin-top:${mm(1.6)}px;opacity:.92">${esc(CONTACT.website)}</div>
    </div>
  </div>
</div>`;

const brochureInside = () => {
  const P = COPY.brochure.panels;
  const panel = (bg, fg, title, body, extra = '') => `<div style="width:${PANEL}px;padding:${mm(11)}px;background:${bg};color:${fg};display:flex;flex-direction:column;border-right:1px solid ${bg === '#fff' ? C.line : 'rgba(255,255,255,.10)'}">
    ${logoLockup({ size: 38, color: fg === '#fff' ? '#ffffff' : C.ink })}
    <div style="font-size:${mm(6.2)}px;font-weight:800;letter-spacing:-.025em;margin-top:${mm(8)}px;line-height:1.05">${esc(title)}</div>
    <div class="rule" style="height:3px;width:${mm(14)}px;background:${C.gold};margin-top:${mm(4)}px"></div>
    <div style="font-size:${mm(3.6)}px;margin-top:${mm(5)}px;line-height:1.55;color:${fg === '#fff' ? '#c9ded4' : C.ink2}">${esc(body)}</div>
    <div style="flex:1"></div>
    ${extra}
  </div>`;
  return `<div class="shrink" style="width:${TRI_W}px;min-height:${TRI_H}px;display:flex;font-family:PJS,sans-serif;background:#fff">
    ${panel('#fff', C.ink, P.what.title, P.what.body, `
      <div style="display:flex;flex-direction:column;gap:${mm(2.2)}px">
        ${CONFIGURABLE.slice(0, 5).map((c) => `<div class="tick">
          ${`<span class="box" style="width:${mm(3.8)}px;height:${mm(3.8)}px;border-radius:${mm(1.2)}px;font-size:${mm(2.2)}px">&#10003;</span>`}
          <div style="font-size:${mm(3.2)}px;font-weight:700;color:${C.ink}">${esc(c[0])}</div></div>`).join('')}
      </div>
      <div style="font-size:${mm(3)}px;color:${C.ink3};margin-top:${mm(4)}px;padding:${mm(3)}px;border-radius:${mm(2)}px;background:${C.canvas}">Configurable per business — no code, no development project.</div>`)}
    ${panel('#fff', C.ink, P.how.title, P.how.body, `
      <div style="display:flex;flex-direction:column;gap:${mm(2.6)}px">
        ${COPY.steps.map((s) => `<div style="display:flex;gap:${mm(2.6)}px;align-items:flex-start">
          <div style="font-size:${mm(4.2)}px;font-weight:800;color:#8A5F14;line-height:1">${esc(s.n)}</div>
          <div><div style="font-size:${mm(3.6)}px;font-weight:800;letter-spacing:-.02em">${esc(s.title)}</div>
          <div style="font-size:${mm(3)}px;color:${C.ink2};margin-top:${mm(0.8)}px;line-height:1.42">${esc(s.body)}</div></div></div>`).join('')}
      </div>`)}
    ${panel(C.night, '#fff', P.businesses.title, P.businesses.body, `
      <div style="display:flex;flex-wrap:wrap;gap:${mm(1.8)}px">
        ${TEMPLATES.map((t) => `<div style="padding:${mm(1.6)}px ${mm(3)}px;border-radius:999px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);font-size:${mm(3.2)}px;font-weight:700">${esc(t.name)}</div>`).join('')}
      </div>
      <div style="padding:${mm(4)}px;border-radius:${mm(2.4)}px;background:linear-gradient(135deg,${C.greenDark},${C.green});margin-top:${mm(5)}px">
        <div style="font-size:${mm(4.4)}px;font-weight:800">${esc(CONTACT.cta)}</div>
        <div style="font-size:${mm(3.2)}px;margin-top:${mm(1.4)}px;opacity:.92">${esc(CONTACT.website)} · ${esc(CONTACT.email)}</div>
        <div style="font-size:${mm(3.2)}px;margin-top:${mm(0.6)}px;opacity:.92">${esc(CONTACT.whatsapp)}</div>
      </div>`)}
  </div>`;
};

const A3W = mm(297), A3H = mm(420);

const poster = () => `${bgDark}
  <div class="shrink" style="position:relative;width:${A3W}px;min-height:${A3H}px;padding:${mm(18)}px;display:flex;flex-direction:column;color:#fff">
    <div style="display:flex;align-items:center;gap:20px">
      ${logoLockup({ size: 74, color: '#fff', tagline: true })}
      <div style="flex:1"></div>
      <div class="eyebrow-pill dark" style="font-size:${mm(3.4)}px;padding:${mm(2)}px ${mm(4)}px">${esc(COPY.eyebrow)}</div>
    </div>

    <h1 style="font-size:${mm(23)}px;margin-top:${mm(22)}px;max-width:${mm(230)}px">${esc(COPY.hero.headline)}</h1>
    <div class="sub" style="font-size:${mm(6)}px;margin-top:${mm(9)}px;max-width:${mm(215)}px;color:#a9c4b8">${esc(COPY.hero.sub)}</div>

    <div style="display:flex;gap:${mm(7)}px;margin-top:${mm(16)}px;flex:1 1 0;min-height:0">
      ${fitbox(browserFrame(uiDashboard()), { gap: 0, flex: '1.15 1 0' })}
      <div style="flex:1;display:flex;flex-direction:column;gap:${mm(5)}px">
        ${COPY.valueProps.map((v) => `<div style="padding:${mm(5)}px;border-radius:${mm(3)}px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13)">
          <div style="font-size:${mm(5.2)}px;font-weight:800;letter-spacing:-.02em">${esc(v.title)}</div>
          <div style="font-size:${mm(3.6)}px;color:#a9c4b8;margin-top:${mm(2)}px;line-height:1.45">${esc(v.body)}</div></div>`).join('')}
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:${mm(3)}px;margin-top:${mm(14)}px">
      ${TEMPLATES.map((t) => `<div style="padding:${mm(2.4)}px ${mm(5)}px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);font-size:${mm(4.4)}px;font-weight:700">${esc(t.name)}</div>`).join('')}
    </div>

    <div style="flex:1"></div>

    <div style="display:flex;align-items:center;gap:${mm(8)}px;padding:${mm(8)}px;border-radius:${mm(4)}px;background:linear-gradient(135deg,${C.greenDark},${C.green});">
      <div style="flex:1">
        <div style="font-size:${mm(11)}px;font-weight:800;letter-spacing:-.03em">${esc(CONTACT.cta)}</div>
        <div style="font-size:${mm(4.4)}px;margin-top:${mm(2)}px;opacity:.93">${esc(CONTACT.website)} · ${esc(CONTACT.email)} · ${esc(CONTACT.whatsapp)}</div>
      </div>
      <div style="text-align:right;font-size:${mm(4.4)}px;font-weight:700;opacity:.93;max-width:${mm(90)}px;line-height:1.45">${esc(COPY.closers[0])}</div>
    </div>
  </div>
</div>`;

const CARD_W = mm(85), CARD_H = mm(55);

const cardFront = () => `<div class="shrink" style="width:${CARD_W}px;min-height:${CARD_H}px;background:linear-gradient(140deg,${C.greenDark},${C.green} 60%,${C.greenLight});color:#fff;padding:${mm(7)}px;display:flex;flex-direction:column;position:relative">
  <div class="grid" style="opacity:.22;background-image:linear-gradient(rgba(255,255,255,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.14) 1px,transparent 1px)"></div>
  <div class="glow" style="width:${mm(40)}px;height:${mm(40)}px;bottom:${-mm(16)}px;right:${-mm(12)}px;background:rgba(192,138,51,.36)"></div>
  <div style="position:relative;display:flex;align-items:center;gap:${mm(3)}px">
    ${markSvg({ size: mm(13) })}
    <div style="font-size:${mm(8)}px;font-weight:800;letter-spacing:-.03em">${BRAND.name}</div>
  </div>
  <div style="flex:1"></div>
  <div style="position:relative">
    <div style="font-size:${mm(6.4)}px;font-weight:800;letter-spacing:-.03em;max-width:${mm(60)}px">${esc(BRAND.tagline)}</div>
    <div style="font-size:${mm(3.6)}px;margin-top:${mm(2)}px;opacity:.95">${esc(CONTACT.website)}</div>
  </div>
</div>`;

const cardBack = () => `<div class="shrink" style="width:${CARD_W}px;min-height:${CARD_H}px;background:#fff;color:${C.ink};padding:${mm(6)}px;display:flex;flex-direction:column;position:relative">
  <div class="grid" style="opacity:.5"></div>
  <div style="position:relative;display:flex;align-items:center;gap:${mm(2.4)}px">
    ${markSvg({ size: mm(9) })}
    <div style="flex:1;font-size:${mm(5.4)}px;font-weight:800;letter-spacing:-.03em;max-width:${mm(50)}px">${esc(CONTACT.cta)}</div>
  </div>
  <div style="position:relative;display:flex;flex-direction:column;gap:${mm(1.8)}px;margin-top:${mm(3.4)}px">
    ${[['Website', CONTACT.website], ['Email', CONTACT.email], ['WhatsApp', CONTACT.whatsapp]]
      .map(([l, v]) => `<div><div style="font-size:${mm(3.2)}px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${C.ink3}">${esc(l)}</div>
        <div style="font-size:${mm(4.4)}px;font-weight:700;letter-spacing:-.01em;margin-top:${mm(0.4)}px">${esc(v)}</div></div>`).join('')}
  </div>
  <div style="flex:1"></div>
  <div style="position:relative;font-size:${mm(3.4)}px;color:${C.ink3};line-height:1.4">Business management platform</div>
</div>`;

/* ---- 06-video : storyboard frames ---- */

const SB_W = 1280, SB_H = 720;
const sbFrame = (n, total, scene, label, visual) => page(`${bgDark}
  <div style="position:relative;height:100%;display:flex;flex-direction:column;padding:44px 52px">
    <div style="display:flex;align-items:center;gap:18px">
      ${logoLockup({ size: 44, color: '#fff' })}
      <div style="flex:1"></div>
      <div style="font-size:18px;font-weight:700;color:#8fe0c0;letter-spacing:.1em;text-transform:uppercase">${esc(label)} · ${n}/${total}</div>
    </div>
    <div style="flex:1 1 0;min-height:0;display:flex;gap:40px;margin-top:34px">
      ${fitbox(visual, { gap: 0, flex: '1.15 1 0', align: 'stretch', extra: 'border-radius:20px;background:#0b1712;border:1px solid rgba(255,255,255,.12)' })}
      <div style="flex:1;display:flex;flex-direction:column;gap:22px">
        <div>
          <div style="font-size:14px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${C.gold}">Time</div>
          <div style="font-size:30px;font-weight:800;letter-spacing:-.02em;color:#fff;margin-top:6px">${esc(scene.t)}</div>
        </div>
        <div>
          <div style="font-size:14px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${C.gold}">Visual</div>
          <div style="font-size:20px;color:#c9ded4;margin-top:6px;line-height:1.5">${esc(scene.visual)}</div>
        </div>
        <div>
          <div style="font-size:14px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${C.gold}">On-screen text</div>
          <div style="font-size:26px;font-weight:800;letter-spacing:-.02em;color:#fff;margin-top:6px">${esc(scene.onScreen)}</div>
        </div>
        <div>
          <div style="font-size:14px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${C.gold}">Direction</div>
          <div style="font-size:19px;color:#c9ded4;margin-top:6px;line-height:1.5">${esc(scene.direction)}</div>
        </div>
      </div>
    </div>
  </div>
</div>`);

const SB_VIS = {
  promo: [
    fitArt(`<div style="display:flex;gap:22px;padding:36px;align-items:center;justify-content:center">
      ${[['Register', 'Orders'], ['Chat thread', 'Updates'], ['Diary', 'Money']].map(([a, b]) => `<div style="width:250px;height:330px;border-radius:16px;background:#1b2620;border:1px solid rgba(255,255,255,.14);padding:20px;display:flex;flex-direction:column;gap:10px;filter:grayscale(.6)">
        <div style="font-size:17px;font-weight:800;color:#8fa79a">${a}</div>
        ${Array.from({ length: 7 }).map(() => `<div style="height:12px;border-radius:4px;background:rgba(255,255,255,.10)"></div>`).join('')}
        <div style="flex:1"></div>
        <div style="font-size:16px;font-weight:700;color:#c9ded4">${b}</div></div>`).join('')}
    </div>`, 860, 660),
    browserFrame(uiDashboard(), { scale: 0.62 }),
    fitArt(`<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:center;padding:40px">
      ${TEMPLATES.map((t, i) => `<div style="padding:18px 28px;border-radius:999px;font-size:24px;font-weight:800;background:${i === 1 ? `linear-gradient(135deg,${C.greenLight},${C.greenDark})` : 'rgba(255,255,255,.08)'};border:1px solid rgba(255,255,255,.16);color:#fff">${esc(t.name)}</div>`).join('')}
    </div>`, 860, 500),
    browserFrame(uiModules(), { scale: 0.62 }),
    browserFrame(uiOrders(), { scale: 0.62 }),
    browserFrame(uiTable('Payments', ['Date', 'Order', 'Method', 'Amount'], [['27 Oct', '#1040', 'Bank transfer', 'Rs 27,400'], ['27 Oct', '#1036', 'Cash', 'Rs 14,900'], ['26 Oct', '#1031', 'Digital', 'Rs 32,000'], ['26 Oct', '#1028', 'Cash', 'Rs 8,600']]), { scale: 0.62 }),
    browserFrame(uiDashboard(), { scale: 0.62 }),
    fitArt(`<div style="display:flex;align-items:center;justify-content:center;gap:60px;padding:40px">
      ${logoLockup({ size: 120, color: '#fff', tagline: true })}
      <div style="width:1px;height:180px;background:rgba(255,255,255,.18)"></div>
      <div><div style="font-size:44px;font-weight:800;color:#fff;letter-spacing:-.03em">${esc(CONTACT.cta)}</div>
      <div style="font-size:30px;color:#8fe0c0;margin-top:12px">${esc(CONTACT.website)}</div></div>
    </div>`, 860, 620),
  ],
  reel: [
    fitArt(`<div style="display:flex;gap:16px;padding:36px;justify-content:center">
      ${[['Register', 'Orders'], ['Chat thread', 'Updates'], ['Diary', 'Money']].map(([a, b]) => `<div style="width:190px;height:280px;border-radius:14px;background:#1b2620;border:1px solid rgba(255,255,255,.14);padding:16px;display:flex;flex-direction:column;gap:8px;filter:grayscale(.6)">
        <div style="font-size:14px;font-weight:800;color:#8fa79a">${a}</div>
        ${Array.from({ length: 6 }).map(() => `<div style="height:10px;border-radius:4px;background:rgba(255,255,255,.10)"></div>`).join('')}
        <div style="flex:1"></div><div style="font-size:15px;font-weight:700;color:#c9ded4">${b}</div></div>`).join('')}
    </div>`, 860, 660),
    phoneFrame(uiMobile(), { scale: 0.94 }),
    fitArt(`<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;padding:40px">
      ${TEMPLATES.map((t) => `<div style="padding:14px 22px;border-radius:999px;font-size:20px;font-weight:800;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#fff">${esc(t.name)}</div>`).join('')}
    </div>`, 860, 500),
    fitArt(`<div style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:24px;padding:40px">
      ${logoLockup({ size: 110, color: '#fff', tagline: true })}
      <div class="cta gold">${esc(CONTACT.cta)}</div>
      <div style="font-size:24px;color:#8fe0c0">${esc(CONTACT.website)}</div>
    </div>`, 860, 620),
  ],
  explainer: [
    fitArt(`<div style="display:flex;gap:22px;padding:36px;justify-content:center;align-items:stretch">
      ${COPY.steps.map((s, i) => `<div style="width:300px;padding:28px;border-radius:20px;background:${i < 2 ? 'rgba(17,122,92,.18)' : 'rgba(192,138,51,.14)'};border:1px solid rgba(255,255,255,.16);display:flex;flex-direction:column">
        <div style="font-size:56px;font-weight:800;color:${i < 2 ? '#8fe0c0' : C.goldSoft}">${esc(s.n)}</div>
        <div style="font-size:26px;font-weight:800;color:#fff;margin-top:14px;letter-spacing:-.02em">${esc(s.title)}</div>
        <div style="flex:1"></div>
        <div style="font-size:18px;font-weight:700;color:#c9ded4">${i < 2 ? 'Bizora' : 'You'}</div></div>`).join('')}
    </div>`, 980, 500),
    fitArt(`<div style="display:flex;gap:18px;padding:40px;justify-content:center;align-items:center;flex-wrap:wrap">
      ${['Business name', 'What you sell', 'How work moves', 'Who needs access'].map((t) => `<div style="width:230px;height:150px;border-radius:14px;background:${C.goldSoft};padding:20px;display:flex;align-items:flex-end;transform:rotate(${Math.random() * 6 - 3}deg)">
        <div style="font-size:22px;font-weight:800;color:${C.ink}">${esc(t)}</div></div>`).join('')}
    </div>`, 980, 500),
    browserFrame(uiModules(), { scale: 0.62 }),
    fitbox(`${browserFrame(uiDashboard())}${phoneFrame(uiMobile())}`, { row: true, gap: 28 }),
    fitArt(`<div style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:24px;padding:40px">
      ${logoLockup({ size: 100, color: '#fff', tagline: true })}
      <div class="cta gold">${esc(CONTACT.cta)}</div>
      <div style="font-size:24px;color:#8fe0c0">${esc(CONTACT.website)} · ${esc(CONTACT.email)}</div>
    </div>`, 860, 620),
  ],
};

for (const [key, video] of Object.entries(COPY.video)) {
  const visuals = SB_VIS[key];
  video.scenes.forEach((scene, i) => {
    job('06-video', `storyboard-${key}-${String(i + 1).padStart(2, '0')}.png`, SB_W, SB_H,
      sbFrame(i + 1, video.scenes.length, scene, `${video.title} — storyboard`, visuals[i] ?? visuals[visuals.length - 1]));
  });
}


/* ---- 05-brand : logo files ---- */

job('05-brand', 'logo-primary.png', 1600, 500, page(`<div style="width:100%;height:100%;display:grid;place-items:center;background:#fff">
  ${logoLockup({ size: 240, color: C.ink, tagline: true })}
</div>`));
job('05-brand', 'logo-white.png', 1600, 500, page(`<div style="width:100%;height:100%;display:grid;place-items:center;background:${C.night}">
  ${logoLockup({ size: 240, color: '#ffffff', tagline: true })}
</div>`));
job('05-brand', 'logo-mark.png', 512, 512, page(`<div style="width:100%;height:100%;display:grid;place-items:center;background:#fff">
  ${markSvg({ size: 400 })}
</div>`));

/* ------------------------------------------------------------------ */
/* render                                                              */
/* ------------------------------------------------------------------ */

const prints = [
  { name: 'flyer-a4-front', w: A4W, h: A4H, html: flyerFront, pdf: [mm(210), mm(297)], preview: 1240 },
  { name: 'flyer-a4-back', w: A4W, h: A4H, html: flyerBack, pdf: [mm(210), mm(297)], preview: 1240 },
  { name: 'brochure-trifold-outside', w: TRI_W, h: TRI_H, html: brochureOutside, pdf: [mm(297), mm(210)], preview: 2000 },
  { name: 'brochure-trifold-inside', w: TRI_W, h: TRI_H, html: brochureInside, pdf: [mm(297), mm(210)], preview: 2000 },
  { name: 'poster-a3', w: A3W, h: A3H, html: poster, pdf: [mm(297), mm(420)], preview: 1240 },
  { name: 'business-card-front', w: CARD_W, h: CARD_H, html: cardFront, pdf: [mm(85), mm(55)], preview: 1000 },
  { name: 'business-card-back', w: CARD_W, h: CARD_H, html: cardBack, pdf: [mm(85), mm(55)], preview: 1000 },
];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const only = process.argv[2];
  const runJobs = only ? jobs.filter((j) => j.name.includes(only)) : jobs;

  /* logo vector files */
  fs.writeFileSync(path.join(OUT, '05-brand', 'logo-primary.svg'), markSvg({ size: 64, tile: true }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
  fs.writeFileSync(path.join(OUT, '05-brand', 'logo-mono.svg'), markSvg({ size: 64, tile: false, mono: '#0E1A16' }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
  fs.writeFileSync(path.join(OUT, '05-brand', 'logo-white.svg'), markSvg({ size: 64, tile: false, mono: '#FFFFFF' }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
  fs.writeFileSync(path.join(OUT, '05-brand', 'logo-square.svg'), markSvg({ size: 64, tile: true, radius: 0 }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));

  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--single-process', '--allow-file-access-from-files', '--font-render-hinting=none'],
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
  const p = await browser.newPage();

  const problems = [];

  /**
   * Legibility + contrast QA. Effective size accounts for CSS `zoom` and
   * transforms; contrast falls back to the artboard base colour when the
   * background is a gradient (data-bg on the wrap).
   */
  async function qa(w, h, label) {
    return p.evaluate(() => {
      const parse = (c) => {
        const m = String(c).match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const [r, g, b, a = '1'] = m[1].split(',').map((v) => parseFloat(v));
        return { r, g, b, a: parseFloat(a) };
      };
      const lum = ({ r, g, b }) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a, b) => {
        const l1 = lum(a), l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const bgNode = document.querySelector('[data-bg]');
      const base = (bgNode && parse(getComputedStyle(bgNode).backgroundColor)) || { r: 255, g: 255, b: 255, a: 1 };
      const baseHex = bgNode?.dataset.bg;
      const baseCol = baseHex ? { r: parseInt(baseHex.slice(1, 3), 16), g: parseInt(baseHex.slice(3, 5), 16), b: parseInt(baseHex.slice(5, 7), 16) } : base;

      const known = { cta: { r: 17, g: 122, b: 92 }, 'cta-gold': { r: 201, g: 152, b: 71 } };
      const bgOf = (el) => {
        if (el.classList.contains('cta')) return el.classList.contains('gold') ? known['cta-gold'] : known.cta;
        let node = el;
        while (node && node !== document.documentElement) {
          const cs = getComputedStyle(node);
          if (cs.backgroundImage && cs.backgroundImage !== 'none') {
            if (node.dataset.bg) return baseCol;
            const solid = parse(cs.backgroundColor);
            if (solid && solid.a > 0.55) return solid;
            return null; // gradient of unknown colour — do not judge
          }
          const c = parse(cs.backgroundColor);
          if (c && c.a > 0.6) return c;
          node = node.parentElement;
        }
        return baseCol;
      };
      const effPx = (el) => {
        const px = parseFloat(getComputedStyle(el).fontSize);
        let z = 1, node = el;
        while (node && node !== document.documentElement) {
          const cs = getComputedStyle(node);
          z *= parseFloat(cs.zoom || '1') || 1;
          if (cs.transform && cs.transform !== 'none') {
            const m = cs.transform.match(/matrix\(([^,]+)/);
            if (m) z *= Math.abs(parseFloat(m[1]));
          }
          node = node.parentElement;
        }
        return px * z;
      };

      let tiny = 0, contrast = 0;
      const tinyList = [], contrastList = [];
      const seen = new Set();
      for (const el of document.querySelectorAll('body *')) {
        const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
        if (!direct) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.closest('[data-clip]')) continue;
        const size = effPx(el);
        if (size < 9.5) { tiny += 1; if (tinyList.length < 4) tinyList.push(`${size.toFixed(1)}px "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)}"`); }
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        if (!fg || fg.a < 0.5) continue;
        const bg = bgOf(el);
        if (!bg) continue;
        const cr = ratio(fg, bg);
        const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
        const need = large ? 3 : 4.5;
        if (cr < need) {
          contrast += 1;
          const key = `${cs.color}|${Math.round(size)}`;
          if (!seen.has(key) && seen.size < 4) {
            seen.add(key);
            contrastList.push(`${cr.toFixed(2)}<${need} ${size.toFixed(0)}px ${cs.color} "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 28)}"`);
          }
        }
      }
      return { tiny, contrast, tinyList, contrastList };
    }).then((r) => {
      for (const t of r.tinyList) console.log(`      small: ${t}`);
      for (const c of r.contrastList) console.log(`      low-ct: ${c}`);
      return r;
    });
  }

  /** Last-resort safety net: if a print piece is still taller than its page, zoom it down. */
  async function shrinkToFit(pageH) {
    return p.evaluate((H) => {
      const out = [];
      for (const el of document.querySelectorAll('.shrink')) {
        el.style.zoom = '1';
        const natural = el.getBoundingClientRect().height / (parseFloat(getComputedStyle(el).zoom) || 1);
        const over = el.scrollHeight;
        const k = Math.min(1, (H - 2.5) / Math.max(over, natural));
        if (k < 1) { el.style.zoom = String(k); out.push(Math.round(k * 100) / 100); }
      }
      return out;
    }, pageH);
  }

  /** Scale every `.fit` element down until it fits its `.fitbox` parent. */
  async function autofit() {
    return p.evaluate(() => {
      const applied = [];
      for (const box of document.querySelectorAll('.fitbox')) {
        const items = [...box.children].filter((c) => c.classList && c.classList.contains('fit'));
        if (!items.length) continue;
        const br = box.getBoundingClientRect();
        const cs = getComputedStyle(box);
        const gap = parseFloat(cs.rowGap) || 0;
        const isRow = cs.flexDirection.startsWith('row');
        const n = items.length;
        for (const it of items) {
          const nw = Number(it.dataset.w) || 1, nh = Number(it.dataset.h) || 1;
          const availW = isRow ? (br.width - gap * (n - 1)) / n : br.width;
          const availH = isRow ? br.height : (br.height - gap * (n - 1)) / n;
          const k = Math.max(0.05, Math.min(1.6, Math.min(availW / nw, availH / nh) * 0.995));
          it.style.zoom = String(k);
          applied.push(Math.round(k * 100) / 100);
        }
      }
      return applied;
    });
  }
  async function check(w, h, label) {
    return p.evaluate((W, H) => {
      const bad = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('[data-clip]')) continue;
        const cls = String(el.className ?? '');
        if (cls.split(/\s+/).some((c) => c === 'glow' || c === 'grid')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const over = Math.max(r.right - W, r.bottom - H, -r.left, -r.top);
        if (over > 1.5) {
          bad.push({
            over: Math.round(over),
            tag: el.tagName,
            cls: cls.slice(0, 26),
            text: String(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 42),
            box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
            edge: r.right > W + 1.5 ? 'right' : (r.bottom > H + 1.5 ? 'bottom' : (r.left < -1.5 ? 'left' : 'top')),
          });
        }
      }
      bad.sort((a, b) => b.over - a.over);
      return { bad: bad.slice(0, 6), count: bad.length, worst: bad[0]?.over ?? 0 };
    }, w, h).then((found) => {
      if (found.count > 0) {
        problems.push(`${label}: ${found.count} clipped, worst +${found.worst}px`);
        for (const b of found.bad) console.log(`    ! +${String(b.over).padStart(4)}px ${b.edge.padEnd(6)} <${b.tag.toLowerCase()} ${b.cls ? '.' + b.cls : ''}> [${b.box}] "${b.text}"`);
      }
      return found;
    });
  }

  for (const j of runJobs) {
    await p.setViewport({ width: j.w, height: j.h, deviceScaleFactor: 1 });
    await p.setContent(j.html, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => document.fonts.ready);
    const fit1 = await autofit();
    await new Promise((r) => setTimeout(r, 220));
    const m = await check(j.w, j.h, j.name);
    const q = await qa(j.w, j.h, j.name);
    await p.screenshot({ path: path.join(OUT, j.dir, j.name) });
    console.log(`${j.name.padEnd(32)} ${String(j.w).padStart(4)}x${String(j.h).padEnd(4)} clip:${String(m.count).padStart(2)} tiny:${String(q.tiny).padStart(2)} contrast:${String(q.contrast).padStart(2)} fit:${fit1.join('/') || '-'}`);
  }

  for (const pr of prints) {
    if (only && !pr.name.includes(only)) continue;
    await p.setViewport({ width: pr.w, height: pr.h, deviceScaleFactor: 1 });
    await p.setContent(page(pr.html()), { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => document.fonts.ready);
    let fitp = await autofit();
    const shrank = await shrinkToFit(pr.h);
    if (shrank.length) { await autofit(); fitp = [...fitp, ...shrank.map((v) => 'x' + v)]; }
    await new Promise((r) => setTimeout(r, 160));
    const pm = await check(pr.w, pr.h, pr.name);
    const qp = await qa(pr.w, pr.h, pr.name);
    const pdfPath = path.join(OUT, '04-print', `${pr.name}.pdf`);
    await p.pdf({ path: pdfPath, width: `${pr.pdf[0]}px`, height: `${pr.pdf[1]}px`, printBackground: true, margin: 0, pageRanges: '1' });
    const prevH = Math.round((pr.preview * pr.h) / pr.w);
    await p.setViewport({ width: pr.preview, height: prevH, deviceScaleFactor: 1 });
    await p.setContent(page(`<div style="width:${pr.preview}px;height:${prevH}px;overflow:hidden" data-clip="1">
        <div style="width:${pr.w}px;height:${pr.h}px;transform:scale(${pr.preview / pr.w});transform-origin:top left">${pr.html()}</div></div>`), { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 160));
    await p.screenshot({ path: path.join(OUT, '04-print', `${pr.name}.png`) });
    console.log(`${pr.name.padEnd(32)} ${String(pr.w).padStart(4)}x${String(pr.h).padEnd(4)} clip:${String(pm.count).padStart(2)} tiny:${String(qp.tiny).padStart(2)} contrast:${String(qp.contrast).padStart(2)} fit:${fitp.join('/') || '-'}`);
  }

  /* join the two-sided print pieces */
  async function join(outName, parts) {
    const merged = await PDFDocument.create();
    for (const part of parts) {
      const src = await PDFDocument.load(fs.readFileSync(path.join(OUT, '04-print', `${part}.pdf`)));
      const [first] = await merged.copyPages(src, [0]);
      merged.addPage(first);
    }
    fs.writeFileSync(path.join(OUT, '04-print', outName), await merged.save());
    console.log(`joined ${outName} ← ${parts.join(' + ')}`);
  }
  await join('flyer-a4.pdf', ['flyer-a4-front', 'flyer-a4-back']);
  await join('brochure-trifold.pdf', ['brochure-trifold-outside', 'brochure-trifold-inside']);
  await join('business-card.pdf', ['business-card-front', 'business-card-back']);

  console.log(`\nclipping problems: ${problems.length ? '\n  ' + problems.join('\n  ') : 'none'}`);
  await browser.close();
}

export {
  page, BASE, mm, esc, fitbox, fitArt, browserFrame, phoneFrame,
  appShell, uiDashboard, uiOrders, uiTable, uiModules, uiMobile,
  bgLight, bgDark, bgGreen, markSvg, logoLockup, C, CONTACT, BRAND,
};
