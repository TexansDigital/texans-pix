// 1. Preview co-visibility + 2. viewport economics.
import { PROFILES, browserUp, openOn, F } from './lib.mjs';

const GROUPS = [
  ['photo (Use my photo button)', '#pick'],
  ['photo (library grid)',        '#library'],
  ['screen (device select)',      '#device'],
  ['template (picker)',           '#templates'],
  ['fields (headline input)',     '[data-field="headline"]'],
  ['fields (kicker input)',       '[data-field="kicker"]'],
  ['frame (zoom slider)',         '#zoom'],
  ['frame (download button)',     '#export'],
  ['collection (save button)',    '#keep'],
];

const measure = (page, sel) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  const c = document.querySelector('#stage');
  const cr = c.getBoundingClientRect();
  const vh = window.innerHeight, vw = window.innerWidth;
  const iy = Math.max(0, Math.min(cr.bottom, vh) - Math.max(cr.top, 0));
  const ix = Math.max(0, Math.min(cr.right, vw) - Math.max(cr.left, 0));
  const area = cr.width * cr.height;
  const er = el.getBoundingClientRect();
  const eIn = er.top >= 0 && er.bottom <= vh;
  return {
    pct: area ? (ix * iy) / area * 100 : 0,
    canvasTop: cr.top, canvasBottom: cr.bottom, canvasH: cr.height,
    scrollY: window.scrollY, ctrlTop: er.top, ctrlBottom: er.bottom, ctrlFullyVisible: eIn, vh,
  };
}, sel);

const browser = await browserUp();
const rows = [];
for (const p of PROFILES) {
  for (const orient of ['portrait', 'landscape']) {
    const vp = orient === 'portrait' ? p.d.viewport
      : { width: p.d.viewport.height, height: p.d.viewport.width };
    const { ctx, page } = await openOn(browser, { ...p, d: { ...p.d, viewport: vp } });

    const doc = await page.evaluate(() => ({
      docH: document.documentElement.scrollHeight,
      vh: window.innerHeight, vw: window.innerWidth,
      canvasH: document.querySelector('#stage').getBoundingClientRect().height,
      canvasW: document.querySelector('#stage').getBoundingClientRect().width,
      hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      scrollW: document.documentElement.scrollWidth,
    }));

    const at = [];
    for (const [label, sel] of GROUPS) {
      // How a fan actually gets there: scroll the control group to the top of
      // the viewport (what scrollIntoView / focus-scroll does), and the gentler
      // minimal scroll that just brings it on screen.
      await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'start' }), sel);
      await page.waitForTimeout(60);
      const start = await measure(page, sel);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'nearest' }), sel);
      await page.waitForTimeout(60);
      const near = await measure(page, sel);
      at.push({ label, start, near });
    }
    rows.push({ device: p.name, orient, doc, at });
    await ctx.close();
  }
}
await browser.close();

for (const r of rows) {
  console.log(`\n### ${r.device} ${r.orient}  ${r.doc.vw}x${r.doc.vh}`);
  console.log(`    document ${r.doc.docH}px = ${F(r.doc.docH / r.doc.vh)} viewports | canvas ${F(r.doc.canvasW)}x${F(r.doc.canvasH)} | h-scroll ${r.doc.hScroll} (scrollW ${r.doc.scrollW})`);
  for (const a of r.at) {
    console.log(`    ${a.label.padEnd(30)} align-top: ${String(F(a.start.pct)).padStart(5)}% visible (scrollY ${F(a.start.scrollY)})   min-scroll: ${String(F(a.near.pct)).padStart(5)}% (scrollY ${F(a.near.scrollY)}, ctrl fully vis ${a.near.ctrlFullyVisible})`);
  }
}
console.log('\nJSON:' + JSON.stringify(rows));
