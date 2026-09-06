import { launch, feed } from './lib.mjs';

const { browser, page } = await launch();
await page.waitForTimeout(1000);

// exact worst float gap in coverRect
const gap = await page.evaluate(async () => {
  const { coverRect } = await import('/src/compose.js');
  const { DEVICES } = await import('/src/devices.js');
  const imgs = [[1179,2556],[1320,2868],[2000,3000],[8000,1000],[1500,1500],[1000,4000],[40,40],[3000,2000],[1080,2400]];
  let max = 0, at = null;
  for (const d of DEVICES) for (const [iw, ih] of imgs) for (let z = 1; z <= 3.0001; z += 0.01)
    for (const px of [-1,-0.5,0,0.5,1]) for (const py of [-1,-0.5,0,0.5,1]) {
      const r = coverRect({ width: iw, height: ih }, d.w, d.h, z, px, py);
      const g = Math.max(r.x, r.y, d.w - (r.x + r.w), d.h - (r.y + r.h));
      if (g > max) { max = g; at = { dev: d.id, img: `${iw}x${ih}`, z: +z.toFixed(2), px, py }; }
    }
  return { max, at };
});
console.log('worst positive frame gap anywhere:', gap.max, 'px at', JSON.stringify(gap.at));

console.log('\n=== pointer-to-photo gain (1.0 would mean the photo tracks the finger) ===');
for (const [file, label] of [['white-2000x3000.png','portrait 2:3'], ['pano-8000x1000.jpg','panorama 8:1'], ['tall-1000x4000.jpg','tall 1:4']]) {
  await feed(page, new URL('./out/' + file, import.meta.url).pathname, file);
  for (const dev of ['ip-16-pro-max', 'desktop']) {
    for (const zoom of [1.2, 2, 3]) {
      await page.evaluate(({ dev, zoom }) => {
        const S = window.__studio; S.setDevice(dev); S.state.zoom = zoom; S.state.panX = 0; S.state.panY = 0; S.render(false);
      }, { dev, zoom });
      const box = await page.locator('#stage').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 5 });
      await page.mouse.up();
      const g = await page.evaluate(async () => {
        const { coverRect } = await import('/src/compose.js');
        const S = window.__studio, c = document.querySelector('#stage');
        const scale = c.getBoundingClientRect().width / c.width;
        const a = coverRect(S.state.image, c.width, c.height, S.state.zoom, 0, 0);
        const b = coverRect(S.state.image, c.width, c.height, S.state.zoom, S.state.panX, S.state.panY);
        return { gainX: +(((b.x - a.x) * scale) / 30).toFixed(2), gainY: +(((b.y - a.y) * scale) / 30).toFixed(2), panX: +S.state.panX.toFixed(3), panY: +S.state.panY.toFixed(3) };
      });
      console.log(` ${label.padEnd(13)} ${dev.padEnd(14)} zoom ${zoom}: photo moves ${g.gainX}x the pointer horizontally, ${g.gainY}x vertically (pan ${g.panX}/${g.panY})`);
    }
  }
}

console.log('\n=== does one short drag hit the clamp? (pan saturates = photo jumps to the edge) ===');
await feed(page, new URL('./out/pano-8000x1000.jpg', import.meta.url).pathname, 'pano-8000x1000.jpg');
await page.evaluate(() => { const S = window.__studio; S.setDevice('ip-16-pro-max'); S.state.zoom = 1; S.state.panX = 0; S.state.panY = 0; S.render(false); });
const box = await page.locator('#stage').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 10 });
const mid = await page.evaluate(() => ({ panX: +window.__studio.state.panX.toFixed(3) }));
await page.mouse.up();
console.log(' panorama at zoom 1, drag 200 css px right (preview is ~341 css px wide): panX =', mid.panX, '(1.0 = fully clamped, i.e. the whole 8:1 photo has scrolled to its end)');
await browser.close();
