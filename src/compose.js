// Canvas compositing. One canvas, sized to the device's real pixels, scaled
// down with CSS for preview — so what you see is byte-for-byte what exports.

export const BRAND = {
  deepSteel: '#021118',
  steel800: '#0a1d27',
  battleRed: '#eb0028',
  redHot: '#ff0000',
  white: '#ffffff',
  htownBlue: '#0080c6',
  display: '"HelveticaNeueLT Ex", "Helvetica Neue", Helvetica, Arial, sans-serif',
  mono: '"Azeret Mono", ui-monospace, Menlo, monospace',
};

export const WEIGHTS = { medium: 500, bold: 700, heavy: 800, black: 900 };

// Deep steel as sRGB channels — every scrim composites toward this.
const STEEL_RGB = [2, 17, 24];

const FONT_FILES = [
  ['HelveticaNeueLTStd-MdEx.otf', 500],
  ['HelveticaNeueLTStd-BdEx.otf', 700],
  ['HelveticaNeueLTPro-HvEx.otf', 800],
  ['HelveticaNeueLTStd-BlkEx.otf', 900],
];

let fontsReady = null;

// Canvas silently falls back to Arial if the face is not loaded, so every
// draw has to wait on this. Resolves { display: [weights], mono: bool }.
export function loadFonts() {
  if (fontsReady) return fontsReady;
  const display = Promise.all(
    FONT_FILES.map(async ([file, weight]) => {
      try {
        const face = new FontFace('HelveticaNeueLT Ex', `url(assets/fonts/${file})`, {
          weight: String(weight), style: 'normal',
        });
        await face.load();
        document.fonts.add(face);
        return weight;
      } catch (err) {
        console.warn(`[studio] font ${file} failed to load`, err);
        return null;
      }
    })
  ).then(list => list.filter(Boolean));

  // The mono carries every stamp and the ticker strip, and it comes from a
  // third party — so it gets the same load check the display cuts get.
  const mono = document.fonts.load('500 12px "Azeret Mono"')
    .then(faces => faces.length > 0 && document.fonts.check('500 12px "Azeret Mono"'))
    .catch(() => false);

  fontsReady = Promise.all([display, mono]).then(([d, m]) => ({ display: d, mono: m }));
  return fontsReady;
}

// --- image decoding --------------------------------------------------------

export class ImageError extends Error {}

const MAX_SOURCE_EDGE = 4096; // decode cap: a 48MP phone photo will hang a tab otherwise

// `imageOrientation: 'from-image'` is what stops portrait phone photos landing
// sideways. Without it every iPhone upload with an EXIF flag renders rotated.
// Returns the bitmap plus the original dimensions, so callers can report the
// photo's real size rather than the post-cap size.
export async function decodeImage(source) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('That file could not be read as an image. Try a JPEG, PNG or WebP.');
  }
  if (!bitmap.width || !bitmap.height) {
    throw new ImageError('That image is empty.');
  }
  const source_w = bitmap.width;
  const source_h = bitmap.height;
  const longest = Math.max(source_w, source_h);
  if (longest <= MAX_SOURCE_EDGE) {
    return { bitmap, sourceWidth: source_w, sourceHeight: source_h, downscaled: false };
  }

  const scale = MAX_SOURCE_EDGE / longest;
  const w = Math.round(source_w * scale);
  const h = Math.round(source_h * scale);
  const off = new OffscreenCanvas(w, h);
  off.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return {
    bitmap: off.transferToImageBitmap(),
    sourceWidth: source_w, sourceHeight: source_h, downscaled: true,
  };
}

// --- geometry --------------------------------------------------------------

// How far the photo can travel on each axis before an edge would show, in
// canvas pixels. Pan is expressed as a fraction of this, so the pointer
// mapping has to divide by it — not by half the preview.
export function coverSlack(img, W, H, zoom = 1) {
  const scale = Math.max(W / img.width, H / img.height) * zoom;
  return {
    x: Math.max(0, (img.width * scale - W) / 2),
    y: Math.max(0, (img.height * scale - H) / 2),
  };
}

