// The adaptive scrims read pixels back on EVERY render (protectBand and
// scrimFlat each call getImageData). That is new cost on the interactive path:
// every keystroke and every drag frame. Measure it before calling the fix free.
import { launch, feed } from './lib.mjs';
const { browser, page } = await launch();

const rows = [];
for (const [file, label] of [['exif0-landscape.jpg', 'landscape'], ['big-6000x4000.jpg', '24MP source']]) {
  await feed(page, '/home/user/texans-pix/tests/out/' + file, file);
  for (const dev of ['ip-se', 'ip-16-pro-max', 'sg-ultra', 'ipad', 'desktop']) {
    for (const tpl of ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey']) {
      const t = await page.evaluate(({ dev, tpl }) => {
        const S = window.__studio;
        S.setDevice(dev); S.setTemplate(tpl); S.setSurface('lock');
        S.render(false); // warm
        const N = 20, t0 = performance.now();
        for (let i = 0; i < N; i++) S.render(false);
        return (performance.now() - t0) / N;
      }, { dev, tpl });
      rows.push({ photo: label, device: dev, template: tpl, msPerRender: +t.toFixed(2) });
    }
  }
}
console.table(rows.sort((a, b) => b.msPerRender - a.msPerRender).slice(0, 15));
const worst = Math.max(...rows.map(r => r.msPerRender));
console.log('worst mean render:', worst.toFixed(2), 'ms  (16.7ms is one frame at 60Hz)');
console.log(worst > 16.7 ? '  <-- a drag or a keystroke cannot hold 60fps on this combination' : '  every combination renders inside one frame');

console.log('\n=== Typing stress: 24 keystrokes into the headline, measured end to end ===');
// The headline input lives in the Words tab, behind the first-run screen.
// Clicking it cold times out on an element that is in the DOM but not on the
// screen — enter the studio and open the tab first, the way a fan does.
await page.evaluate(() => {
  document.querySelector('#start-lib')?.click();
  window.__studio.setTab('words');
});
await page.waitForSelector('[data-field="headline"]', { state: 'visible', timeout: 10000 });
await page.click('[data-field="headline"]');
const t0 = Date.now();
await page.type('[data-field="headline"]', 'ABCDEFGHIJKLMNOPQRSTUVWX', { delay: 0 });
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
console.log(' 24 keystrokes settled in', Date.now() - t0, 'ms; canvas still matches the preset:',
  await page.evaluate(() => { const c = document.querySelector('#stage'), d = window.__studio.state.device; return c.width === d.w && c.height === d.h; }));

console.log('\n=== Decode timing (a 24MP photo must not hang the tab) ===');
for (const f of ['big-6000x4000.jpg', 'pano-8000x1000.jpg', 'tiny-40x40.jpg']) {
  const t = Date.now();
  const r = await feed(page, '/home/user/texans-pix/tests/out/' + f, f);
  console.log(` ${f.padEnd(22)} ${String(Date.now() - t).padStart(5)}ms  source ${r.source.join('x')}  decoded ${r.img.w}x${r.img.h}`);
}
await browser.close();
