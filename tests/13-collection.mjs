// Collection: keep, list, restore, remove — and the privacy rule that a fan's
// own photo is never written into a saved recipe.
import { chromium } from 'playwright';

const URL = 'http://localhost:8080/index.html';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL);
await page.waitForFunction(() => window.__studio, null, { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);
// The library builds asynchronously after boot.
await page.waitForFunction(() => document.querySelectorAll('.thumb').length > 0, null, { timeout: 15000 });

const results = {};

// Save from a library photo, then restore it.
results.libraryRoundTrip = await page.evaluate(async () => {
  document.querySelectorAll('.thumb')[0].click();
  await new Promise(r => setTimeout(r, 1200));
  const s = window.__studio;
  s.setTemplate('jersey'); s.setDevice('ip-se'); s.setSurface('home');
  s.setFields({ headline: 'HOUSTON', name: 'MARIA GONZALEZ', number: '04', section: '132', since: '2002', kicker: 'WEEK 04' });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await s.keepCurrent();
  await new Promise(r => setTimeout(r, 400));

  const cells = document.querySelectorAll('#collection .keep');
  const saved = cells.length;
  // Change everything, then restore from the saved cell.
  s.setTemplate('battle'); s.setDevice('ip-16-pro-max');
  s.setFields({ headline: 'WRONG', name: 'WRONG', number: '99', section: '', since: '', kicker: '' });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  cells[0].querySelector('button:not(.drop)').click();
  await new Promise(r => setTimeout(r, 1400));

  return {
    saved,
    template: s.state.template.id,
    device: s.state.device.id,
    surface: s.state.surface,
    name: s.state.fields.name,
    number: s.state.fields.number,
    canvasW: document.querySelector('#stage').width,
    hasPhoto: !!s.state.image,
    selectSynced: document.querySelector('#device').value === s.state.device.id,
    fieldSynced: document.querySelector('[data-field="name"]').value === s.state.fields.name,
  };
});

// A fan's own photo must not be written into the stored recipe.
results.ownPhotoPrivacy = await page.evaluate(async () => {
  const s = window.__studio;
  const c = new OffscreenCanvas(1200, 1600);
  const x = c.getContext('2d');
  x.fillStyle = '#12ab34'; x.fillRect(0, 0, 1200, 1600);
  await s.useSource(await c.convertToBlob({ type: 'image/png' }), 'my-private-photo.png');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await s.keepCurrent();
  await new Promise(r => setTimeout(r, 400));

  const raw = localStorage.getItem('texans.studio.collection.v1') || '';
  const parsed = JSON.parse(raw || '{}');
  const items = Object.values(parsed);
  const own = items.find(i => i.photo?.kind === 'own');
  return {
    stored: items.length,
    recordsOwnKind: !!own,
    // No base64/data URI of the photo may appear anywhere in the recipe store.
    recipeHasImageData: /data:image/.test(raw),
    recipeSize: raw.length,
  };
});

results.remove = await page.evaluate(async () => {
  const before = document.querySelectorAll('#collection .keep').length;
  document.querySelector('#collection .keep .drop').click();
  await new Promise(r => setTimeout(r, 500));
  return { before, after: document.querySelectorAll('#collection .keep').length };
});

await browser.close();

const r = results.libraryRoundTrip;
const p = results.ownPhotoPrivacy;
const checks = [
  ['save creates a collection entry', r.saved >= 1],
  ['restore returns the template', r.template === 'jersey'],
  ['restore returns the device', r.device === 'ip-se' && r.canvasW === 750],
  ['restore returns the surface', r.surface === 'home'],
  ['restore returns the fields', r.name === 'MARIA GONZALEZ' && r.number === '04'],
  ['restore reloads the library photo', r.hasPhoto],
  ['device select stays in sync', r.selectSynced],
  ['text inputs stay in sync', r.fieldSynced],
  ['own photo recorded as own, not stored', p.recordsOwnKind],
  ['no image data in the recipe store', !p.recipeHasImageData],
  ['remove drops the entry', results.remove.after === results.remove.before - 1],
  ['no page errors', errors.length === 0],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (errors.length) console.log('errors:', errors.join('; '));
console.log('recipe store size:', p.recipeSize, 'bytes');
if (failed) process.exitCode = 1;
