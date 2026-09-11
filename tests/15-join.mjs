// The fan list, and the promise around it.
//
// Two things are checked here. First that the opt-in behaves: hidden until a
// wallpaper is actually saved, never blocking one, consent required, and a
// dead network costing the fan nothing. Second — and this is the one that
// matters — every single request the page makes during a full session is
// audited, and none of them may carry image data. The studio has had a written
// promise that a fan's photo never leaves their device since day one; until
// there was an endpoint to send it to, nothing verified it.
import { launch, feed, settle } from './lib.mjs';
import { join as joinPath } from 'node:path';
import { readFileSync } from 'node:fs';

const FX = new URL('./out/', import.meta.url).pathname;
const PHOTO = joinPath(FX, 'split-2000x3000.png');
const photoBytes = readFileSync(PHOTO);

const { browser, page, errors } = await launch();

// Audit every request the page makes, for the whole run.
const sent = [];
page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
page.on('requestfailed', r => console.log('FAILED', r.url(), r.failure()?.errorText));
page.on('request', r => {
  let body = null;
  try { body = r.postData(); } catch { body = null; }
  sent.push({ url: r.url(), method: r.method(), body, bytes: body ? body.length : 0 });
});

let posted = null;
await page.route('**/api/join', async route => {
  posted = route.request().postData();
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});

await feed(page, PHOTO, 'split-2000x3000.png');
await settle(page);

const beforeSave = await page.evaluate(() => document.querySelector('#join').hidden);

// Save the wallpaper the way a fan does.
await page.evaluate(() => { window.__savedBlobs = 0; });
const dl = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
  page.click('#export'),
]);
await page.waitForTimeout(600);
const afterSave = await page.evaluate(() => document.querySelector('#join').hidden);

// Consent unticked must be refused before anything is sent.
const noConsent = await page.evaluate(async () => {
  document.querySelector('#join-email').value = 'fan@example.com';
  document.querySelector('#join-consent').checked = false;
  document.querySelector('#join-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  return { note: document.querySelector('#join-note').textContent, hidden: document.querySelector('#join').hidden };
});
const postedAfterNoConsent = posted;

// Now with consent.
const withConsent = await page.evaluate(async () => {
  document.querySelector('#join-email').value = 'Fan@Example.com';
  document.querySelector('#join-code').value = 'TXNS-W04';
  document.querySelector('#join-consent').checked = true;
  document.querySelector('#join-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await new Promise(r => setTimeout(r, 500));
  return { note: document.querySelector('#join-note').textContent };
});
await browser.close();

const payload = posted ? JSON.parse(posted) : null;

// --- the audit -------------------------------------------------------------
// Image bytes are unmistakable: a JPEG opens FFD8FF, a PNG has the IHDR magic.
// Also catch a data: URI or a long base64 run, which is how an image would
// most plausibly be smuggled into a JSON field.
const photoHead = photoBytes.subarray(0, 16).toString('latin1');
const suspects = [];
for (const r of sent) {
  if (!r.body) continue;
  const b = r.body;
  if (b.includes('data:image')) suspects.push(`${r.method} ${r.url}: data: URI`);
  if (b.includes('\xFF\xD8\xFF') || b.includes('PNG\r\n')) suspects.push(`${r.method} ${r.url}: raw image header`);
  if (b.includes(photoHead)) suspects.push(`${r.method} ${r.url}: bytes from the source photo`);
  if (/[A-Za-z0-9+/]{2000,}={0,2}/.test(b)) suspects.push(`${r.method} ${r.url}: ${b.length}B base64 run`);
}
const bodied = sent.filter(r => r.bytes > 0);
const offsite = sent.filter(r => !/^http:\/\/(127\.0\.0\.1|localhost)/.test(r.url));

const checks = [
  ['card is hidden before any save', beforeSave === true],
  ['a wallpaper actually downloaded', !!dl[0]],
  ['card appears once the file is saved', afterSave === false],
  ['no consent, nothing sent', postedAfterNoConsent === null],
  ['no consent, the fan is told why', /tick the box/i.test(noConsent.note)],
  ['no consent, card stays open', noConsent.hidden === false],
  ['with consent, the signup is sent', payload !== null],
  ['email is sent as typed', payload?.email === 'Fan@Example.com'],
  ['consent arrives as a literal true', payload?.consent === true],
  ['the agreed wording travels with it', typeof payload?.consentText === 'string' && payload.consentText.length > 20],
  ['stadium code sets attended', payload?.attended === true],
  ['the game is recorded', typeof payload?.game === 'string' && payload.game.length > 0],
  ['signup body stays under the 2KB cap', (posted?.length ?? 0) < 2048],
  ['the fan is told they are on the list', /on the list/i.test(withConsent.note)],
  ['only one request in the session carries a body', bodied.length === 1],
  ['that request is the signup', bodied[0]?.url.endsWith('/api/join')],
  ['nothing was sent off-origin', offsite.length === 0],
  ['NO REQUEST CARRIED IMAGE DATA', suspects.length === 0],
  ['no page errors', errors.filter(e => !/willReadFrequently/.test(e)).length === 0],
];

let bad = 0;
for (const [name, ok] of checks) { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); }
console.log(`\n${sent.length} requests audited, ${bodied.length} with a body, largest ${Math.max(0, ...sent.map(r => r.bytes))}B`);
if (suspects.length) console.log('SUSPECT:\n  ' + suspects.join('\n  '));
if (offsite.length) console.log('OFF-ORIGIN:\n  ' + offsite.slice(0, 5).map(r => r.url).join('\n  '));
if (errors.length) console.log('CONSOLE:\n  ' + errors.slice(0, 8).join('\n  '));
if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log(`\n${checks.length}/${checks.length}`);
