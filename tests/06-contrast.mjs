// P1-2: do the adaptive scrims actually protect the type?
// For every type run the harness draws the frame, records the ink box, redraws
// with the type suppressed, and reads the real backdrop pixels under that box.
// Contrast is computed against the mean backdrop and against the single
// lightest pixel in the box (the honest worst case).
import { launch, feed, INK_RECORDER } from './lib.mjs';

const { browser, page } = await launch();
await page.evaluate(INK_RECORDER);

const lum = c => { const s = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const parse = f => {
  if (f.startsWith('#')) return { rgb: [1, 3, 5].map(i => parseInt(f.slice(i, i + 2), 16)), a: 1 };
  const m = f.match(/rgba?\(([^)]+)\)/); if (!m) return null;
  const p = m[1].split(',').map(Number); return { rgb: p.slice(0, 3), a: p[3] ?? 1 };
};

const SOURCES = (process.env.SRC || 'white-2000x3000.png,dark-2000x3000.png,grey-2000x3000.png,split-2000x3000.png,checker-2000x3000.png').split(',');
const fields = { headline: 'Houston', name: 'Marcus Ryan', number: '04', section: '132', since: '2002', kicker: 'Week 01' };
const DEVICES = ['ip-16-pro-max', 'ip-se', 'desktop'];
const TEMPLATES = ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey'];

const all = [];
for (const SRC of SOURCES) {
  await feed(page, new URL('./out/' + SRC, import.meta.url).pathname, SRC);
  for (const dev of DEVICES) {
    for (const surface of ['lock', 'home']) {
      for (const tpl of TEMPLATES) {
        const r = await page.evaluate(async ({ dev, surface, tpl, fields }) => {
          const S = window.__studio, c = document.querySelector('#stage'), ctx = c.getContext('2d');
          S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl); S.setFields(fields);
          window.__ink = []; window.__recording = true; window.__suppress = false;
          S.render(false); window.__recording = false;
          const ink = window.__ink.filter(i => i.text.trim());
          window.__suppress = true; S.render(false); window.__suppress = false;
          const out = ink.map(i => {
            const x = Math.max(0, Math.round(i.x0)), y = Math.max(0, Math.round(i.y0));
            const w = Math.min(c.width - x, Math.max(1, Math.round(i.x1 - i.x0)));
            const h = Math.min(c.height - y, Math.max(1, Math.round(i.y1 - i.y0)));
            if (w < 1 || h < 1) return null;
            const d = ctx.getImageData(x, y, w, h).data;
            let R = 0, G = 0, B = 0, n = 0, maxL = -1, maxPx = null;
            const hist = [];
            for (let p = 0; p < d.length; p += 4) {
              R += d[p]; G += d[p + 1]; B += d[p + 2]; n++;
              const L = 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
              if (L > maxL) { maxL = L; maxPx = [d[p], d[p + 1], d[p + 2]]; }
              if ((p / 4) % 7 === 0) hist.push([d[p], d[p + 1], d[p + 2]]);
            }
            const size = +(/(\d+(?:\.\d+)?)px/.exec(i.font) || [0, 0])[1];
            return { text: i.text.slice(0, 18), fill: i.fill, alpha: i.alpha, size,
              mono: /Azeret|monospace|Menlo/.test(i.font),
              meanBehind: [Math.round(R / n), Math.round(G / n), Math.round(B / n)],
              lightestBehind: maxPx, hist };
          }).filter(Boolean);
          S.render(false);
          return out;
        }, { dev, surface, tpl, fields });

        for (const i of r) {
          const p = parse(i.fill); if (!p) continue;
          const eff = p.a * i.alpha;
          const over = bg => p.rgb.map((v, k) => v * eff + bg[k] * (1 - eff));
          // WCAG "large text" = >=24px, or >=18.7px bold. Everything the studio
          // draws on a 1000px+ canvas is far past that, so 3:1 is the bar for
          // display runs; mono stamps are small relative to the plate but are
          // still >=16px of a ~1200px-wide canvas, i.e. large when viewed.
          all.push({ src: SRC, dev, surface, tpl, text: i.text, kind: i.mono ? 'mono' : 'display',
            size: i.size, fill: i.fill,
            behind: i.meanBehind.join(','), lightest: i.lightestBehind.join(','),
            crMean: +ratio(over(i.meanBehind), i.meanBehind).toFixed(2),
            crLightest: +ratio(over(i.lightestBehind), i.lightestBehind).toFixed(2),
            // Red hot sits mid-scale (L 0.213), so the WORST backdrop is the one
            // closest to the ink's own luminance, not the lightest one. Scan the
            // sampled backdrop pixels and keep the minimum.
            crWorst: +i.hist.reduce((m, bg) => Math.min(m, ratio(over(bg), bg)), Infinity).toFixed(2),
            worstBehind: i.hist.reduce((a, bg) => ratio(over(bg), bg) < ratio(over(a), a) ? bg : a, i.hist[0] || [0, 0, 0]).join(',') });
        }
      }
    }
  }
}

