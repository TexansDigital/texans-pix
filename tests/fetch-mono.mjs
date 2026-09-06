// One-off: pull the latin subset of Azeret Mono into tests/fonts so the suite
// can serve it locally. The sandbox has no TLS path to fonts.googleapis.com
// from the browser, and measuring mono stamps against a fallback face makes
// every overflow threshold in the suite meaningless.
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIR = new URL('./fonts/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const css = execFileSync('curl', ['-sS', '-A', UA,
  'https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@400;500&display=swap'], { encoding: 'utf8' });

const faces = [];
for (const block of css.match(/@font-face \{[\s\S]*?\}/g) || []) {
  if (!block.includes('U+0000-00FF')) continue; // latin subset only
  const weight = block.match(/font-weight: (\d+)/)[1];
  const url = block.match(/url\((https:[^)]+)\)/)[1];
  const file = `azeret-${weight}.woff2`;
  writeFileSync(DIR + file, execFileSync('curl', ['-sS', url], { encoding: 'buffer', maxBuffer: 1 << 24 }));
  faces.push(`@font-face{font-family:'Azeret Mono';font-style:normal;font-weight:${weight};font-display:block;src:url(/tests/fonts/${file}) format('woff2');}`);
}
writeFileSync(DIR + 'azeret.css', faces.join('\n'));
console.log(`wrote ${faces.length} faces to ${DIR}`);
