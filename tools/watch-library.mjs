#!/usr/bin/env node
// Gameday ingest. Leave this running on the machine your editors file to.
//
//   npm run watch            rebuild the library whenever a frame lands
//   npm run watch -- --deploy  ...and push it live
//
// The editor drops a frame into library/photos/tonight/ and walks away. No
// commands, no build step, no one at a keyboard during the fourth quarter.

import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PHOTOS = join(ROOT, 'library/photos');
const DEPLOY = process.argv.includes('--deploy');
// Long enough that a burst of frames from one export becomes one build, short
// enough that a fan sees the touchdown while it still feels like now.
const SETTLE_MS = 4000;

let timer = null;
let running = false;
let queued = false;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit' });
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on('error', reject);
  });
}

async function rebuild() {
  if (running) { queued = true; return; }
  running = true;
  const started = Date.now();
  try {
    console.log(`\n[${new Date().toLocaleTimeString()}] building…`);
    await run('node', ['tools/build-library.mjs']);
    if (DEPLOY) {
      await run('node', ['tools/build-site.mjs']);
      await run('npx', ['wrangler', 'deploy']);
      console.log(`live in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } else {
      console.log(`built in ${((Date.now() - started) / 1000).toFixed(1)}s — run with --deploy to push it live`);
    }
  } catch (err) {
    // A failed build must never stop the watcher; the next frame retries.
    console.error(`build failed: ${err.message}`);
  } finally {
    running = false;
    if (queued) { queued = false; schedule(); }
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(rebuild, SETTLE_MS);
}

await mkdir(join(PHOTOS, 'tonight'), { recursive: true });

console.log('Watching library/photos/ (including tonight/)');
console.log(DEPLOY ? 'Deploying on every change.' : 'Building only. Add --deploy to push live.');
console.log('Ctrl-C to stop.\n');

watch(PHOTOS, { recursive: true }, (_event, filename) => {
  if (!filename || /^\./.test(filename)) return;      // editor swap files
  if (!/\.(jpe?g|png|webp|avif|txt)$/i.test(filename)) return;
  console.log(`  saw ${filename}`);
  schedule();
});

await rebuild();
