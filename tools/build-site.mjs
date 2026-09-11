#!/usr/bin/env node
// Assembles the deployable site into _site/. Used by both the Cloudflare and
// GitHub Pages paths so they can never drift apart.

import { rm, mkdir, cp, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SITE = join(ROOT, '_site');

await rm(SITE, { recursive: true, force: true });
await mkdir(SITE, { recursive: true });

// Root-level files, named one by one: the site build copies directories and
// would otherwise leave anything sitting loose at the repo root behind. A
// favicon that never ships is a generic tab icon on a Texans page.
for (const file of ['index.html', 'favicon.ico']) {
  await cp(join(ROOT, file), join(SITE, file));
}
// This week's game. The studio reads it at runtime, so it ships with the site.
await cp(join(ROOT, 'gameday.json'), join(SITE, 'gameday.json'));
// Skip dotfiles. macOS scatters .DS_Store through these directories and they
// are gitignored, so they are invisible in `git status` but still get copied.
// Wrangler drops them when it builds its asset manifest; GitHub Pages would
// serve them. Keeping them out means both paths ship the same 27 files.
const visible = { recursive: true, filter: src => !basename(src).startsWith('.') };
for (const dir of ['src', 'assets', 'library']) {
  await cp(join(ROOT, dir), join(SITE, dir), visible);
}
// GitHub Pages runs Jekyll by default, which swallows underscore-prefixed paths.
await writeFile(join(SITE, '.nojekyll'), '');

console.log('Assembled _site/');
