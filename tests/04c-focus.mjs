// Focused follow-ups on the three clusters 04-templates.mjs surfaces, so each
// can be judged as a real defect or as glyph side-bearing noise.
import { launch, feed, INK_RECORDER, isMono, BLANK_FIELDS } from './lib.mjs';

const { browser, page } = await launch();
await feed(page, '/home/user/texans-pix/tests/out/exif0-landscape.jpg', 'exif0-landscape.jpg');
await page.evaluate(INK_RECORDER);

const shot = (dev, surface, tpl, fields) => page.evaluate(async ({ dev, surface, tpl, fields }) => {
  const S = window.__studio;
  S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl);
  S.setFields({ headline: '', name: '', number: '', section: '', since: '', kicker: '', ...fields });
  window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
  const c = document.querySelector('#stage'), d = S.state.device, eff = S.effectiveSurface();
  const stripH = Math.round(c.height * 0.028);
  const lockZ = eff === 'lock' ? d.lock : null;
  const fBottom = lockZ ? c.height * (lockZ.controlsTop - 0.03) : c.height * ((d.home || {}).dockTop - 0.03);
  return { W: c.width, H: c.height, margin: Math.round(c.width * 0.062), eff, stripH,
    stripTop: lockZ ? Math.round(fBottom) : c.height - stripH, fBottom,
    dockTop: (d.home || {}).dockTop, controlsTop: d.lock && d.lock.controlsTop,
    ink: window.__ink.filter(i => i.text.trim()) };
}, { dev, surface, tpl, fields });

console.log('=== 1. Left side-bearing: how far does display ink sit left of the pen? ===');
for (const [tpl, dev] of [['battle', 'ip-16-pro-max'], ['ticker', 'ip-16-pro-max'], ['jersey', 'ip-16-pro-max'], ['battle', 'desktop']]) {
  const r = await shot(dev, 'lock', tpl, { headline: 'ABCDEFGHIJ KLMNOPQRST UVWXY' });
  for (const i of r.ink.filter(x => !isMono(x.font))) {
    const size = +(/(\d+(?:\.\d+)?)px/.exec(i.font) || [0, 0])[1];
    console.log(` ${tpl}/${dev} "${i.text.slice(0, 12)}" pen=${r.margin} x0=${i.x0.toFixed(1)} overshoot=${(r.margin - i.x0).toFixed(1)}px = ${((r.margin - i.x0) / size * 100).toFixed(2)}% of the ${size}px cap height`);
  }
}

console.log('\n=== 2. Jersey number: a 2-char field is the whole hero, at W*0.42 ===');
for (const dev of ['ip-16-pro-max', 'ip-se', 'desktop', 'ipad']) {
  for (const num of ['0', '00', '88', 'WW', 'MM', '4']) {
    const r = await shot(dev, 'lock', 'jersey', { number: num, name: 'Marcus' });
    const hero = r.ink.filter(i => !isMono(i.font) && i.text === num.toUpperCase());
    if (!hero.length) { console.log(` ${dev.padEnd(14)} number="${num}" -> not drawn`); continue; }
    const h = hero[0];
    const flags = [];
    if (h.x1 > r.W) flags.push('OFF-CANVAS-RIGHT');
    else if (h.x1 > r.W - r.margin) flags.push('past margin');
    if (h.y0 < 0) flags.push('OFF-CANVAS-TOP');
    console.log(` ${dev.padEnd(14)} number="${num}" x=[${h.x0.toFixed(0)},${h.x1.toFixed(0)}]/${r.W} y=[${h.y0.toFixed(0)},${h.y1.toFixed(0)}]/${r.H}  ${flags.join(' ') || 'ok'}`);
  }
}

console.log('\n=== 3. Ticker on a HOME surface: where does the strip and its type land? ===');
for (const dev of ['ip-16-pro-max', 'ip-se', 'sg-ultra', 'desktop']) {
  for (const surface of ['lock', 'home']) {
    const r = await shot(dev, surface, 'ticker', { headline: 'Houston', kicker: 'Week 01', section: '132' });
    const nonStrip = r.ink.filter(i => !(i.y0 >= r.stripTop - 2 && i.y1 <= r.stripTop + r.stripH + 2));
    const lowest = nonStrip.length ? Math.max(...nonStrip.map(i => i.y1)) : 0;
    const zoneTop = r.eff === 'lock' ? r.controlsTop * r.H : r.dockTop * r.H;
    const zoneName = r.eff === 'lock' ? 'controls' : 'dock';
    console.log(` ${dev.padEnd(14)} ${surface}->${r.eff.padEnd(5)} stripTop=${r.stripTop} (H=${r.H})  lowest non-strip ink y1=${lowest.toFixed(0)}  ${zoneName} starts ${zoneTop.toFixed(0)}  ${lowest > zoneTop ? `<-- ${(lowest - zoneTop).toFixed(0)}px INSIDE the ${zoneName}` : 'clear'}`);
  }
}

console.log('\n=== 4. Same question for the other four templates on home ===');
for (const tpl of ['battle', 'stamp', 'deep-steel', 'jersey']) {
  const r = await shot('ip-16-pro-max', 'home', tpl, { headline: 'Houston', name: 'Marcus', number: '04', section: '132', since: '2002', kicker: 'Week 01' });
  const lowest = Math.max(...r.ink.map(i => i.y1));
  const dock = r.dockTop * r.H;
  console.log(` ${tpl.padEnd(11)} lowest ink y1=${lowest.toFixed(0)}  dock starts ${dock.toFixed(0)}  ${lowest > dock ? 'INSIDE DOCK' : 'clear'}`);
}
await browser.close();
