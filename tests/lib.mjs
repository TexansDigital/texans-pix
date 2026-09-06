// Shared harness helpers. NODE_PATH must point at the playwright install.
import { chromium } from 'playwright';

export const BASE = 'http://127.0.0.1:8080/';

export async function launch() {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
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
  return { browser, page, errors };
}

// Load a local fixture file into the page as a File and hand it to useSource.
export async function feed(page, absPath, name) {
  const buf = (await import('node:fs')).readFileSync(absPath);
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
    };
  }, { b64, name });
}

export async function settle(page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}
