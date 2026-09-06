import { launch, feed } from './lib.mjs';
const { browser, page } = await launch();
await page.waitForTimeout(1000);
await feed(page, '/home/user/texans-pix/tests/out/exif0-landscape.jpg', 'exif0-landscape.jpg');
await page.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
  window.__ink = []; window.__recording = false;
  P.fillText = function (t, x, y, ...r) {
    if (window.__recording) { const m = this.measureText(t); window.__ink.push({ text: String(t), x1: x + m.actualBoundingBoxRight, y, font: this.font }); }
    return orig.apply(this, [t, x, y, ...r]);
  };
});
const run = (dev, kicker) => page.evaluate(async ({ dev, kicker }) => {
  const S = window.__studio; S.setDevice(dev); S.setSurface('lock'); S.setTemplate('ticker');
  S.setFields({ headline: 'Houston', name: '', number: '', section: '132', since: '2002', kicker });
  window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
  const c = document.querySelector('#stage');
  const stripTop = c.height - Math.round(c.height * 0.028) - 4;
  const k = window.__ink.filter(i => /Azeret|monospace/.test(i.font) && i.y < stripTop);
  return { W: c.width, margin: Math.round(c.width * 0.062), maxX: Math.max(...k.map(i => i.x1)) };
}, { dev, kicker });
for (const dev of ['ip-se', 'ip-16-pro-max']) {
  let pastMargin = null, offCanvas = null;
  for (let n = 6; n <= 24; n++) {
    const r = await run(dev, 'W'.repeat(n));
    if (!pastMargin && r.maxX > r.W - r.margin) pastMargin = n;
    if (!offCanvas && r.maxX > r.W) offCanvas = n;
  }
  const real = await run(dev, 'PRESEASON WEEK 01 XXXXXX');
  console.log(`${dev}: kicker (with SEC 132 // SINCE 2002) passes the margin at ${pastMargin} wide chars, leaves the canvas at ${offCanvas}; the 24-char max kicker "PRESEASON WEEK 01 XXXXXX" reaches x=${real.maxX.toFixed(0)} on a ${real.W}px canvas`);
}
await browser.close();
