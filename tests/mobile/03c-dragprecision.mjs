// 5c. Does touch drag work at all, and how precise is it?
import { PROFILES, browserUp, openOn, F } from './lib.mjs';
const browser = await browserUp();
const p = PROFILES[0];
const { ctx, page } = await openOn(browser, p);
const cdp = await ctx.newCDPSession(page);
await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 1600;
  const g = c.getContext('2d'); g.fillStyle = '#444'; g.fillRect(0,0,1200,1600);
  const bmp = await createImageBitmap(c);
  await window.__studio.useSource(bmp, 'probe');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
});
await page.waitForTimeout(200);

async function drag(dx, dy, zoom) {
  await page.evaluate(z => { const s = __studio.state; s.zoom = z; s.panX = 0; s.panY = 0; document.querySelector('#zoom').value = String(z); __studio.render(false); scrollTo(0,0); }, zoom);
  await page.waitForTimeout(100);
  const b = await page.evaluate(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y, id: 1 }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + dx*i/10, y: b.y + dy*i/10, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  const s = await page.evaluate(() => ({ px: __studio.state.panX, py: __studio.state.panY, slack: (() => { const st = __studio.state; return null })() }));
  const g = await page.evaluate(z => {
    const s = __studio.state, c = document.querySelector('#stage');
    const rect = c.getBoundingClientRect(); const shown = rect.width / c.width;
    return { shown };
  }, zoom);
  console.log(`zoom ${zoom}  drag ${dx>0?'+':''}${dx},${dy>0?'+':''}${dy} finger px -> panX ${F(s.px)} panY ${F(s.py)}   (preview scale ${(g.shown*100).toFixed(1)}%)`);
}
await drag(60, 0, 1);
await drag(0, 60, 1);
await drag(0, 60, 1.5);
await drag(60, 0, 1.5);
await drag(3, 0, 1);   // smallest realistic finger jitter
await ctx.close(); await browser.close();
