// Every template x every device x both surfaces x a spread of field values.
// Asserts ink stays inside the safe band, inside the side margins, on the
// canvas, and out of the device's own UI zones.
import { launch, feed, INK_RECORDER, isMono, BLANK_FIELDS } from './lib.mjs';

const { browser, page } = await launch();
await feed(page, new URL('./out/exif0-landscape.jpg', import.meta.url).pathname, 'exif0-landscape.jpg');
await page.evaluate(INK_RECORDER);

// maxlength on each input in index.html, so "the worst a fan can type".
const MAX = { headline: 28, name: 24, number: 2, section: 6, since: 4, kicker: 24 };
const W = n => 'W'.repeat(n);          // widest common glyph
const M = n => 'M'.repeat(n);

const cases = [
  { name: 'defaults', fields: { ...BLANK_FIELDS, kicker: 'WEEK 01' } },
  { name: 'all-empty', fields: { ...BLANK_FIELDS } },
  { name: 'all-spaces', fields: { headline: '  ', name: ' ', number: ' ', section: '   ', since: ' ', kicker: '  ' } },
  { name: 'typical', fields: { headline: 'Houston', name: 'Marcus', number: '04', section: '132', since: '2002', kicker: 'Week 01' } },
  { name: 'headline-max-words', fields: { ...BLANK_FIELDS, headline: 'ABCDEFGHIJ KLMNOPQRST UVWXY', kicker: 'Week 01' } },
  { name: 'headline-max-unbroken', fields: { ...BLANK_FIELDS, headline: W(MAX.headline) } },
  { name: 'name-max-unbroken', fields: { ...BLANK_FIELDS, name: M(MAX.name) } },
  { name: 'papadopoulos', fields: { ...BLANK_FIELDS, name: 'PAPADOPOULOS-JONES' } },
  { name: 'number-00', fields: { ...BLANK_FIELDS, name: 'Bo', number: '00' } },
  { name: 'section-letters', fields: { ...BLANK_FIELDS, section: 'CLUBAB' } },
  { name: 'max-everything', fields: { headline: W(MAX.headline), name: M(MAX.name), number: 'WW', section: W(MAX.section), since: W(MAX.since), kicker: W(MAX.kicker) } },
  { name: 'max-everything-real', fields: { headline: 'ABCDEFGHIJ KLMNOPQRST UVWXY', name: 'WWWWWWWWWWWWWWWWWWWWWWWW', number: '88', section: 'CLUBAB', since: '2002', kicker: 'PRESEASON WEEK 01 XXXXXX' } },
];

const devices = await page.evaluate(() => [...document.querySelectorAll('#device option')].map(o => o.value));
const templates = await page.evaluate(() => [...document.querySelectorAll('.tpl')].map(b => b.dataset.id));

