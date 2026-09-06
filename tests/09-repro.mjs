// The five original P1 reproductions, re-run verbatim against the fixed build.
import { launch, feed, INK_RECORDER, isMono } from './lib.mjs';
const { browser, page } = await launch();
await feed(page, '/home/user/texans-pix/tests/out/exif0-landscape.jpg', 'exif0-landscape.jpg');
await page.evaluate(INK_RECORDER);

const probe = (dev, surface, tpl, fields) => page.evaluate(async ({ dev, surface, tpl, fields }) => {
  const S = window.__studio;
  S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl);
  S.setFields({ headline: '', name: '', number: '', section: '', since: '', kicker: '', ...fields });
  window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
  const c = document.querySelector('#stage'), d = S.state.device, eff = S.effectiveSurface();
  const stripH = Math.round(c.height * 0.028);
  const stripTop = eff === 'lock' && d.lock ? Math.round(c.height * (d.lock.controlsTop - 0.03)) : c.height - stripH;
  return { W: c.width, H: c.height, margin: Math.round(c.width * 0.062), stripTop, stripH, eff,
    ink: window.__ink.filter(i => i.text.trim()) };
}, { dev, surface, tpl, fields });
const disp = r => r.ink.filter(i => !isMono(i.font));
const mono = r => r.ink.filter(i => isMono(i.font) && !(i.y0 >= r.stripTop - 2 && i.y1 <= r.stripTop + r.stripH + 2));

console.log('R1 // Ticker dropping words at the 28-char headline maxlength');
for (const h of ['HOUSTON WE FINISH WHAT WE DO', 'GAME DAY IN THE BAYOU CITY!!', 'ALPHA BRAVO CHARLIE DELTA EC']) {
  for (const dev of ['ip-16-pro-max', 'ip-se', 'desktop']) {
    const r = await probe(dev, 'lock', 'ticker', { headline: h });
    const out = disp(r).map(i => i.text);
    const inWords = h.toUpperCase().split(/\s+/), outWords = out.join(' ').split(/\s+/).filter(Boolean);
    const missing = inWords.filter(w => !outWords.includes(w));
    console.log(`   ${dev.padEnd(14)} "${h}"\n     -> ${JSON.stringify(out)}  ${missing.length ? `<-- LOST ${missing.join(',')}` : 'every word kept'}`);
  }
}

console.log('\nR1b // Same question for every template');
// stamp has no display line at all: it carries the name through a mono stamp
// drawn glyph by glyph, so its run has to be reassembled without the spaces
// trackedText inserts between characters.
for (const tpl of ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey']) {
  for (const [field, text] of [['headline', 'ALPHA BRAVO CHARLIE DELTA EC'], ['name', 'ALPHA BRAVO CHARLIE DELT']]) {
    const r = await probe('ip-16-pro-max', 'lock', tpl, { [field]: text });
    const d = disp(r).map(i => i.text).join(' ');
    const m = mono(r).map(i => i.text).join('');
    const flat = x => x.toUpperCase().replace(/[^A-Z]/g, '');
    const kept = flat(d).includes(flat(text)) || flat(m).includes(flat(text));
    const carrier = flat(d).includes(flat(text)) ? 'display' : flat(m).includes(flat(text)) ? 'mono' : 'NEITHER';
    console.log(`   ${tpl.padEnd(11)} ${field.padEnd(9)} -> ${carrier}: "${(carrier === 'mono' ? m : d).slice(0, 60)}"  ${kept ? 'every character kept' : '<-- CHARACTERS LOST'}`);
  }
}

