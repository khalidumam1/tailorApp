/**
 * Renders the full-bleed scene frames the marketing videos are cut from.
 *
 * Frames land in .build/frames/ (not committed — they are regenerated on
 * demand). Each frame is one video shot: background, product visual, and the
 * on-screen text for that beat.
 *
 * Run: node video.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { BRAND, CONTACT, COPY, DEMO, TEMPLATES, WIDGETS } from './bizora.js';
import {
  page, esc, fitbox, fitArt, browserFrame, phoneFrame, uiDashboard, uiOrders,
  uiTable, uiModules, uiMobile, bgLight, bgDark, bgGreen, markSvg, logoLockup, C,
} from './render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRAMES = path.join(HERE, 'frames');
fs.mkdirSync(FRAMES, { recursive: true });

/* ---------- shot visuals ---------- */

const messyTrio = (dark = true) => fitArt(`<div style="display:flex;gap:26px;align-items:center;justify-content:center">
  ${[['Register', 'Orders'], ['Chat thread', 'Updates'], ['Diary', 'Money']].map(([a, b]) => `<div style="width:270px;height:360px;border-radius:18px;background:${dark ? '#1b2620' : '#ffffff'};border:1px solid rgba(255,255,255,.14);padding:22px;display:flex;flex-direction:column;gap:11px;${dark ? '' : 'box-shadow:0 30px 60px -40px rgba(14,26,22,.6)'};filter:grayscale(.55)">
    <div style="font-size:18px;font-weight:800;color:${dark ? '#8fa79a' : C.ink3};letter-spacing:-.02em">${esc(a)}</div>
    ${Array.from({ length: 8 }).map((_, i) => `<div style="height:13px;border-radius:4px;background:${dark ? 'rgba(255,255,255,.10)' : C.line};width:${[100, 82, 94, 68, 88, 76, 92, 60][i]}%"></div>`).join('')}
    <div style="flex:1"></div>
    <div style="font-size:14px;font-weight:700;color:${dark ? '#c9ded4' : C.ink2}">${esc(b)}</div></div>`).join('')}
</div>`, 900, 420);

const templatesRow = () => fitArt(`<div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:center;max-width:1000px">
  ${TEMPLATES.map((t, i) => `<div style="padding:22px 34px;border-radius:999px;font-size:30px;font-weight:800;letter-spacing:-.02em;background:${i === 1 ? `linear-gradient(135deg,${C.greenLight},${C.greenDark})` : 'rgba(255,255,255,.08)'};border:1px solid rgba(255,255,255,.18);color:#fff">${esc(t.name)}</div>`).join('')}
</div>`, 1000, 300);

const numbersGrid = () => fitArt(`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;width:1080px">
  ${[...DEMO.dashboard.kpis.map((k) => [k.label, k.value]), ...DEMO.dashboard.money.map((m) => [m.label, 'Rs ' + m.value])]
    .map(([l, v]) => `<div style="padding:36px 32px;border-radius:24px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15)">
      <div style="font-size:19px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8fe0c0">${esc(l)}</div>
      <div style="font-size:64px;font-weight:800;letter-spacing:-.035em;color:#fff;margin-top:12px">${esc(v)}</div></div>`).join('')}
</div>`, 1100, 420);

const stepsCards = () => fitArt(`<div style="display:flex;gap:26px;justify-content:center;align-items:stretch">
  ${COPY.steps.map((s, i) => `<div style="width:330px;padding:32px;border-radius:24px;background:${i < 2 ? 'rgba(17,122,92,.20)' : 'rgba(192,138,51,.16)'};border:1px solid rgba(255,255,255,.18);display:flex;flex-direction:column">
    <div style="font-size:62px;font-weight:800;color:${i < 2 ? '#8fe0c0' : '#F3E3C7'}">${esc(s.n)}</div>
    <div style="font-size:29px;font-weight:800;color:#fff;margin-top:16px;letter-spacing:-.025em">${esc(s.title)}</div>
    <div style="flex:1"></div>
    <div style="font-size:17px;font-weight:700;color:#c9ded4;margin-top:18px">${i < 2 ? 'Bizora' : 'You'}</div></div>`).join('')}
</div>`, 1080, 420);

const stickyNotes = () => fitArt(`<div style="display:flex;gap:22px;justify-content:center;align-items:center;flex-wrap:wrap;max-width:1100px">
  ${['Business name', 'What you sell', 'How work moves', 'Who needs access'].map((t) => `<div style="width:250px;height:170px;border-radius:16px;background:${C.goldSoft};padding:24px;display:flex;align-items:flex-end">
    <div style="font-size:25px;font-weight:800;color:${C.ink};letter-spacing:-.02em;line-height:1.2">${esc(t)}</div></div>`).join('')}
</div>`, 1100, 400);

