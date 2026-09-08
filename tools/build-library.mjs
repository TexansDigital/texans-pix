#!/usr/bin/env node
// Weekly and in-game library build.
//
//   library/photos/           the season shelf
//   library/photos/tonight/   this game — shown first, cleared by `npm run archive`
//
// Drop frames in, run `npm run library` (or leave `npm run watch` running and
// it happens by itself). Writes thumbnails, display derivatives and the
// manifest the studio reads.
//
// The moment line — "Q3 // STROUD 42 YD TD" — comes from a sidecar .txt file
// next to the photo if there is one, otherwise from the filename. Your editors
// already caption for the wire; that caption is the stamp.

import { readdir, mkdir, writeFile, stat, readFile, unlink } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
const PHOTOS = join(ROOT, 'library/photos');
const TONIGHT = join(PHOTOS, 'tonight');
const THUMBS = join(ROOT, 'library/thumbs');
const DISPLAY = join(ROOT, 'library/display');
const MANIFEST = join(ROOT, 'library/manifest.json');

const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const THUMB_WIDTH = 400;
// Tapping a thumbnail used to fetch the full original: 2.4MB, which is 48
// seconds on a congested stadium connection. This is what the studio loads.
const DISPLAY_WIDTH = 1600;
const SOFT_LIMIT = 100;

const titleFrom = name => basename(name, extname(name))
  .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\b\w/g, c => c.toUpperCase());

// `q3-stroud-42yd-td` becomes `Q3 // STROUD 42YD TD`: the leading quarter or
// period token is split off as its own segment, which is how the brand writes
// a stamp.
function momentFrom(name) {
  const raw = basename(name, extname(name)).replace(/[-_]+/g, ' ').trim();
  if (!raw) return '';
  const parts = raw.split(/\s+/);
  const head = parts[0].toUpperCase();
  if (/^(Q[1-4]|OT|PRE|HALF|FINAL)$/.test(head) && parts.length > 1) {
    return `${head} // ${parts.slice(1).join(' ').toUpperCase()}`;
  }
  return raw.toUpperCase();
}

async function sidecarMoment(dir, file) {
  const side = join(dir, `${basename(file, extname(file))}.txt`);
  try {
    const text = (await readFile(side, 'utf8')).split('\n')[0].trim();
    return text ? text.toUpperCase() : '';
  } catch {
    return '';
  }
}

async function listImages(dir) {
  try {
    return (await readdir(dir)).filter(f => EXTS.has(extname(f).toLowerCase())).sort();
  } catch {
    return null;
  }
}

async function ingest(dir, file, tonight, photos, failures) {
  const src = join(dir, file);
  try {
    // .rotate() with no argument applies the EXIF orientation, which keeps
    // portrait phone frames upright in the picker.
    const image = sharp(src).rotate();
    const meta = await image.metadata();
    const stem = basename(file, extname(file));
    const outName = `${tonight ? 'tonight-' : ''}${stem}.jpg`;

    await image.clone()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 78, progressive: true })
      .toFile(join(THUMBS, outName));
    await sharp(src).rotate()
      .resize({ width: DISPLAY_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toFile(join(DISPLAY, outName));

    const { size, mtimeMs } = await stat(src);
    photos.push({
      id: `${tonight ? 'tonight-' : ''}${stem}`,
      file: `library/photos/${tonight ? 'tonight/' : ''}${file}`,
      thumb: `library/thumbs/${outName}`,
      display: `library/display/${outName}`,
      title: titleFrom(file),
      moment: (await sidecarMoment(dir, file)) || momentFrom(file),
      tonight,
      shot: Math.round(mtimeMs),
      width: meta.width ?? null,
      height: meta.height ?? null,
      bytes: size,
    });
    process.stdout.write(tonight ? '*' : '.');
  } catch (err) {
    failures.push({ file, reason: err.message });
    process.stdout.write('x');
  }
}

async function prune(wanted) {
  let removed = 0;
  for (const dir of [THUMBS, DISPLAY]) {
    let files;
    try { files = await readdir(dir); } catch { continue; }
    for (const file of files) {
      if (extname(file).toLowerCase() !== '.jpg' || wanted.has(file)) continue;
      try { await unlink(join(dir, file)); removed += 1; } catch { /* already gone */ }
    }
  }
  return removed;
}

async function main() {
  await mkdir(THUMBS, { recursive: true });
  await mkdir(DISPLAY, { recursive: true });
  await mkdir(TONIGHT, { recursive: true });

  const season = await listImages(PHOTOS);
  if (season === null) {
    console.error(`No photo directory at ${PHOTOS}.`);
    process.exit(1);
  }
  const tonight = (await listImages(TONIGHT)) || [];

  const photos = [];
  const failures = [];
  // Newest first within tonight, so the frame from two minutes ago leads.
  for (const file of tonight) await ingest(TONIGHT, file, true, photos, failures);
  for (const file of season) await ingest(PHOTOS, file, false, photos, failures);
  process.stdout.write('\n');

  photos.sort((a, b) => (b.tonight - a.tonight) || (b.shot - a.shot));

  // A photo pulled out of library/photos/ must take its derivatives with it.
  // thumbs/ and display/ are generated and gitignored, so a file deleted from
  // the source shelf otherwise survives on disk and gets copied into _site/ by
  // the site build — off the manifest, invisible in the studio, and still live
  // at a direct URL. Prune anything with no source behind it.
  // Keyed off the source listings rather than `photos`, so a frame that failed
  // to process this run keeps its last good derivative instead of losing it.
  const wanted = new Set([
    ...tonight.map(f => `tonight-${basename(f, extname(f))}.jpg`),
    ...season.map(f => `${basename(f, extname(f))}.jpg`),
  ]);
  const pruned = await prune(wanted);
  if (pruned) console.log(`pruned ${pruned} orphaned derivative${pruned === 1 ? '' : 's'}`);

  const total = photos.length;
  if (total > SOFT_LIMIT) {
    console.warn(`${total} photos. The studio is tuned for about ${SOFT_LIMIT}; beyond that the picker is hard to scan.`);
  }

  await writeFile(MANIFEST, `${JSON.stringify({
    version: 2,
    updated: new Date().toISOString(),
    count: total,
    tonight: photos.filter(p => p.tonight).length,
    photos,
  }, null, 2)}\n`);

  const live = photos.filter(p => p.tonight).length;
  console.log(`${total} photo${total === 1 ? '' : 's'} (${live} tonight) -> library/manifest.json`);
  if (failures.length) {
    console.warn(`\n${failures.length} file(s) could not be processed:`);
    for (const f of failures) console.warn(`  ${f.file}: ${f.reason}`);
    process.exitCode = 1;
  }
}

main().catch(err => { console.error(err); process.exit(1); });
