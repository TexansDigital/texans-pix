import { launch, feed } from './lib.mjs';

const { browser, page } = await launch();
await page.waitForTimeout(1200);
const SRC = process.env.SRC || 'white-2000x3000.png';
await feed(page, new URL('./out/' + SRC, import.meta.url).pathname, SRC);
console.log('source photo:', SRC);

await page.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
  window.__ink = []; window.__recording = false; window.__suppress = false;
  P.fillText = function (t, x, y, ...r) {
    if (window.__recording) {
      const m = this.measureText(t);
      let left = x - m.actualBoundingBoxLeft, right = x + m.actualBoundingBoxRight;
      if (this.textAlign === 'center') { left = x - m.width / 2; right = x + m.width / 2; }
      window.__ink.push({ text: String(t), x0: left, x1: right, y0: y - m.actualBoundingBoxAscent, y1: y + m.actualBoundingBoxDescent, fill: String(this.fillStyle), alpha: this.globalAlpha, font: this.font });
    }
    if (window.__suppress) return;
    return orig.apply(this, [t, x, y, ...r]);
  };
});

const lum = c => { const s = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const parse = f => {
  if (f.startsWith('#')) return [1,3,5].map(i => parseInt(f.slice(i, i + 2), 16));
  const m = f.match(/rgba?\(([^)]+)\)/); if (!m) return null;
  const p = m[1].split(',').map(Number); return { rgb: p.slice(0, 3), a: p[3] ?? 1 };
};

const fields = { headline: 'Houston', name: 'Marcus Ryan', number: '04', section: '132', since: '2002', kicker: 'Week 01' };
const rows = [];
for (const dev of ['ip-16-pro-max', 'ip-se', 'desktop']) {
  for (const surface of ['lock', 'home']) {
    for (const tpl of ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey']) {
      const r = await page.evaluate(async ({ dev, surface, tpl, fields }) => {
        const S = window.__studio, c = document.querySelector('#stage'), ctx = c.getContext('2d');
        S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl); S.setFields(fields);
        window.__ink = []; window.__recording = true; window.__suppress = false;
        S.render(false); window.__recording = false;
        const ink = window.__ink.filter(i => i.text.trim());
        // redraw with the type suppressed to read what sits behind it
        window.__suppress = true; S.render(false); window.__suppress = false;
        const out = ink.map(i => {
          const x = Math.max(0, Math.round(i.x0)), y = Math.max(0, Math.round(i.y0));
          const w = Math.min(c.width - x, Math.max(1, Math.round(i.x1 - i.x0)));
          const h = Math.min(c.height - y, Math.max(1, Math.round(i.y1 - i.y0)));
          if (w < 1 || h < 1) return null;
          const d = ctx.getImageData(x, y, w, h).data;
          let R = 0, G = 0, B = 0, n = 0, maxL = -1, maxPx = null;
          for (let p = 0; p < d.length; p += 4) {
            R += d[p]; G += d[p+1]; B += d[p+2]; n++;
            const L = 0.2126*d[p] + 0.7152*d[p+1] + 0.0722*d[p+2];
            if (L > maxL) { maxL = L; maxPx = [d[p], d[p+1], d[p+2]]; }
          }
          return { text: i.text.slice(0, 20), fill: i.fill, alpha: i.alpha, font: i.font.slice(0, 28),
                   meanBehind: [Math.round(R/n), Math.round(G/n), Math.round(B/n)], lightestBehind: maxPx };
        }).filter(Boolean);
        S.render(false);
        return out;
      }, { dev, surface, tpl, fields });

      for (const i of r) {
        const p = parse(i.fill);
        const rgb = Array.isArray(p) ? p : p.rgb;
        const a = Array.isArray(p) ? 1 : p.a;
        const eff = a * i.alpha;
        // effective text colour once its own alpha is composited over the backdrop
        const over = bg => rgb.map((v, k) => v * eff + bg[k] * (1 - eff));
        rows.push({
          dev, surface, tpl, text: i.text,
          fill: i.fill, meanBehind: i.meanBehind.join(','), lightestBehind: i.lightestBehind.join(','),
          crMean: +ratio(over(i.meanBehind), i.meanBehind).toFixed(2),
          crWorst: +ratio(over(i.lightestBehind), i.lightestBehind).toFixed(2),
        });
      }
    }
  }
}
// aggregate: the worst mean-contrast run per template x device x surface
const agg = {};
for (const r of rows) {
  const k = `${r.tpl}|${r.dev}|${r.surface}`;
  if (!agg[k] || r.crMean < agg[k].crMean) agg[k] = r;
}
console.log('\n--- worst run per template x device x surface (mean backdrop) ---');
console.table(Object.entries(agg).map(([k, r]) => ({ key: k, text: r.text, fill: r.fill, behind: r.meanBehind, crMean: r.crMean })).sort((a,b)=>a.crMean-b.crMean));
const worst = rows.slice().sort((a, b) => a.crWorst - b.crWorst);
console.log('type runs measured:', rows.length);
console.log('\n--- 25 worst contrast ratios over a PURE WHITE photo ---');
console.table(worst.slice(0, 25));
console.log('\nruns below 4.5:1 (WCAG AA body):', rows.filter(r => r.crWorst < 4.5).length);
console.log('runs below 3:1 (large text AA):', rows.filter(r => r.crWorst < 3).length);
console.log('runs below 2:1 (visibly unreadable):', rows.filter(r => r.crWorst < 2).length);
await browser.close();
