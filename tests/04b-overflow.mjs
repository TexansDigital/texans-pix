// P1-1: hard-break threshold sweep. For every template x every device x both
// surfaces, walk each personalisation field from 1 char to its maxlength with
// worst-case glyphs and record the first length at which ink passes the safe
// margin or leaves the canvas. The whole sweep runs inside one page.evaluate
// because it is ~200k renders and a round trip per render takes an hour.
import { launch, feed, INK_RECORDER, isMono } from './lib.mjs';

const { browser, page } = await launch();
await feed(page, new URL('./out/exif0-landscape.jpg', import.meta.url).pathname, 'exif0-landscape.jpg');
await page.evaluate(INK_RECORDER);

const sweep = await page.evaluate(() => {
  const S = window.__studio;
  const MAX = { headline: 28, name: 24, number: 2, section: 6, since: 4, kicker: 24 };
  const TEMPLATES = ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey'];
  const devices = [...document.querySelectorAll('#device option')].map(o => o.value);
  const isMono = f => /Azeret|monospace|Menlo/.test(f);
  const c = document.querySelector('#stage');

  const shot = (dev, surface, tpl, fields) => {
    S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl);
    S.setFields({ headline: '', name: '', number: '', section: '', since: '', kicker: '', ...fields });
    window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
    const d = S.state.device, eff = S.effectiveSurface();
    const stripH = Math.round(c.height * 0.028);
    const lockZ = eff === 'lock' ? d.lock : null;
    const stripTop = lockZ ? Math.round(c.height * (lockZ.controlsTop - 0.03)) : c.height - stripH;
    const ink = window.__ink.filter(i => i.text.trim() &&
      !(tpl === 'ticker' && i.y0 >= stripTop - 2 && i.y1 <= stripTop + stripH + 2));
    return { W: c.width, H: c.height, margin: Math.round(c.width * 0.062), ink, eff };
  };

  const rows = [];
  for (const tpl of TEMPLATES) {
    for (const field of Object.keys(MAX)) {
      for (const glyph of ['M', 'W']) {
        let pastMargin = null, offCanvas = null, worst = null, worstOver = -1e9, usesField = false;
        for (const dev of devices) {
          for (const surface of ['lock', 'home']) {
            for (let n = 1; n <= MAX[field]; n++) {
              const r = shot(dev, surface, tpl, { [field]: glyph.repeat(n) });
              if (!r.ink.length) continue;
              usesField = usesField || r.ink.some(i => i.text.includes(glyph));
              const maxX = Math.max(...r.ink.map(i => i.x1));
              const minX = Math.min(...r.ink.map(i => i.x0));
              const maxY = Math.max(...r.ink.map(i => i.y1));
              const minY = Math.min(...r.ink.map(i => i.y0));
              // 12px of left tolerance: an 'A' or 'W' at 250px carries real
              // negative side bearing that is not an overflow.
              if (!pastMargin && (maxX > r.W - r.margin + 2 || minX < r.margin - 12)) pastMargin = `${n}@${dev}/${r.eff}`;
              if (!offCanvas && (maxX > r.W + 0.5 || minX < -0.5 || maxY > r.H + 0.5 || minY < -0.5)) {
                offCanvas = `${n}@${dev}/${r.eff}`;
              }
              const over = Math.max(maxX - (r.W - r.margin), maxY - r.H, -minY);
              if (over > worstOver) { worstOver = over; worst = `${dev}/${r.eff} n=${n} x=[${minX.toFixed(0)},${maxX.toFixed(0)}] y=[${minY.toFixed(0)},${maxY.toFixed(0)}] canvas=${r.W}x${r.H} marginLimit=${r.W - r.margin}`; }
            }
          }
        }
        rows.push({ tpl, field, glyph, usesField, pastMargin, offCanvas, worst });
      }
    }
  }
  return rows;
});

