#!/usr/bin/env node
// Weekly library build.
//
//   1. drop this week's frames into library/photos/  (up to ~100)
//   2. npm run library
//
// Writes 400px thumbnails into library/thumbs/ and a manifest the studio
// reads. Filenames become titles, so name them the way you want fans to see
// them: `stroud-td-week04.jpg` becomes "Stroud TD Week04".

import { readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
const PHOTOS = join(ROOT, 'library/photos');
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
  .replace(/[-_]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, c => c.toUpperCase());

async function main() {
  await mkdir(THUMBS, { recursive: true });
  await mkdir(DISPLAY, { recursive: true });

  let files;
  try {
    files = (await readdir(PHOTOS)).filter(f => EXTS.has(extname(f).toLowerCase())).sort();
  } catch {
    console.error(`No photo directory at ${PHOTOS}. Create it and add this week's frames.`);
    process.exit(1);
  }

  if (!files.length) {
    console.warn('No photos found. Writing an empty manifest.');
  }
  if (files.length > SOFT_LIMIT) {
    console.warn(`${files.length} photos found. The studio is tuned for about ${SOFT_LIMIT}; more than that makes the picker hard to scan.`);
  }

  const photos = [];
  const failures = [];

  for (const file of files) {
    const src = join(PHOTOS, file);
    try {
      // .rotate() with no argument applies the EXIF orientation, which is what
      // keeps portrait phone frames upright in the picker.
      const image = sharp(src).rotate();
      const meta = await image.metadata();
      const thumbName = `${basename(file, extname(file))}.jpg`;
      await image
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 78, progressive: true })
        .toFile(join(THUMBS, thumbName));
      await sharp(src).rotate()
        .resize({ width: DISPLAY_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true, mozjpeg: true })
        .toFile(join(DISPLAY, thumbName));

      const { size } = await stat(src);
      photos.push({
        id: basename(file, extname(file)),
        file: `library/photos/${file}`,
        thumb: `library/thumbs/${thumbName}`,
        display: `library/display/${thumbName}`,
        title: titleFrom(file),
        width: meta.width ?? null,
        height: meta.height ?? null,
        bytes: size,
      });
      process.stdout.write('.');
    } catch (err) {
      failures.push({ file, reason: err.message });
      process.stdout.write('x');
    }
  }
  process.stdout.write('\n');

  const manifest = {
    version: 1,
    updated: new Date().toISOString(),
    count: photos.length,
    photos,
  };
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Wrote ${photos.length} photo${photos.length === 1 ? '' : 's'} to library/manifest.json`);
  if (failures.length) {
    console.warn(`\n${failures.length} file(s) could not be processed:`);
    for (const f of failures) console.warn(`  ${f.file}: ${f.reason}`);
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
