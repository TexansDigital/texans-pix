// 3. Touch targets, 4. iOS input zoom, plus tap-highlight / meta checks.
import { PROFILES, browserUp, openOn, F } from './lib.mjs';

const browser = await browserUp();
for (const p of PROFILES.filter(x => ['iPhone SE 3rd', 'iPhone 15 Pro Max'].includes(x.name))) {
  const { ctx, page } = await openOn(browser, p);

  // Seed a collection entry so .drop / .keep are real, not hypothetical.
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const bmp = await createImageBitmap(c);
    await window.__studio.useSource(bmp, 'probe.png');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await window.__studio.keepCurrent();
    await window.__studio.renderCollection();
  }).catch(e => console.log('seed failed:', e.message));
  await page.waitForTimeout(300);

  const out = await page.evaluate(() => {
    const sels = 'button, a, input, select, textarea, label.check, [role="radio"], .seg label, summary';
    const seen = new Set();
    const items = [];
    for (const el of document.querySelectorAll(sels)) {
      if (seen.has(el)) continue; seen.add(el);
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const label = (el.id && '#' + el.id) || el.className && ('.' + String(el.className).split(' ')[0]) || el.tagName.toLowerCase();
      // hit area = the element itself; for a visually-hidden radio use its label
      items.push({
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        label: `${label}${el.type ? '[' + el.type + ']' : ''}`,
        text: (el.textContent || el.value || '').trim().slice(0, 28),
        w: r.width, h: r.height, x: r.x, y: r.y,
        fontSize: parseFloat(cs.fontSize),
        opacity: cs.opacity, pos: cs.position,
        tapHighlight: cs.webkitTapHighlightColor,
        touchAction: cs.touchAction,
        hidden: el.hidden || cs.opacity === '0',
      });
    }
    const meta = document.querySelector('meta[name=viewport]')?.content || '(none)';
    // adjacency: nearest neighbour gap between visible interactive boxes
    const vis = items.filter(i => i.w > 0 && i.h > 0 && !i.hidden);
    for (const a of vis) {
      let best = Infinity, who = '';
      for (const b of vis) {
        if (a === b) continue;
        const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
        const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
        const d = Math.hypot(dx, dy);
        if (d < best) { best = d; who = b.label; }
      }
      a.gap = best; a.gapTo = who;
    }
    return { items, vis, meta, docFont: parseFloat(getComputedStyle(document.body).fontSize) };
  });

  console.log(`\n=== ${p.name} (${p.d.viewport.width}x${p.d.viewport.height}) ===`);
  console.log(`viewport meta: ${out.meta}`);
  console.log(`\n-- touch targets (rendered CSS px) --`);
  console.log('  elem                          w x h        44?  24?  nearest-gap');
  for (const i of out.vis) {
    const ok44 = i.w >= 44 && i.h >= 44;
    const ok24 = i.w >= 24 && i.h >= 24;
    console.log(`  ${i.label.padEnd(28)} ${String(F(i.w)).padStart(6)}x${String(F(i.h)).padEnd(6)} ${ok44 ? ' ok ' : 'FAIL'} ${ok24 ? ' ok ' : 'FAIL'}  ${F(i.gap)}px -> ${i.gapTo}   ${i.text}`);
  }
  console.log(`\n-- font-size of inputs/selects (iOS zooms under 16px) --`);
  for (const i of out.items.filter(x => x.tag === 'input' || x.tag === 'select' || x.tag === 'textarea')) {
    console.log(`  ${i.label.padEnd(28)} ${i.fontSize}px  ${i.fontSize < 16 ? 'ZOOMS' : 'ok'}${i.hidden ? '  (hidden)' : ''}`);
  }
  console.log(`\n-- touch-action / tap highlight --`);
  const uniq = new Map();
  for (const i of out.vis) uniq.set(`${i.touchAction}|${i.tapHighlight}`, (uniq.get(`${i.touchAction}|${i.tapHighlight}`) || 0) + 1);
  for (const [k, v] of uniq) console.log(`  ${k}  x${v}`);
  const stage = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('#stage'));
    return { touchAction: cs.touchAction, userSelect: cs.userSelect, tap: cs.webkitTapHighlightColor };
  });
  console.log(`  #stage: ${JSON.stringify(stage)}`);
  await ctx.close();
}
await browser.close();
