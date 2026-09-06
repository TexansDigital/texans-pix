// Guide rectangles: shape, not just leakage. The desktop preset has no lock
// screen and a home band of statusBottom 0 / dockTop 1, which used to make
// drawGuides emit two zero-height rectangles (a 2px red hairline at y=0 and
// y=H) that read as a rendering artefact.
import { launch, feed } from './lib.mjs';

const { browser, page } = await launch();
await feed(page, '/home/user/texans-pix/tests/out/white-2000x3000.png', 'white-2000x3000.png');

await page.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype;
  const of = P.fillRect, os = P.strokeRect;
  window.__rects = [];
  P.fillRect = function (x, y, w, h) { if (window.__rec) window.__rects.push({ op: 'fill', x, y, w, h, style: String(this.fillStyle) }); return of.apply(this, arguments); };
  P.strokeRect = function (x, y, w, h) { if (window.__rec) window.__rects.push({ op: 'stroke', x, y, w, h, style: String(this.strokeStyle), lw: this.lineWidth }); return os.apply(this, arguments); };
});

const devices = await page.evaluate(() => [...document.querySelectorAll('#device option')].map(o => o.value));
const rows = [];
for (const dev of devices) {
  for (const surface of ['lock', 'home']) {
    const r = await page.evaluate(async ({ dev, surface }) => {
      const { drawGuides } = await import('/src/compose.js');
      const { getDevice } = await import('/src/devices.js');
      const S = window.__studio;
      S.setDevice(dev); S.setSurface(surface);
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const c = document.querySelector('#stage'), ctx = c.getContext('2d');
      window.__rects = []; window.__rec = true;
      drawGuides(ctx, c.width, c.height, getDevice(dev), S.effectiveSurface());
      window.__rec = false;
      S.render(false);
      return { eff: S.effectiveSurface(), rects: window.__rects, H: c.height };
    }, { dev, surface });
    const guideRects = r.rects.filter(q => /235, ?0, ?40/.test(q.style));
    const degenerate = guideRects.filter(q => q.h <= 0 || q.w <= 0);
    rows.push({ dev, surface, effective: r.eff, guideRects: guideRects.length,
      zeroHeight: degenerate.length,
      shapes: guideRects.map(q => `${q.op}${Math.round(q.y)}+${Math.round(q.h)}`).join(' ') });
  }
}
console.table(rows);
const bad = rows.filter(r => r.zeroHeight > 0);
console.log('presets emitting a zero-height/zero-width guide rectangle:', bad.length ? JSON.stringify(bad) : 'none');

// And the pixel consequence on desktop + lock: a hairline at the very top or
// bottom edge over a pure-white photo.
const edge = await page.evaluate(async () => {
  const S = window.__studio, c = document.querySelector('#stage'), ctx = c.getContext('2d');
  S.setDevice('desktop'); S.setSurface('lock'); S.setTemplate('stamp');
  document.querySelector('#guides').checked = true;
  document.querySelector('#guides').dispatchEvent(new Event('change'));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const row = y => { const d = ctx.getImageData(0, y, c.width, 1).data; let red = 0; for (let i = 0; i < d.length; i += 4) if (d[i] - d[i + 2] > 25 && d[i] > 120) red++; return red; };
  return { effective: S.effectiveSurface(), top0: row(0), top2: row(2), bottom: row(c.height - 1), bottom3: row(c.height - 3), W: c.width };
});
console.log('desktop+lock, guides on, red-tinted pixels per edge row:', JSON.stringify(edge));
await browser.close();