console.log('=== 1. Worst-case unbroken run per field, 1..maxlength, all templates x devices x surfaces ===');
for (const r of sweep) {
  if (!r.usesField) continue;
  const flag = r.offCanvas ? '   <<< LEAVES CANVAS' : '';
  console.log(` ${r.tpl.padEnd(11)} ${r.field.padEnd(9)} '${r.glyph}'  past-margin@${String(r.pastMargin || '-').padEnd(24)} off-canvas@${String(r.offCanvas || '-').padEnd(24)}${flag}`);
  if (r.offCanvas) console.log(`     worst: ${r.worst}`);
}
const leaks = sweep.filter(r => r.usesField && r.offCanvas);
console.log('\nfield/template combinations that can leave the canvas within maxlength:',
  leaks.length ? leaks.map(r => `${r.tpl}.${r.field}('${r.glyph}')`).join(', ') : 'NONE');

// --- R4 repro + character-integrity check ------------------------------------
const detail = await page.evaluate(() => {
  const S = window.__studio, c = document.querySelector('#stage');
  const isMono = f => /Azeret|monospace|Menlo/.test(f);
  const shot = (dev, surface, tpl, fields) => {
    S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl);
    S.setFields({ headline: '', name: '', number: '', section: '', since: '', kicker: '', ...fields });
    window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
    return { W: c.width, margin: Math.round(c.width * 0.062), ink: window.__ink.filter(i => i.text.trim()) };
  };
  const out = { names: [], integrity: [] };
  for (const name of ['VANDERPLOEG', 'SCHWARZENEGGER', 'PAPADOPOULOS-JONES', 'HOUSTONTEXANSFAN', 'MMMMMMMMMMMMMMMMMMMMMMMM'])
    for (const tpl of ['battle', 'ticker', 'jersey'])
      for (const dev of ['ip-16-pro-max', 'ip-se']) {
        const r = shot(dev, 'lock', tpl, { name });
        const d = r.ink.filter(i => !isMono(i.font));
        out.names.push({ tpl, dev, name, lines: d.map(i => i.text), maxX: +Math.max(...d.map(i => i.x1)).toFixed(0), W: r.W, margin: r.margin });
      }
  for (const tpl of ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey'])
    for (const [field, text] of [['name', 'PAPADOPOULOS-JONES'], ['headline', 'MMMMMMMMMMMMMMMMMMMMMMMMMMMM'], ['headline', 'ALPHA BRAVO CHARLIE DELTA EC'], ['kicker', 'WWWWWWWWWWWWWWWWWWWWWWWW']])
      for (const dev of ['ip-se', 'ip-16-pro-max']) {
        const r = shot(dev, 'lock', tpl, { [field]: text });
        const monoOut = r.ink.filter(i => isMono(i.font)).map(i => i.text).join('');
        const dispOut = r.ink.filter(i => !isMono(i.font)).map(i => i.text).join('');
        out.integrity.push({ tpl, dev, field, text, dispOut, monoOut });
      }
  return out;
});

console.log('\n=== 2. R4 repro: long single-token names ===');
for (const n of detail.names) {
  const v = n.maxX > n.W ? 'OFF-CANVAS' : n.maxX > n.W - n.margin ? 'past margin' : 'ok';
  console.log(` ${n.tpl.padEnd(11)} ${n.dev.padEnd(14)} "${n.name}" -> ${JSON.stringify(n.lines)} maxX=${n.maxX}/${n.W} ${v}`);
}

console.log('\n=== 3. Hard break / shrink must not delete characters ===');
let lost = 0;
for (const i of detail.integrity) {
  const want = i.text.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const gotDisp = i.dispOut.replace(/[^A-Z0-9-]/g, '');
  const gotMono = i.monoOut.replace(/[^A-Z0-9-]/g, '');
  const used = gotDisp.includes(want[0]) ? 'display' : gotMono.includes(want[0]) ? 'mono' : null;
  if (!used) { console.log(` ${i.tpl.padEnd(11)} ${i.dev.padEnd(14)} ${i.field.padEnd(9)} (field unused by this template)`); continue; }
  const got = used === 'display' ? gotDisp : gotMono;
  const ok = got.includes(want);
  if (!ok) lost++;
  console.log(` ${i.tpl.padEnd(11)} ${i.dev.padEnd(14)} ${i.field.padEnd(9)} "${i.text.slice(0, 18)}" via ${used}: ${ok ? 'all chars kept' : `LOST -> "${got}"`}`);
}
console.log('\ncases where characters were silently dropped:', lost);
await browser.close();
