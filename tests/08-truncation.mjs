import { launch, feed } from './lib.mjs';
const { browser, page } = await launch();
await page.waitForTimeout(1000);
await feed(page, '/home/user/texans-pix/tests/out/exif0-landscape.jpg', 'exif0-landscape.jpg');
await page.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
  window.__ink = []; window.__recording = false;
  P.fillText = function (t, x, y, ...r) {
    if (window.__recording) { const m = this.measureText(t); window.__ink.push({ text: String(t), x, y, w: m.width, font: this.font }); }
    return orig.apply(this, [t, x, y, ...r]);
  };
});
const probe = (dev, tpl, fields) => page.evaluate(async ({ dev, tpl, fields }) => {
  const S = window.__studio; S.setDevice(dev); S.setSurface('lock'); S.setTemplate(tpl);
  S.setFields({ headline: '', name: '', number: '', section: '', since: '', kicker: '', ...fields });
  window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
  const c = document.querySelector('#stage');
  return { W: c.width, H: c.height, ink: window.__ink.filter(i => i.text.trim() && !/Azeret|monospace/.test(i.font)) };
}, { dev, tpl, fields });

console.log('=== Words silently dropped by displayBlock maxLines slice ===');
const headline = 'ALPHA BRAVO CHARLIE DELTA ECHO FOXTROT';
for (const tpl of ['battle', 'deep-steel', 'ticker', 'jersey']) {
  const r = await probe('ip-16-pro-max', tpl, { headline });
  const drawn = r.ink.map(i => i.text).join(' ');
  const wordsIn = headline.split(' '), wordsOut = drawn.split(/\s+/).filter(Boolean);
  const missing = wordsIn.filter(w => !wordsOut.includes(w));
  console.log(` ${tpl.padEnd(11)} lines=${r.ink.length} drawn="${drawn}"`);
  console.log(`   font=${r.ink[0] ? r.ink[0].font : '-'}  dropped words: ${missing.length ? missing.join(',') : 'none'}`);
}

console.log('\n=== Reserved height vs drawn height (displayBlockHeight uses maxLines 3; ticker/jersey draw maxLines 2) ===');
for (const [tpl, expectMax] of [['battle', 3], ['deep-steel', 3], ['ticker', 2], ['jersey', 2]]) {
  const r = await probe('ip-16-pro-max', tpl, { headline, name: headline });
  const ys = r.ink.map(i => i.y);
  console.log(` ${tpl.padEnd(11)} maxLines in draw=${expectMax}  lines drawn=${r.ink.length}  y positions=${ys.map(v => v.toFixed(0)).join(',')}  bottom-of-band=${(r.H * 0.84).toFixed(0)}`);
}

console.log('\n=== Headline typed in lower case stays uppercase? ===');
{
  const r = await probe('ip-16-pro-max', 'battle', { headline: 'houston we have a problem' });
  console.log(' ', JSON.stringify(r.ink.map(i => i.text)));
}
console.log('\n=== "Loading library…" placeholder ===');
console.log(' ', await page.evaluate(() => document.querySelector('#library p.empty') ? 'STILL PRESENT: "' + document.querySelector('#library p.empty').textContent + '" alongside ' + document.querySelectorAll('#library .thumb').length + ' thumbnails' : 'cleared'));
await browser.close();
