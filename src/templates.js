// Wallpaper templates, drawn on top of the photo.
//
// House rules these all obey, from the Texans design system:
//   - display type is always uppercase, Black cut, tight leading
//   - `//` separates, `★` is the only decorative glyph, never emoji
//   - type over photography gets a scrim, never a rounded translucent box
//   - square corners; red is emphasis, never a large field except the ticker
//   - no sponsor mark is ever baked into the file (see README)

import {
  BRAND, WEIGHTS, TONE, protectBand, scrimTop, scrimFlat, rule,
  monoStamp, layoutDisplay, drawDisplay, tickerStrip, drawBadge,
} from './compose.js';

// A field counts as present only if it has non-whitespace in it. A single
// space used to slip through every `||` fallback and blank the hero line.
const has = v => typeof v === 'string' ? v.trim().length > 0 : v != null && String(v).trim().length > 0;
const val = v => String(v ?? '').trim();

// First non-blank value, so `headline: ' '` falls through to the next option.
export const pick = (...vals) => vals.find(has) !== undefined ? val(vals.find(has)) : '';

// `SEC 132` only when there is a section. Prevents the bare label that a
// whitespace-only field used to leave behind.
const labeled = (label, v) => (has(v) ? `${label} ${val(v)}` : '');

// Join non-empty parts with the brand separator so an empty field never
// leaves an orphan `//`.
export const join = (...parts) => parts.filter(has).map(val).join(' // ');

const MARGIN = 0.062; // side margin as a fraction of width

