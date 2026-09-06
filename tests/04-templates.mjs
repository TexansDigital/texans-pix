import { launch, feed } from './lib.mjs';

const { browser, page } = await launch();
await page.waitForTimeout(1200);
await feed(page, new URL('./out/exif0-landscape.jpg', import.meta.url).pathname, 'exif0-landscape.jpg');

// Record every fillText the templates make, with a real ink bounding box.
await page.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype;
  const origFill = P.fillText;
  window.__ink = [];
  window.__recording = false;
  P.fillText = function (text, x, y, ...rest) {
    if (window.__recording) {
      const m = this.measureText(text);
      const t = this.getTransform();
      let left = x - m.actualBoundingBoxLeft, right = x + m.actualBoundingBoxRight;
      if (this.textAlign === 'center') { left = x - m.width / 2; right = x + m.width / 2; }
      else if (this.textAlign === 'right' || this.textAlign === 'end') { left = x - m.width; right = x; }
      window.__ink.push({
        text: String(text),
        x0: left * t.a + t.e, x1: right * t.a + t.e,
        y0: (y - m.actualBoundingBoxAscent) * t.d + t.f,
        y1: (y + m.actualBoundingBoxDescent) * t.d + t.f,
        font: this.font, alpha: this.globalAlpha,
      });
    }
    return origFill.apply(this, [text, x, y, ...rest]);
  };
});

const cases = JSON.parse(process.env.CASES || 'null') || [
  { name: 'defaults', fields: { headline: '', name: '', number: '', section: '', since: '', kicker: 'WEEK 01' } },
  { name: 'all-empty', fields: { headline: '', name: '', number: '', section: '', since: '', kicker: '' } },
  { name: 'typical', fields: { headline: 'Houston', name: 'Marcus', number: '04', section: '132', since: '2002', kicker: 'Week 01' } },
  { name: 'headline-28', fields: { headline: 'ABCDEFGHIJ KLMNOPQRST UVWXY', name: '', number: '', section: '', since: '', kicker: 'Week 01' } },
  { name: 'unbroken-name', fields: { headline: '', name: 'MMMMMMMMMMMMMMMMMMMMMMMM', number: '', section: '', since: '', kicker: '' } },
  { name: 'number-00', fields: { headline: '', name: 'Bo', number: '00', section: '', since: '', kicker: '' } },
  { name: 'section-letters', fields: { headline: '', name: '', number: '', section: 'CLUBAB', since: '', kicker: '' } },
  { name: 'max-everything', fields: { headline: 'ABCDEFGHIJ KLMNOPQRST UVWXY', name: 'WWWWWWWWWWWWWWWWWWWWWWWW', number: '88', section: 'CLUBAB', since: '2002', kicker: 'PRESEASON WEEK 01 XXXXXX' } },
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
          const d = S.state.device, c = document.querySelector('#stage');
          const band = typeBand(d, surface);
          const zones = [];
          if (surface === 'lock' && d.lock) {
            zones.push(['clock', d.lock.clockTop * c.height, d.lock.clockBottom * c.height]);
            zones.push(['widgets', d.lock.clockBottom * c.height, d.lock.widgetBottom * c.height]);
            zones.push(['controls', d.lock.controlsTop * c.height, c.height]);
          } else if (d.home) {
            zones.push(['status', 0, d.home.statusBottom * c.height]);
            zones.push(['dock', d.home.dockTop * c.height, c.height]);
          }
          const margin = Math.round(c.width * 0.062);
          return { ink: window.__ink, W: c.width, H: c.height, band, zones, margin };
        }, { dev, surface, tpl, fields: c.fields });

        const bandTop = r.band.top * r.H, bandBottom = r.band.bottom * r.H;
        // merge per-glyph mono runs into logical runs (same font+row) for readable output
        for (const ink of r.ink) {
          if (!ink.text.trim()) continue;
          const isTicker = /HOUSTON TEXANS/.test(ink.text) && ink.font.includes('Azeret') === false ? false : false;
          const tag = `${dev}/${surface}/${tpl}/${c.name}`;
          const push = (kind, detail) => findings.push({ tag, kind, text: ink.text.slice(0, 24), detail });
          if (ink.y0 < bandTop - 1) push('above-safe-band', `y0=${ink.y0.toFixed(0)} < bandTop=${bandTop.toFixed(0)}`);
          if (ink.y1 > bandBottom + 1) push('below-safe-band', `y1=${ink.y1.toFixed(0)} > bandBottom=${bandBottom.toFixed(0)}`);
          if (ink.x0 < r.margin - 1) push('left-overflow', `x0=${ink.x0.toFixed(0)} < margin=${r.margin}`);
          if (ink.x1 > r.W - r.margin + 1) push('right-overflow', `x1=${ink.x1.toFixed(0)} > ${r.W - r.margin}`);
          for (const [zname, zt, zb] of r.zones) {
            if (ink.y1 > zt + 1 && ink.y0 < zb - 1) push('in-' + zname, `[${ink.y0.toFixed(0)},${ink.y1.toFixed(0)}] vs ${zname}[${zt.toFixed(0)},${zb.toFixed(0)}]`);
          }
          if (/\/\/\s*$/.test(ink.text) || /^\s*\/\//.test(ink.text)) push('orphan-separator', ink.text);
        }
      }
    }
  }
}

// summarise
const byKind = {};
for (const f of findings) {
  const key = `${f.kind}|${f.tag.split('/').slice(1).join('/')}`;
  (byKind[key] ||= []).push(f);
}
console.log('total ink violations:', findings.length);
const groups = Object.entries(byKind).sort((a,b)=>b[1].length-a[1].length);
for (const [k, list] of groups) {
  console.log(`\n${k}  x${list.length}  devices: ${[...new Set(list.map(f=>f.tag.split('/')[0]))].join(',')}`);
  console.log('   e.g.', JSON.stringify(list[0]));
}
await browser.close();
