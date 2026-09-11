// Mobile harness helpers. Read-only measurement of the shipped app.
import { chromium, devices } from 'playwright';

export const BASE = 'http://127.0.0.1:8080/';

export const PROFILES = [
  // Playwright viewports are the real usable area (screen minus browser chrome).
  { name: 'iPhone SE 3rd',      screen: [375, 667], d: devices['iPhone SE (3rd gen)'] },
  { name: 'iPhone 13',          screen: [390, 844], d: devices['iPhone 13'] },
  { name: 'iPhone 15 Pro Max',  screen: [430, 932], d: devices['iPhone 15 Pro Max'] },
  { name: 'Pixel 7',            screen: [412, 915], d: devices['Pixel 7'] },
  { name: 'Android 360x740',    screen: [360, 740], d: { ...devices['Pixel 5'], viewport: { width: 360, height: 672 }, screen: { width: 360, height: 740 }, deviceScaleFactor: 3 } },
];

export async function browserUp() {
  return chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
}

// Azeret Mono used to be stubbed here because the app fetched it from Google
// at runtime. The app self-hosts it now, so there is nothing to stand in for.

export async function openOn(browser, profile, extra = {}) {
  const ctx = await browser.newContext({ ...profile.d, hasTouch: true, isMobile: true, ...extra });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__studio && window.__studio.state, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelectorAll('.tpl').length > 0, null, { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('#library .empty') || document.querySelectorAll('.thumb').length >= 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  return { ctx, page };
}

export const F = n => Math.round(n * 10) / 10;
