import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const p = await b.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8080/index.html');
await p.waitForFunction(() => window.__studio, null, { timeout: 20000 });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(800);

const before = await p.evaluate(() => {
  const vis = [...document.querySelectorAll('button, input, select, a, [role="tab"]')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; })
    .map(el => el.id || el.className.split(' ')[0] || el.type);
  return { count: vis.length, controls: vis, head: document.querySelector('.start-head')?.textContent.trim() };
});

// HOUSTON must not break mid-word
await p.evaluate(async () => {
  const c = new OffscreenCanvas(1200, 1800); const x = c.getContext('2d');
  x.fillStyle = '#123'; x.fillRect(0,0,1200,1800);
  await window.__studio.useSource(await c.convertToBlob({type:'image/png'}), 'test');
});
await p.waitForTimeout(600);
const after = await p.evaluate(() => {
  const vis = [...document.querySelectorAll('button, input, select, a, [role="tab"]')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; }).length;
  return { count: vis };
});

const wrapCheck = await p.evaluate(() => {
  const out = {};
  const ctx = document.createElement('canvas').getContext('2d');
  for (const [name, w] of [['ip-se',750],['ip-13',1170],['ip-16-pro-max',1320],['sg-ultra',1440]]) {
    window.__studio.setDevice(name);
    window.__studio.setTemplate('battle');
    window.__studio.setFields({ headline: 'HOUSTON', name: '', number: '', section: '', since: '', kicker: '' });
    const L = window.__studio.layout?.('HOUSTON');
    out[name] = null;
  }
  return out;
});
await b.close();
console.log('FIRST RUN — controls visible before a photo:', before.count);
console.log('  ', before.controls.join(', '));
console.log('  headline:', JSON.stringify(before.head));
console.log('AFTER a photo — controls visible:', after.count);
console.log(errs.length ? 'ERRORS: ' + errs.join('; ') : 'no page errors');
