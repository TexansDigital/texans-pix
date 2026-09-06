// Wallpaper templates, drawn on top of the photo.
//
// House rules these all obey, from the Texans design system:
//   - display type is always uppercase, Black cut, tight leading
//   - `//` separates, `★` is the only decorative glyph, never emoji
//   - type over photography gets a scrim, never a rounded translucent box
//   - square corners; red is emphasis, never a large field except the ticker
//   - no sponsor mark is ever baked into the file (see README)

import {
  BRAND, WEIGHTS, scrimBottom, scrimTop, scrimFlat, rule,
  monoStamp, displayBlock, tickerStrip, drawBadge,
} from './compose.js';

// Join non-empty parts with the brand separator so an empty field never
// leaves an orphan `//`.
export const join = (...parts) => parts.map(p => (p == null ? '' : String(p).trim()))
  .filter(Boolean).join(' // ');

const MARGIN = 0.062; // side margin as a fraction of width

function frame(W, H, device, surface) {
  const m = Math.round(W * MARGIN);
  let top, bottom;
  if (surface === 'lock' && device.lock) {
    top = H * (device.lock.widgetBottom + 0.02);
    bottom = H * (device.lock.controlsTop - 0.03);
  } else {
    const home = device.home || { statusBottom: 0.05, dockTop: 0.86 };
    top = H * (home.statusBottom + 0.03);
    bottom = H * (home.dockTop - 0.03);
  }
  return { m, left: m, right: W - m, width: W - m * 2, top, bottom };
}

