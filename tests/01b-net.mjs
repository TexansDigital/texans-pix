import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage();
const log = [];
page.on('response', r => log.push(`${r.status()} ${r.url()}`));
page.on('requestfailed', r => log.push(`FAIL ${r.url()} ${r.failure()?.errorText}`));
page.on('pageerror', e => log.push('PAGEERROR ' + e.stack));
page.on('console', m => log.push(`console.${m.type()}: ${m.text()}`));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
console.log(log.join('\n'));
// any POST/PUT of user data?
await browser.close();
