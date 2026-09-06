// P1-3 (shared layout pass), P2-10 (uppercase) and P2-14 (loading line).
import { launch, feed, INK_RECORDER, isMono } from './lib.mjs';
const { browser, page } = await launch();
await feed(page, '/home/user/texans-pix/tests/out/exif0-landscape.jpg', 'exif0-landscape.jpg');
await page.evaluate(INK_RECORDER);

const probe = (dev, tpl, fields) => page.evaluate(async ({ dev, tpl, fields }) => {
  const S = window.__studio; S.setDevice(dev); S.setSurface('lock'); S.setTemplate(tpl);
  S.setFields({ headline: '', name: '', number: '', section: '', since: '', kicker: '', ...fields });
  window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
  const c = document.querySelector('#stage');
  return { W: c.width, H: c.height, ink: window.__ink.filter(i => i.text.trim()) };
}, { dev, tpl, fields });

console.log('=== P1-3: layoutDisplay and drawDisplay must agree, and drop nothing ===');
const headline = 'ALPHA BRAVO CHARLIE DELTA EC';   // 28 chars = the field maxlength
for (const tpl of ['battle', 'deep-steel', 'ticker', 'jersey']) {
  for (const dev of ['ip-16-pro-max', 'ip-se', 'desktop']) {
    const r = await probe(dev, tpl, { headline });
    const d = r.ink.filter(i => !isMono(i.font));
    const drawn = d.map(i => i.text).join(' ');
    const missing = headline.split(' ').filter(w => !drawn.split(/\s+/).includes(w));
    console.log(` ${tpl.padEnd(11)} ${dev.padEnd(14)} lines=${d.length} "${drawn}" ${missing.length ? `<-- DROPPED ${missing.join(',')}` : 'complete'}`);
  }
}

console.log('\n=== Reserved height vs drawn height (the two used to disagree) ===');
for (const [tpl, maxLines] of [['battle', 3], ['deep-steel', 3], ['ticker', 2], ['jersey', 2]]) {
  // Feed only the headline: jersey prefers `name`, and measuring the layout
  // against a different string than the template drew is a harness bug, not a
  // product one.
  const r = await probe('ip-16-pro-max', tpl, { headline });
  const d = r.ink.filter(i => !isMono(i.font));
  const ys = d.map(i => i.y);
  const step = ys.length > 1 ? ys[1] - ys[0] : 0;
  const size = +(/(\d+(?:\.\d+)?)px/.exec(d[0].font) || [0, 0])[1];
  const measured = await page.evaluate(async ({ tpl, headline, maxLines, size }) => {
    const { layoutDisplay } = await import('/src/compose.js');
    const c = document.querySelector('#stage').getContext('2d');
    const W = c.canvas.width, m = Math.round(W * 0.062);
    const base = { battle: 0.135, 'deep-steel': 0.115, ticker: 0.155, jersey: 0.088 }[tpl];
    const L = layoutDisplay(c, headline, { size: Math.round(W * base), maxWidth: W - m * 2, maxLines });
    return { lines: L.lines.length, fontSize: +L.fontSize.toFixed(1), height: +L.height.toFixed(1), lineHeight: L.lineHeight };
  }, { tpl, headline, maxLines, size });
  const drawnHeight = ys.length ? (ys.at(-1) - ys[0]) + size : 0;
  console.log(` ${tpl.padEnd(11)} maxLines=${maxLines} drawn lines=${d.length} layout says ${measured.lines} lines @ ${measured.fontSize}px, height ${measured.height}` +
    `  |  drawn step=${step.toFixed(1)} (expect ${(measured.fontSize * measured.lineHeight).toFixed(1)})` +
    `  ${d.length === measured.lines && Math.abs(step - measured.fontSize * measured.lineHeight) < 1 ? 'AGREE' : '<-- DISAGREE'}`);
}

console.log('\n=== Brand rule: display type is always uppercase ===');
for (const tpl of ['battle', 'deep-steel', 'ticker', 'jersey']) {
  const r = await probe('ip-16-pro-max', tpl, { headline: 'houston we have a problem', name: 'marcus ryan' });
  const d = r.ink.filter(i => !isMono(i.font)).map(i => i.text);
  console.log(` ${tpl.padEnd(11)} ${JSON.stringify(d)} ${d.join('') === d.join('').toUpperCase() ? 'uppercase' : '<-- LOWERCASE LEAKED'}`);
}
console.log('\n=== P2-10: jersey Number field is uppercased ===');
for (const num of ['ab', 'oO', '0o', 'w4']) {
  const r = await probe('ip-16-pro-max', 'jersey', { number: num, name: 'bo' });
  const d = r.ink.filter(i => !isMono(i.font)).map(i => i.text);
  console.log(` number="${num}" -> ${JSON.stringify(d)} ${d.join('') === d.join('').toUpperCase() ? 'uppercase' : '<-- LOWERCASE LEAKED'}`);
}
console.log('\n=== Mono stamps are uppercase too ===');
{
  const r = await probe('ip-16-pro-max', 'stamp', { name: 'marcus ryan', number: '04', section: 'club', since: '2002', kicker: 'week 01' });
  const m = r.ink.filter(i => isMono(i.font)).map(i => i.text).join('');
  console.log(' ', JSON.stringify(m), m === m.toUpperCase() ? 'uppercase' : '<-- LOWERCASE LEAKED');
}

console.log('\n=== P2-14: the "Loading library…" placeholder must be cleared ===');
console.log(' ', await page.evaluate(() => {
  const empty = document.querySelector('#library p.empty');
  const thumbs = document.querySelectorAll('#library .thumb').length;
  return empty
    ? `STILL PRESENT: "${empty.textContent}" alongside ${thumbs} thumbnails`
    : `cleared; ${thumbs} thumbnails, count label "${document.querySelector('#lib-count').textContent}"`;
}));
await browser.close();
