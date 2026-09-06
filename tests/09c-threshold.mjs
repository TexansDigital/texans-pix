// P1-4: the Ticker kicker used to run off the plate. monoStamp now takes a
// maxWidth and shrinks. Sweep the kicker from 1 char to its 24-char maxlength
// on every device, with SEC and SINCE also present (the widest real line).
import { launch, feed, INK_RECORDER } from './lib.mjs';
const { browser, page } = await launch();
await feed(page, '/home/user/texans-pix/tests/out/exif0-landscape.jpg', 'exif0-landscape.jpg');
await page.evaluate(INK_RECORDER);

const res = await page.evaluate(() => {
  const S = window.__studio, c = document.querySelector('#stage');
  const isMono = f => /Azeret|monospace|Menlo/.test(f);
  const devices = [...document.querySelectorAll('#device option')].map(o => o.value);

  const run = (dev, surface, tpl, kicker, extra = {}) => {
    S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl);
    S.setFields({ headline: 'Houston', name: '', number: '', section: '132', since: '2002', kicker, ...extra });
    window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
    const d = S.state.device, eff = S.effectiveSurface();
    const stripH = Math.round(c.height * 0.028);
    const stripTop = eff === 'lock' && d.lock ? Math.round(c.height * (d.lock.controlsTop - 0.03)) : c.height - stripH;
    const k = window.__ink.filter(i => isMono(i.font) && i.text.trim() &&
      !(i.y0 >= stripTop - 2 && i.y1 <= stripTop + stripH + 2));
    if (!k.length) return null;
    const size = +(/(\d+(?:\.\d+)?)px/.exec(k[0].font) || [0, 0])[1];
    return { W: c.width, margin: Math.round(c.width * 0.062), maxX: Math.max(...k.map(i => i.x1)),
      minX: Math.min(...k.map(i => i.x0)), size, eff, text: k.map(i => i.text).join('') };
  };

  const out = { sweep: [], real: [], allTemplates: [] };
  for (const dev of devices) {
    for (const surface of ['lock', 'home']) {
      let pastMargin = null, offCanvas = null, worst = 0, worstN = 0, minSize = Infinity, baseSize = 0;
      for (let n = 1; n <= 24; n++) {
        const r = run(dev, surface, 'ticker', 'W'.repeat(n));
        if (!r) continue;
        if (n === 1) baseSize = r.size;
        minSize = Math.min(minSize, r.size);
        if (!pastMargin && r.maxX > r.W - r.margin + 1) pastMargin = n;
        if (!offCanvas && r.maxX > r.W) offCanvas = n;
        if (r.maxX - (r.W - r.margin) > worst - 1e9 && r.maxX > worst) { worst = r.maxX; worstN = n; }
      }
      const r24 = run(dev, surface, 'ticker', 'PRESEASON WEEK 01 XXXXXX');
      out.sweep.push({ dev, surface: r24.eff, pastMargin, offCanvas, worstMaxX: +worst.toFixed(0), worstN,
        W: r24.W, marginLimit: r24.W - r24.margin, baseSize: +baseSize.toFixed(1), minSize: +minSize.toFixed(1),
        real24: +r24.maxX.toFixed(0), real24Size: +r24.size.toFixed(1) });
    }
  }
  // and the same worst-case kicker through every template that draws one
  for (const tpl of ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey'])
    for (const dev of ['ip-se', 'ip-16-pro-max', 'desktop'])
      for (const k of ['WWWWWWWWWWWWWWWWWWWWWWWW', 'MMMMMMMMMMMMMMMMMMMMMMMM', 'PRESEASON WEEK 01 XXXXXX']) {
        const r = run(dev, 'lock', tpl, k, { section: 'CLUBAB', since: '2002', name: 'MMMMMMMMMMMMMMMMMMMMMMMM', number: '88' });
        if (r) out.allTemplates.push({ tpl, dev, kicker: k.slice(0, 10), maxX: +r.maxX.toFixed(0), minX: +r.minX.toFixed(0), W: r.W, limit: r.W - r.margin, size: +r.size.toFixed(1) });
      }
  return out;
});

console.log('=== Ticker kicker sweep, "W" x 1..24 with SEC 132 // SINCE 2002 ===');
console.table(res.sweep.map(r => ({ device: r.dev, surface: r.surface, W: r.W, marginLimit: r.marginLimit,
  'passes margin at n': r.pastMargin ?? '-', 'leaves canvas at n': r.offCanvas ?? '-',
  'widest maxX': r.worstMaxX, 'stamp size 1ch -> 24ch': `${r.baseSize} -> ${r.minSize}`,
  'real 24-char maxX': r.real24 })));
const bad = res.sweep.filter(r => r.offCanvas || r.pastMargin);
console.log(bad.length ? 'FAIL on: ' + JSON.stringify(bad) : 'PASS: no device/surface lets the ticker kicker pass the safe margin at any kicker length up to maxlength.');

console.log('\n=== Widest possible mono line through every template (max kicker + max section + since + name + number) ===');
console.table(res.allTemplates.map(r => ({ ...r, verdict: r.maxX > r.W ? 'OFF CANVAS' : r.maxX > r.limit ? 'past margin' : 'ok' })));
const bad2 = res.allTemplates.filter(r => r.maxX > r.limit);
console.log(bad2.length ? 'mono overflow remains on: ' + JSON.stringify(bad2) : 'PASS: every mono stamp shrinks to fit inside the margins.');
await browser.close();
