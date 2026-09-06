#!/usr/bin/env node
// Assembles the deployable site into _site/. Used by both the Cloudflare and
// GitHub Pages paths so they can never drift apart.

import { rm, mkdir, cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SITE = join(ROOT, '_site');

await rm(SITE, { recursive: true, force: true });
await mkdir(SITE, { recursive: true });

await cp(join(ROOT, 'index.html'), join(SITE, 'index.html'));
for (const dir of ['src', 'assets', 'library']) {
  await cp(join(ROOT, dir), join(SITE, dir), { recursive: true });
}
// GitHub Pages runs Jekyll by default, which swallows underscore-prefixed paths.
await writeFile(join(SITE, '.nojekyll'), '');

console.log('Assembled _site/');
