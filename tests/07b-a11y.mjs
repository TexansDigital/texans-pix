import { launch } from './lib.mjs';
const { browser, page } = await launch();
await page.waitForTimeout(800);
const seq = await page.evaluate(() => {
  const out = [];
  const focusables = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
    .filter(el => !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null || (el.tagName === 'INPUT' && el.type === 'radio'));
  for (const el of focusables) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.type ? '[' + el.type + ']' : ''}`);
  return out;
});
console.log('tabbable controls in DOM order:\n ', seq.join('\n  '));
const fileReach = await page.evaluate(() => {
  const f = document.querySelector('#file');
  const label = document.querySelector('label[for="file"]');
  f.focus();
  return { fileHidden: f.hasAttribute('hidden'), fileTabIndex: f.tabIndex, focusLandedOnFile: document.activeElement === f,
           labelTag: label && label.tagName, labelTabIndex: label ? label.tabIndex : null, labelFocusable: (() => { label.focus(); return document.activeElement === label; })() };
});
console.log('file picker reachability:', JSON.stringify(fileReach));
const focusStyles = await page.evaluate(() => {
  const res = {};
  for (const [k, sel] of [['device select', '#device'], ['headline text field', '[data-field="headline"]'], ['zoom range', '#zoom'], ['export button', '#export']]) {
    const el = document.querySelector(sel);
    el.focus();
    const cs = getComputedStyle(el);
    res[k] = { outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, border: cs.borderColor };
  }
  return res;
});
console.log('focus indicators:', JSON.stringify(focusStyles, null, 1));
// can a keyboard user pan?
console.log('canvas tabIndex:', await page.evaluate(() => document.querySelector('#stage').tabIndex));
await browser.close();
