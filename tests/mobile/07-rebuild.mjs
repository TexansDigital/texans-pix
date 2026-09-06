// Does the rebuilt layout actually put the preview on screen while you work?
import { chromium, devices } from 'playwright';
const EXEC = process.env.PW_CHROMIUM;
const URL = 'http://localhost:8080/index.html';
const PROFILES = [
  ['iPhone SE', { width: 375, height: 667 }, 2],
  ['iPhone 13', { width: 390, height: 664 }, 3],
  ['Pixel 7', { width: 412, height: 839 }, 2.625],
  ['Android 360', { width: 360, height: 672 }, 3],
];
const browser = await chromium.launch({ executablePath: EXEC });
const rows = []; const errs = [];
for (const [name, viewport, dpr] of PROFILES) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
  await p.goto(URL);
  await p.waitForFunction(() => window.__studio, null, { timeout: 20000 });
  await p.waitForFunction(() => document.querySelectorAll('.thumb').length > 0, null, { timeout: 15000 });
  await p.evaluate(async () => { document.querySelectorAll('.thumb')[0].click(); });
  await p.waitForTimeout(1500);

  for (const tab of ['photo', 'look', 'words', 'saved']) {
    const r = await p.evaluate(async (tab) => {
      window.__studio.setTab(tab);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = document.querySelector('#stage').getBoundingClientRect();
      const vh = window.innerHeight;
      const visible = Math.max(0, Math.min(c.bottom, vh) - Math.max(c.top, 0));
      return {
        pct: c.height > 0 ? Math.round(visible / c.height * 100) : 0,
        docOver: Math.round(document.documentElement.scrollHeight / vh * 100) / 100,
      };
    }, tab);
    rows.push({ device: name, tab, previewVisible: `${r.pct}%`, docViewports: r.docOver });
  }
  // touch targets + input font sizes
  const audit = await p.evaluate(() => {
    const small = [], zoomy = [];
    for (const el of document.querySelectorAll('button, input, select, [role="tab"]')) {
      if (el.hidden || !el.offsetParent && el.type !== 'radio') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const label = el.id || el.className || el.type;
      if (r.height < 44 || r.width < 44) small.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if ((el.tagName === 'SELECT' || el.type === 'text') && fs < 16) zoomy.push(`${label} ${fs}px`);
    }
    return { small, zoomy };
  });
  rows.push({ device: name, tab: 'AUDIT', previewVisible: `${audit.small.length} small`, docViewports: `${audit.zoomy.length} <16px` });
  if (audit.small.length) console.log(`  ${name} small targets:`, audit.small.join(', '));
  if (audit.zoomy.length) console.log(`  ${name} zoom risks:`, audit.zoomy.join(', '));
  await ctx.close();
}
await browser.close();
console.table(rows);
if (errs.length) console.log('PAGE ERRORS:\n' + errs.join('\n')); else console.log('no page errors');
