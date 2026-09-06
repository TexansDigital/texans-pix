import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const log = [];
page.on('response', r => log.push(`${r.status()} ${r.url()}`));
page.on('requestfailed', r => log.push(`FAIL ${r.url()} ${r.failure()?.errorText}`));
page.on('pageerror', e => log.push('PAGEERROR ' + e.stack));
page.on('console', m => log.push(`console.${m.type()}: ${m.text()}`));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('--- every request the page made at boot ---');
console.log(log.join('\n'));
const outbound = log.filter(l => /^(POST|PUT|PATCH) /.test(l));
console.log('\nnon-GET requests at boot:', outbound.length ? outbound.join('\n') : '(none)');
// Static audit of the shipped source for anything that could transmit a photo.
const { readFileSync, readdirSync } = await import('node:fs');
const files = readdirSync('/home/user/texans-pix/src').filter(f => f.endsWith('.js'));
const src = files.map(f => readFileSync('/home/user/texans-pix/src/' + f, 'utf8')).join('\n');
const html = readFileSync('/home/user/texans-pix/index.html', 'utf8');
for (const [name, re] of [
  ['fetch(', /fetch\s*\(/g], ['XMLHttpRequest', /XMLHttpRequest/g], ['sendBeacon', /sendBeacon/g],
  ['WebSocket', /WebSocket/g], ['FormData', /FormData/g], ['RTCPeerConnection', /RTCPeerConnection/g],
  ['<form>', /<form/gi], ['action=', /action=/gi], ['analytics/track/pixel', /analytic|gtag|\btrack\b|dataLayer|pixel\.gif/gi],
  ['toDataURL/toBlob sent anywhere', /(toDataURL|toBlob)[\s\S]{0,120}(fetch|XMLHttpRequest|sendBeacon)/g],
]) {
  const hits = [...(src + html).matchAll(re)].length;
  console.log(`  ${name.padEnd(32)} ${hits} occurrence(s)`);
}
console.log('\n  fetch call sites in src:', [...src.matchAll(/fetch\((.{0,45})/g)].map(m => m[1].replace(/\n.*/, '')).join(' | '));
await browser.close();
