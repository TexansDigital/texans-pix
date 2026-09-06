import { PROFILES, browserUp, openOn, F } from './lib.mjs';
const browser = await browserUp();
const { ctx, page } = await openOn(browser, PROFILES[0]);
const cdp = await ctx.newCDPSession(page);

// A. nested scroll: the library grid is a 260px scroller inside a 2886px page.
await page.evaluate(() => {
  const lib = document.querySelector('#library');
  const proto = lib.querySelector('.thumb');
  if (proto) for (let i = 0; i < 16; i++) lib.appendChild(proto.cloneNode(true));
  document.querySelector('#library').scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(200);
const lb = await page.evaluate(() => { const r = document.querySelector('#library').getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2, h: r.height, sh: document.querySelector('#library').scrollHeight }; });
const b4 = await page.evaluate(() => ({ page: scrollY, grid: document.querySelector('#library').scrollTop }));
await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:lb.x,y:lb.y,id:1}] });
for (let i=1;i<=12;i++) await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:lb.x,y:lb.y-160*i/12,id:1}] });
await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
await page.waitForTimeout(400);
const af = await page.evaluate(() => ({ page: scrollY, grid: document.querySelector('#library').scrollTop }));
console.log(`library grid: visible ${F(lb.h)}px window over ${lb.sh}px of thumbs`);
console.log(`swipe up inside the grid -> page ${b4.page}->${af.page}, grid scrollTop ${b4.grid}->${af.grid}`);

// B. pinch on the canvas, repeated
await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width=1200;c.height=1600;
  const bmp = await createImageBitmap(c);
  await window.__studio.useSource(bmp,'p');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  scrollTo(0,0);
});
await page.waitForTimeout(200);
const box = await page.evaluate(() => { const r=document.querySelector('#stage').getBoundingClientRect(); return {cx:r.x+r.width/2, cy:r.y+r.height/2}; });
for (const dir of ['spread','pinch']) {
  await page.evaluate(() => { const s=__studio.state; s.zoom=1.6; s.panX=0; s.panY=0; __studio.render(false); });
  const z0 = await page.evaluate(()=>({z:__studio.state.zoom,x:__studio.state.panX,y:__studio.state.panY}));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.cx-30,y:box.cy-30,id:1},{x:box.cx+30,y:box.cy+30,id:2}]});
  for(let i=1;i<=10;i++){const d = dir==='spread'? 30+i*7 : Math.max(4,30-i*2.5);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.cx-d,y:box.cy-d,id:1},{x:box.cx+d,y:box.cy+d,id:2}]});}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(250);
  const z1 = await page.evaluate(()=>({z:__studio.state.zoom,x:__studio.state.panX,y:__studio.state.panY,vv:visualViewport.scale}));
  console.log(`two-finger ${dir.padEnd(6)} on canvas: zoom ${z0.z}->${z1.z}  pan ${F(z0.x)},${F(z0.y)} -> ${F(z1.x)},${F(z1.y)}  browser scale ${z1.vv}`);
}

// C. does the page itself allow pinch zoom (no maximum-scale)?
console.log('viewport meta allows user scaling:', await page.evaluate(()=>{const m=document.querySelector('meta[name=viewport]').content;return !/user-scalable\s*=\s*no|maximum-scale/.test(m)}));

// D. tap on the canvas with no photo (a fan poking the placeholder)
await page.evaluate(()=>{ __studio.state.image=null; __studio.render(false); scrollTo(0,0); });
const t0 = await page.evaluate(()=>scrollY);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.cx,y:box.cy,id:1}]});
for(let i=1;i<=10;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.cx,y:box.cy-120*i/10,id:1}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.waitForTimeout(300);
console.log(`swipe on the EMPTY placeholder canvas (no photo yet, first thing a fan sees): scrollY ${t0} -> ${await page.evaluate(()=>scrollY)}`);
await ctx.close(); await browser.close();
