import { launch, feed } from './lib.mjs';
import sharp from 'sharp';

const { browser, page } = await launch();
await page.waitForTimeout(1200);
await feed(page, new URL('./out/white-2000x3000.png', import.meta.url).pathname, 'white-2000x3000.png');

// Guides drawn on a WHITE photo are unmistakable: a red-tinted band + red stroke.
const r = await page.evaluate(async () => {
  const S = window.__studio, c = document.querySelector('#stage'), ctx = c.getContext('2d');
  S.setDevice('ip-16-pro-max'); S.setSurface('lock'); S.setTemplate('stamp');
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

  const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
  const probe = [Math.round(c.width * 0.5), Math.round(c.height * 0.15)]; // inside clock zone
  const clean1 = px(...probe);

  document.querySelector('#guides-btn').click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const previewWithGuides = px(...probe);

  // export path
  S.render(false);
  const afterRenderFalse = px(...probe);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.94));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);

  // race variant: schedule a guides render then immediately export, like a fast click
  document.querySelector('#guides-btn').click(); // queues rAF render(true)
  S.render(false);
  const raceBlob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.94));
  const rbuf = new Uint8Array(await raceBlob.arrayBuffer());
  let rbin = ''; for (let i = 0; i < rbuf.length; i++) rbin += String.fromCharCode(rbuf[i]);

  return { probe, clean1, previewWithGuides, afterRenderFalse, b64: btoa(bin), raceB64: btoa(rbin) };
});
console.log('probe px', r.probe, 'clean', r.clean1, 'preview w/ guides', r.previewWithGuides, 'after render(false)', r.afterRenderFalse);

const measured = {};
for (const [name, b64] of [['normal export', r.b64], ['race export', r.raceB64]]) {
  const buf = Buffer.from(b64, 'base64');
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i+1], data[i+2]]; };
  // guide fill over white would read ~ (219,217,220)-ish red tint; clean white is ~255,255,255
  const clock = at(Math.round(info.width * 0.5), Math.round(info.height * 0.15));
  // count pixels that are red-tinted (r noticeably > b) in the top 30% - guides only
  let tinted = 0, n = 0;
  for (let y = 0; y < Math.round(info.height * 0.3); y += 3) {
    for (let x = 0; x < info.width; x += 3) {
      const [R, G, B] = at(x, y); n++;
      if (R - B > 20 && R > 120) tinted++;
    }
  }
  console.log(name, 'clockPixel', clock, 'redTintedTopFraction', (tinted / n).toFixed(4));
  measured[name] = tinted / n;
}
await browser.close();

// This suite printed its evidence and always exited 0, so a preview canvas full
// of guide ink read as a pass. Give it a verdict: guide ink is red-tinted, and
// none of it may survive into anything read back for export.
const GUIDE_IN_EXPORT = 0.001;
const verdict = [
  ['render(false) clears the preview', String(r.afterRenderFalse) === String(r.clean1)],
  ['normal export carries no guide ink', measured['normal export'] <= GUIDE_IN_EXPORT],
  ['race export carries no guide ink', measured['race export'] <= GUIDE_IN_EXPORT],
];
let bad = 0;
for (const [name, ok] of verdict) { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); }
process.exit(bad ? 1 : 0);
