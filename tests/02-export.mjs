import { launch, feed } from './lib.mjs';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const { browser, page, errors } = await launch();
await page.waitForTimeout(1200);
await feed(page, new URL('./out/exif0-landscape.jpg', import.meta.url).pathname, 'exif0-landscape.jpg');

const devices = await page.evaluate(() => [...document.querySelectorAll('#device option')].map(o => o.value));
const rows = [];
for (const id of devices) {
  for (const surface of ['lock', 'home']) {
    const r = await page.evaluate(async ({ id, surface }) => {
      const S = window.__studio;
      S.setDevice(id); S.setSurface(surface);
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const c = document.querySelector('#stage');
      // Export exactly the way the app does it.
      S.render(false);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.94));
      const bmp = await createImageBitmap(blob);
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return {
        preset: [S.state.device.w, S.state.device.h],
        canvas: [c.width, c.height],
        decoded: [bmp.width, bmp.height],
        bytes: buf.length,
        b64: btoa(bin),
      };
    }, { id, surface });
    // Independently verify with sharp in node.
    const buf = Buffer.from(r.b64, 'base64');
    const meta = await sharp(buf).metadata();
    rows.push({
      id, surface,
      preset: r.preset.join('x'), canvas: r.canvas.join('x'),
      decodedInPage: r.decoded.join('x'), decodedInNode: `${meta.width}x${meta.height}`,
      format: meta.format,
      ok: r.preset.join('x') === r.canvas.join('x') && r.preset.join('x') === r.decoded.join('x')
          && r.preset.join('x') === `${meta.width}x${meta.height}`,
    });
  }
}
console.table(rows);
console.log('ALL EXPORT DIMS OK:', rows.every(r => r.ok));

// --- guides must never reach an export -------------------------------------
const guideTest = await page.evaluate(async () => {
  const S = window.__studio;
  S.setDevice('ip-16-pro-max'); S.setSurface('lock');
  document.querySelector('#guides').checked = true;
  document.querySelector('#guides').dispatchEvent(new Event('change'));
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const c = document.querySelector('#stage');
  const ctx = c.getContext('2d');
  // sample a pixel inside the clock zone with guides shown on the preview
  const inClock = [...ctx.getImageData(c.width / 2, c.height * 0.15, 1, 1).data];

  // now do exactly what the export button does
  const withGuidesVisible = c.toDataURL('image/png');
  S.render(false);
  const clean = c.toDataURL('image/png');
  const cleanPx = [...ctx.getImageData(c.width / 2, c.height * 0.15, 1, 1).data];

  // real export path: click the button and grab the blob it would make
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.94));
  const bmp = await createImageBitmap(blob);
  const off = new OffscreenCanvas(bmp.width, bmp.height);
  const octx = off.getContext('2d');
  octx.drawImage(bmp, 0, 0);
  // scan for guide-red: the 0.75-alpha stroke over dark art is a strong red
  const d = octx.getImageData(0, 0, bmp.width, bmp.height).data;
  let strongRed = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 150 && d[i + 1] < 70 && d[i + 2] < 90) strongRed++;
  }
  return { guidesFlag: S.state.guides, inClock, cleanPx, sameImage: withGuidesVisible === clean, strongRedPixels: strongRed, total: bmp.width * bmp.height };
});
console.log('guides:', JSON.stringify(guideTest));

// click the actual export button with guides on, intercept the download
await page.evaluate(() => { const g = document.querySelector('#guides'); g.checked = true; g.dispatchEvent(new Event('change')); });
await page.waitForTimeout(300);
const dl = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }).catch(e => null),
  page.click('#export'),
]);
if (dl[0]) {
  const p = '/home/user/texans-pix/tests/out/exported-guides-on.jpg';
  await dl[0].saveAs(p);
  const meta = await sharp(p).metadata();
  const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
  let strongRed = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 150 && data[i + 1] < 70 && data[i + 2] < 90) strongRed++;
  }
  console.log('downloaded file:', dl[0].suggestedFilename(), `${meta.width}x${meta.height}`, meta.format, 'strongRedPixels=', strongRed);
} else {
  console.log('NO DOWNLOAD EVENT FIRED');
}

// re-export twice unchanged: byte compare
const twice = await page.evaluate(async () => {
  const c = document.querySelector('#stage');
  const S = window.__studio;
  const grab = async () => {
    S.render(false);
    const b = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.94));
    const a = new Uint8Array(await b.arrayBuffer());
    let h = 0; for (let i = 0; i < a.length; i++) h = (h * 31 + a[i]) >>> 0;
    return { size: a.length, hash: h };
  };
  return [await grab(), await grab()];
});
console.log('re-export determinism:', JSON.stringify(twice), 'identical:', twice[0].size === twice[1].size && twice[0].hash === twice[1].hash);
console.log('--- errors ---'); console.log(errors.join('\n') || '(none)');
await browser.close();