// Cover-fit the photo into the frame, then apply the user's zoom and pan.
// Pan is clamped so the photo can never pull away from an edge and expose
// background — at zoom 1 the photo exactly covers, so pan is pinned to 0.
export function coverRect(img, W, H, zoom = 1, panX = 0, panY = 0) {
  const base = Math.max(W / img.width, H / img.height);
  const scale = base * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const slack = coverSlack(img, W, H, zoom);
  const x = (W - dw) / 2 + clamp(panX, -1, 1) * slack.x;
  const y = (H - dh) / 2 + clamp(panY, -1, 1) * slack.y;
  return { x, y, w: dw, h: dh };
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// --- luminance & adaptive scrims ------------------------------------------

const srgbToLinear = c => {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

// Mean sRGB of a canvas region, read from a tiny downsample so this stays
// cheap enough to run on every render.
function meanRegionRGB(canvas, x, y, w, h) {
  const S = 24;
  const off = new OffscreenCanvas(S, S);
  const o = off.getContext('2d', { willReadFrequently: true });
  o.drawImage(canvas, x, y, Math.max(1, w), Math.max(1, h), 0, 0, S, S);
  const { data } = o.getImageData(0, 0, S, S);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  const n = data.length / 4;
  return [r / n, g / n, b / n];
}

// Backdrop luminance the type needs to sit on. White display type only needs
// the band knocked back; red hot is a light colour (L 0.213) so it needs the
// backdrop close to black before it reads at all.
export const TONE = { white: 0.13, red: 0.035 };

// Smallest alpha of deep steel that pulls `rgb` down to `target` luminance.
function alphaFor(rgb, target, floor) {
  for (let a = floor; a <= 0.97; a += 0.02) {
    const mixed = rgb.map((c, i) => (1 - a) * c + a * STEEL_RGB[i]);
    if (luminance(mixed) <= target) return Math.min(0.97, a);
  }
  return 0.97;
}

// A scrim sized to the photo underneath it, rather than a fixed alpha tuned
// for dark art. Samples the band the type will occupy and darkens until the
// type will actually read. Must run after the photo is drawn.
export function protectBand(ctx, W, H, { fromFrac, toFrac = 1, tone = TONE.white, floor = 0.4, feather = 0.18 }) {
  const y = Math.max(0, Math.round(H * fromFrac));
  const h = Math.max(1, Math.round(H * (toFrac - fromFrac)));
  let peak = floor;
  try {
    peak = alphaFor(meanRegionRGB(ctx.canvas, 0, y, W, h), tone, floor);
  } catch {
    peak = 0.9; // tainted or unreadable canvas: fail safe, not transparent
  }
  const fadeTop = Math.max(0, H * (fromFrac - feather));
  const g = ctx.createLinearGradient(0, H * toFrac, 0, fadeTop);
  g.addColorStop(0, `rgba(2,17,24,${peak})`);
  g.addColorStop(Math.min(0.999, (H * toFrac - H * fromFrac) / (H * toFrac - fadeTop || 1)), `rgba(2,17,24,${peak})`);
  g.addColorStop(1, 'rgba(2,17,24,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, fadeTop, W, H * toFrac - fadeTop);
  return peak;
}

export function scrimTop(ctx, W, H, toFrac = 0.35, strength = 0.85) {
  const g = ctx.createLinearGradient(0, 0, 0, H * toFrac);
  g.addColorStop(0, `rgba(2,17,24,${strength})`);
  g.addColorStop(1, 'rgba(2,17,24,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * toFrac);
}

// Flat hold-back across the whole plate, also sized to the photo.
export function scrimFlat(ctx, W, H, { tone = TONE.white, floor = 0.4 } = {}) {
  let a = floor;
  try {
    a = alphaFor(meanRegionRGB(ctx.canvas, 0, 0, W, H), tone, floor);
  } catch {
    a = 0.85;
  }
  ctx.fillStyle = `rgba(2,17,24,${a})`;
  ctx.fillRect(0, 0, W, H);
  return a;
}

export function rule(ctx, x, y, w, h, color = BRAND.battleRed) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// --- type ------------------------------------------------------------------

// Canvas has no reliable letter-spacing across engines, so tracked text is
// drawn glyph by glyph. Returns the total advance so callers can centre it.
export function trackedText(ctx, text, x, y, tracking, { measureOnly = false } = {}) {
  let cursor = x;
  for (const ch of text) {
    const adv = ctx.measureText(ch).width;
    if (!measureOnly) ctx.fillText(ch, cursor, y);
    cursor += adv + tracking;
  }
  return cursor - x - tracking;
}

const trackedWidth = (ctx, text, size, tracking) => {
  ctx.font = `500 ${size}px ${BRAND.mono}`;
  return trackedText(ctx, text, 0, 0, tracking, { measureOnly: true });
};

// Mono stamp. `maxWidth` shrinks the size until the line fits rather than
// letting it run off the plate.
export function monoStamp(ctx, text, x, y, size, color = BRAND.white, align = 'left', maxWidth = Infinity) {
  const upper = String(text ?? '').toUpperCase();
  if (!upper.trim()) return 0;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;

  let fontSize = size;
  const minSize = size * 0.6;
  let width = trackedWidth(ctx, upper, fontSize, fontSize * 0.18);
  while (width > maxWidth && fontSize > minSize) {
    fontSize -= Math.max(1, size * 0.04);
    width = trackedWidth(ctx, upper, fontSize, fontSize * 0.18);
  }

  const tracking = fontSize * 0.18;
  ctx.font = `500 ${fontSize}px ${BRAND.mono}`;
  let startX = x;
  if (align === 'center') startX = x - width / 2;
  else if (align === 'right') startX = x - width;
  trackedText(ctx, upper, startX, y, tracking);
  ctx.restore();
  return fontSize;
}

// One layout pass shared by the draw and the height measurement, so the two
// can never disagree about how many lines there are. Shrinks to fit
// `maxLines`; hard-breaks a single word too long for the measure.
export function layoutDisplay(ctx, text, { size, maxWidth, maxLines = 3, weight = WEIGHTS.black, lineHeight = 0.88 }) {
  const words = String(text ?? '').toUpperCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { fontSize: size, lines: [], height: 0, lineHeight };

  const minSize = size * 0.34;
  let fontSize = size;
  let lines = [];
  for (;;) {
    ctx.font = `${weight} ${fontSize}px ${BRAND.display}`;
    lines = wrap(ctx, words, maxWidth);
    if (lines.length <= maxLines) break;
    if (fontSize <= minSize) { lines = lines.slice(0, maxLines); break; }
    fontSize = Math.max(minSize, fontSize - Math.max(1, size * 0.04));
  }
  ctx.font = `${weight} ${fontSize}px ${BRAND.display}`;
  const height = (lines.length - 1) * fontSize * lineHeight + fontSize;
  return { fontSize, lines, height, lineHeight };
}

export function drawDisplay(ctx, layout, { x, y, color = BRAND.white, align = 'left', weight = WEIGHTS.black }) {
  if (!layout.lines.length) return 0;
  ctx.save();
  ctx.font = `${weight} ${layout.fontSize}px ${BRAND.display}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  const step = layout.fontSize * layout.lineHeight;
  layout.lines.forEach((line, i) => ctx.fillText(line, x, y + i * step));
  ctx.restore();
  return layout.height;
}

// Greedy wrap. A word wider than the measure is hard-broken at the character
// level, because a surname with no spaces used to run straight off the plate.
function wrap(ctx, words, maxWidth) {
  const lines = [];
  let line = '';
  const push = () => { if (line) { lines.push(line); line = ''; } };

  for (const word of words) {
    if (ctx.measureText(word).width > maxWidth) {
      push();
      let chunk = '';
      for (const ch of word) {
        if (chunk && ctx.measureText(chunk + ch).width > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) { push(); line = word; }
    else line = candidate;
  }
  push();
  return lines;
}

// The brand's bottom ticker strip: repeating wordmark and star on battle red.
export function tickerStrip(ctx, W, stripTop, stripH) {
  ctx.save();
  ctx.fillStyle = BRAND.battleRed;
  ctx.fillRect(0, stripTop, W, stripH);
  ctx.beginPath();
  ctx.rect(0, stripTop, W, stripH);
  ctx.clip();
  const size = stripH * 0.34;
  ctx.font = `500 ${size}px ${BRAND.mono}`;
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.textBaseline = 'middle';
  const unit = 'HOUSTON TEXANS ★ ';
  const tracking = size * 0.18;
  const unitWidth = trackedText(ctx, unit, 0, 0, tracking, { measureOnly: true }) || W;
  for (let x = 0; x < W + unitWidth; x += unitWidth) {
    trackedText(ctx, unit, x, stripTop + stripH / 2, tracking);
  }
  ctx.restore();
}

export function drawBadge(ctx, img, x, y, size) {
  if (!img) return;
  const ratio = img.width / img.height;
  const w = ratio >= 1 ? size : size * ratio;
  const h = ratio >= 1 ? size / ratio : size;
  ctx.drawImage(img, x, y + (size - h) / 2, w, h);
}

// Guides are preview-only. Nothing here may ever reach an export.
export function drawGuides(ctx, W, H, device, surface) {
  const zones = [];
  if (surface === 'lock' && device.lock) {
    zones.push(['Clock', device.lock.clockTop, device.lock.clockBottom]);
    zones.push(['Widgets', device.lock.clockBottom, device.lock.widgetBottom]);
    zones.push(['Controls', device.lock.controlsTop, 1]);
  } else if (device.home) {
    zones.push(['Status', 0, device.home.statusBottom]);
    zones.push(['Dock', device.home.dockTop, 1]);
  }
  ctx.save();
  for (const [label, from, to] of zones) {
    if (to - from <= 0) continue; // desktop has no status or dock band to draw
    const y = H * from;
    const h = H * (to - from);
    ctx.fillStyle = 'rgba(235,0,40,.16)';
    ctx.fillRect(0, y, W, h);
    ctx.strokeStyle = 'rgba(235,0,40,.75)';
    ctx.lineWidth = Math.max(2, W * 0.003);
    ctx.strokeRect(0, y, W, h);
    monoStamp(ctx, label, W * 0.03, y + Math.max(26, H * 0.016), Math.max(18, W * 0.022), 'rgba(255,255,255,.95)');
  }
  ctx.restore();
}