console.log('\nR2 // A single space in Headline must fall through to the fallback, not blank the hero');
for (const tpl of ['battle', 'deep-steel', 'ticker', 'jersey']) {
  const e = disp(await probe('ip-16-pro-max', 'lock', tpl, { headline: '' })).map(i => i.text);
  const s = disp(await probe('ip-16-pro-max', 'lock', tpl, { headline: ' ' })).map(i => i.text);
  const t = disp(await probe('ip-16-pro-max', 'lock', tpl, { headline: '   ', name: '  ' })).map(i => i.text);
  const same = JSON.stringify(e) === JSON.stringify(s) && JSON.stringify(e) === JSON.stringify(t);
  console.log(`   ${tpl.padEnd(11)} ""->${JSON.stringify(e)}  " "->${JSON.stringify(s)}  "   "+name" "->${JSON.stringify(t)}  ${same ? 'identical, fallback used' : '<-- HERO LINE DIFFERS'}`);
}
console.log('   pick() unit check:', JSON.stringify(await page.evaluate(async () => {
  const { pick, join } = await import('/src/templates.js');
  return {
    'pick(" ", "", "FALLBACK")': pick(' ', '', 'FALLBACK'),
    'pick("\\t\\n", "Name")': pick('\t\n', 'Name'),
    'pick("", "")': pick('', ''),
    'pick("  Houston  ")': pick('  Houston  '),
    'join("a", " ", "b")': join('a', ' ', 'b'),
    'join(" ", " ")': join(' ', ' '),
  };
})));

console.log('\nR3 // Whitespace-only Section/Since/Number must suppress the LABEL as well as the value');
for (const tpl of ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey']) {
  for (const [label, f] of [
    ['all whitespace', { section: ' ', since: '  ', number: ' ', kicker: '   ', name: ' ', headline: ' ' }],
    ['section only', { section: '132' }],
    ['since only', { since: '2002' }],
    ['number only', { number: '04' }],
    ['all empty', {}],
  ]) {
    const r = await probe('ip-16-pro-max', 'lock', tpl, f);
    const m = mono(r).map(i => i.text).join('');
    const orphan = /(^|\s)\/\/\s*$|^\s*\/\/|\/\/\s*\/\//.test(m) ? ' <-- ORPHAN SEPARATOR' : '';
    const bareLabel = /\b(SEC|SECTION|SINCE|NO)\b\s*(\/\/|$)/.test(m) ? ' <-- BARE LABEL' : '';
    console.log(`   ${tpl.padEnd(11)} ${label.padEnd(15)} mono="${m}"${orphan}${bareLabel}`);
  }
}

console.log('\nR4 // A long single word must not run off the canvas (battle, iPhone 16 Pro Max, lock)');
for (const name of ['SCHWARZENEGGER', 'PAPADOPOULOS-JONES', 'MMMMMMMMMMMMMM', 'MMMMMMMMMMMMMMMMMMMMMMMM', 'WWWWWWWWWWWWWWWWWWWWWWWW']) {
  const r = await probe('ip-16-pro-max', 'lock', 'battle', { name });
  const d = disp(r);
  const maxX = Math.max(...d.map(i => i.x1));
  console.log(`   name="${name}" (${name.length}) -> ${JSON.stringify(d.map(i => i.text))}  x1max=${maxX.toFixed(0)} canvas=${r.W} ${maxX > r.W ? '<-- OFF CANVAS' : maxX > r.W - r.margin ? '(past margin)' : 'ok'}`);
}

console.log('\nR5 // Ticker kicker line must not run off the canvas with ordinary values');
for (const dev of ['ip-se', 'ip-xr', 'ip-16-pro-max']) {
  for (const k of ['Preseason Week 01', 'Week 01', 'Divisional Round', 'PRESEASON WEEK 01 XXXXXX']) {
    const r = await probe(dev, 'lock', 'ticker', { kicker: k, section: '132', since: '2002', headline: 'Houston' });
    const m = mono(r);
    const maxX = Math.max(...m.map(i => i.x1));
    const size = m.length ? +(/(\d+(?:\.\d+)?)px/.exec(m[0].font) || [0, 0])[1] : 0;
    console.log(`   ${dev.padEnd(14)} kicker="${k.padEnd(24)}" rightmost=${maxX.toFixed(0)} canvas=${r.W} margin-limit=${r.W - r.margin} shrunk-to=${size.toFixed(1)}px  ${maxX > r.W ? '<-- OFF CANVAS' : maxX > r.W - r.margin ? '(past margin)' : 'ok'}`);
  }
}
await browser.close();