const endCard = (dark = true) => fitArt(`<div style="display:flex;align-items:center;justify-content:center;gap:70px">
  ${logoLockup({ size: 150, color: '#fff', tagline: true })}
  <div style="width:1px;height:220px;background:rgba(255,255,255,.20)"></div>
  <div>
    <div style="font-size:56px;font-weight:800;color:#fff;letter-spacing:-.035em">${esc(CONTACT.cta)}</div>
    <div style="font-size:36px;color:#8fe0c0;margin-top:16px;letter-spacing:-.01em">${esc(CONTACT.website)}</div>
    <div style="font-size:28px;color:#c9ded4;margin-top:10px">${esc(CONTACT.email)}</div>
  </div>
</div>`, 1100, 420);

const phoneShot = () => phoneFrame(uiMobile());

/* ---------- scene maps ---------- */

const SHOTS = {
  promo: [
    { visual: () => messyTrio(), dark: true },
    { visual: () => browserFrame(uiDashboard()), dark: true },
    { visual: () => templatesRow(), dark: true },
    { visual: () => browserFrame(uiModules()), dark: true },
    { visual: () => browserFrame(uiOrders()), dark: true },
    { visual: () => browserFrame(uiTable('Payments', ['Date', 'Order', 'Method', 'Amount'], [['27 Oct', '#1040', 'Bank transfer', 'Rs 27,400'], ['27 Oct', '#1036', 'Cash', 'Rs 14,900'], ['26 Oct', '#1031', 'Digital', 'Rs 32,000'], ['26 Oct', '#1028', 'Cash', 'Rs 8,600']])), dark: true },
    { visual: () => numbersGrid(), dark: true },
    { visual: () => endCard(), dark: true },
  ],
  reel: [
    { visual: () => messyTrio(), dark: true },
    { visual: () => phoneShot(), dark: true },
    { visual: () => templatesRow(), dark: true },
    { visual: () => endCard(), dark: true },
  ],
  explainer: [
    { visual: () => stepsCards(), dark: true },
    { visual: () => stickyNotes(), dark: true },
    { visual: () => browserFrame(uiModules()), dark: true },
    { visual: () => fitbox(`${browserFrame(uiDashboard())}${phoneFrame(uiMobile())}`, { row: true, gap: 34 }), dark: true },
    { visual: () => endCard(), dark: true },
  ],
};

/** Which orientation each cut is published in. */
const LAYOUTS = {
  promo: [{ w: 1920, h: 1080, tag: 'land' }, { w: 1080, h: 1920, tag: 'vert' }],
  reel: [{ w: 1080, h: 1920, tag: 'vert' }],
  explainer: [{ w: 1920, h: 1080, tag: 'land' }],
};

function scenePage({ w, h, scene, shot, dark }) {
  const land = w >= h;
  const k = land ? w / 1920 : w / 1080;
  const px = (n) => Math.round(n * k);
  return page(`${dark ? bgDark : bgLight}
  <div style="position:relative;width:100%;height:100%;display:flex;flex-direction:column;padding:${px(64)}px">
    <div style="display:flex;align-items:center;gap:18px">
      ${logoLockup({ size: px(54), color: dark ? '#fff' : C.ink })}
      <div style="flex:1"></div>
      <div class="eyebrow-pill ${dark ? 'dark' : ''}" style="font-size:${px(14)}px">${esc(shot.label ?? BRAND.name)}</div>
    </div>
    <div style="flex:1 1 0;min-height:0;display:flex;align-items:center;justify-content:center;padding:${px(34)}px 0">${shot.visual()}</div>
    <div style="font-size:${px(land ? 62 : 86)}px;font-weight:800;letter-spacing:-.035em;line-height:1.04;color:${dark ? '#fff' : C.ink};max-width:${land ? '90%' : '100%'}">${esc(scene.onScreen)}</div>
  </div>
</div>`);
}

const browser = await puppeteer.launch({
  args: [...chromium.args, '--no-sandbox', '--single-process', '--allow-file-access-from-files', '--font-render-hinting=none'],
  executablePath: await chromium.executablePath(),
  headless: 'shell',
});
const p = await browser.newPage();

for (const [key, video] of Object.entries(COPY.video)) {
  for (const L of LAYOUTS[key]) {
    for (let i = 0; i < video.scenes.length; i += 1) {
      const scene = video.scenes[i];
      const shot = SHOTS[key][i];
      await p.setViewport({ width: L.w, height: L.h, deviceScaleFactor: 1 });
      await p.setContent(scenePage({ w: L.w, h: L.h, scene, shot, dark: shot.dark }), { waitUntil: 'domcontentloaded' });
      await p.evaluate(() => document.fonts.ready);
      await p.evaluate(() => {
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
            it.style.zoom = String(Math.max(0.05, Math.min(1.8, Math.min(availW / nw, availH / nh) * 0.98)));
          }
        }
      });
      await new Promise((r) => setTimeout(r, 140));
      const name = `${key}-${L.tag}-${String(i + 1).padStart(2, '0')}.png`;
      await p.screenshot({ path: path.join(FRAMES, name) });
      console.log(`${name.padEnd(30)} ${L.w}x${L.h}`);
    }
  }
}
await browser.close();