console.log('type runs measured:', all.length, 'over', SOURCES.length, 'photos');

console.log('\n=== Worst contrast per template x photo (single lightest backdrop pixel under the run) ===');
const agg = {};
for (const r of all) {
  const k = `${r.tpl}|${r.src}`;
  if (!agg[k] || r.crWorst < agg[k].crWorst) agg[k] = r;
}
console.table(Object.entries(agg).map(([k, r]) => ({
  template: k.split('|')[0], photo: k.split('|')[1].replace(/-\d+x\d+\.\w+$/, ''),
  where: `${r.dev}/${r.surface}`, run: r.text, kind: r.kind, fill: r.fill,
  worstBehind: r.worstBehind, crWorst: r.crWorst, crMean: r.crMean, crLightest: r.crLightest,
})).sort((a, b) => a.crWorst - b.crWorst));

console.log('\n=== Worst per template across ALL photos ===');
const perT = {};
for (const r of all) if (!perT[r.tpl] || r.crWorst < perT[r.tpl].crWorst) perT[r.tpl] = r;
console.table(Object.values(perT).map(r => ({ template: r.tpl, photo: r.src, where: `${r.dev}/${r.surface}`, run: r.text, kind: r.kind, fill: r.fill, worstBehind: r.worstBehind, crWorst: r.crWorst })).sort((a, b) => a.crWorst - b.crWorst));

console.log('\n--- 20 worst runs overall ---');
console.table(all.slice().sort((a, b) => a.crWorst - b.crWorst).slice(0, 20));

for (const bar of [4.5, 3, 2]) {
  const bad = all.filter(r => r.crWorst < bar);
  console.log(`runs below ${bar}:1 (worst-pixel): ${bad.length}` +
    (bad.length ? ` -> ${[...new Set(bad.map(r => `${r.tpl}/${r.src.split('-')[0]}`))].join(', ')}` : ''));
}
const dispFail = all.filter(r => r.kind === 'display' && r.crWorst < 3);
console.log('\nDISPLAY runs below the 3:1 large-text bar:', dispFail.length);
if (dispFail.length) console.table(dispFail.slice(0, 15));

// The headline answer: worst DISPLAY contrast per template, white vs dark,
// split by whether the short/wide desktop plate is included.
console.log('\n=== HEADLINE: worst DISPLAY-type contrast per template ===');
const summary = [];
for (const tpl of TEMPLATES) {
  const row = { template: tpl };
  for (const [label, filt] of [
    ['white(all)', r => r.src.startsWith('white')],
    ['white(phones+tablet)', r => r.src.startsWith('white') && r.dev !== 'desktop'],
    ['dark(all)', r => r.src.startsWith('dark')],
    ['grey(all)', r => r.src.startsWith('grey')],
    ['split(all)', r => r.src.startsWith('split')],
    ['checker(all)', r => r.src.startsWith('checker')],
  ]) {
    const set = all.filter(r => r.tpl === tpl && r.kind === 'display' && filt(r));
    row[label] = set.length ? Math.min(...set.map(r => r.crWorst)) : '-';
  }
  summary.push(row);
}
console.table(summary);
console.log('bar for large display type: 3.0:1   (cells below that are failures)');
await browser.close();
