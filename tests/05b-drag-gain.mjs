// P2-8: pointer-to-photo gain. A gain of 1.0 means the photo tracks the finger
// exactly. The old code divided the pointer delta by half the preview width,
// which made the gain swing with photo aspect and zoom; the fix divides by
// coverSlack() measured in displayed pixels.
//
// Gain is measured with a REAL mouse drag through Playwright, then read back
// from coverRect so the number is the photo's actual travel on screen.
import { launch, feed } from './lib.mjs';

const { browser, page } = await launch();

// 1. Geometry first: the photo may never pull away from an edge.
const gap = await page.evaluate(async () => {
  const { coverRect } = await import('/src/compose.js');
  const { DEVICES } = await import('/src/devices.js');
  const imgs = [[1179, 2556], [1320, 2868], [2000, 3000], [8000, 1000], [1500, 1500], [1000, 4000], [40, 40], [3000, 2000], [1080, 2400], [4096, 2731]];
  let max = -Infinity, at = null, n = 0;
  for (const d of DEVICES) for (const [iw, ih] of imgs) for (let z = 1; z <= 3.0001; z += 0.01)
    for (const px of [-1.5, -1, -0.5, 0, 0.5, 1, 1.5]) for (const py of [-1.5, -1, -0.5, 0, 0.5, 1, 1.5]) {
      const r = coverRect({ width: iw, height: ih }, d.w, d.h, z, px, py);
      const g = Math.max(r.x, r.y, d.w - (r.x + r.w), d.h - (r.y + r.h));
      n++;
      if (g > max) { max = g; at = { dev: d.id, img: `${iw}x${ih}`, z: +z.toFixed(2), px, py }; }
    }
  return { max, at, n };
});
console.log(`worst positive frame gap over ${gap.n} combinations:`, gap.max.toExponential(3), 'px at', JSON.stringify(gap.at));
console.log(gap.max > 1e-9 ? '  <-- BACKGROUND CAN BE EXPOSED' : '  (negative = photo always overhangs the frame; nothing can expose background)');

console.log('\n=== pointer-to-photo gain, real drags (1.00 = the photo tracks the finger) ===');
const rows = [];
for (const [file, label] of [
  ['white-2000x3000.png', 'portrait 2:3'],
  ['pano-8000x1000.jpg', 'panorama 8:1'],
  ['tall-1000x4000.jpg', 'tall 1:4'],
  ['square-1500.jpg', 'square 1:1'],
  ['exif0-landscape.jpg', 'landscape 4:3'],
]) {
  await feed(page, new URL('./out/' + file, import.meta.url).pathname, file);
  for (const dev of ['ip-16-pro-max', 'ip-se', 'desktop', 'ipad', 'sg-ultra']) {
    for (const zoom of [1, 1.2, 2, 3]) {
      await page.evaluate(({ dev, zoom }) => {
        const S = window.__studio; S.setDevice(dev); S.state.zoom = zoom; S.state.panX = 0; S.state.panY = 0; S.render(false);
      }, { dev, zoom });
      const box = await page.locator('#stage').boundingBox();
      const D = 24; // css px, small enough not to hit the clamp on most combos
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + D, box.y + box.height / 2 + D, { steps: 6 });
      await page.mouse.up();
      const g = await page.evaluate(async (D) => {
        const { coverRect, coverSlack } = await import('/src/compose.js');
        const S = window.__studio, c = document.querySelector('#stage');
        const scale = c.getBoundingClientRect().width / c.width;
        const a = coverRect(S.state.image, c.width, c.height, S.state.zoom, 0, 0);
        const b = coverRect(S.state.image, c.width, c.height, S.state.zoom, S.state.panX, S.state.panY);
        const slack = coverSlack(S.state.image, c.width, c.height, S.state.zoom);
        return {
          gainX: +(((b.x - a.x) * scale) / D).toFixed(3),
          gainY: +(((b.y - a.y) * scale) / D).toFixed(3),
          panX: +S.state.panX.toFixed(3), panY: +S.state.panY.toFixed(3),
          slackX: +slack.x.toFixed(1), slackY: +slack.y.toFixed(1),
          // A drag that saturates the clamp cannot report a meaningful gain.
          clampedX: Math.abs(S.state.panX) >= 0.999, clampedY: Math.abs(S.state.panY) >= 0.999,
          // An axis with no slack cannot move at all — 0 is correct there.
          frozenX: slack.x < 0.5, frozenY: slack.y < 0.5,
        };
      }, D);
      rows.push({ photo: label, dev, zoom, ...g });
    }
  }
}

const fmt = r => {
  const notes = [];
  if (r.frozenX) notes.push('x pinned (no slack)');
  if (r.frozenY) notes.push('y pinned (no slack)');
  if (r.clampedX && !r.frozenX) notes.push('x hit clamp');
  if (r.clampedY && !r.frozenY) notes.push('y hit clamp');
  return notes.join(', ');
};
console.table(rows.map(r => ({ photo: r.photo, device: r.dev, zoom: r.zoom, gainX: r.gainX, gainY: r.gainY, note: fmt(r) })));

// Only rows where the axis could actually move and did not saturate are a fair
// test of the gain.
const live = rows.flatMap(r => [
  ...(!r.frozenX && !r.clampedX ? [{ axis: 'x', gain: r.gainX, ...r }] : []),
  ...(!r.frozenY && !r.clampedY ? [{ axis: 'y', gain: r.gainY, ...r }] : []),
]);
const gains = live.map(r => r.gain);
console.log('\nmeasurable axes (movable and not clamped):', live.length, 'of', rows.length * 2);
console.log('gain min', Math.min(...gains).toFixed(3), 'max', Math.max(...gains).toFixed(3),
  'mean', (gains.reduce((a, b) => a + b, 0) / gains.length).toFixed(3));
const off = live.filter(r => Math.abs(r.gain - 1) > 0.08);
console.log('axes more than 8% off 1.00x:', off.length);
if (off.length) console.table(off.map(r => ({ photo: r.photo, device: r.dev, zoom: r.zoom, axis: r.axis, gain: r.gain, slackX: r.slackX, slackY: r.slackY })));
else console.log('PASS: every measurable axis tracks the pointer within 8% of 1.00x.');

// And the qualitative check the old code failed: one short drag must not fling
// an 8:1 panorama from end to end.
console.log('\n=== one short drag on an 8:1 panorama at zoom 1 ===');
await feed(page, new URL('./out/pano-8000x1000.jpg', import.meta.url).pathname, 'pano-8000x1000.jpg');
for (const dev of ['ip-16-pro-max', 'desktop']) {
  await page.evaluate(d => { const S = window.__studio; S.setDevice(d); S.state.zoom = 1; S.state.panX = 0; S.state.panY = 0; S.render(false); }, dev);
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 12 });
  const mid = await page.evaluate(() => ({ panX: +window.__studio.state.panX.toFixed(4) }));
  await page.mouse.up();
  console.log(` ${dev.padEnd(14)} preview ~${box.width.toFixed(0)}css px wide, drag 200px right -> panX=${mid.panX} (1.0 = flung to the end)`);
}
await browser.close();
