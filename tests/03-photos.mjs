import { launch, feed } from './lib.mjs';
import { readFileSync } from 'node:fs';

const { browser, page, errors } = await launch();
await page.waitForTimeout(1200);

const rejections = [];
await page.exposeFunction('__rej', m => rejections.push(m));
await page.evaluate(() => {
  window.addEventListener('unhandledrejection', e => window.__rej('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)));
});

const fixtures = [
  ['exif6-portrait.jpg', 'EXIF orientation 6 portrait (stored 1600x1200)'],
  ['exif0-landscape.jpg', 'control, no EXIF tag'],
  ['big-6000x4000.jpg', '24MP'],
  ['tiny-40x40.jpg', '40x40 thumbnail'],
  ['pano-8000x1000.jpg', 'ultra-wide panorama'],
  ['transparent.png', 'transparent PNG'],
  ['photo.webp', 'WebP'],
  ['square-1500.jpg', 'square'],
  ['tall-1000x4000.jpg', 'tall screenshot'],
  ['not-an-image.jpg', 'text file renamed .jpg'],
];

for (const [file, desc] of fixtures) {
  const path = new URL('./out/' + file, import.meta.url).pathname;
  const t0 = Date.now();
  const res = await feed(page, path, file);
  const ms = Date.now() - t0;

  const analysis = await page.evaluate(async () => {
    const S = window.__studio;
    const { coverRect } = await import('/src/compose.js');
    const c = document.querySelector('#stage'), ctx = c.getContext('2d');
    if (!S.state.image) return { noImage: true };
    const img = S.state.image;
    const r = coverRect(img, c.width, c.height, S.state.zoom, S.state.panX, S.state.panY);
    // corner samples of the composited canvas (top strip is unscrimmed on 'battle')
    const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    // Sample the source bitmap itself at native size to check orientation.
    const off = new OffscreenCanvas(img.width, img.height);
    const octx = off.getContext('2d');
    octx.drawImage(img, 0, 0);
    const q = (fx, fy) => {
      const d = octx.getImageData(Math.round(img.width * fx), Math.round(img.height * fy), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    // is the canvas blank / uniform?
    const samples = [];
    for (let i = 1; i <= 8; i++) samples.push(px(Math.round(c.width * i / 9), Math.round(c.height * 0.10)).join(','));
    return {
      imgAspect: +(img.width / img.height).toFixed(5),
      drawnAspect: +(r.w / r.h).toFixed(5),
      cover: { x: +r.x.toFixed(3), y: +r.y.toFixed(3), w: +r.w.toFixed(3), h: +r.h.toFixed(3) },
      coversFrame: r.x <= 0.0001 && r.y <= 0.0001 && r.x + r.w >= c.width - 0.0001 && r.y + r.h >= c.height - 0.0001,
      srcTL: q(0.08, 0.08), srcTR: q(0.92, 0.08), srcBL: q(0.08, 0.92), srcBR: q(0.92, 0.92),
      uniformTopRow: new Set(samples).size === 1,
      canvasCorners: [px(1, 1), px(c.width - 2, 1), px(1, c.height - 2), px(c.width - 2, c.height - 2)],
    };
  });
  console.log(`\n## ${file} (${desc})  [${ms}ms]`);
  console.log('   status:', JSON.stringify(res.status), 'isError:', res.isError, 'decoded:', res.img);
  console.log('   ', JSON.stringify(analysis));
}

console.log('\n--- unhandled rejections ---'); console.log(rejections.join('\n') || '(none)');
console.log('--- console errors ---'); console.log(errors.filter(e => !/fonts.googleapis|favicon|404|willReadFrequently/.test(e)).join('\n') || '(none besides fonts.googleapis/favicon)');
await browser.close();
