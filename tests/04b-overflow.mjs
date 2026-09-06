import { launch, feed } from './lib.mjs';

const { browser, page } = await launch();
await page.waitForTimeout(1200);
await feed(page, new URL('./out/exif0-landscape.jpg', import.meta.url).pathname, 'exif0-landscape.jpg');

await page.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
  window.__ink = []; window.__recording = false;
  P.fillText = function (t, x, y, ...r) {
    if (window.__recording) {
      const m = this.measureText(t);
      let left = x - m.actualBoundingBoxLeft, right = x + m.actualBoundingBoxRight;
      if (this.textAlign === 'center') { left = x - m.width / 2; right = x + m.width / 2; }
      window.__ink.push({ text: String(t), x0: left, x1: right, y0: y - m.actualBoundingBoxAscent, y1: y + m.actualBoundingBoxDescent, font: this.font });
    }
    return orig.apply(this, [t, x, y, ...r]);
  };
});

const shot = (dev, surface, tpl, fields) => page.evaluate(async ({ dev, surface, tpl, fields }) => {
  const S = window.__studio;
  S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl); S.setFields(fields);
  window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
  const c = document.querySelector('#stage');
  const strip = c.height - Math.round(c.height * 0.028) - 2;
  const ink = window.__ink.filter(i => i.text.trim() && !(tpl === 'ticker' && i.y0 >= strip));
  return { W: c.width, H: c.height, margin: Math.round(c.width * 0.062), ink };
}, { dev, surface, tpl, fields });

console.log('=== 1. Shortest unbroken name that escapes the frame / canvas (lock, ip-16-pro-max) ===');
for (const tpl of ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey']) {
  let firstFrame = null, firstCanvas = null;
  for (let n = 6; n <= 24; n++) {
    const name = 'M'.repeat(n);
    const r = await shot('ip-16-pro-max', 'lock', tpl, { headline: '', name, number: '', section: '', since: '', kicker: '' });
    const worst = r.ink.reduce((a, i) => Math.max(a, i.x1), 0);
    const minx = r.ink.reduce((a, i) => Math.min(a, i.x0), 1e9);
    if (!firstFrame && (worst > r.W - r.margin + 2 || minx < r.margin - 6)) firstFrame = { n, worst: worst.toFixed(0), minx: minx.toFixed(0), limit: r.W - r.margin };
    if (!firstCanvas && (worst > r.W + 1 || minx < -1)) firstCanvas = { n, worst: worst.toFixed(0), minx: minx.toFixed(0), W: r.W };
  }
  console.log(` ${tpl.padEnd(11)} escapes safe margin at n=${firstFrame ? JSON.stringify(firstFrame) : 'never'}   escapes CANVAS at n=${firstCanvas ? JSON.stringify(firstCanvas) : 'never'}`);
}

console.log('\n=== 2. Real-word check: a long single surname ===');
for (const name of ['VANDERPLOEG', 'SCHWARZENEGGER', 'PAPADOPOULOS-JONES', 'HOUSTONTEXANSFAN']) {
  const r = await shot('ip-16-pro-max', 'lock', 'battle', { headline: '', name, number: '', section: '', since: '', kicker: '' });
  const worst = Math.max(...r.ink.map(i => i.x1));
  console.log(` ${name.padEnd(20)} len=${String(name.length).padEnd(2)} maxX=${worst.toFixed(0)} frameRight=${r.W - r.margin} canvasW=${r.W} ${worst > r.W ? 'OFF-CANVAS' : worst > r.W - r.margin ? 'past margin' : 'ok'}`);
}

console.log('\n=== 3. Mono stamp overflow (max personalisation) on every device, narrowest first ===');
const devs = await page.evaluate(() => [...document.querySelectorAll('#device option')].map(o => o.value));
const fields = { headline: 'Houston', name: 'Marcus', number: '88', section: 'CLUBAB', since: '2002', kicker: 'PRESEASON WEEK 01 XXXXXX' };
for (const tpl of ['battle', 'stamp', 'ticker', 'jersey', 'deep-steel']) {
  const bad = [];
  for (const d of devs) {
    const r = await shot(d, 'lock', tpl, fields);
    const mono = r.ink.filter(i => /Azeret|monospace/.test(i.font));
    if (!mono.length) continue;
    const worst = Math.max(...mono.map(i => i.x1));
    if (worst > r.W - r.margin + 2) bad.push(`${d}: maxX=${worst.toFixed(0)} limit=${r.W - r.margin} canvas=${r.W}${worst > r.W ? ' OFF-CANVAS' : ''}`);
  }
  console.log(` ${tpl}: ${bad.length ? bad.join(' | ') : 'no mono overflow'}`);
}

console.log('\n=== 4. Orphan separators / stray punctuation with sparse fields ===');
const probes = [
  ['all empty', { headline: '', name: '', number: '', section: '', since: '', kicker: '' }],
  ['only spaces', { headline: '   ', name: '  ', number: ' ', section: '   ', since: ' ', kicker: '   ' }],
  ['section only', { headline: '', name: '', number: '', section: '132', since: '', kicker: '' }],
  ['since only', { headline: '', name: '', number: '', section: '', since: '2002', kicker: '' }],
  ['number only', { headline: '', name: '', number: '04', section: '', since: '', kicker: '' }],
];
for (const tpl of ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey']) {
  for (const [label, f] of probes) {
    const r = await shot('ip-16-pro-max', 'lock', tpl, f);
    const strings = r.ink.filter(i => /Azeret|monospace/.test(i.font)).map(i => i.text).join('');
    const display = r.ink.filter(i => !/Azeret|monospace/.test(i.font)).map(i => i.text).join(' | ');
    const flag = /(^|\s)\/\/\s*$|^\s*\/\/|\/\/\s*\/\//.test(strings) ? '  <-- ORPHAN' : '';
    console.log(` ${tpl.padEnd(11)} ${label.padEnd(13)} mono="${strings}" display="${display}"${flag}`);
  }
}

console.log('\n=== 5. Uppercase rule: letters in the Number field ===');
{
  const r = await shot('ip-16-pro-max', 'lock', 'jersey', { headline: '', name: 'bo', number: 'ab', section: '', since: '', kicker: '' });
  console.log(' ink drawn:', JSON.stringify(r.ink.map(i => i.text)));
}
{
  const r = await shot('ip-16-pro-max', 'lock', 'jersey', { headline: '', name: '', number: '00', section: '', since: '', kicker: '' });
  console.log(' number "00":', JSON.stringify(r.ink.map(i => ({ t: i.text, x0: +i.x0.toFixed(0), x1: +i.x1.toFixed(0), y0: +i.y0.toFixed(0), y1: +i.y1.toFixed(0) }))));
}
await browser.close();
