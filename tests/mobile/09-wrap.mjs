// HOUSTON must render on one line. Counts distinct horizontal bands of ink in
// the lower half of the plate, where the headline sits.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
await p.goto('http://localhost:8080/index.html');
await p.waitForFunction(() => window.__studio, null, { timeout: 20000 });
await p.evaluate(() => document.fonts.ready);
await p.evaluate(async () => {
  const c = new OffscreenCanvas(1400, 2000); const x = c.getContext('2d');
  x.fillStyle = '#0a0f14'; x.fillRect(0, 0, 1400, 2000);
  await window.__studio.useSource(await c.convertToBlob({ type: 'image/png' }), 'flat');
});
await p.waitForTimeout(500);

const rows = [];
for (const dev of ['ip-se', 'ip-13', 'ip-16-pro-max', 'sg-ultra', 'desktop']) {
  for (const word of ['HOUSTON', 'TEXANS', 'BATTLE RED', 'PAPADOPOULOS']) {
    const r = await p.evaluate(async ([dev, word]) => {
      const s = window.__studio;
      s.setDevice(dev); s.setTemplate('battle'); s.setSurface('home');
      s.setFields({ headline: word, name: '', number: '', section: '', since: '', kicker: '' });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      // Render at export size so we measure what the fan actually gets.
      const out = s.renderExport();
      const { data, width, height } = out.getContext('2d').getImageData(0, 0, out.width, out.height);
      let bands = 0, inBand = false, maxX = 0;
      for (let y = Math.floor(height * 0.45); y < height; y++) {
        let bright = 0;
        for (let x = 0; x < width; x += 3) {
          const i = (y * width + x) * 4;
          if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) { bright++; if (x > maxX) maxX = x; }
        }
        const has = bright > 3;
        if (has && !inBand) bands++;
        inBand = has;
      }
      return { bands, overflow: maxX > width - 4, width };
    }, [dev, word]);
    rows.push({ device: dev, word, inkBands: r.bands, offCanvas: r.overflow });
  }
}
await b.close();
const single = rows.filter(r => ['HOUSTON', 'TEXANS'].includes(r.word));
const bad = single.filter(r => r.inkBands > 1);
const over = rows.filter(r => r.offCanvas);
console.table(rows);
console.log(`single words split across lines: ${bad.length}`);
console.log(`anything running off canvas: ${over.length}`);
if (bad.length || over.length) process.exitCode = 1; else console.log('PASS');
