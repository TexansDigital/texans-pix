// Renders one frame per surviving defect so each claim has a picture behind
// it. Output is gitignored (tests/out).
import { launch, feed } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const { browser, page } = await launch();

const shots = [
  // still-open
  ['open-ticker-desktop-white', 'white-2000x3000.png', 'desktop', 'home', 'ticker', { headline: 'Houston', kicker: 'Week 01', section: '132' }],
  ['open-jersey-desktop-white', 'white-2000x3000.png', 'desktop', 'home', 'jersey', { name: 'Marcus Ryan', number: '04', kicker: 'Week 01' }],
  ['open-deepsteel-red-on-white', 'white-2000x3000.png', 'ip-se', 'lock', 'deep-steel', { headline: 'Houston', since: '2002' }],
  ['open-stamp-red-kicker-white', 'white-2000x3000.png', 'ip-16-pro-max', 'lock', 'stamp', { kicker: 'Week 01', name: 'Marcus', number: '04', section: '132', since: '2002' }],
  ['open-jersey-letters-number', 'exif0-landscape.jpg', 'ip-16-pro-max', 'lock', 'jersey', { name: 'Marcus', number: 'WW' }],
  ['open-ticker-home-dock', 'exif0-landscape.jpg', 'ip-16-pro-max', 'home', 'ticker', { headline: 'Houston', kicker: 'Week 01', section: '132' }],
  // fixed, kept as regression references
  ['fixed-battle-papadopoulos', 'exif0-landscape.jpg', 'ip-16-pro-max', 'lock', 'battle', { name: 'Papadopoulos-Jones' }],
  ['fixed-ticker-kicker-se', 'exif0-landscape.jpg', 'ip-se', 'lock', 'ticker', { headline: 'Houston', kicker: 'Preseason Week 01 XXXXXX', section: '132', since: '2002' }],
  ['fixed-spaces-fallback', 'exif0-landscape.jpg', 'ip-16-pro-max', 'lock', 'battle', { headline: ' ', section: ' ', since: ' ', number: ' ', kicker: '' }],
  ['fixed-battle-white-scrim', 'white-2000x3000.png', 'ip-16-pro-max', 'lock', 'battle', { headline: 'Houston', kicker: 'Week 01', section: '132' }],
];
for (const [name, file, dev, surface, tpl, fields] of shots) {
  await feed(page, '/home/user/texans-pix/tests/out/' + file, file);
  await page.evaluate(({ dev, surface, tpl, fields }) => {
    const S = window.__studio; S.setDevice(dev); S.setSurface(surface); S.setTemplate(tpl);
    S.setFields({ headline: '', name: '', number: '', section: '', since: '', kicker: '', ...fields }); S.render(false);
  }, { dev, surface, tpl, fields });
  const buf = await page.evaluate(() => document.querySelector('#stage').toDataURL('image/jpeg', 0.85));
  writeFileSync(`/home/user/texans-pix/tests/out/${name}.jpg`, Buffer.from(buf.split(',')[1], 'base64'));
  console.log('wrote tests/out/' + name + '.jpg  ', `${dev}/${surface}/${tpl}`);
}
await browser.close();
