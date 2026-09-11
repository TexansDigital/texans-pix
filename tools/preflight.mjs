#!/usr/bin/env node
// Runs before deploy. Catches the things that produce confusing errors:
// wrong folder, missing dependencies, stale checkout, no Cloudflare login.

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ok = m => console.log(`  ok    ${m}`);
const bad = m => { console.error(`  FAIL  ${m}`); failures++; };
let failures = 0;

console.log('\nPreflight\n');

// 1. Are we in the right project at all?
const pkgPath = join(ROOT, 'package.json');
if (!existsSync(pkgPath)) {
  console.error('  FAIL  No package.json. You are not in the texans-pix folder.');
  console.error('\n        cd ~/Downloads/texans-pix\n');
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
if (pkg.name !== 'texans-wallpaper-studio') {
  bad(`This is "${pkg.name}", not the wallpaper studio.`);
} else {
  ok(`in ${ROOT.replace(/\/$/, '')}`);
}

// 2. Dependencies present.
if (!existsSync(join(ROOT, 'node_modules', 'sharp'))) {
  bad('sharp is not installed. Run: npm install');
} else {
  ok('dependencies installed');
}

// 3. Anything to build from.
const manifest = join(ROOT, 'library/manifest.json');
if (existsSync(manifest)) {
  const count = JSON.parse(readFileSync(manifest, 'utf8')).photos?.length ?? 0;
  if (count === 0) bad('library is empty — add photos to library/photos/');
  else ok(`${count} photo${count === 1 ? '' : 's'} in the library`);
} else {
  ok('library will be built');
}

// 4. Is this checkout current? A stale clone silently deploys old code.
try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim();
  execSync('git fetch --quiet origin', { cwd: ROOT, stdio: 'ignore', timeout: 15000 });
  const behind = execSync(`git rev-list --count HEAD..origin/${branch}`, { cwd: ROOT }).toString().trim();
  if (Number(behind) > 0) {
    bad(`${behind} commit(s) behind origin/${branch}. Run: git pull`);
  } else {
    ok(`on ${branch}, up to date`);
  }
} catch {
  ok('git check skipped (offline or no remote)');
}

// 5. The fan list. A Worker with a D1 binding pointed at a placeholder id
// fails during deploy with a message about a database uuid, which tells you
// nothing about what to do. Say the actual next command instead.
const wranglerPath = join(ROOT, 'wrangler.toml');
if (existsSync(wranglerPath)) {
  const toml = readFileSync(wranglerPath, 'utf8');
  if (toml.includes('[[d1_databases]]')) {
    if (toml.includes('PASTE_DATABASE_ID_HERE')) {
      bad('The fan list has no database yet.');
      console.error('\n        npx wrangler d1 create texans-wallpaper-studio');
      console.error('        # paste the database_id it prints into wrangler.toml, then');
      console.error('        npm run migrate\n');
    } else if (/database_id\s*=\s*"[0-9a-f-]{36}"/.test(toml)) {
      ok('fan list database configured');
    } else {
      bad('database_id in wrangler.toml does not look like a Cloudflare id.');
    }
  }
}

console.log('');
if (failures) {
  console.error(`Preflight failed with ${failures} problem${failures === 1 ? '' : 's'}. Nothing was deployed.\n`);
  process.exit(1);
}
console.log('Preflight passed. Building and deploying.\n');
