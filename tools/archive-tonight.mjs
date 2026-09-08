#!/usr/bin/env node
// After the whistle: move tonight's frames onto the season shelf so the
// Tonight strip is empty before the next kickoff.

import { readdir, rename, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PHOTOS = join(ROOT, 'library/photos');
const TONIGHT = join(PHOTOS, 'tonight');
const KEEP = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.txt']);

await mkdir(TONIGHT, { recursive: true });
let files = [];
try {
  files = (await readdir(TONIGHT)).filter(f => KEEP.has(extname(f).toLowerCase()));
} catch {
  console.log('Nothing to archive.');
  process.exit(0);
}
if (!files.length) { console.log('Tonight is already empty.'); process.exit(0); }

for (const f of files) await rename(join(TONIGHT, f), join(PHOTOS, f));
console.log(`Moved ${files.length} file${files.length === 1 ? '' : 's'} to the season shelf.`);
console.log('Run `npm run library` (or let the watcher do it) to rebuild.');
