import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const p = await b.newPage({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/index.html');
await p.waitForFunction(() => window.__studio, null, { timeout: 20000 });
await p.evaluate(() => document.fonts.ready);
await p.waitForFunction(() => document.querySelectorAll('.thumb').length > 0, null, { timeout: 15000 });

const r = await p.evaluate(async () => {
  const shelfVisible = !document.querySelector('#tonight-block').hidden;
  const tonightThumbs = document.querySelectorAll('#tonight .thumb').length;
  const seasonThumbs = document.querySelectorAll('#library .thumb').length;
  const label = document.querySelector('#tonight-count').textContent;
  const momentChip = document.querySelector('#tonight .thumb .moment')?.textContent || '';
  // The first thumb in the DOM should be tonight's, not a season frame.
  const firstIsTonight = document.querySelectorAll('.thumb')[0].closest('#tonight') !== null;

  document.querySelector('#tonight .thumb').click();
  await new Promise(r => setTimeout(r, 1600));
  const s = window.__studio;
  return {
    shelfVisible, tonightThumbs, seasonThumbs, label, momentChip, firstIsTonight,
    kicker: s.state.fields.kicker,
    kickerInput: document.querySelector('[data-field="kicker"]').value,
    hasPhoto: !!s.state.image,
  };
});
await b.close();
const checks = [
  ['tonight shelf shows when frames exist', r.shelfVisible],
  ['tonight frame is in its own shelf', r.tonightThumbs === 1],
  ['season shelf still populated', r.seasonThumbs === 2],
  ['shelf is labelled', /from this game/.test(r.label)],
  ['moment chip on the thumbnail', /STROUD/.test(r.momentChip)],
  ['tonight leads the picker', r.firstIsTonight],
  ['tapping loads the photo', r.hasPhoto],
  ['moment auto-fills the stamp', /STROUD 42 YD TD/.test(r.kicker)],
  ['and the field shows it', /STROUD/.test(r.kickerInput)],
  ['no page errors', errs.length === 0],
];
let bad = 0;
for (const [n, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) bad++; }
console.log(`\n${checks.length - bad}/${checks.length} passed`);
console.log('stamp:', JSON.stringify(r.kicker));
if (errs.length) console.log('errors:', errs.join('; '));
if (bad) process.exitCode = 1;
