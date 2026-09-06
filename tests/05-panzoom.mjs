import { launch, feed } from './lib.mjs';

const { browser, page } = await launch();
await page.waitForTimeout(1200);

// A pure-white source makes any exposed deep-steel background obvious.
await feed(page, new URL('./out/white-2000x3000.png', import.meta.url).pathname, 'white-2000x3000.png');

const devices = await page.evaluate(() => [...document.querySelectorAll('#device option')].map(o => o.value));
const sources = [
  ['white-2000x3000.png', 'portrait 2:3'],
  ['pano-8000x1000.jpg', 'panorama 8:1'],
  ['square-1500.jpg', 'square'],
  ['tall-1000x4000.jpg', 'tall 1:4'],
  ['tiny-40x40.jpg', '40x40'],
];

// Geometry check: does coverRect ever leave the frame uncovered?
console.log('=== A. coverRect coverage sweep (geometry, exact) ===');
const geo = await page.evaluate(async ({ devices }) => {
  const { coverRect } = await import('/src/compose.js');
  const { DEVICES } = await import('/src/devices.js');
  const imgs = [
    { name: '2000x3000', width: 2000, height: 3000 }, { name: '8000x1000', width: 8000, height: 1000 },
    { name: '1500x1500', width: 1500, height: 1500 }, { name: '1000x4000', width: 1000, height: 4000 },
    { name: '40x40', width: 40, height: 40 }, { name: '4096x2731', width: 4096, height: 2731 },
    { name: '1179x2556 exact', width: 1179, height: 2556 }, { name: '1320x2868 exact', width: 1320, height: 2868 },
    { name: '3000x2000', width: 3000, height: 2000 },
  ];
  const bad = [];
  for (const d of DEVICES) for (const img of imgs) {
    for (let z = 1; z <= 3.0001; z += 0.05) {
      for (const px of [-1, -0.5, 0, 0.5, 1]) for (const py of [-1, -0.5, 0, 0.5, 1]) {
        const r = coverRect(img, d.w, d.h, z, px, py);
        const gapL = r.x, gapT = r.y, gapR = d.w - (r.x + r.w), gapB = d.h - (r.y + r.h);
        const worst = Math.max(gapL, gapT, gapR, gapB);
        if (worst > 0) bad.push({ dev: d.id, img: img.name, z: +z.toFixed(2), px, py, gapL: +gapL.toFixed(6), gapT: +gapT.toFixed(6), gapR: +gapR.toFixed(6), gapB: +gapB.toFixed(6) });
      }
    }
  }
  return { count: bad.length, worst: bad.sort((a, b) => Math.max(b.gapL,b.gapT,b.gapR,b.gapB) - Math.max(a.gapL,a.gapT,a.gapR,a.gapB)).slice(0, 8) };
}, { devices });
console.log('uncovered-frame combinations:', geo.count, JSON.stringify(geo.worst, null, 1));

console.log('\n=== B. Real pixels: can a drag expose background? (white photo, stamp template) ===');
const results = [];
for (const [file, desc] of sources) {
  await feed(page, new URL('./out/' + file, import.meta.url).pathname, file);
  for (const dev of ['ip-16-pro-max', 'ip-se', 'desktop', 'ipad', 'sg-ultra']) {
    for (const zoom of [1, 1.01, 1.5, 2, 3]) {
      const r = await page.evaluate(async ({ dev, zoom }) => {
        const S = window.__studio, c = document.querySelector('#stage'), ctx = c.getContext('2d');
        S.setDevice(dev); S.setSurface('home'); S.setTemplate('stamp');
        S.state.zoom = zoom;
        let worst = null;
        for (const [px, py] of [[-5,-5],[5,5],[-5,5],[5,-5],[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1]]) {
          S.state.panX = px; S.state.panY = py;
          S.render(false);
          // the stamp template only scrims the bottom third; sample the clean area
          const d = ctx.getImageData(0, 0, c.width, Math.round(c.height * 0.6)).data;
          // deep steel background is (2,17,24)
          let bg = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (Math.abs(d[i] - 2) < 6 && Math.abs(d[i+1] - 17) < 6 && Math.abs(d[i+2] - 24) < 6) bg++;
          }
          if (!worst || bg > worst.bg) worst = { px, py, bg };
        }
        S.state.panX = 0; S.state.panY = 0;
        return { worst, W: c.width, H: c.height };
      }, { dev, zoom });
      results.push({ src: desc, dev, zoom, bgPixels: r.worst.bg, at: `${r.worst.px},${r.worst.py}` });
    }
  }
}
const leaks = results.filter(r => r.bgPixels > 0);
console.log('combinations tested:', results.length, ' with background exposed:', leaks.length);
console.log(JSON.stringify(leaks.slice(0, 20), null, 1));

console.log('\n=== C. Pointer-drag sensitivity: what a real drag does to pan ===');
const drag = await page.evaluate(() => {
  const c = document.querySelector('#stage');
  return { cssW: c.getBoundingClientRect().width, cssH: c.getBoundingClientRect().height, canvasW: c.width, canvasH: c.height };
});
console.log('canvas css size', drag);
await page.evaluate(() => { const S = window.__studio; S.setDevice('ip-16-pro-max'); S.state.zoom = 3; S.state.panX = 0; S.state.panY = 0; S.render(false); });
const box = await page.locator('#stage').boundingBox();
const before = await page.evaluate(() => ({ ...window.__studio.state, image: undefined, device: undefined, template: undefined, fields: undefined }));
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 2, box.y + box.height / 2 + i * 2);
await page.mouse.up();
const after = await page.evaluate(() => ({ panX: window.__studio.state.panX, panY: window.__studio.state.panY }));
console.log('drag of 20 css px right+down at zoom 3 =>', JSON.stringify(after), 'preview box', { w: box.width.toFixed(1), h: box.height.toFixed(1) });
const photoShift = await page.evaluate(async () => {
  const { coverRect } = await import('/src/compose.js');
  const S = window.__studio, c = document.querySelector('#stage');
  const a = coverRect(S.state.image, c.width, c.height, 3, 0, 0);
  const b = coverRect(S.state.image, c.width, c.height, 3, S.state.panX, S.state.panY);
  const scale = c.getBoundingClientRect().width / c.width;
  return { dxCanvasPx: +(b.x - a.x).toFixed(1), dxCssPx: +((b.x - a.x) * scale).toFixed(1), dyCanvasPx: +(b.y - a.y).toFixed(1), dyCssPx: +((b.y - a.y) * scale).toFixed(1) };
});
console.log('photo moved:', JSON.stringify(photoShift), '<- for a 20 css px pointer move');
await browser.close();
