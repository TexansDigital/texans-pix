import { PROFILES, browserUp, openOn, F } from './lib.mjs';
const browser = await browserUp();
for (const p of PROFILES) {
  for (const orient of ['portrait','landscape']) {
    const vp = orient==='portrait'? p.d.viewport : {width:p.d.viewport.height,height:p.d.viewport.width};
    const { ctx, page } = await openOn(browser, { ...p, d:{...p.d, viewport: vp} });
    const m = await page.evaluate(() => {
      const g = s => document.querySelector(s).getBoundingClientRect();
      const mast = g('.mast'), hold = g('.canvas-hold'), st = g('#stage'), note = g('.mast-note');
      return {
        vw: innerWidth, vh: innerHeight,
        mastH: mast.height, noteTop: note.top, noteWrapped: note.top > mast.top + 40,
        holdW: hold.width, holdH: hold.height, stW: st.width, stH: st.height,
        wastedW: hold.width - 32 - st.width,
        stageAreaPctOfViewport: (st.width*st.height)/(innerWidth*innerHeight)*100,
      };
    });
    console.log(`${(p.name+' '+orient).padEnd(30)} ${m.vw}x${m.vh} | mast ${F(m.mastH)}px (note wrapped: ${m.noteWrapped}) | preview panel ${F(m.holdW)}x${F(m.holdH)} holding a ${F(m.stW)}x${F(m.stH)} canvas -> ${F(m.wastedW)}px of unused width | canvas = ${F(m.stageAreaPctOfViewport)}% of the screen area`);
    await ctx.close();
  }
}
await browser.close();
