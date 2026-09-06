// 5. Gestures: does a drag on the canvas scroll the page? is pinch handled?
import { PROFILES, browserUp, openOn, F } from './lib.mjs';

const browser = await browserUp();
const p = PROFILES[0]; // iPhone SE 3rd
const { ctx, page } = await openOn(browser, p);
const cdp = await ctx.newCDPSession(page);

async function seedPhoto() {
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1600;
    const g = c.getContext('2d');
    g.fillStyle = '#333'; g.fillRect(0, 0, 1200, 1600);
    for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 9},70%,50%)`; g.fillRect(i * 30, 0, 15, 1600); }
    const bmp = await createImageBitmap(c);
    await window.__studio.useSource(bmp, 'probe');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
await seedPhoto();
await page.waitForTimeout(200);

const box = await page.evaluate(() => {
  const r = document.querySelector('#stage').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
console.log('canvas box', JSON.stringify(box), 'viewport', p.d.viewport);

// --- A. one-finger vertical swipe that starts on the canvas -----------------
async function swipe(x, y, dy, steps = 12) {
  const before = await page.evaluate(() => ({ y: window.scrollY, pan: window.__studio.state.panY }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / steps, id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => ({ y: window.scrollY, pan: window.__studio.state.panY }));
  return { before, after };
}

const onCanvas = await swipe(box.x + box.w / 2, box.y + box.h / 2, -140);
console.log(`swipe UP starting ON the canvas   -> scrollY ${onCanvas.before.y} -> ${onCanvas.after.y}   panY ${F(onCanvas.before.pan)} -> ${F(onCanvas.after.pan)}`);

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(150);
const offCanvas = await swipe(box.x + box.w / 2, box.y + box.h + 40, -140);
console.log(`swipe UP starting BELOW the canvas -> scrollY ${offCanvas.before.y} -> ${offCanvas.after.y}`);

// --- B. pinch: two fingers spreading on the canvas --------------------------
await page.evaluate(() => { window.scrollTo(0, 0); window.__studio.state.zoom = 1; window.__studio.state.panX = 0; window.__studio.state.panY = 0; });
await page.waitForTimeout(120);
const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
const z0 = await page.evaluate(() => ({ zoom: window.__studio.state.zoom, panX: window.__studio.state.panX, panY: window.__studio.state.panY, vs: visualViewport.scale }));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 20, y: cy - 20, id: 1 }, { x: cx + 20, y: cy + 20, id: 2 }] });
for (let i = 1; i <= 10; i++) {
  const d = 20 + i * 6;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - d, y: cy - d, id: 1 }, { x: cx + d, y: cy + d, id: 2 }] });
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(300);
const z1 = await page.evaluate(() => ({ zoom: window.__studio.state.zoom, panX: window.__studio.state.panX, panY: window.__studio.state.panY, vs: visualViewport.scale }));
console.log(`pinch-spread on canvas -> state.zoom ${z0.zoom} -> ${z1.zoom} | panX ${F(z0.panX)} -> ${F(z1.panX)} panY ${F(z0.panY)} -> ${F(z1.panY)} | visualViewport.scale ${z0.vs} -> ${z1.vs}`);

// --- C. does a second finger corrupt the pan? -------------------------------
console.log(`gesture handlers on canvas: ${await page.evaluate(() => {
  const evs = ['gesturestart','gesturechange','touchstart','touchmove','wheel'];
  return evs.map(e => e + '=' + (typeof document.querySelector('#stage')['on' + e] !== 'undefined' ? 'attr-slot' : 'n/a')).join(' ');
})}`);

// --- D. how far can a drag actually move the photo on a 184px-wide preview? --
const reach = await page.evaluate(() => {
  const s = window.__studio.state;
  const c = document.querySelector('#stage');
  const rect = c.getBoundingClientRect();
  return { shown: rect.width / c.width, canvasW: c.width, previewW: rect.width };
});
console.log(`preview scale: ${F(reach.previewW)}px shown for a ${reach.canvasW}px canvas = ${(reach.shown * 100).toFixed(1)}% (1 finger px = ${F(1 / reach.shown)} export px)`);

await ctx.close();
await browser.close();
