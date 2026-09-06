// 6. Safe areas / vh, 7. device auto-detection.
import { PROFILES, browserUp, openOn, F } from './lib.mjs';
import { DEVICES } from '../../src/devices.js';

const browser = await browserUp();
console.log('viewport meta:', (await (async () => 'see 02')()) );
console.log('\n-- what the browser knows about the handset vs what the app asks the fan to pick --');
for (const p of PROFILES) {
  const { ctx, page } = await openOn(browser, p);
  const info = await page.evaluate(() => ({
    sw: screen.width, sh: screen.height, dpr: devicePixelRatio,
    aw: screen.availWidth, ah: screen.availHeight,
    iw: innerWidth, ih: innerHeight,
    orient: screen.orientation?.type,
    ua: navigator.userAgent.slice(0, 60),
    defaultDevice: window.__studio.state.device.id + ' ' + window.__studio.state.device.w + 'x' + window.__studio.state.device.h,
    sai: getComputedStyle(document.documentElement).getPropertyValue('--x') || 'n/a',
  }));
  const px = Math.round(info.sw * info.dpr), py = Math.round(info.sh * info.dpr);
  const exact = DEVICES.find(d => d.w === px && d.h === py);
  // nearest by pixel-count distance
  let near = null, bd = Infinity;
  for (const d of DEVICES) { const dist = Math.hypot(d.w - px, d.h - py); if (dist < bd) { bd = dist; near = d; } }
  console.log(`${p.name.padEnd(18)} screen ${info.sw}x${info.sh} @${info.dpr}dpr -> ${px}x${py}   exact match: ${exact ? exact.id : 'NONE'}   nearest: ${near.id} (${near.w}x${near.h}, off by ${F(bd)}px)   app default: ${info.defaultDevice}`);
  await ctx.close();
}

console.log('\n-- safe-area / vh audit (static) --');
const { ctx, page } = await openOn(browser, PROFILES[1]);
const css = await page.evaluate(() => {
  const meta = document.querySelector('meta[name=viewport]').content;
  const el = document.querySelector('#stage');
  const root = document.documentElement;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);width:env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  const pr = probe.getBoundingClientRect();
  const mast = document.querySelector('.mast').getBoundingClientRect();
  const lastPanel = [...document.querySelectorAll('.panel')].pop().getBoundingClientRect();
  const studio = getComputedStyle(document.querySelector('.studio'));
  return {
    meta,
    stageMaxH: getComputedStyle(el).maxHeight,
    safeTopResolved: pr.height, safeLeftResolved: pr.width,
    mastTop: mast.top, mastH: mast.height,
    bodyPadBottom: getComputedStyle(document.body).paddingBottom,
    studioPad: studio.padding,
    docH: document.documentElement.scrollHeight, vh: innerHeight,
  };
});
console.log(JSON.stringify(css, null, 2));
await ctx.close();
await browser.close();
