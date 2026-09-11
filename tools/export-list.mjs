#!/usr/bin/env node
// Pull the fan list out of D1 as CSV, for your CRM.
//
//   npm run list            the live list
//   npm run list -- --local the local dev database
//   npm run list -- --game "HOU vs COLTS"
//
// Writes to stdout so you can pipe it, or use -o to name a file.

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = name => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] ?? null; };
const local = argv.includes('--local');
const game = flag('--game');
const out = flag('-o') || flag('--out');

const where = game ? `WHERE game = '${game.replace(/'/g, "''")}'` : '';
const sql = `SELECT email, game, section, attended, source, created_at, updated_at, consent_at, consent_text
             FROM fans ${where} ORDER BY created_at DESC`;

const res = spawnSync('npx', [
  'wrangler', 'd1', 'execute', 'texans-wallpaper-studio',
  local ? '--local' : '--remote', '--json', '--command', sql,
], { encoding: 'utf8' });

if (res.status !== 0) {
  console.error(res.stderr || 'wrangler failed');
  console.error('\nIf this is the first run: create the database with\n  npx wrangler d1 create texans-wallpaper-studio\nand paste the id into wrangler.toml.');
  process.exit(1);
}

let rows;
try {
  // wrangler prints a banner before the JSON on some versions, so start at the
  // first bracket rather than assuming the whole of stdout parses.
  const text = res.stdout.slice(res.stdout.indexOf('['));
  rows = JSON.parse(text)[0]?.results ?? [];
} catch (err) {
  console.error(`Could not read wrangler's output: ${err.message}`);
  process.exit(1);
}

// Excel reads a leading =, + or @ as a formula, so any field starting with one
// is prefixed with a quote. A mail list is exactly the sort of file someone
// opens in Excel without thinking.
const cell = v => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const headers = ['email', 'game', 'section', 'attended', 'source', 'created_at', 'updated_at', 'consent_at', 'consent_text'];
const csv = [headers.join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\n') + '\n';

if (out) {
  writeFileSync(out, csv);
  console.error(`${rows.length} fan${rows.length === 1 ? '' : 's'} -> ${out}`);
} else {
  process.stdout.write(csv);
  console.error(`\n${rows.length} fan${rows.length === 1 ? '' : 's'}${game ? ` for ${game}` : ''}`);
}
