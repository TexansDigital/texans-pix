// 5b. The canvas as a scroll dead zone, with realistic source photos.
import { PROFILES, browserUp, openOn, F } from './lib.mjs';

const browser = await browserUp();
for (const p of PROFILES) {
  const { ctx, page } = await openOn(browser, p);
  const cdp = await ctx.newCDPSession(page);
  for (const [name, w, h] of [['portrait phone photo 3:4', 1200, 1600], ['landscape photo 4:3', 1600, 1200]]) {
    await page.evaluate(async ({ w, h }) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      for (let i = 0; i < 60; i++) { g.fillStyle = `hsl(${i * 6},70%,50%)`; g.fillRect(0, i * h / 60, w, h / 60); }
      const bmp = await createImageBitmap(c);
      await window.__studio.useSource(bmp, 'probe');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      window.scrollTo(0, 0);
    }, { w, h });
    await page.waitForTimeout(200);
    const box = await page.evaluate(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, vh: innerHeight, vw: innerWidth }; });
    const x = box.x + box.w / 2, y = box.y + box.h / 2;
    const before = await page.evaluate(() => ({ y: scrollY, px: __studio.state.panX, py: __studio.state.panY }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 140 * i / 12, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ y: scrollY, px: __studio.state.panX, py: __studio.state.panY }));
    const deadPct = Math.min(box.h, box.vh - Math.max(0, box.y)) / box.vh * 100;
    console.log(`${p.name.padEnd(18)} ${name.padEnd(24)} swipe-up-on-canvas: scrollY ${before.y}->${after.y}  panY ${F(before.py)}->${F(after.py)}  panX ${F(before.px)}->${F(after.px)}  | canvas covers ${F(deadPct)}% of viewport height as a non-scrollable zone`);
  }
  await ctx.close();
}
await browser.close();
