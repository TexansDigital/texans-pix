import { launch, feed } from './lib.mjs';
const { browser, page } = await launch();
await page.waitForTimeout(1000);
await feed(page, '/home/user/texans-pix/tests/out/exif0-landscape.jpg', 'exif0-landscape.jpg');
await page.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
  window.__ink = []; window.__recording = false;
  P.fillText = function (t, x, y, ...r) {
    if (window.__recording) { const m = this.measureText(t); window.__ink.push({ text: String(t), x0: x - m.actualBoundingBoxLeft, x1: x + m.actualBoundingBoxRight, y, font: this.font }); }
    return orig.apply(this, [t, x, y, ...r]);
  };
});
const run = (dev, tpl, fields) => page.evaluate(async ({ dev, tpl, fields }) => {
  const S = window.__studio; S.setDevice(dev); S.setSurface('lock'); S.setTemplate(tpl);
  S.setFields({ headline: 'Houston', name: '', number: '', section: '', since: '', kicker: '', ...fields });
  window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
  const c = document.querySelector('#stage');
  const stripTop = c.height - Math.round(c.height * 0.028) - 4;
  const kicker = window.__ink.filter(i => /Azeret|monospace/.test(i.font) && i.y < stripTop && i.text.trim());
  return { W: c.width, margin: Math.round(c.width * 0.062), maxX: kicker.length ? Math.max(...kicker.map(i => i.x1)) : 0, text: kicker.map(i => i.text).join('') };
}, { dev, tpl, fields });

for (const dev of ['ip-se', 'ip-xr', 'sg-std', 'ip-16-pro-max', 'ipad']) {
  for (const f of [
    { kicker: 'Week 01', section: '132', since: '2002' },
    { kicker: 'Preseason Week 01', section: '132', since: '2002' },
    { kicker: 'Week 01', section: '132' },
    { kicker: 'Week 01' },
  ]) {
    const r = await run(dev, 'ticker', f);
    const verdict = r.maxX > r.W ? 'OFF CANVAS' : r.maxX > r.W - r.margin ? 'past margin' : 'ok';
    console.log(`${dev.padEnd(14)} kicker="${(f.kicker||'').padEnd(18)}" sec=${(f.section||'-').padEnd(4)} since=${(f.since||'-').padEnd(5)} -> "${r.text}" rightmost=${r.maxX.toFixed(0)} canvas=${r.W} margin-limit=${r.W - r.margin}  ${verdict}`);
  }
}
await browser.close();