function frame(W, H, device, surface) {
  const m = Math.round(W * MARGIN);
  const lock = surface === 'lock' ? device.lock : null;
  let top, bottom;
  if (lock) {
    top = H * (lock.widgetBottom + 0.02);
    bottom = H * (lock.controlsTop - 0.03);
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
      protectBand(ctx, W, H, { fromFrac: 0.42, tone: TONE.white, floor: 0.5 });

      const stampSize = Math.max(16, W * 0.026);
      const kicker = join(fields.kicker, labeled('SEC', fields.section));
      let y = f.bottom;

      if (has(kicker)) {
        monoStamp(ctx, kicker, f.left, y, stampSize, 'rgba(255,255,255,.78)', 'left', f.width);
        y -= stampSize * 2.4;
      }
      const headline = pick(fields.headline, fields.name, 'HOUSTON TEXANS');
      const layout = layoutDisplay(ctx, headline, { size: Math.round(W * 0.135), maxWidth: f.width, maxLines: 3 });
      y -= layout.height;
      drawDisplay(ctx, layout, { x: f.left, y, color: BRAND.white });
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
      protectBand(ctx, W, H, { fromFrac: 0.64, tone: TONE.white, floor: 0.45 });

      const size = Math.max(18, W * 0.030);
      const lines = [
        join(fields.kicker),
        join(fields.name, labeled('NO', fields.number)),
        join(labeled('SECTION', fields.section), labeled('SINCE', fields.since)),
      ].filter(has);

      let y = f.bottom;
      for (let i = lines.length - 1; i >= 0; i--) {
        const color = i === 0 ? BRAND.battleRed : 'rgba(255,255,255,.92)';
        monoStamp(ctx, lines[i], f.left, y, size, color, 'left', f.width);
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
      // Red hot needs a near-black backdrop before it reads at all.
      scrimFlat(ctx, W, H, { tone: TONE.red, floor: 0.5 });

      if (marks.bullhead) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        const size = W * 0.86;
        drawBadge(ctx, marks.bullhead, (W - size) / 2, f.top + (f.bottom - f.top) * 0.08, size);
        ctx.restore();
      }

      const stampSize = Math.max(16, W * 0.026);
      let y = f.bottom;
      const foot = join(labeled('SECTION', fields.section), labeled('SINCE', fields.since));
      if (has(foot)) {
        monoStamp(ctx, foot, W / 2, y, stampSize, 'rgba(255,255,255,.8)', 'center', f.width);
        y -= stampSize * 2.6;
      }
      const headline = pick(fields.headline, fields.name, 'WE FINISH WHAT WE START');
      const layout = layoutDisplay(ctx, headline, { size: Math.round(W * 0.115), maxWidth: f.width, maxLines: 3 });
      y -= layout.height;
      drawDisplay(ctx, layout, { x: W / 2, y, color: BRAND.redHot, align: 'center' });
      if (has(fields.kicker)) {
        y -= stampSize * 2.2;
        monoStamp(ctx, fields.kicker, W / 2, y, stampSize, 'rgba(255,255,255,.85)', 'center', f.width);
      }
    },
  },

  {
    id: 'ticker',
    label: 'Ticker',
    note: 'The brand ticker strip along the bottom of the safe area.',
    draw(ctx, { W, H, device, surface, fields }) {
      const f = frame(W, H, device, surface);
      const stripH = Math.round(H * 0.028);
      // On a lock screen the true bottom edge sits under the flashlight and
      // camera controls, so the strip rides the bottom of the safe band.
      const stripTop = surface === 'lock' && device.lock ? Math.round(f.bottom) : H - stripH;

      protectBand(ctx, W, H, { fromFrac: 0.5, toFrac: (stripTop + stripH) / H, tone: TONE.white, floor: 0.5 });
      tickerStrip(ctx, W, stripTop, stripH);

      const stampSize = Math.max(16, W * 0.026);
      let y = stripTop - stripH * 0.6;
      const kicker = join(fields.kicker, labeled('SEC', fields.section), labeled('SINCE', fields.since));
      if (has(kicker)) {
        monoStamp(ctx, kicker, f.left, y, stampSize, 'rgba(255,255,255,.8)', 'left', f.width);
        y -= stampSize * 2.4;
      }
      const headline = pick(fields.headline, fields.name, 'HOUSTON');
      const layout = layoutDisplay(ctx, headline, { size: Math.round(W * 0.155), maxWidth: f.width, maxLines: 2 });
      y -= layout.height;
      drawDisplay(ctx, layout, { x: f.left, y, color: BRAND.white });
    },
  },

  {
    id: 'jersey',
    label: 'Jersey',
    note: 'Your number as the hero. Needs a number to earn its keep.',
    draw(ctx, { W, H, device, surface, fields, marks }) {
      const f = frame(W, H, device, surface);
      const number = val(fields.number).toUpperCase().slice(0, 2);
      // The number is red hot and huge; the band under it has to go near-black.
      protectBand(ctx, W, H, { fromFrac: 0.34, tone: has(number) ? TONE.red : TONE.white, floor: 0.5 });
      scrimTop(ctx, W, H, 0.28, 0.5);

      let y = f.bottom;

      const foot = join(fields.kicker, labeled('SEC', fields.section));
      const stampSize = Math.max(16, W * 0.026);
      if (has(foot)) {
        monoStamp(ctx, foot, f.left, y, stampSize, 'rgba(255,255,255,.78)', 'left', f.width);
        y -= stampSize * 2.6;
      }

      const name = pick(fields.name, fields.headline, 'HOUSTON TEXANS');
      const layout = layoutDisplay(ctx, name, { size: Math.round(W * 0.088), maxWidth: f.width, maxLines: 2 });
      y -= layout.height;
      drawDisplay(ctx, layout, { x: f.left, y, color: BRAND.white });

      if (has(number)) {
        const numSize = Math.round(W * 0.42);
        ctx.save();
        ctx.font = `${WEIGHTS.black} ${numSize}px ${BRAND.display}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = BRAND.redHot;
        y -= Math.round(numSize * 0.16);
        ctx.fillText(number, f.left, y);
        ctx.restore();
        y -= numSize * 0.86;
      } else {
        y -= Math.round(H * 0.02);
        rule(ctx, f.left, y, Math.round(W * 0.16), Math.max(4, Math.round(H * 0.0055)));
        if (marks.bullhead) drawBadge(ctx, marks.bullhead, f.left, f.top, W * 0.12);
      }
    },
  },
];

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
}
