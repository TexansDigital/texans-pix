// P2-9 / P3-16: the flow must be completable from the keyboard, the file
// picker must be reachable and actually open, and focus must be visible.
import { launch } from './lib.mjs';
const { browser, page } = await launch();

console.log('=== DOM tab order ===');
const seq = await page.evaluate(() => [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
  .filter(el => !el.disabled && el.tabIndex >= 0 && (el.offsetParent !== null || el.type === 'radio'))
  .map(el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.type ? '[' + el.type + ']' : ''}`));
console.log(' ', seq.join('\n  '));

console.log('\n=== File picker reachability ===');
const reach = await page.evaluate(() => {
  const f = document.querySelector('#file'), pick = document.querySelector('#pick');
  return {
    hiddenInputTabIndex: f.tabIndex, hiddenInputHasHidden: f.hasAttribute('hidden'),
    hiddenInputAriaHidden: f.getAttribute('aria-hidden'),
    hiddenInputReachableByTab: f.tabIndex >= 0 && f.offsetParent !== null,
    pickButtonExists: !!pick, pickButtonTabIndex: pick && pick.tabIndex,
    pickButtonLabel: pick && pick.textContent.trim(),
  };
});
console.log(' ', JSON.stringify(reach, null, 1));

// Tab to #pick from the top of the document and confirm it is the first stop.
await page.evaluate(() => document.body.focus());
await page.keyboard.press('Tab');
const first = await page.evaluate(() => {
  const a = document.activeElement, cs = getComputedStyle(a);
  return { id: a.id, tag: a.tagName, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, offset: cs.outlineOffset };
});
console.log('\nfirst Tab stop:', JSON.stringify(first));

// Does activating it actually open the OS file dialog? Playwright surfaces that
// as a 'filechooser' event; both Enter and Space must work.
for (const key of ['Enter', 'Space']) {
  await page.evaluate(() => document.querySelector('#pick').focus());
  const chooser = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null),
    page.keyboard.press(key),
  ]);
  console.log(`  keyboard ${key} on #pick opened the file chooser:`, !!chooser[0],
    chooser[0] ? `(accepts multiple: ${chooser[0].isMultiple()})` : '');
}
// and by mouse. #pick lives in the controls panel, which the first-run screen
// covers until the fan chooses a way in — so enter the studio first rather than
// clicking at a button that is there in the DOM but not reachable on screen.
await page.evaluate(() => document.querySelector('#start-lib').click());
await page.waitForTimeout(200);
const byMouse = await Promise.all([
  page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null),
  page.click('#pick'),
]);
console.log('  mouse click on #pick opened the file chooser:', !!byMouse[0]);

// Setting files through the chooser must drive the same path as a drop.
const chooser2 = await Promise.all([page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null), page.click('#pick')]);
if (chooser2[0]) {
  await chooser2[0].setFiles('/home/user/texans-pix/tests/out/exif0-landscape.jpg');
  await page.waitForFunction(() => window.__studio.state.image !== null, null, { timeout: 8000 }).catch(() => {});
  console.log('  picking a file through the chooser loaded it:',
    await page.evaluate(() => ({ status: document.querySelector('#status').textContent, exportEnabled: !document.querySelector('#export').disabled })));
}

console.log('\n=== Focus indicators (P3-16) ===');
const styles = await page.evaluate(() => {
  const res = {};
  const probes = [['pick button', '#pick'], ['device select', '#device'],
    ['headline text field', '[data-field="headline"]'], ['name text field', '[data-field="name"]'],
    ['number text field', '[data-field="number"]'], ['zoom range', '#zoom'],
    ['guides toggle', '#guides-btn'], ['surface radio', '[name="surface"]'],
    ['template button', '.tpl'], ['export button', '#export']];
  for (const [k, sel] of probes) {
    const el = document.querySelector(sel);
    if (!el) { res[k] = 'MISSING'; continue; }
    // :focus-visible only matches keyboard focus, so simulate that path.
    el.focus({ focusVisible: true });
    const cs = getComputedStyle(el);
    const matchesFV = el.matches(':focus-visible');
    res[k] = { focusVisible: matchesFV, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, outlineOffset: cs.outlineOffset, border: cs.borderColor, boxShadow: cs.boxShadow.slice(0, 40) };
  }
  return res;
});
for (const [k, v] of Object.entries(styles)) {
  const visible = v !== 'MISSING' && v.outline && !/^none/.test(v.outline);
  console.log(` ${k.padEnd(20)} ${visible ? 'VISIBLE' : 'no outline'}  ${JSON.stringify(v)}`);
}

// Keyboard-only walk of the whole flow.
console.log('\n=== Keyboard-only completion ===');
await page.evaluate(() => document.body.focus());
const stops = [];
for (let i = 0; i < 30; i++) {
  await page.keyboard.press('Tab');
  const a = await page.evaluate(() => { const el = document.activeElement; return el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : ''}` : 'none'; });
  if (stops.at(-1) !== a) stops.push(a);
  if (a === 'button#export') break;
}
console.log(' ', stops.join(' -> '));
console.log('  reached #export by Tab alone:', stops.includes('button#export'));
console.log('  canvas tabIndex (pan is mouse-only):', await page.evaluate(() => document.querySelector('#stage').tabIndex));
await browser.close();
