// 8b. Why a drag is 6fps: render() draws the full export surface every frame.
import { PROFILES, browserUp, openOn, F } from './lib.mjs';
const browser = await browserUp();
const { ctx, page } = await openOn(browser, PROFILES[1]);
const cdp = await ctx.newCDPSession(page);
await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 3000; c.height = 4000;
  const g = c.getContext('2d'); g.fillStyle = '#556'; g.fillRect(0,0,3000,4000);
  const bmp = await createImageBitmap(c);
  await window.__studio.useSource(bmp, 'probe');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
});
for (const rate of [1, 4]) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const rows = await page.evaluate(() => {
    const out = [];
    for (const id of ['ip-16-pro-max', 'ip-plus', 'ip-se', 'sg-ultra']) {
      window.__studio.setDevice(id);
      const s = window.__studio.state;
      const t = [];
      for (let i = 0; i < 12; i++) { const a = performance.now(); window.__studio.render(false); t.push(performance.now() - a); }
      t.sort((a, b) => a - b);
      out.push({ id, px: s.device.w * s.device.h, ms: t[6] });
    }
    return out;
  });
  console.log(`\ncpu ${rate}x  — median render() cost per frame, canvas shown at ~183px wide:`);
  for (const r of rows) console.log(`  ${r.id.padEnd(15)} ${(r.px / 1e6).toFixed(1)}MP  ${F(r.ms)}ms  -> ${F(1000 / r.ms)}fps ceiling`);
}
// typing latency: every keystroke triggers a full re-render
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.evaluate(() => window.__studio.setDevice('ip-16-pro-max'));
const typing = await page.evaluate(async () => {
  const el = document.querySelector('[data-field="name"]');
  el.focus();
  const lat = [];
  for (const ch of 'HOUSTON') {
    const a = performance.now();
    el.value += ch;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    lat.push(performance.now() - a);
  }
  lat.sort((x, y) => x - y);
  return { median: lat[3], max: lat[lat.length - 1] };
});
console.log(`\ntyping a 7-letter name at 4x CPU: median ${F(typing.median)}ms per keystroke to repaint, worst ${F(typing.max)}ms`);
await ctx.close(); await browser.close();
