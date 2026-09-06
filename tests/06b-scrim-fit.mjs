// Why do some display runs still sit on a bright backdrop?
// protectBand takes a fixed `fromFrac` per template, while the display size is
// a fraction of WIDTH. On a short, wide canvas (desktop 2560x1440) the type
// block is proportionally huge and its top rises above the band.
import { launch, feed, INK_RECORDER, isMono } from './lib.mjs';

const { browser, page } = await launch();
await page.evaluate(INK_RECORDER);

const BANDS = { battle: 0.42, stamp: 0.64, 'deep-steel': null, ticker: 0.5, jersey: 0.34 };

for (const src of ['white-2000x3000.png']) {
  await feed(page, new URL('./out/' + src, import.meta.url).pathname, src);
  console.log('photo:', src);
  console.log('\n tpl / device      display block top   band starts   feather starts   verdict');
  for (const tpl of ['battle', 'stamp', 'deep-steel', 'ticker', 'jersey']) {
    for (const dev of ['ip-16-pro-max', 'ip-se', 'ipad', 'desktop']) {
      const r = await page.evaluate(async ({ dev, tpl }) => {
        const S = window.__studio, c = document.querySelector('#stage'), ctx = c.getContext('2d');
        S.setDevice(dev); S.setSurface('lock'); S.setTemplate(tpl);
        S.setFields({ headline: 'Houston', name: 'Marcus Ryan', number: '04', section: '132', since: '2002', kicker: 'Week 01' });
        window.__ink = []; window.__recording = true; S.render(false); window.__recording = false;
        const disp = window.__ink.filter(i => i.text.trim() && !/Azeret|monospace|Menlo/.test(i.font));
        if (!disp.length) return null;
        const top = Math.min(...disp.map(i => i.y0));
        // read the backdrop luminance across the row the display block starts on
        window.__suppress = true; S.render(false); window.__suppress = false;
        const row = Math.max(0, Math.round(top) + 2);
        const d = ctx.getImageData(0, row, c.width, 1).data;
        let max = 0; for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i]);
        S.render(false);
        return { H: c.height, W: c.width, top, size: +(/(\d+(?:\.\d+)?)px/.exec(disp[0].font) || [0, 0])[1], brightestAtTop: max };
      }, { dev, tpl });
      if (!r) { console.log(` ${tpl}/${dev}: no display run`); continue; }
      const frac = BANDS[tpl];
      const bandY = frac === null ? 0 : r.H * frac;
      const feather = frac === null ? 0 : r.H * (frac - 0.18);
      const verdict = frac === null ? 'flat scrim, whole plate'
        : r.top < feather ? `TYPE STARTS ABOVE THE SCRIM ENTIRELY (${(feather - r.top).toFixed(0)}px)`
        : r.top < bandY ? `top ${(bandY - r.top).toFixed(0)}px into the feather ramp`
        : 'fully inside the band';
      console.log(` ${tpl.padEnd(11)} ${dev.padEnd(14)} top=${r.top.toFixed(0).padStart(5)} (size ${String(r.size).padStart(5)})  band=${bandY.toFixed(0).padStart(5)}  feather=${feather.toFixed(0).padStart(5)}  brightest px on that row=${String(r.brightestAtTop).padStart(3)}  ${verdict}`);
    }
  }
}
await browser.close();
