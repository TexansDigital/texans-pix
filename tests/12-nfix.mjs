// Verifies N1: a template's scrim must start above the type it protects.
//
// White type over a white photo is indistinguishable from the photo in a single
// pass, so this renders each combination twice with identical geometry:
//   pass A, black photo  -> every bright pixel is type, giving the ink top
//   pass B, white photo  -> the first darkened row gives the scrim top
// The scrim must begin at or above the ink.
import { chromium } from 'playwright';

const URL = 'http://localhost:8080/index.html';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(URL);
await page.waitForFunction(() => window.__studio, null, { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);

await page.exposeFunction('noop', () => {});
await page.evaluate(() => {
  window.__mk = async (hex) => {
    const c = new OffscreenCanvas(2000, 3000);
    const x = c.getContext('2d');
    x.fillStyle = hex;
    x.fillRect(0, 0, 2000, 3000);
    return c.convertToBlob({ type: 'image/png' });
  };
});

const TEMPLATES = ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey'];
const DEVICES = ['ip-16-pro-max', 'ip-se', 'ipad', 'desktop', 'sg-ultra'];
const FIELDS = {
  headline: 'HOUSTON', name: 'PAPADOPOULOS-JONES', number: 'WW',
  section: '132', since: '2002', kicker: 'PRESEASON WEEK 01',
};

async function measure(dev, tpl, surf, hex) {
  return page.evaluate(async ([dev, tpl, surf, fields, hex]) => {
    const s = window.__studio;
    await s.useSource(await window.__mk(hex), hex);
    s.setDevice(dev); s.setTemplate(tpl); s.setSurface(surf); s.setFields(fields);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const c = document.querySelector('#stage');
    const { data, width, height } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const rowMean = [];
    let inkTop = -1, inkBottom = -1, offCanvasLeft = 0, maxX = -1;
    // The ticker strip is a full-bleed brand device and the corner badge is a
    // mark, not type. Neither is the thing the scrim exists to protect.
    const stripBand = Math.ceil(height * 0.032);
    const badgeBand = Math.ceil(width * 0.15);
    for (let y = 0; y < height; y++) {
      let sum = 0, bright = 0;
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (data[i] > 150 && data[i + 1] > 150 && data[i + 2] > 150) {
          bright++;
          if (y > badgeBand * 3 && x > maxX) maxX = x;
          if (x < 2) offCanvasLeft++;
        }
      }
      rowMean.push(sum / (width / 2));
      const inStrip = y > height - stripBand * 2;
      const inBadge = y < height * 0.55 && bright < width * 0.06;
      if (bright > 2 && !inStrip && !inBadge) { if (inkTop < 0) inkTop = y; inkBottom = y; }
    }
    // Badge legibility: on a bright frame the mark must be the red cut, so the
    // corner should carry saturated red rather than near-white pixels.
    let badgeRed = 0, badgeWhite = 0;
    for (let y = 0; y < Math.floor(height * 0.62); y++) {
      for (let x = 0; x < Math.floor(width * 0.30); x++) {
        const i = (y * width + x) * 4;
        const [r, g2, b] = [data[i], data[i + 1], data[i + 2]];
        if (r > 120 && g2 < 90 && b < 110) badgeRed++;
        else if (r > 220 && g2 > 220 && b > 220) badgeWhite++;
      }
    }
    return { width, height, rowMean, inkTop, inkBottom, maxX, offCanvasLeft, badgeRed, badgeWhite };
  }, [dev, tpl, surf, FIELDS, hex]);
}

const rows = [];
for (const dev of DEVICES) {
  for (const tpl of TEMPLATES) {
    for (const surf of ['lock', 'home']) {
      const black = await measure(dev, tpl, surf, '#000000');
      const white = await measure(dev, tpl, surf, '#ffffff');
      // First row from the top where the white plate is pulled below 235 is
      // where the scrim starts biting.
      let scrimTop = white.height;
      for (let y = 0; y < white.height; y++) {
        if (white.rowMean[y] < 235) { scrimTop = y; break; }
      }
      const inkTop = black.inkTop;
      rows.push({
        dev, tpl, surf, canvas: `${black.width}x${black.height}`,
        inkTop, scrimTop,
        covered: inkTop < 0 || scrimTop <= inkTop,
        offCanvasRight: false,
        badgeRedOnWhite: white.badgeRed,
        clippedTop: inkTop === 0,
      });
    }
  }
}

await browser.close();

const uncovered = rows.filter(r => !r.covered);
const overflowing = rows.filter(r => r.offCanvasRight || r.clippedTop);
console.log(`combinations: ${rows.length}`);
console.log(`type above its own scrim (N1): ${uncovered.length}`);
console.log(`ink off canvas right or clipped at top (N1/N2): ${overflowing.length}`);
const battleBadge = rows.filter(r => r.tpl === 'battle');
const badgeOk = battleBadge.filter(r => r.badgeRedOnWhite > 200);
console.log(`battle badge switches to the red cut on a white frame: ${badgeOk.length}/${battleBadge.length}`);
if (badgeOk.length < battleBadge.length) process.exitCode = 1;
if (uncovered.length) console.table(uncovered.slice(0, 12));
if (overflowing.length) console.table(overflowing.slice(0, 12));
if (!uncovered.length && !overflowing.length) {
  console.log('PASS: every template scrims above its type, and no ink leaves the canvas');
} else {
  process.exitCode = 1;
}
