import { launch, feed } from './lib.mjs';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const { browser, page, errors } = await launch();
await page.waitForTimeout(1200);
const rejections = [];
await page.exposeFunction('__rej', m => rejections.push(m));
await page.evaluate(() => window.addEventListener('unhandledrejection', e => window.__rej(String(e.reason && e.reason.message || e.reason))));

console.log('=== A. Export with no photo picked ===');
{
  const state = await page.evaluate(() => {
    const b = document.querySelector('#export');
    return { disabled: b.disabled, ariaDisabled: b.getAttribute('aria-disabled'), pointer: getComputedStyle(b).pointerEvents, opacity: getComputedStyle(b).opacity };
  });
  console.log(' #export at boot:', JSON.stringify(state));
  // A disabled button will not accept a normal click, so force one AND call the
  // handler directly: neither route may produce a file.
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 4000 }).catch(() => null),
    page.click('#export', { force: true }).catch(e => console.log(' forced click rejected:', String(e).split('\n')[0])),
  ]);
  console.log(' forced click on the disabled button produced a download?', !!dl);
  if (dl) {
    const p = '/home/user/texans-pix/tests/out/no-photo.jpg';
    await dl.saveAs(p);
    const m = await sharp(p).metadata();
    console.log('  <-- EXPORTED ANYWAY:', dl.suggestedFilename(), `${m.width}x${m.height}`);
  }
  // and via the keyboard, which is how a real user would reach it
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 3000 }).catch(() => null),
    page.evaluate(() => { const b = document.querySelector('#export'); b.focus(); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); }),
  ]);
  console.log(' synthetic click event on the disabled button produced a download?', !!dl2);
  console.log(' status:', await page.textContent('#status'));
}

console.log('\n=== B. Template + fields chosen before any photo ===');
console.log(' ', await page.evaluate(async () => {
  const S = window.__studio; S.setTemplate('jersey'); S.setFields({ name: 'Ada', number: '11' });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const c = document.querySelector('#stage'), ctx = c.getContext('2d');
  const px = [...ctx.getImageData(Math.round(c.width * 0.1), Math.round(c.height * 0.72), 1, 1).data].slice(0, 3);
  return 'renders placeholder, sample px ' + px.join(',');
}));

console.log('\n=== C. Two files in flight: does the later pick win? ===');
{
  const big = readFileSync('/home/user/texans-pix/tests/out/big-6000x4000.jpg').toString('base64');
  const small = readFileSync('/home/user/texans-pix/tests/out/tiny-40x40.jpg').toString('base64');
  const r = await page.evaluate(async ({ big, small }) => {
    const mk = (b64, name) => { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new File([a], name, { type: 'image/jpeg' }); };
    const S = window.__studio;
    const p1 = S.useSource(mk(big, 'big-6000x4000.jpg'), 'big-6000x4000.jpg');   // slow decode, picked first
    const p2 = S.useSource(mk(small, 'tiny-40x40.jpg'), 'tiny-40x40.jpg');       // fast decode, picked second
    await Promise.all([p1, p2]);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { finalImage: [S.state.image.width, S.state.image.height], status: document.querySelector('#status').textContent };
  }, { big, small });
  console.log(' user picked BIG then TINY. state.image =', r.finalImage.join('x'), '| status =', JSON.stringify(r.status));
  console.log(' -> expected 40x40 (last pick).', r.finalImage[0] === 40 ? 'OK' : 'WRONG PHOTO WINS');
}

console.log('\n=== D. Rapid device switching mid-render ===');
{
  const r = await page.evaluate(async () => {
    const S = window.__studio, c = document.querySelector('#stage');
    const ids = ['ip-se', 'desktop', 'sg-ultra', 'ipad', 'ip-16-pro-max', 'story'];
    for (const id of ids) { S.setDevice(id); }        // 6 switches in one frame
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { device: S.state.device.id, canvas: [c.width, c.height], preset: [S.state.device.w, S.state.device.h] };
  });
  console.log(' ', JSON.stringify(r), r.canvas.join('x') === r.preset.join('x') ? 'canvas matches final preset' : 'MISMATCH');
}

console.log('\n=== E. Privacy: every request made while loading a user photo ===');
{
  const reqs = [];
  page.on('request', q => reqs.push(`${q.method()} ${q.url().slice(0, 90)}`));
  await feed(page, '/home/user/texans-pix/tests/out/exif0-landscape.jpg', 'exif0-landscape.jpg');
  await page.click('#export').catch(() => {});
  await page.waitForTimeout(800);
  console.log(' requests:', reqs.length ? reqs.join('\n           ') : '(none — nothing left the device)');
  const src = readFileSync('/home/user/texans-pix/src/app.js', 'utf8') + readFileSync('/home/user/texans-pix/src/compose.js', 'utf8');
  console.log(' grep for upload primitives in src:', /fetch\((?!'library|entry)|XMLHttpRequest|sendBeacon|WebSocket|FormData/.test(src) ? 'REVIEW' : 'none beyond library fetch');
}

console.log('\n=== F. Keyboard: can the flow be completed without a mouse? ===');
{
  await page.keyboard.press('Tab');
  const order = [];
  for (let i = 0; i < 26; i++) {
    const info = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a) return null;
      const cs = getComputedStyle(a);
      const outline = `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`;
      return { tag: a.tagName.toLowerCase(), id: a.id || null, cls: a.className || null, text: (a.textContent || '').trim().slice(0, 18), outline, boxShadow: cs.boxShadow.slice(0, 40) };
    });
    order.push(info);
    await page.keyboard.press('Tab');
  }
  const seen = new Map();
  for (const o of order) { const k = `${o.tag}#${o.id || ''}.${String(o.cls).slice(0, 18)}`; if (!seen.has(k)) seen.set(k, o); }
  for (const [k, o] of seen) console.log(`  ${k.padEnd(34)} outline="${o.outline}" boxShadow="${o.boxShadow}"`);
  console.log('  canvas focusable?', await page.evaluate(() => { const c = document.querySelector('#stage'); return c.tabIndex >= 0 || c.hasAttribute('tabindex'); }));
  console.log('  zoom slider reachable?', [...seen.keys()].some(k => k.includes('#zoom')));
  console.log('  export button reachable?', [...seen.keys()].some(k => k.includes('#export')));
}

console.log('\n--- unhandled rejections:', rejections.join(' | ') || '(none)');
console.log('--- page errors:', errors.filter(e => /pageerror/.test(e)).join(' | ') || '(none)');
await browser.close();
