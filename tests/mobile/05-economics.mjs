// 2. Viewport economics: what is above the fold, how much scrolling, and how
// the page grows with a realistic library and collection.
import { PROFILES, browserUp, openOn, F } from './lib.mjs';

const browser = await browserUp();
for (const p of PROFILES) {
  const { ctx, page } = await openOn(browser, p);
  const base = await page.evaluate(() => {
    const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const vh = innerHeight;
    const mast = r('header.bar'), stage = r('#stage'), hold = r('section.preview'), status = r('#status');
    const panels = [...document.querySelectorAll('.pane')].map(e => {
      const b = e.getBoundingClientRect();
      // Panes carry their name as data-pane; the <legend> they used to have is gone.
      return { legend: e.dataset.pane || '(unnamed)', top: b.top + scrollY, h: b.height };
    });
    return {
      vh, docH: document.documentElement.scrollHeight,
      mastH: mast.height,
      canvasTopDoc: stage.top + scrollY, canvasBottomDoc: stage.bottom + scrollY,
      canvasW: stage.width, canvasH: stage.height,
      holdH: hold.height,
      statusBottomDoc: status.bottom + scrollY,
      firstControlTopDoc: panels[0].top,
      panels,
    };
  });
  const foldSpend = {
    mast: base.mastH / base.vh * 100,
    preview: base.holdH / base.vh * 100,
    controlsAboveFold: Math.max(0, base.vh - base.firstControlTopDoc) / base.vh * 100,
  };
  console.log(`\n### ${p.name} ${p.d.viewport.width}x${p.d.viewport.height}`);
  console.log(`  doc ${base.docH}px = ${F(base.docH / base.vh)} viewports; canvas ${F(base.canvasW)}x${F(base.canvasH)}`);
  console.log(`  first screen: masthead ${F(base.mastH)}px (${F(foldSpend.mast)}%), preview block ${F(base.holdH)}px (${F(foldSpend.preview)}%), controls visible ${F(Math.max(0, base.vh - base.firstControlTopDoc))}px (${F(foldSpend.controlsAboveFold)}%)`);
  console.log(`  canvas occupies doc y ${F(base.canvasTopDoc)}..${F(base.canvasBottomDoc)}; everything below y=${F(base.canvasBottomDoc)} shows no preview at all`);
  for (const pn of base.panels) console.log(`    panel ${pn.legend.padEnd(22)} top ${String(F(pn.top)).padStart(6)}  height ${F(pn.h)}  (screen ${F(pn.top / base.vh) + 1})`);

  // realistic content: 18 library photos, 6 saved wallpapers
  const grown = await page.evaluate(() => {
    const lib = document.querySelector('#library');
    const proto = lib.querySelector('.thumb');
    if (proto) for (let i = 0; i < 16; i++) lib.appendChild(proto.cloneNode(true));
    const coll = document.querySelector('#collection');
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div'); d.className = 'keep';
      d.innerHTML = '<button style="all:unset;display:block;width:100%;height:100%"></button><button class="drop">x</button>';
      coll.appendChild(d);
    }
    return { docH: document.documentElement.scrollHeight, vh: innerHeight };
  });
  console.log(`  with 18 library photos + 6 saved: doc ${grown.docH}px = ${F(grown.docH / grown.vh)} viewports`);
  await ctx.close();
}
await browser.close();
