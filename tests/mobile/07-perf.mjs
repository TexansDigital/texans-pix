// 8. Throttled conditions: 4x CPU, slow 3G. First paint, TTI, drag frames.
import { PROFILES, browserUp, F } from './lib.mjs';
import { readFileSync, existsSync } from 'node:fs';

const FONT_DIR = new URL('../fonts/', import.meta.url).pathname;
const NETS = {
  'slow 3G':  { downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8, latency: 400 },
  'fast 3G':  { downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150 },
  'no throttle': null,
};

const browser = await browserUp();
const p = PROFILES[1]; // iPhone 13
for (const [netName, net] of Object.entries(NETS)) {
  for (const cpu of [4, 1]) {
    if (netName === 'fast 3G' && cpu === 1) continue;
    const ctx = await browser.newContext({ ...p.d, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    if (existsSync(FONT_DIR + 'azeret.css')) {
      await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: readFileSync(FONT_DIR + 'azeret.css', 'utf8') }));
      await page.route('**/tests/fonts/*.woff2', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(FONT_DIR + r.request().url().split('/').pop()) }));
    }
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net ? net.latency : 0, downloadThroughput: net ? net.downloadThroughput : -1, uploadThroughput: net ? net.uploadThroughput : -1 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

    const t0 = Date.now();
    await page.goto('http://127.0.0.1:8080/', { waitUntil: 'commit' });
    await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, null, { timeout: 120000 }).catch(() => {});
    const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1);
    // "usable" = the app has drawn the first real preview and the export button
    // has been wired (init() awaits fonts + logo marks before the first render).
    // init() awaits loadFonts() then loadMarks() before the first scheduleRender,
    // so the last logo landing + two frames is the moment a preview exists.
    await page.waitForFunction(() => performance.getEntriesByType('resource').some(r => /wordmark-red-white/.test(r.name)), null, { timeout: 240000 }).catch(() => {});
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
    const ready = Date.now() - t0;
    await page.waitForFunction(() => document.querySelectorAll('.thumb').length > 0 || document.querySelector('#library .empty'), null, { timeout: 240000 }).catch(() => {});
    const libReady = Date.now() - t0;
    const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; });
    const bytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0));

    // Tapping a library thumb pulls the full-size photo, not the thumbnail.
    let photoMs = -1, photoBytes = 0;
    // The library sits behind the first-run screen until the fan picks a way
    // in, so a cold click on a thumb never lands.
    await page.evaluate(() => document.querySelector('#start-lib')?.click());
    await page.waitForSelector('.thumb', { state: 'visible', timeout: 10000 }).catch(() => {});
    if (await page.$('.thumb')) {
      const s = Date.now();
      await page.click('.thumb');
      await page.waitForFunction(() => window.__studio.state.image !== null, null, { timeout: 240000 }).catch(() => {});
      photoMs = Date.now() - s;
      photoBytes = await page.evaluate(() => { const r = performance.getEntriesByType('resource').filter(x => /library\/photos/.test(x.name)); return r.reduce((a, x) => a + (x.encodedBodySize || x.transferSize || 0), 0); });
    }

    // Drag frame times at this CPU rate.
    let frames = null;
    if (await page.evaluate(() => !!window.__studio?.state?.image)) {
      frames = await page.evaluate(async () => {
        const c = document.querySelector('#stage');
        const r = c.getBoundingClientRect();
        const times = [];
        let last = performance.now();
        const step = i => new Promise(res => requestAnimationFrame(() => {
          const now = performance.now(); times.push(now - last); last = now;
          const e = new PointerEvent('pointermove', { clientX: r.x + r.width / 2 + i, clientY: r.y + r.height / 2, bubbles: true, pointerId: 1 });
          c.dispatchEvent(e); res();
        }));
        c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, pointerId: 1, isPrimary: true }));
        for (let i = 0; i < 45; i++) await step(i);
        c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
        const t = times.slice(5).sort((a, b) => a - b);
        // also time render() alone
        const rs = [];
        for (let i = 0; i < 10; i++) { const a = performance.now(); window.__studio.render(false); rs.push(performance.now() - a); }
        rs.sort((a, b) => a - b);
        return { median: t[Math.floor(t.length / 2)], p95: t[Math.floor(t.length * 0.95)], max: t[t.length - 1], n: t.length, renderMedian: rs[5] };
      });
    }
    console.log(`${netName.padEnd(12)} cpu ${cpu}x | FCP ${F(fcp)}ms | DCL ${F(nav.dcl)}ms | usable (first preview drawn) ${ready}ms | library thumbs ${libReady}ms | boot bytes ${(bytes / 1024).toFixed(0)}KB | tap library thumb -> photo on screen ${photoMs}ms (${(photoBytes / 1024).toFixed(0)}KB) | drag frames median ${frames ? F(frames.median) : 'n/a'}ms p95 ${frames ? F(frames.p95) : 'n/a'}ms max ${frames ? F(frames.max) : 'n/a'}ms | render() alone ${frames ? F(frames.renderMedian) : 'n/a'}ms`);
    await ctx.close();
  }
}
await browser.close();
