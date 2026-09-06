// P2-11: the Ticker strip must sit clear of the device's own UI zone — the
// flashlight/camera control row on an iOS lock screen, the dock on a home
// screen. Checks the strip AND the type that rides above it, on every device
// and both surfaces, from real pixels as well as from the fillRect geometry.
import { launch, feed, INK_RECORDER, isMono } from './lib.mjs';
const { browser, page } = await launch();
await feed(page, '/home/user/texans-pix/tests/out/dark-2000x3000.png', 'dark-2000x3000.png');
await page.evaluate(INK_RECORDER);

const devices = await page.evaluate(() => [...document.querySelectorAll('#device option')].map(o => o.value));
const rows = [];
for (const dev of devices) {
  for (const surface of ['lock', 'home']) {
    const r = await page.evaluate(async ({ dev, surface }) => {
      const S = window.__studio, c = document.querySelector('#stage'), ctx = c.getContext('2d');
      S.setDevice(dev); S.setSurface(surface); S.setTemplate('ticker');
      S.setFields({ headline: 'Houston', name: '', number: '', section: '132', since: '2002', kicker: 'Week 01' });
      window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
      const d = S.state.device, eff = S.effectiveSurface();
      // Find the strip from PIXELS: the topmost and bottommost row that is
      // battle red across the full width.
      const isRedRow = y => {
        const px = ctx.getImageData(0, y, c.width, 1).data;
        let red = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i] > 180 && px[i + 1] < 60 && px[i + 2] < 90) red++;
        return red > c.width * 0.5;
      };
      let top = -1, bot = -1;
      for (let y = 0; y < c.height; y++) if (isRedRow(y)) { if (top < 0) top = y; bot = y; }
      const zone = eff === 'lock' && d.lock
        ? { name: 'controls', from: d.lock.controlsTop * c.height }
        : { name: 'dock', from: (d.home || { dockTop: 1 }).dockTop * c.height };
      const ink = window.__ink.filter(i => i.text.trim() && !(i.y0 >= top - 2 && i.y1 <= bot + 2));
      return { H: c.height, eff, stripTop: top, stripBottom: bot, zone,
        lowestType: ink.length ? Math.max(...ink.map(i => i.y1)) : 0 };
    }, { dev, surface });
    rows.push({ device: dev, asked: surface, drawn: r.eff, H: r.H,
      strip: `${r.stripTop}..${r.stripBottom}`,
      zone: `${r.zone.name} @${r.zone.from.toFixed(0)}`,
      stripInZone: r.stripBottom > r.zone.from + 1 ? `${(r.stripBottom - r.zone.from).toFixed(0)}px` : 'no',
      typeInZone: r.lowestType > r.zone.from + 1 ? `${(r.lowestType - r.zone.from).toFixed(0)}px` : 'no' });
  }
}
console.table(rows);
const stripBad = rows.filter(r => r.stripInZone !== 'no');
const typeBad = rows.filter(r => r.typeInZone !== 'no');
console.log('\nstrip inside the device UI zone:', stripBad.length ? stripBad.map(r => `${r.device}/${r.drawn} by ${r.stripInZone}`).join(', ') : 'none');
console.log('type  inside the device UI zone:', typeBad.length ? typeBad.map(r => `${r.device}/${r.drawn} by ${r.typeInZone}`).join(', ') : 'none');
console.log('\nlock screens clear:', rows.filter(r => r.drawn === 'lock').every(r => r.stripInZone === 'no' && r.typeInZone === 'no'));
console.log('home screens clear:', rows.filter(r => r.drawn === 'home').every(r => r.stripInZone === 'no' && r.typeInZone === 'no'));
await browser.close();
