import { launch, feed } from './lib.mjs';
const { browser, page } = await launch();
await page.waitForTimeout(1200);
const shots = [
  ['overflow-battle-papadopoulos', 'exif0-landscape.jpg', 'ip-16-pro-max', 'lock', 'battle', { name: 'Papadopoulos-Jones' }],
  ['contrast-jersey-white', 'white-2000x3000.png', 'ip-16-pro-max', 'lock', 'jersey', { name: 'Marcus Ryan', number: '04', kicker: 'Week 01' }],
  ['contrast-deepsteel-white', 'white-2000x3000.png', 'desktop', 'lock', 'deep-steel', { headline: 'Houston', since: '2002' }],
  ['ticker-kicker-overflow', 'exif0-landscape.jpg', 'ip-se', 'lock', 'ticker', { headline: 'Houston', kicker: 'Preseason Week 01 XXXXXX', section: '132', since: '2002' }],
  ['spaces-blank-hero', 'exif0-landscape.jpg', 'ip-16-pro-max', 'lock', 'stamp', { headline: ' ', section: ' ', since: ' ', number: ' ', kicker: '' }],
];
for (const [name, file, dev, surface, tpl, fields] of shots) {
  await feed(page, '/home/user/texans-pix/tests/out/' + file, file);
  await page.evaluate(({ dev, surface, tpl, fields }) => {
    const S = window.__studio; S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl);
    S.setFields({ headline: '', name: '', number: '', section: '', since: '', kicker: '', ...fields }); S.render(false);
  }, { dev, surface, tpl, fields });
  const buf = await page.evaluate(() => document.querySelector('#stage').toDataURL('image/jpeg', 0.85));
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`/home/user/texans-pix/tests/out/${name}.jpg`, Buffer.from(buf.split(',')[1], 'base64'));
  console.log('wrote tests/out/' + name + '.jpg');
}
await browser.close();
