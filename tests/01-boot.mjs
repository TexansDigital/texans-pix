import { launch } from './lib.mjs';

const { browser, page, errors } = await launch();

// Give async boot (fonts, marks, library) time to finish.
await page.waitForTimeout(1500);

const boot = await page.evaluate(() => {
  const faces = [...document.fonts].map(f => `${f.family} ${f.weight} ${f.status}`);
  const checks = {};
  for (const w of [500, 700, 800, 900]) {
    checks[w] = document.fonts.check(`${w} 100px "HelveticaNeueLT Ex"`);
  }
  // Measure the same string with the real family vs a family that cannot exist.
  const c = document.createElement('canvas').getContext('2d');
  const probe = 'HOUSTON TEXANS WWWW';
  const m = {};
  for (const w of [500, 700, 800, 900]) {
    c.font = `${w} 100px "HelveticaNeueLT Ex", "No Such Face XYZ", sans-serif`;
    const real = c.measureText(probe).width;
    c.font = `${w} 100px "No Such Face XYZ", Arial, sans-serif`;
    const bogus = c.measureText(probe).width;
    c.font = `${w} 100px Arial`;
    const arial = c.measureText(probe).width;
    m[w] = { real: +real.toFixed(2), bogusFallback: +bogus.toFixed(2), arial: +arial.toFixed(2),
             differsFromFallback: Math.abs(real - bogus) > 0.5 };
  }
  return {
    faces, checks, measure: m,
    status: document.querySelector('#status').textContent,
    statusErr: document.querySelector('#status').classList.contains('err'),
    canvas: [document.querySelector('#stage').width, document.querySelector('#stage').height],
    libCount: document.querySelector('#lib-count').textContent,
    libHTML: document.querySelector('#library').innerHTML.slice(0, 120),
    templates: [...document.querySelectorAll('.tpl')].map(b => b.dataset.id),
    devices: [...document.querySelectorAll('#device option')].length,
    dims: document.querySelector('#dims').textContent,
    marksLoaded: undefined,
  };
});
console.log(JSON.stringify(boot, null, 2));
console.log('--- console/network issues ---');
console.log(errors.length ? errors.join('\n') : '(none)');
await browser.close();
