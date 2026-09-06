// 2b. Core path: open -> pick photo -> pick template -> download.
// Counts taps and total scroll distance, with and without checking the preview.
import { PROFILES, browserUp, openOn, F } from './lib.mjs';

const browser = await browserUp();
for (const p of PROFILES) {
  const { ctx, page } = await openOn(browser, p);
  const vh = p.d.viewport.height;
  const y = async sel => page.evaluate(s => {
    document.querySelector(s).scrollIntoView({ block: 'nearest' });
    return window.scrollY;
  }, sel);
  const canvasTop = await page.evaluate(() => document.querySelector('#stage').getBoundingClientRect().top + scrollY);

  const steps = [];
  let cur = 0, dist = 0, taps = 0;
  const go = async (sel, label, tap = 1) => {
    const t = await y(sel);
    dist += Math.abs(t - cur); cur = t; taps += tap;
    steps.push(`${label}: scroll to y=${F(t)} (+${F(Math.abs(t - cur))}), ${tap} tap`);
  };
  const back = async label => {
    const t = 0; dist += Math.abs(t - cur); cur = t;
    await page.evaluate(() => scrollTo(0, 0));
    steps.push(`${label}: scroll back to preview (y=0)`);
  };

  await go('.thumb', 'pick a library photo');
  const afterPhoto = dist;
  await back('check it');
  await go('.tpl', 'pick a template');
  await back('check it');
  await go('#export', 'download');
  await page.waitForTimeout(50);

  console.log(`\n### ${p.name} (${p.d.viewport.width}x${vh})`);
  console.log(`  minimum path, never looking at the preview between steps:`);
  const minDist = await (async () => {
    await page.evaluate(() => scrollTo(0, 0));
    let d = 0, c = 0;
    for (const s of ['.thumb', '.tpl', '#export']) { const t = await y(s); d += Math.abs(t - c); c = t; }
    return d;
  })();
  console.log(`    3 taps, ${F(minDist)}px of scrolling = ${F(minDist / vh)} screens`);
  console.log(`  realistic path, glancing at the preview after each choice:`);
  console.log(`    3 taps, ${F(dist)}px of scrolling = ${F(dist / vh)} screens`);
  console.log(`  full path with a name typed in (fields panel) and a save:`);
  const full = await (async () => {
    await page.evaluate(() => scrollTo(0, 0));
    let d = 0, c = 0;
    for (const s of ['.thumb', null, '.tpl', null, '[data-field="name"]', null, '#export', '#keep']) {
      const t = s === null ? 0 : await y(s);
      if (s === null) await page.evaluate(() => scrollTo(0, 0));
      d += Math.abs(t - c); c = t;
    }
    return d;
  })();
  console.log(`    5 taps + typing, ${F(full)}px = ${F(full / vh)} screens`);
  await ctx.close();
}
await browser.close();
