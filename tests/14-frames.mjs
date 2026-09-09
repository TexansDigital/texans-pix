// Frame templates must leave the photograph's middle exactly as the photo drew
// it. Rendered twice per case — once with the template, once with the template
// suppressed — and the two are compared pixel for pixel inside the centre box.
// A frame that dims a face by one level fails here.
import { launch, feed, settle } from './lib.mjs';
import { join } from 'node:path';

const FIXTURES = new URL('./out/', import.meta.url).pathname;
// Three grounds, because ink only shows against a ground that contrasts with
// it. A first pass of this test ran on the white fixture alone and scored every
// frame a perfect zero — white keylines over white photography are invisible to
// a difference, not absent from it.
const PHOTOS = ['white-2000x3000.png', 'grey-2000x3000.png', 'dark-2000x3000.png'];
const CASES = [
  ['ip-16-pro-max', 'lock'], ['ip-16-pro-max', 'home'],
  ['ip-se', 'lock'], ['ip-se', 'home'],
  ['sg-ultra', 'home'], ['px-9', 'lock'],
  ['ipad', 'home'], ['desktop', 'home'],
  ['share-square', 'home'], ['share-story', 'home'],
];
const FIELDS = {
  name: 'ADAM CANN', number: '77', section: '132', row: '9', seat: '14',
  since: '2002', kicker: 'Q3 // 42 YD TD', headline: '',
};

const { browser, page, errors } = await launch();
const ids = await page.evaluate(() =>
  window.__studio.templates.map(t => ({ id: t.id, frame: !!t.frame })));
await page.evaluate(f => window.__studio.setFields(f), FIELDS);

const results = [];
for (const photo of PHOTOS) {
await feed(page, join(FIXTURES, photo), photo);
for (const [device, surface] of CASES) {
  for (const t of ids) {
    const r = await page.evaluate(async ({ device, surface, id }) => {
      const s = window.__studio;
      s.setDevice(device); s.setSurface(surface); s.setTemplate(id);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = document.querySelector('canvas');
      const g = c.getContext('2d', { willReadFrequently: true });
      const W = c.width, H = c.height;
      const withT = g.getImageData(0, 0, W, H).data;

      // Same function, overlay suppressed: the photograph alone.
      s.paint(g, W, H, false, { overlay: false });
      const bare = g.getImageData(0, 0, W, H).data;

      // Centre box: the middle half in both axes, where a face sits.
      const x0 = Math.floor(W * 0.25), x1 = Math.ceil(W * 0.75);
      const y0 = Math.floor(H * 0.28), y1 = Math.ceil(H * 0.72);
      const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      let touched = 0, total = 0, maxDelta = 0, dimSum = 0, maxDim = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          total += 1;
          const d = Math.abs(withT[i] - bare[i]) + Math.abs(withT[i + 1] - bare[i + 1]) + Math.abs(withT[i + 2] - bare[i + 2]);
          if (d > 6) { touched += 1; if (d > maxDelta) maxDelta = d; }
          // Dimming is the thing a frame must never do: a scrim over a face
          // costs luminance, a hairline rule laid across the plate does not.
          const dim = lum(bare, i) - lum(withT, i);
          if (dim > 0) { dimSum += dim; if (dim > maxDim) maxDim = dim; }
        }
      }
      // Any ink outside the plate is a defect regardless of template kind.
      let edgeInk = 0;
      for (let x = 0; x < W; x++) {
        const top = (0 * W + x) * 4, bot = ((H - 1) * W + x) * 4;
        if (withT[top + 3] === 0 || withT[bot + 3] === 0) edgeInk += 1;
      }
      return { touchedFrac: touched / total, maxDelta, meanDim: dimSum / total, maxDim, W, H, edgeInk };
    }, { device, surface, id: t.id });
    results.push({ photo, device, surface, id: t.id, frame: t.frame, ...r });
  }
}
}
await browser.close();

// A hairline keyline laid across the plate is a frame edge, not an element
// dropped on the middle: it can cross the box while covering almost none of it.
// A scrim covers most of it and darkens what it covers. These two thresholds
// are what separates the kinds.
const COVER_MAX = 0.02;   // 2% of the centre box
const DIM_MAX = 1.5;      // mean luminance lost, 0-255
const fails = [];
for (const r of results) {
  const where = `${r.id} @ ${r.device}/${r.surface} on ${r.photo.split('-')[0]}`;
  if (r.edgeInk) fails.push(`${where}: ${r.edgeInk} transparent edge pixels`);
  if (!r.frame) continue;
  if (r.touchedFrac > COVER_MAX) {
    fails.push(`${where}: covered ${(r.touchedFrac * 100).toFixed(2)}% of the centre`);
  }
  if (r.meanDim > DIM_MAX) {
    fails.push(`${where}: dimmed the centre by ${r.meanDim.toFixed(1)} (max pixel ${r.maxDim.toFixed(0)})`);
  }
}
const mean = (a, k) => a.length ? a.reduce((s, r) => s + r[k], 0) / a.length : 0;
const worst = (a, k) => a.reduce((m, r) => Math.max(m, r[k]), 0);
for (const [kind, rows] of [['frame', results.filter(r => r.frame)], ['type-led', results.filter(r => !r.frame)]]) {
  console.log(`${kind.padEnd(9)} centre covered ${(mean(rows, 'touchedFrac') * 100).toFixed(1)}% avg / ${(worst(rows, 'touchedFrac') * 100).toFixed(1)}% worst   dimmed ${mean(rows, 'meanDim').toFixed(1)} avg / ${worst(rows, 'meanDim').toFixed(1)} worst   (${rows.length} renders)`);
}
console.log('');
for (const id of [...new Set(results.filter(r => r.frame).map(r => r.id))]) {
  const rows = results.filter(r => r.id === id);
  console.log(`  ${id.padEnd(9)} covered ${(worst(rows, 'touchedFrac') * 100).toFixed(2)}% worst   dimmed ${worst(rows, 'meanDim').toFixed(2)} worst`);
}
if (errors.length) console.log('\nconsole:\n  ' + errors.slice(0, 6).join('\n  '));
if (fails.length) { console.log('\nFAIL\n  ' + fails.slice(0, 20).join('\n  ')); process.exit(1); }
console.log(`\nPASS  ${results.length} renders. No frame dimmed the centre at all; the worst covered ${(worst(results.filter(r => r.frame), 'touchedFrac') * 100).toFixed(2)}% of it with a hairline.`);
