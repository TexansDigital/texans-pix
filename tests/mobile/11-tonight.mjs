// The Tonight shelf: in-game frames lead the picker, carry their moment stamp,
// and the shelf disappears entirely once the game is archived.
//
// This test builds its own fixture and deletes it again. Nothing it writes may
// survive the run: library/photos/tonight/ ships to a public, Texans-branded
// page with its caption presented as fact, so a fixture left behind is a
// fabricated moment in production. The caption here names no real player.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import sharp from 'sharp';

const TONIGHT = 'library/photos/tonight';
const STEM = 'q3-test-fixture-drive';
const JPG = `${TONIGHT}/${STEM}.jpg`;
const TXT = `${TONIGHT}/${STEM}.txt`;
const build = () => spawnSync('node', ['tools/build-library.mjs'], { stdio: 'ignore' });
const clean = async () => {
  for (const f of [JPG, TXT]) await unlink(f).catch(() => {});
  build();
};

await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 34, g: 44, b: 52 } } })
  .jpeg().toFile(JPG);
await writeFile(TXT, 'Q3 // TEST FIXTURE DRIVE\n');
build();

const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const errs = [];
let r, empty;
try {
  const p = await b.newPage({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  p.on('pageerror', e => errs.push(e.message));
  const load = async () => {
    await p.goto('http://localhost:8080/index.html');
    await p.waitForFunction(() => window.__studio, null, { timeout: 20000 });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForFunction(() => document.querySelectorAll('.thumb').length > 0, null, { timeout: 15000 });
  };

  await load();
  r = await p.evaluate(async () => {
    const shelfVisible = !document.querySelector('#tonight-block').hidden;
    const tonightThumbs = document.querySelectorAll('#tonight .thumb').length;
    const seasonThumbs = document.querySelectorAll('#library .thumb').length;
    const label = document.querySelector('#tonight-count').textContent;
    const momentChip = document.querySelector('#tonight .thumb .moment')?.textContent || '';
    // The first thumb in the DOM should be tonight's, not a season frame.
    const firstIsTonight = document.querySelectorAll('.thumb')[0].closest('#tonight') !== null;

    document.querySelector('#tonight .thumb').click();
    await new Promise(res => setTimeout(res, 1600));
    const s = window.__studio;
    return {
      shelfVisible, tonightThumbs, seasonThumbs, label, momentChip, firstIsTonight,
      kicker: s.state.fields.kicker,
      kickerInput: document.querySelector('[data-field="kicker"]').value,
      hasPhoto: !!s.state.image,
    };
  });

  // Archive the game: the shelf must vanish rather than leave an empty strip,
  // and the season library must still stand on its own.
  await clean();
  await load();
  empty = await p.evaluate(() => ({
    hidden: document.querySelector('#tonight-block').hidden,
    offset: document.querySelector('#tonight-block').offsetHeight,
    tonightThumbs: document.querySelectorAll('#tonight .thumb').length,
    seasonThumbs: document.querySelectorAll('#library .thumb').length,
    label: document.querySelector('#tonight-count').textContent,
  }));
} finally {
  await b.close();
  await clean();
}

const checks = [
  ['tonight shelf shows when frames exist', r.shelfVisible],
  ['tonight frame is in its own shelf', r.tonightThumbs === 1],
  ['season shelf still populated', r.seasonThumbs === 2],
  ['shelf is labelled', /from this game/.test(r.label)],
  ['moment chip on the thumbnail', /TEST FIXTURE/.test(r.momentChip)],
  ['tonight leads the picker', r.firstIsTonight],
  ['tapping loads the photo', r.hasPhoto],
  ['moment auto-fills the stamp', /TEST FIXTURE DRIVE/.test(r.kicker)],
  ['and the field shows it', /TEST FIXTURE/.test(r.kickerInput)],
  ['shelf hides once the game is archived', empty.hidden],
  ['and takes up no space', empty.offset === 0],
  ['no orphan thumbnails left behind', empty.tonightThumbs === 0],
  ['season library survives the archive', empty.seasonThumbs === 2],
  ['stale count label cleared', empty.label === ''],
  ['no page errors', errs.length === 0],
];
let fail = 0;
for (const [name, ok] of checks) { if (!ok) fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); }
console.log(`\n${checks.length - fail}/${checks.length}`);
if (errs.length) console.log(errs.join('\n'));
process.exit(fail ? 1 : 0);
