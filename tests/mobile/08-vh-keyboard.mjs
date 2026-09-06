// 4b. `vh` against the iOS large viewport, and life with the keyboard up.
import { PROFILES, browserUp, openOn, F } from './lib.mjs';

const browser = await browserUp();

// iOS Safari resolves `vh` against the LARGE viewport (URL bar hidden), but
// paints into the SMALL one while the bar is showing. Emulate both.
const CASES = [
  { name: 'iPhone 13 small viewport (URL bar showing)', vp: { width: 390, height: 664 } },
  { name: 'iPhone 13 large viewport (bar hidden, what vh resolves against)', vp: { width: 390, height: 745 } },
  { name: 'iPhone SE small viewport', vp: { width: 375, height: 553 } },
  { name: 'iPhone SE large viewport', vp: { width: 375, height: 667 } },
];
for (const c of CASES) {
  const { ctx, page } = await openOn(browser, { ...PROFILES[1], d: { ...PROFILES[1].d, viewport: c.vp } });
  const r = await page.evaluate(() => {
    const s = document.querySelector('#stage').getBoundingClientRect();
    return { h: s.height, w: s.width, vh: innerHeight, cap: getComputedStyle(document.querySelector('#stage')).maxHeight };
  });
  console.log(`${c.name.padEnd(58)} vh=${r.vh}  60vh cap resolves to ${r.cap}  canvas ${F(r.w)}x${F(r.h)}`);
  await ctx.close();
}
console.log(`\n  -> on iOS the 60vh cap (src/studio.css:96) is computed from the large viewport,`);
console.log(`     so with the URL bar showing the preview eats a larger share of what the fan can see.`);

console.log('\n-- keyboard up (iOS keyboard ~336px, Android ~300px) --');
for (const [label, vp, kb] of [
  ['iPhone SE', { width: 375, height: 667 }, 336],
  ['iPhone 13', { width: 390, height: 664 }, 336],
  ['Pixel 7',   { width: 412, height: 839 }, 300],
]) {
  const { ctx, page } = await openOn(browser, { ...PROFILES[0], d: { ...PROFILES[0].d, viewport: vp } });
  // focus a field then shrink the viewport the way the keyboard does
  await page.evaluate(() => document.querySelector('[data-field="name"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(80);
  await page.setViewportSize({ width: vp.width, height: vp.height - kb });
  await page.waitForTimeout(150);
  const m = await page.evaluate(() => {
    const f = document.querySelector('[data-field="name"]').getBoundingClientRect();
    const s = document.querySelector('#stage').getBoundingClientRect();
    const vh = innerHeight;
    const iy = Math.max(0, Math.min(s.bottom, vh) - Math.max(s.top, 0));
    return { fieldVisible: f.top >= 0 && f.bottom <= vh, fieldTop: f.top, vh, previewPct: s.height ? iy / s.height * 100 : 0 };
  });
  console.log(`  ${label.padEnd(10)} usable height ${m.vh}px  field visible: ${m.fieldVisible}  preview visible: ${F(m.previewPct)}%`);
  await ctx.close();
}
await browser.close();
