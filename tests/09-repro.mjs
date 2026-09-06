import { launch, feed } from './lib.mjs';
const { browser, page } = await launch();
await page.waitForTimeout(1000);
await feed(page, '/home/user/texans-pix/tests/out/exif0-landscape.jpg', 'exif0-landscape.jpg');
await page.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
  window.__ink = []; window.__recording = false;
  P.fillText = function (t, x, y, ...r) {
    if (window.__recording) { const m = this.measureText(t); window.__ink.push({ text: String(t), x0: x - m.actualBoundingBoxLeft, x1: x + m.actualBoundingBoxRight, font: this.font }); }
    return orig.apply(this, [t, x, y, ...r]);
  };
});
const probe = (dev, surface, tpl, fields) => page.evaluate(async ({ dev, surface, tpl, fields }) => {
  const S = window.__studio; S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl);
  S.setFields({ headline: '', name: '', number: '', section: '', since: '', kicker: '', ...fields });
  window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
  const c = document.querySelector('#stage');
  const strip = c.height - Math.round(c.height * 0.028) - 2;
  return { W: c.width, ink: window.__ink.filter(i => i.text.trim() && !(tpl === 'ticker' && /Azeret|monospace/.test(i.font) && i.x0 > -1e9 && false)) };
}, { dev, surface, tpl, fields });

console.log('R1 // Ticker drops words with a 28-char headline (the field maxlength)');
for (const h of ['HOUSTON WE FINISH WHAT WE DO', 'GAME DAY IN THE BAYOU CITY!!']) {
  const r = await probe('ip-16-pro-max', 'lock', 'ticker', { headline: h });
  const disp = r.ink.filter(i => !/Azeret|monospace/.test(i.font)).map(i => i.text);
  console.log(`   in  "${h}" (${h.length} chars)\n   out ${JSON.stringify(disp)}  ${disp.join(' ').replace(/\s+/g,' ') !== h ? '<-- TEXT LOST' : 'ok'}`);
}

console.log('\nR2 // A single space in Headline blanks the hero line');
for (const tpl of ['battle', 'deep-steel', 'ticker', 'jersey']) {
  const empty = await probe('ip-16-pro-max', 'lock', tpl, { headline: '' });
  const space = await probe('ip-16-pro-max', 'lock', tpl, { headline: ' ' });
  const e = empty.ink.filter(i => !/Azeret|monospace/.test(i.font)).map(i => i.text);
  const s = space.ink.filter(i => !/Azeret|monospace/.test(i.font)).map(i => i.text);
  console.log(`   ${tpl.padEnd(11)} headline="" -> ${JSON.stringify(e)}   headline=" " -> ${JSON.stringify(s)} ${s.length === 0 && e.length ? '<-- HERO LINE GONE' : ''}`);
}

console.log('\nR3 // Whitespace-only Section/Since leave orphan separators and label words');
for (const tpl of ['battle', 'stamp', 'deep-steel', 'ticker']) {
  const r = await probe('ip-16-pro-max', 'lock', tpl, { section: ' ', since: ' ', number: ' ', kicker: '' });
  const mono = r.ink.filter(i => /Azeret|monospace/.test(i.font)).map(i => i.text).join('');
  console.log(`   ${tpl.padEnd(11)} mono renders "${mono}"`);
}

console.log('\nR4 // Long single word runs off the canvas (battle, iPhone 16 Pro Max, lock)');
for (const name of ['SCHWARZENEGGER', 'PAPADOPOULOS-JONES', 'MMMMMMMMMMMMMM']) {
  const r = await probe('ip-16-pro-max', 'lock', 'battle', { name });
  const d = r.ink.filter(i => !/Azeret|monospace/.test(i.font));
  console.log(`   name="${name}" (${name.length})  ink x0..x1 = ${d.map(i => `${i.x0.toFixed(0)}..${i.x1.toFixed(0)}`).join(' ')}  canvas width ${r.W} ${Math.max(...d.map(i=>i.x1)) > r.W ? '<-- OFF CANVAS' : ''}`);
}

console.log('\nR5 // Ticker kicker line runs off the canvas with ordinary field values');
for (const k of ['Preseason Week 01', 'Week 01', 'Divisional Round']) {
  const r = await probe('ip-se', 'lock', 'ticker', { kicker: k, section: '132', since: '2002', headline: 'Houston' });
  const mono = r.ink.filter(i => /Azeret|monospace/.test(i.font));
  const strip = mono.filter(i => i.x1 > 0);
  const maxX = Math.max(...mono.map(i => i.x1));
  console.log(`   kicker="${k}" + SEC 132 + SINCE 2002 on iPhone SE (750px): rightmost ink x=${maxX.toFixed(0)} ${maxX > 750 ? '<-- OFF CANVAS' : maxX > 750 - 47 ? '(past the 6.2% margin)' : 'ok'}`);
}
await browser.close();