export const TEMPLATES = [
  {
    id: 'battle',
    label: 'Battle',
    note: 'Bottom scrim, heavy display line, red rule. The default.',
    draw(ctx, { W, H, device, surface, fields, marks }) {
      const f = frame(W, H, device, surface);
      scrimBottom(ctx, W, H, 0.42, 0.94);

      const stampSize = Math.max(16, W * 0.026);
      const kicker = join(fields.kicker, fields.section && `SEC ${fields.section}`);
      let y = f.bottom;

      if (kicker) {
        monoStamp(ctx, kicker, f.left, y, stampSize, 'rgba(255,255,255,.72)');
        y -= stampSize * 2.4;
      }
      const headline = fields.headline || fields.name || 'HOUSTON TEXANS';
      const size = Math.round(W * 0.135);
      ctx.font = `${WEIGHTS.black} ${size}px ${BRAND.display}`;
      const probe = displayBlockHeight(ctx, headline, size, f.width);
      y -= probe;
      displayBlock(ctx, headline, {
        x: f.left, y, size, maxWidth: f.width, color: BRAND.white, maxLines: 3,
      });
      y -= Math.round(H * 0.022);
      rule(ctx, f.left, y, Math.round(W * 0.16), Math.max(4, Math.round(H * 0.0055)));

      if (marks.bullhead) drawBadge(ctx, marks.bullhead, f.left, f.top, W * 0.13);
    },
  },

  {
    id: 'stamp',
    label: 'Stamp',
    note: 'Mono data block only. Keeps the frame clear — best for lock screens.',
    draw(ctx, { W, H, device, surface, fields }) {
      const f = frame(W, H, device, surface);
      scrimBottom(ctx, W, H, 0.66, 0.8);

      const size = Math.max(18, W * 0.030);
      const lines = [
        join(fields.kicker),
        join(fields.name, fields.number && `NO ${fields.number}`),
        join(fields.section && `SECTION ${fields.section}`, fields.since && `SINCE ${fields.since}`),
      ].filter(Boolean);

      let y = f.bottom;
      for (let i = lines.length - 1; i >= 0; i--) {
        const color = i === 0 ? BRAND.battleRed : 'rgba(255,255,255,.9)';
        monoStamp(ctx, lines[i], f.left, y, size, color);
        y -= size * 2.1;
      }
      y -= size * 0.4;
      rule(ctx, f.left, y, Math.round(W * 0.10), Math.max(3, Math.round(H * 0.004)));
    },
  },

  {
    id: 'deep-steel',
    label: 'Deep Steel',
    note: 'Flat scrim with the bullhead held back behind the type.',
    draw(ctx, { W, H, device, surface, fields, marks }) {
      const f = frame(W, H, device, surface);
      scrimFlat(ctx, W, H, 0.58);
      scrimBottom(ctx, W, H, 0.5, 0.7);

      if (marks.bullhead) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        const size = W * 0.86;
        drawBadge(ctx, marks.bullhead, (W - size) / 2, f.top + (f.bottom - f.top) * 0.08, size);
        ctx.restore();
      }

      const stampSize = Math.max(16, W * 0.026);
      let y = f.bottom;
      const foot = join(fields.section && `SECTION ${fields.section}`, fields.since && `SINCE ${fields.since}`);
      if (foot) {
        monoStamp(ctx, foot, W / 2, y, stampSize, 'rgba(255,255,255,.7)', 'center');
        y -= stampSize * 2.6;
      }
      const headline = fields.headline || fields.name || 'WE FINISH WHAT WE START';
      const size = Math.round(W * 0.115);
      ctx.font = `${WEIGHTS.black} ${size}px ${BRAND.display}`;
      y -= displayBlockHeight(ctx, headline, size, f.width);
      displayBlock(ctx, headline, {
        x: W / 2, y, size, maxWidth: f.width, color: BRAND.redHot, align: 'center', maxLines: 3,
      });
      if (fields.kicker) {
        y -= stampSize * 2.2;
        monoStamp(ctx, fields.kicker, W / 2, y, stampSize, 'rgba(255,255,255,.8)', 'center');
      }
    },
  },

  {
    id: 'ticker',
    label: 'Ticker',
    note: 'The brand ticker strip along the bottom edge.',
    draw(ctx, { W, H, device, surface, fields }) {
      const f = frame(W, H, device, surface);
      const stripH = Math.round(H * 0.028);
      scrimBottom(ctx, W, H, 0.5, 0.9);
      tickerStrip(ctx, W, H, stripH);

      const stampSize = Math.max(16, W * 0.026);
      let y = f.bottom - stripH * 1.4;
      const kicker = join(fields.kicker, fields.section && `SEC ${fields.section}`, fields.since && `SINCE ${fields.since}`);
      if (kicker) {
        monoStamp(ctx, kicker, f.left, y, stampSize, 'rgba(255,255,255,.75)');
        y -= stampSize * 2.4;
      }
      const headline = fields.headline || fields.name || 'HOUSTON';
      const size = Math.round(W * 0.155);
      ctx.font = `${WEIGHTS.black} ${size}px ${BRAND.display}`;
      y -= displayBlockHeight(ctx, headline, size, f.width);
      displayBlock(ctx, headline, {
        x: f.left, y, size, maxWidth: f.width, color: BRAND.white, maxLines: 2,
      });
    },
  },

  {
    id: 'jersey',
    label: 'Jersey',
    note: 'Your number as the hero. Needs a number to earn its keep.',
    draw(ctx, { W, H, device, surface, fields, marks }) {
      const f = frame(W, H, device, surface);
      scrimBottom(ctx, W, H, 0.38, 0.94);
      scrimTop(ctx, W, H, 0.28, 0.5);

      const number = (fields.number || '').trim();
      let y = f.bottom;

      const foot = join(fields.kicker, fields.section && `SEC ${fields.section}`);
      const stampSize = Math.max(16, W * 0.026);
      if (foot) {
        monoStamp(ctx, foot, f.left, y, stampSize, 'rgba(255,255,255,.72)');
        y -= stampSize * 2.6;
      }

      const name = fields.name || fields.headline || 'HOUSTON TEXANS';
      const nameSize = Math.round(W * 0.088);
      ctx.font = `${WEIGHTS.black} ${nameSize}px ${BRAND.display}`;
      y -= displayBlockHeight(ctx, name, nameSize, f.width);
      displayBlock(ctx, name, {
        x: f.left, y, size: nameSize, maxWidth: f.width, color: BRAND.white, maxLines: 2,
      });

      if (number) {
        const numSize = Math.round(W * 0.42);
        ctx.save();
        ctx.font = `${WEIGHTS.black} ${numSize}px ${BRAND.display}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = BRAND.redHot;
        y -= Math.round(numSize * 0.16);
        ctx.fillText(number.slice(0, 2), f.left, y);
        ctx.restore();
        y -= numSize * 0.86;
      } else {
        y -= Math.round(H * 0.02);
        rule(ctx, f.left, y, Math.round(W * 0.16), Math.max(4, Math.round(H * 0.0055)));
      }

      if (marks.bullhead && !number) {
        drawBadge(ctx, marks.bullhead, f.left, f.top, W * 0.12);
      }
    },
  },
];

// displayBlock wraps and shrinks internally; this mirrors that so callers can
// reserve the right vertical space before drawing.
function displayBlockHeight(ctx, text, size, maxWidth, maxLines = 3, lineHeight = 0.88) {
  const words = String(text).toUpperCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  let fontSize = size;
  const minSize = size * 0.45;
  let lines = [];
  while (fontSize >= minSize) {
    ctx.font = `${WEIGHTS.black} ${fontSize}px ${BRAND.display}`;
    lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && !lines.some(l => ctx.measureText(l).width > maxWidth)) break;
    fontSize -= Math.max(1, Math.round(size * 0.04));
  }
  const count = Math.min(lines.length, maxLines);
  return (count - 1) * fontSize * lineHeight + fontSize;
}

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
}
