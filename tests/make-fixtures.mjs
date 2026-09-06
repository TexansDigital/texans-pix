// Generates test photos for the QA harness. Output is gitignored (tests/out).
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// A recognisable asymmetric pattern: red block top-left, blue block bottom-right,
// so rotation/mirroring is detectable from pixels alone.
async function pattern(w, h) {
  const bg = { create: { width: w, height: h, channels: 3, background: { r: 20, g: 140, b: 60 } } };
  const red = await sharp({ create: { width: Math.round(w * 0.3), height: Math.round(h * 0.3), channels: 3, background: { r: 235, g: 0, b: 40 } } }).png().toBuffer();
  const blue = await sharp({ create: { width: Math.round(w * 0.3), height: Math.round(h * 0.3), channels: 3, background: { r: 0, g: 128, b: 198 } } }).png().toBuffer();
  return sharp(bg).composite([
    { input: red, top: 0, left: 0 },
    { input: blue, top: h - Math.round(h * 0.3), left: w - Math.round(w * 0.3) },
  ]);
}

// 1. Portrait JPEG carrying EXIF orientation 6 (rotate 90 CW on display).
// Stored pixels are landscape 1200x1600? No: store 1600x1200 landscape pixels and
// flag orientation 6 so a correct decoder shows 1200x1600 portrait.
{
  const base = await (await pattern(1600, 1200)).jpeg({ quality: 92 }).toBuffer();
  const buf = await sharp(base).withMetadata({ orientation: 6 }).jpeg({ quality: 92 }).toBuffer();
  writeFileSync(OUT + 'exif6-portrait.jpg', buf);
}
// 1b. control: same pixels, no orientation tag
{
  const buf = await (await pattern(1600, 1200)).jpeg({ quality: 92 }).toBuffer();
  writeFileSync(OUT + 'exif0-landscape.jpg', buf);
}
// 2. Big photo 6000x4000 (24MP)
writeFileSync(OUT + 'big-6000x4000.jpg', await (await pattern(6000, 4000)).jpeg({ quality: 80 }).toBuffer());
// 3. Tiny thumbnail
writeFileSync(OUT + 'tiny-40x40.jpg', await (await pattern(40, 40)).jpeg({ quality: 92 }).toBuffer());
// 4. Ultra-wide panorama
writeFileSync(OUT + 'pano-8000x1000.jpg', await (await pattern(8000, 1000)).jpeg({ quality: 80 }).toBuffer());
// 5. Transparent PNG
{
  const w = 1200, h = 1600;
  const red = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 235, g: 0, b: 40, alpha: 1 } } }).png().toBuffer();
  const buf = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: red, top: 0, left: 0 }]).png().toBuffer();
  writeFileSync(OUT + 'transparent.png', buf);
}
// 6. WebP
writeFileSync(OUT + 'photo.webp', await (await pattern(1500, 2000)).webp({ quality: 85 }).toBuffer());
// 7. Text file renamed .jpg
writeFileSync(OUT + 'not-an-image.jpg', 'this is definitely not a jpeg\n'.repeat(40));
// 8. Pure white, for contrast testing
writeFileSync(OUT + 'white-2000x3000.png', await sharp({ create: { width: 2000, height: 3000, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer());
// 9. Square
writeFileSync(OUT + 'square-1500.jpg', await (await pattern(1500, 1500)).jpeg({ quality: 90 }).toBuffer());
// 10. Tall screenshot
writeFileSync(OUT + 'tall-1000x4000.jpg', await (await pattern(1000, 4000)).jpeg({ quality: 85 }).toBuffer());
console.log('fixtures written to', OUT);
