// Shared harness helpers. NODE_PATH must point at the playwright install.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

export const BASE = 'http://127.0.0.1:8080/';

// Azeret Mono is served by the app itself now (assets/fonts), so the suite no
// longer has to stand in for fonts.googleapis.com. MONO_LOCAL stays exported
// and true: callers use it to mean "the real mono face is available", and it
// is — from the app rather than from a stub.
export const MONO_LOCAL = true;

export async function launch(opts = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__studio && window.__studio.state, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  // Boot is async (fonts, marks, library). Wait for the real thing rather than
  // a fixed sleep, so a slow font load cannot silently skew a measurement.
  if (!opts.skipFontWait) {
    await page.waitForFunction(
      () => document.fonts.check('900 100px "HelveticaNeueLT Ex"'),
      null, { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(
      () => document.fonts.check('500 12px "Azeret Mono"'),
      null, { timeout: 8000 }).catch(() => {});
  }
  return { browser, page, errors };
}

// Load a local fixture file into the page as a File and hand it to useSource.
export async function feed(page, absPath, name) {
  const buf = readFileSync(absPath);
  const b64 = buf.toString('base64');
  return page.evaluate(async ({ b64, name }) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const type = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const file = new File([arr], name, { type });
    await window.__studio.useSource(file, name);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const s = window.__studio.state;
    return {
      status: document.querySelector('#status').textContent,
      isError: document.querySelector('#status').classList.contains('err'),
      img: s.image ? { w: s.image.width, h: s.image.height } : null,
      source: [s.sourceWidth, s.sourceHeight],
      exportDisabled: document.querySelector('#export').disabled,
    };
  }, { b64, name });
}

// The zone overlay. It was a checkbox called #guides and is now a toggle button
// called #guides-btn; three suites went on setting .checked on a null and had
// been red ever since. One helper so the next rename breaks one line.
export async function setGuides(page, on) {
  await page.evaluate(async want => {
    const btn = document.querySelector('#guides-btn');
    if (!btn) throw new Error('#guides-btn not found');
    if (window.__studio.state.guides !== want) btn.click();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, on);
}

export async function settle(page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// Install the fillText recorder every layout test uses. `window.__ink` collects
// one entry per fillText call with a real ink bounding box in canvas space;
// `window.__suppress` draws nothing so the backdrop can be read.
export const INK_RECORDER = () => {
  const P = CanvasRenderingContext2D.prototype;
  if (P.__inkPatched) return;
  const orig = P.fillText;
  P.__inkPatched = true;
  window.__ink = [];
  window.__recording = false;
  window.__suppress = false;
  P.fillText = function (t, x, y, ...rest) {
    if (window.__recording) {
      const m = this.measureText(t);
      let left = x - m.actualBoundingBoxLeft, right = x + m.actualBoundingBoxRight;
      if (this.textAlign === 'center') { left = x - m.width / 2; right = x + m.width / 2; }
      else if (this.textAlign === 'right' || this.textAlign === 'end') { left = x - m.width; right = x; }
      window.__ink.push({
        text: String(t), x0: left, x1: right,
        y0: y - m.actualBoundingBoxAscent, y1: y + m.actualBoundingBoxDescent, y,
        font: this.font, fill: String(this.fillStyle), alpha: this.globalAlpha,
        align: this.textAlign, baseline: this.textBaseline,
      });
    }
    if (window.__suppress) return;
    return orig.apply(this, [t, x, y, ...rest]);
  };
};

export const isMono = f => /Azeret|monospace|Menlo/.test(f);

export const BLANK_FIELDS = { headline: '', name: '', number: '', section: '', since: '', kicker: '' };
