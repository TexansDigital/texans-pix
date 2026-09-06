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

const FONT_FILES = [
  ['HelveticaNeueLTStd-MdEx.otf', 500],
  ['HelveticaNeueLTStd-BdEx.otf', 700],
  ['HelveticaNeueLTPro-HvEx.otf', 800],
  ['HelveticaNeueLTStd-BlkEx.otf', 900],
];

let fontsReady = null;

// Canvas silently falls back to Arial if the face is not loaded, so every
// draw has to wait on this. Resolves to the list of cuts that actually loaded.
export function loadFonts() {
  if (fontsReady) return fontsReady;
  fontsReady = Promise.all(
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
  return fontsReady;
}

// --- image decoding --------------------------------------------------------

export class ImageError extends Error {}

const MAX_SOURCE_EDGE = 4096; // decode cap: a 48MP phone photo will hang a tab otherwise

// `imageOrientation: 'from-image'` is what stops portrait phone photos landing
// sideways. Without it every iPhone upload with an EXIF flag renders rotated.
export async function decodeImage(source) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch (err) {
    throw new ImageError('That file could not be read as an image. Try a JPEG, PNG or WebP.');
  }
  if (!bitmap.width || !bitmap.height) {
    throw new ImageError('That image is empty.');
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_SOURCE_EDGE) return bitmap;

  const scale = MAX_SOURCE_EDGE / longest;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const off = new OffscreenCanvas(w, h);
  off.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return off.transferToImageBitmap();
}

// --- geometry --------------------------------------------------------------

// Cover-fit the photo into the frame, then apply the user's zoom and pan.
// Pan is clamped so the photo can never pull away from an edge and expose
// background — at zoom 1 the photo exactly covers, so pan is pinned to 0.
export function coverRect(img, W, H, zoom = 1, panX = 0, panY = 0) {
  const base = Math.max(W / img.width, H / img.height);
  const scale = base * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const slackX = Math.max(0, (dw - W) / 2);
  const slackY = Math.max(0, (dh - H) / 2);
  const x = (W - dw) / 2 + clamp(panX, -1, 1) * slackX;
  const y = (H - dh) / 2 + clamp(panY, -1, 1) * slackY;
  return { x, y, w: dw, h: dh };
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// --- drawing primitives ----------------------------------------------------

export function scrimBottom(ctx, W, H, fromFrac = 0.45, strength = 0.92) {
  const g = ctx.createLinearGradient(0, H, 0, H * fromFrac);
  g.addColorStop(0, `rgba(2,17,24,${strength})`);
  g.addColorStop(0.42, `rgba(2,17,24,${strength * 0.6})`);
  g.addColorStop(1, 'rgba(2,17,24,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * fromFrac, W, H * (1 - fromFrac));
}

export function scrimTop(ctx, W, H, toFrac = 0.35, strength = 0.85) {
  const g = ctx.createLinearGradient(0, 0, 0, H * toFrac);
  g.addColorStop(0, `rgba(2,17,24,${strength})`);
  g.addColorStop(1, 'rgba(2,17,24,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * toFrac);
}

export function scrimFlat(ctx, W, H, strength = 0.55) {
  ctx.fillStyle = `rgba(2,17,24,${strength})`;
  ctx.fillRect(0, 0, W, H);
}

export function rule(ctx, x, y, w, h, color = BRAND.battleRed) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

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

export function monoStamp(ctx, text, x, y, size, color = BRAND.white, align = 'left') {
  if (!text) return;
  const upper = String(text).toUpperCase();
  ctx.save();
  ctx.font = `500 ${size}px ${BRAND.mono}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  const tracking = size * 0.18;
  let startX = x;
  if (align !== 'left') {
    const width = trackedText(ctx, upper, 0, 0, tracking, { measureOnly: true });
    startX = align === 'center' ? x - width / 2 : x - width;
  }
  trackedText(ctx, upper, startX, y, tracking);
  ctx.restore();
}

// Uppercase display type, wrapped to `maxWidth`, shrinking until it fits
// `maxLines`. Returns the block height so callers can stack beneath it.
export function displayBlock(ctx, text, opts) {
  const {
    x, y, size, maxWidth, weight = WEIGHTS.black, color = BRAND.white,
    align = 'left', lineHeight = 0.88, maxLines = 3, minSize = size * 0.45,
  } = opts;
  const words = String(text).toUpperCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;

  let fontSize = size;
  let lines = [];
  while (fontSize >= minSize) {
    ctx.font = `${weight} ${fontSize}px ${BRAND.display}`;
    lines = wrap(ctx, words, maxWidth);
    const tooWide = lines.some(l => ctx.measureText(l).width > maxWidth);
    if (lines.length <= maxLines && !tooWide) break;
    fontSize -= Math.max(1, Math.round(size * 0.04));
  }
  ctx.font = `${weight} ${fontSize}px ${BRAND.display}`;
  lines = lines.slice(0, maxLines);

  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  const step = fontSize * lineHeight;
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * step));
  ctx.restore();
  return (lines.length - 1) * step + fontSize;
}

function wrap(ctx, words, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// The brand's bottom ticker strip: repeating wordmark and star on battle red.
export function tickerStrip(ctx, W, H, stripH) {
  ctx.save();
  ctx.fillStyle = BRAND.battleRed;
  ctx.fillRect(0, H - stripH, W, stripH);
  ctx.beginPath();
  ctx.rect(0, H - stripH, W, stripH);
  ctx.clip();
  const size = stripH * 0.34;
  ctx.font = `500 ${size}px ${BRAND.mono}`;
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.textBaseline = 'middle';
  const unit = 'HOUSTON TEXANS ★ ';
  const tracking = size * 0.18;
  const unitWidth = trackedText(ctx, unit, 0, 0, tracking, { measureOnly: true });
  for (let x = 0; x < W + unitWidth; x += unitWidth) {
    trackedText(ctx, unit, x, H - stripH / 2, tracking);
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
