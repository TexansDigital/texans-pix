import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const p = await b.newPage({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/index.html');
await p.waitForFunction(() => window.__studio, null, { timeout: 20000 });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(700);

const r = await p.evaluate(async () => {
  const s = window.__studio;
  const c = new OffscreenCanvas(1400, 1400); const x = c.getContext('2d');
  x.fillStyle = '#1a2733'; x.fillRect(0, 0, 1400, 1400);
  await s.useSource(await c.convertToBlob({ type: 'image/png' }), 'seatpic');
  const wallpaper = { device: s.state.device.id, w: s.state.device.w, h: s.state.device.h };

  s.applySurface('share');
  s.setFields({ section: '132', row: 'J', seat: '12', name: 'ADAM' });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const share = {
    device: s.state.device.id, w: s.state.device.w, h: s.state.device.h,
    template: s.state.template.id,
    shareBtnVisible: !document.querySelector('#share').hidden,
    exportLabel: document.querySelector('#export').textContent.trim(),
  };
  const out = s.renderExport();
  const square = out.width === out.height;

  s.applySurface('lock');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const back = { device: s.state.device.id, w: s.state.device.w, shareBtnVisible: !document.querySelector('#share').hidden };

  return { wallpaper, share, square, back, kicker: s.state.fields.kicker,
           templates: [...document.querySelectorAll('.tpl')].map(t => t.dataset.id) };
});
await b.close();
const checks = [
  ['share mode swaps to a square card', r.share.w === 1080 && r.share.h === 1080 && r.square],
  ['share mode picks a gameday template', ['my-seat','gameday'].includes(r.share.template)],
  ['Send button appears in share mode', r.share.shareBtnVisible],
  ['action relabels for a card', /card/i.test(r.share.exportLabel)],
  ['switching back restores the handset', r.back.device === r.wallpaper.device && r.back.w === r.wallpaper.w],
  ['Send button hides for wallpapers', !r.back.shareBtnVisible],
  ['kicker defaults from gameday.json', /week/i.test(r.kicker)],
  ['gameday templates registered', r.templates.includes('my-seat') && r.templates.includes('gameday')],
  ['no page errors', errs.length === 0],
];
let bad = 0;
for (const [n, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) bad++; }
console.log(`\n${checks.length - bad}/${checks.length} passed`);
if (errs.length) console.log('errors:', errs.join('; '));
if (bad) process.exitCode = 1;