const findings = [];
for (const dev of devices) {
  for (const surface of ['lock', 'home']) {
    for (const tpl of templates) {
      for (const c of cases) {
        const r = await page.evaluate(async ({ dev, surface, tpl, fields }) => {
          const S = window.__studio;
          const { typeBand } = await import('/src/devices.js');
          S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl); S.setFields(fields);
          window.__ink = []; window.__recording = true;
          S.render(false);
          window.__recording = false;
          // The app coerces lock -> home where there is no lock screen; the
          // assertions have to use the surface that was actually drawn.
          const eff = S.effectiveSurface();
          const d = S.state.device, c = document.querySelector('#stage');
          const band = typeBand(d, eff);
          const zones = [];
          if (eff === 'lock' && d.lock) {
            zones.push(['clock', d.lock.clockTop * c.height, d.lock.clockBottom * c.height]);
            zones.push(['widgets', d.lock.clockBottom * c.height, d.lock.widgetBottom * c.height]);
            zones.push(['controls', d.lock.controlsTop * c.height, c.height]);
          } else if (d.home) {
            if (d.home.statusBottom > 0) zones.push(['status', 0, d.home.statusBottom * c.height]);
            if (d.home.dockTop < 1) zones.push(['dock', d.home.dockTop * c.height, c.height]);
          }
          // Ticker's own strip glyphs are deliberately full-bleed. Its top is
          // f.bottom on a lock screen now, not H - stripH, so compute it the
          // way the template does.
          const stripH = Math.round(c.height * 0.028);
          const m = Math.round(c.width * 0.062);
          const lockZ = eff === 'lock' ? d.lock : null;
          const fBottom = lockZ ? c.height * (lockZ.controlsTop - 0.03)
                                : c.height * ((d.home || { dockTop: 0.86 }).dockTop - 0.03);
          const stripTop = lockZ ? Math.round(fBottom) : c.height - stripH;
          return { ink: window.__ink, W: c.width, H: c.height, band, zones, margin: m, stripTop, stripH, eff };
        }, { dev, surface, tpl, fields: c.fields });

        const bandTop = r.band.top * r.H, bandBottom = r.band.bottom * r.H;
        for (const ink of r.ink) {
          if (!ink.text.trim()) continue;
          if (tpl === 'ticker' && ink.y0 >= r.stripTop - 2 && ink.y1 <= r.stripTop + r.stripH + 2) continue;
          const tag = `${dev}/${r.eff}/${tpl}/${c.name}`;
          const push = (kind, detail) => findings.push({ tag, kind, text: ink.text.slice(0, 24), detail });
          if (ink.y0 < bandTop - 1) push('above-safe-band', `y0=${ink.y0.toFixed(0)} < bandTop=${bandTop.toFixed(0)}`);
          if (ink.y1 > bandBottom + 1) push('below-safe-band', `y1=${ink.y1.toFixed(0)} > bandBottom=${bandBottom.toFixed(0)}`);
          if (ink.x0 < r.margin - 1) push('left-overflow', `x0=${ink.x0.toFixed(0)} < margin=${r.margin}`);
          if (ink.x1 > r.W - r.margin + 1) push('right-overflow', `x1=${ink.x1.toFixed(0)} > ${r.W - r.margin}`);
          if (ink.x1 > r.W + 0.5 || ink.x0 < -0.5) push('OFF-CANVAS', `x=[${ink.x0.toFixed(0)},${ink.x1.toFixed(0)}] canvas 0..${r.W}`);
          if (ink.y1 > r.H + 0.5 || ink.y0 < -0.5) push('OFF-CANVAS-V', `y=[${ink.y0.toFixed(0)},${ink.y1.toFixed(0)}] canvas 0..${r.H}`);
          for (const [zname, zt, zb] of r.zones) {
            if (ink.y1 > zt + 1 && ink.y0 < zb - 1) push('in-' + zname, `[${ink.y0.toFixed(0)},${ink.y1.toFixed(0)}] vs ${zname}[${zt.toFixed(0)},${zb.toFixed(0)}]`);
          }
          if (/\/\/\s*$/.test(ink.text) || /^\s*\/\//.test(ink.text)) push('orphan-separator', ink.text);
          if (!isMono(ink.font) && ink.text !== ink.text.toUpperCase()) push('not-uppercase', ink.text);
        }
      }
    }
  }
}

const byKind = {};
for (const f of findings) {
  const key = `${f.kind}|${f.tag.split('/').slice(1).join('/')}`;
  (byKind[key] ||= []).push(f);
}
console.log('combinations:', devices.length * 2 * templates.length * cases.length);
console.log('total ink violations:', findings.length);
for (const [k, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${k}  x${list.length}  devices: ${[...new Set(list.map(f => f.tag.split('/')[0]))].join(',')}`);
  console.log('   e.g.', JSON.stringify(list[0]));
}
if (!findings.length) console.log('\nPASS: no ink left its safe band, its margins, the canvas, or entered a device UI zone.');
await browser.close();
