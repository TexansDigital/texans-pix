// Contract check for the APIs that changed in the fix pass. Every claim the
// rest of the suite makes rests on these shapes being what they say they are.
import { launch, feed, MONO_LOCAL } from './lib.mjs';

const { browser, page } = await launch();
console.log('mono served locally:', MONO_LOCAL);

const out = {};

// --- decodeImage returns a record, not a bare bitmap -------------------------
out.decodeImage = await page.evaluate(async () => {
  const { decodeImage } = await import('/src/compose.js');
  const mk = async (w, h) => {
    const c = new OffscreenCanvas(w, h);
    const x = c.getContext('2d'); x.fillStyle = '#e00'; x.fillRect(0, 0, w, h);
    return c.convertToBlob({ type: 'image/png' });
  };
  const small = await decodeImage(await mk(300, 200));
  const big = await decodeImage(await mk(6000, 4000));
  return {
    keys: Object.keys(small).sort(),
    isBareBitmap: small instanceof ImageBitmap,
    small: { w: small.bitmap.width, h: small.bitmap.height, sw: small.sourceWidth, sh: small.sourceHeight, down: small.downscaled },
    big: { w: big.bitmap.width, h: big.bitmap.height, sw: big.sourceWidth, sh: big.sourceHeight, down: big.downscaled },
    bigAspectPreserved: Math.abs(big.bitmap.width / big.bitmap.height - 6000 / 4000) < 1e-3,
    capped: Math.max(big.bitmap.width, big.bitmap.height) === 4096,
  };
});

// --- loadFonts resolves { display: [weights], mono: bool } --------------------
out.loadFonts = await page.evaluate(async () => {
  const { loadFonts } = await import('/src/compose.js');
  const f = await loadFonts();
  return { keys: Object.keys(f).sort(), display: f.display, mono: f.mono, displayIsArray: Array.isArray(f.display), monoIsBool: typeof f.mono === 'boolean' };
});

// --- layoutDisplay + drawDisplay share one pass ------------------------------
out.displayPair = await page.evaluate(async () => {
  const M = await import('/src/compose.js');
  const c = new OffscreenCanvas(1320, 2868).getContext('2d');
  const L = M.layoutDisplay(c, 'ALPHA BRAVO CHARLIE DELTA', { size: 178, maxWidth: 1156, maxLines: 2 });
  const drawn = M.drawDisplay(c, L, { x: 82, y: 100 });
  return {
    removed: { displayBlock: typeof M.displayBlock, displayBlockHeight: typeof M.displayBlockHeight },
    present: { layoutDisplay: typeof M.layoutDisplay, drawDisplay: typeof M.drawDisplay },
    layoutKeys: Object.keys(L).sort(),
    lines: L.lines, fontSize: L.fontSize, height: +L.height.toFixed(2),
    drawReturnsSameHeight: Math.abs(drawn - L.height) < 1e-9,
    heightMatchesFormula: Math.abs(L.height - ((L.lines.length - 1) * L.fontSize * L.lineHeight + L.fontSize)) < 1e-9,
    respectsMaxLines: L.lines.length <= 2,
  };
});

// --- protectBand replaces scrimBottom; TONE values ---------------------------
out.protectBand = await page.evaluate(async () => {
  const M = await import('/src/compose.js');
  const probe = (rgb) => {
    const off = new OffscreenCanvas(400, 800);
    const x = off.getContext('2d', { willReadFrequently: true });
    x.fillStyle = `rgb(${rgb.join(',')})`; x.fillRect(0, 0, 400, 800);
    const alpha = M.protectBand(x, 400, 800, { fromFrac: 0.5, tone: M.TONE.white, floor: 0.4 });
    const at = (px, py) => [...x.getImageData(px, py, 1, 1).data].slice(0, 3);
    return { alpha: +alpha.toFixed(3), inBand: at(200, 700), aboveBand: at(200, 100) };
  };
  return {
    removed: typeof M.scrimBottom,
    signatureArity: M.protectBand.length,
    TONE: M.TONE,
    onWhite: probe([255, 255, 255]),
    onBlack: probe([0, 0, 0]),
    onGrey: probe([128, 128, 128]),
    adaptive: true,
  };
});

// --- tickerStrip takes an explicit top ---------------------------------------
out.tickerStrip = await page.evaluate(async () => {
  const M = await import('/src/compose.js');
  const off = new OffscreenCanvas(400, 800);
  const x = off.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 800);
  M.tickerStrip(x, 400, 300, 40);
  const at = (px, py) => [...x.getImageData(px, py, 1, 1).data].slice(0, 3);
  return { arity: M.tickerStrip.length, above: at(200, 290), inStrip: at(5, 320), below: at(200, 350) };
});

// --- coverSlack is what the pan math divides by ------------------------------
out.coverSlack = await page.evaluate(async () => {
  const { coverSlack, coverRect } = await import('/src/compose.js');
  const rows = [];
  for (const [iw, ih] of [[2000, 3000], [8000, 1000], [1000, 4000], [1320, 2868]]) {
    for (const z of [1, 1.5, 3]) {
      const s = coverSlack({ width: iw, height: ih }, 1320, 2868, z);
      const a = coverRect({ width: iw, height: ih }, 1320, 2868, z, 0, 0);
      const b = coverRect({ width: iw, height: ih }, 1320, 2868, z, 1, 1);
      rows.push({ img: `${iw}x${ih}`, z, slackX: +s.x.toFixed(3), slackY: +s.y.toFixed(3),
        movedX: +(b.x - a.x).toFixed(3), movedY: +(b.y - a.y).toFixed(3),
        matches: Math.abs((b.x - a.x) - s.x) < 1e-6 && Math.abs((b.y - a.y) - s.y) < 1e-6 });
    }
  }
  return { defined: typeof coverSlack, rows, allMatch: rows.every(r => r.matches) };
});

// --- effectiveSurface: desktop coerces lock -> home --------------------------
out.effectiveSurface = await page.evaluate(() => {
  const S = window.__studio;
  const res = {};
  for (const [dev, want] of [['ip-16-pro-max', 'lock'], ['desktop', 'home']]) {
    S.setDevice(dev); S.setSurface('lock');
    res[dev + '/lock'] = S.effectiveSurface();
    res[dev + '/lock/ok'] = S.effectiveSurface() === want;
    S.setSurface('home');
    res[dev + '/home'] = S.effectiveSurface();
  }
  S.setDevice('ip-16-pro-max'); S.setSurface('lock');
  return { type: typeof S.effectiveSurface, ...res };
});

// --- DOM contract: #pick, #file tabindex, #export starts disabled -------------
out.dom = await page.evaluate(() => {
  const pick = document.querySelector('#pick');
  const file = document.querySelector('#file');
  const exp = document.querySelector('#export');
  return {
    pickExists: !!pick, pickTag: pick && pick.tagName, pickTabIndex: pick && pick.tabIndex,
    fileTabIndex: file.tabIndex, fileHidden: file.hasAttribute('hidden'), fileAriaHidden: file.getAttribute('aria-hidden'),
    exportDisabledAtBoot: exp.disabled,
  };
});
console.log(JSON.stringify(out, null, 1));

// export must enable only once a photo is in
const before = await page.evaluate(() => document.querySelector('#export').disabled);
const fed = await feed(page, '/home/user/texans-pix/tests/out/exif0-landscape.jpg', 'exif0-landscape.jpg');
console.log('\n#export disabled before photo:', before, '| after photo:', fed.exportDisabled, '| status:', JSON.stringify(fed.status));
await browser.close();
