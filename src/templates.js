// Wallpaper templates, drawn on top of the photo.
//
// House rules these all obey, from the Texans design system:
//   - display type is always uppercase, Black cut, tight leading
//   - `//` separates, `★` is the only decorative glyph, never emoji
//   - type over photography gets a scrim, never a rounded translucent box
//   - square corners; red is emphasis, never a large field except the ticker
//   - no sponsor mark is ever baked into the file (see README)
//
// Sizes are pure fractions of W and H with no absolute floors, so the preview
// surface and the export surface render identically at any scale.
//
// Every template measures its type first, then lays a scrim sized to where
// that type actually landed, then draws. A scrim anchored to a fixed fraction
// of height inverts on a landscape plate — display size scales with width —
// and leaves the headline sitting above its own protection.

import {
  BRAND, WEIGHTS, TONE, protectBand, scrimTop, scrimFlat, rule, isLightBackdrop,
  monoStamp, layoutDisplay, drawDisplay, fitLine, tickerStrip, drawBadge,
} from './compose.js';
import { getGameday, matchup, kickoffLabel, defaultKicker } from './gameday.js';

// A field counts as present only if it has non-whitespace in it. A single
// space used to slip through every `||` fallback and blank the hero line.
const has = v => typeof v === 'string' ? v.trim().length > 0 : v != null && String(v).trim().length > 0;
const val = v => String(v ?? '').trim();

// First non-blank value, so `headline: ' '` falls through to the next option.
export const pick = (...vals) => { const hit = vals.find(has); return hit === undefined ? '' : val(hit); };

// `SEC 132` only when there is a section. Prevents the bare label that a
// whitespace-only field used to leave behind.
const labeled = (label, v) => (has(v) ? `${label} ${val(v)}` : '');

// Join non-empty parts with the brand separator so an empty field never
// leaves an orphan `//`.
export const join = (...parts) => parts.filter(has).map(val).join(' // ');

const MARGIN = 0.062; // side margin as a fraction of width

// The corner badge sits outside the scrim, so a white bullhead disappears on a
// bright frame. Pick the variant that actually reads against what is behind it.
function badgeMark(marks, sample, H, top, size) {
  const light = sample ? isLightBackdrop(sample(top / H, (top + size) / H)) : false;
  return (light && marks.bullheadRed) ? marks.bullheadRed : marks.bullhead;
}

function frame(W, H, device, surface) {
  const m = Math.round(W * MARGIN);
  if (device.share) {
    // Nothing to dodge on a card that is sent rather than set as a wallpaper.
    return { m, left: m, right: W - m, width: W - m * 2, top: H * 0.05, bottom: H * 0.94 };
  }
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

// Where the brand ticker strip may sit. On a lock screen the physical bottom
// edge is under the flashlight and camera controls; on a home screen it is
// under the dock. Only a surface with neither gets the true bottom edge.
function tickerTop(H, f, device, surface, stripH) {
  const lock = surface === 'lock' && device.lock;
  const hasDock = (device.home?.dockTop ?? 1) < 1;
  return lock || hasDock ? Math.round(f.bottom) : H - stripH;
}

export const TEMPLATES = [
  {
    id: 'battle',
    label: 'Battle',
    note: 'Bottom scrim, heavy display line, red rule. The default.',
    draw(ctx, { W, H, device, surface, fields, marks, sample }) {
      const f = frame(W, H, device, surface);
      const stampSize = W * 0.026;
      const kicker = join(fields.kicker, labeled('SEC', fields.section));
      const ruleH = Math.max(1, H * 0.0055);

      // Measure.
      let y = f.bottom;
      const kickerY = has(kicker) ? y : null;
      if (kickerY !== null) y -= stampSize * 2.4;
      const budget = y - f.top - ruleH - H * 0.03;
      const layout = layoutDisplay(ctx, pick(fields.headline, fields.name, 'HOUSTON TEXANS'), {
        size: Math.round(W * 0.135), maxWidth: f.width, maxHeight: budget, maxLines: 3,
      });
      y -= layout.height;
      const headlineY = y;
      const ruleY = y - Math.round(H * 0.022);

      // Protect, then draw.
      protectBand(ctx, W, H, { fromFrac: (ruleY - H * 0.02) / H, tone: TONE.white, floor: 0.45, sample });
      if (kickerY !== null) monoStamp(ctx, kicker, f.left, kickerY, stampSize, 'rgba(255,255,255,.82)', 'left', f.width);
      drawDisplay(ctx, layout, { x: f.left, y: headlineY, color: BRAND.white });
      rule(ctx, f.left, ruleY, Math.round(W * 0.16), ruleH);
      const badgeSize = W * 0.13;
      drawBadge(ctx, badgeMark(marks, sample, H, f.top, badgeSize), f.left, f.top, badgeSize);
    },
  },

  {
    id: 'stamp',
    label: 'Stamp',
    note: 'Mono data block only. Keeps the frame clear — best for lock screens.',
    draw(ctx, { W, H, device, surface, fields, sample }) {
      const f = frame(W, H, device, surface);
      const size = W * 0.030;
      const lines = [
        join(fields.kicker),
        join(fields.name, labeled('NO', fields.number)),
        join(labeled('SECTION', fields.section), labeled('SINCE', fields.since)),
      ].filter(has);

      const blockTop = f.bottom - Math.max(0, lines.length - 1) * size * 2.1 - size;
      const ruleY = blockTop - size * 0.9;
      protectBand(ctx, W, H, { fromFrac: (ruleY - H * 0.02) / H, tone: TONE.white, floor: 0.45, sample });

      let y = f.bottom;
      for (let i = lines.length - 1; i >= 0; i--) {
        // Small red mono cannot reach 4.5:1 over arbitrary photography without
        // a near-opaque scrim, so the emphasis lives in the rule instead.
        monoStamp(ctx, lines[i], f.left, y, size, 'rgba(255,255,255,.94)', 'left', f.width);
        y -= size * 2.1;
      }
      rule(ctx, f.left, ruleY, Math.round(W * 0.10), Math.max(1, H * 0.004));
    },
  },

  {
    id: 'deep-steel',
    label: 'Deep Steel',
    note: 'Flat scrim with the bullhead held back behind the type.',
    draw(ctx, { W, H, device, surface, fields, marks, sample }) {
      const f = frame(W, H, device, surface);

      // The watermark goes under the scrim, not over it. Drawn on top it lifted
      // the backdrop out from under the red type and cost a full point of contrast.
      if (marks.bullhead) {
        ctx.save();
        ctx.globalAlpha = 0.2;
        const size = Math.min(W * 0.86, (f.bottom - f.top) * 0.8);
        drawBadge(ctx, marks.bullhead, (W - size) / 2, f.top + (f.bottom - f.top) * 0.08, size);
        ctx.restore();
      }
      scrimFlat(ctx, W, H, { tone: TONE.red, floor: 0.5, sample });

      const stampSize = W * 0.026;
      let y = f.bottom;
      const foot = join(labeled('SECTION', fields.section), labeled('SINCE', fields.since));
      if (has(foot)) {
        monoStamp(ctx, foot, W / 2, y, stampSize, 'rgba(255,255,255,.85)', 'center', f.width);
        y -= stampSize * 2.6;
      }
      const budget = y - f.top - (has(fields.kicker) ? stampSize * 2.2 : 0);
      const layout = layoutDisplay(ctx, pick(fields.headline, fields.name, 'WE FINISH WHAT WE START'), {
        size: Math.round(W * 0.115), maxWidth: f.width, maxHeight: budget, maxLines: 3,
      });
      y -= layout.height;
      drawDisplay(ctx, layout, { x: W / 2, y, color: BRAND.redHot, align: 'center' });
      if (has(fields.kicker)) {
        monoStamp(ctx, fields.kicker, W / 2, y - stampSize * 1.4, stampSize, 'rgba(255,255,255,.88)', 'center', f.width);
      }
    },
  },

  {
    id: 'ticker',
    label: 'Ticker',
    note: 'The brand ticker strip along the bottom of the safe area.',
    draw(ctx, { W, H, device, surface, fields, sample }) {
      const f = frame(W, H, device, surface);
      const stripH = Math.round(H * 0.028);
      const stripTop = tickerTop(H, f, device, surface, stripH);
      const stampSize = W * 0.026;
      const kicker = join(fields.kicker, labeled('SEC', fields.section), labeled('SINCE', fields.since));

      let y = stripTop - stripH * 0.6;
      if (has(kicker)) y -= stampSize * 2.4;
      const kickerY = has(kicker) ? stripTop - stripH * 0.6 : null;
      const budget = y - f.top;
      const layout = layoutDisplay(ctx, pick(fields.headline, fields.name, 'HOUSTON'), {
        size: Math.round(W * 0.155), maxWidth: f.width, maxHeight: budget, maxLines: 2,
      });
      y -= layout.height;

      protectBand(ctx, W, H, {
        fromFrac: (y - H * 0.02) / H, toFrac: (stripTop + stripH) / H,
        tone: TONE.white, floor: 0.45, sample,
      });
      tickerStrip(ctx, W, stripTop, stripH);
      if (kickerY !== null) monoStamp(ctx, kicker, f.left, kickerY, stampSize, 'rgba(255,255,255,.85)', 'left', f.width);
      drawDisplay(ctx, layout, { x: f.left, y, color: BRAND.white });
    },
  },

  {
    id: 'jersey',
    label: 'Jersey',
    note: 'Your number as the hero. Needs a number to earn its keep.',
    draw(ctx, { W, H, device, surface, fields, marks, sample }) {
      const f = frame(W, H, device, surface);
      const number = val(fields.number).toUpperCase().slice(0, 2);
      const stampSize = W * 0.026;
      const foot = join(fields.kicker, labeled('SEC', fields.section));

      let y = f.bottom;
      const footY = has(foot) ? y : null;
      if (footY !== null) y -= stampSize * 2.6;

      const nameLayout = layoutDisplay(ctx, pick(fields.name, fields.headline, 'HOUSTON TEXANS'), {
        size: Math.round(W * 0.088), maxWidth: f.width, maxHeight: (y - f.top) * 0.4, maxLines: 2,
      });
      y -= nameLayout.height;
      const nameY = y;

      let numSize = 0;
      let numY = y;
      if (has(number)) {
        // Fitted on both axes: `WW` used to run off every preset, and on a
        // landscape plate a width-derived size overflowed the canvas top.
        numSize = fitLine(ctx, number, {
          size: Math.round(W * 0.42), maxWidth: f.width, maxHeight: (y - f.top) * 0.92,
        });
        numY = y - Math.round(numSize * 0.16);
        y = numY - numSize * 0.86;
      } else {
        y -= Math.round(H * 0.02);
      }

      const topInk = Math.max(f.top * 0.5, y - H * 0.02);
      protectBand(ctx, W, H, {
        fromFrac: topInk / H, tone: has(number) ? TONE.red : TONE.white, floor: 0.45, sample,
      });
      scrimTop(ctx, W, H, 0.28, 0.5);

      if (footY !== null) monoStamp(ctx, foot, f.left, footY, stampSize, 'rgba(255,255,255,.82)', 'left', f.width);
      drawDisplay(ctx, nameLayout, { x: f.left, y: nameY, color: BRAND.white });

      if (has(number)) {
        ctx.save();
        ctx.font = `${WEIGHTS.black} ${numSize}px ${BRAND.display}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = BRAND.redHot;
        ctx.fillText(number, f.left, numY);
        ctx.restore();
      } else {
        rule(ctx, f.left, y, Math.round(W * 0.16), Math.max(1, H * 0.0055));
        const badgeSize = W * 0.12;
        drawBadge(ctx, badgeMark(marks, sample, H, f.top, badgeSize), f.left, f.top, badgeSize);
      }
    },
  },
  {
    id: 'my-seat',
    label: 'My Seat',
    note: 'Section and row as the hero. Built to send, not to set.',
    gameday: true,
    draw(ctx, { W, H, device, surface, fields, marks, sample }) {
      const f = frame(W, H, device, surface);
      const g = getGameday();
      const stampSize = W * 0.028;

      const seat = val(fields.section);
      const rowLabel = join(labeled('ROW', fields.row), labeled('SEAT', fields.seat));
      const foot = join(matchup(g), kickoffLabel(g));

      // Measure bottom-up so the scrim covers exactly what gets drawn.
      let y = f.bottom;
      const footY = has(foot) ? y : null;
      if (footY !== null) y -= stampSize * 2.5;

      const nameLayout = layoutDisplay(ctx, pick(fields.name, g.hashtag, 'HOUSTON'), {
        size: W * 0.075, maxWidth: f.width, maxHeight: (y - f.top) * 0.3, maxLines: 1,
      });
      y -= nameLayout.height;
      const nameY = y;

      let numSize = 0, numY = y;
      const label = has(seat) ? 'SECTION' : '';
      if (has(seat)) {
        numSize = fitLine(ctx, seat, {
          size: W * 0.40, maxWidth: f.width, maxHeight: (y - f.top) * 0.55,
        });
        numY = y - numSize * 0.2;
        y = numY - numSize * 0.86;
      }
      const labelY = has(label) ? y - stampSize * 0.6 : y;
      if (has(label)) y = labelY - stampSize * 1.8;
      const rowY = has(rowLabel) ? y - stampSize * 0.4 : y;
      if (has(rowLabel)) y = rowY - stampSize * 1.8;

      protectBand(ctx, W, H, {
        fromFrac: Math.max(0, (y - H * 0.03)) / H,
        tone: has(seat) ? TONE.red : TONE.white, floor: 0.5, sample,
      });

      if (has(rowLabel)) monoStamp(ctx, rowLabel, f.left, rowY, stampSize, 'rgba(255,255,255,.8)', 'left', f.width);
      if (has(label)) monoStamp(ctx, label, f.left, labelY, stampSize, BRAND.battleRed, 'left', f.width);
      if (has(seat)) {
        ctx.save();
        ctx.font = `${WEIGHTS.black} ${numSize}px ${BRAND.display}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = BRAND.redHot;
        ctx.fillText(seat.toUpperCase(), f.left, numY);
        ctx.restore();
      }
      drawDisplay(ctx, nameLayout, { x: f.left, y: nameY, color: BRAND.white });
      if (footY !== null) monoStamp(ctx, foot, f.left, footY, stampSize, 'rgba(255,255,255,.85)', 'left', f.width);

      const badgeSize = W * 0.11;
      drawBadge(ctx, badgeMark(marks, sample, H, f.top, badgeSize), W - f.m - badgeSize, f.top, badgeSize);
    },
  },

  {
    id: 'gameday',
    label: 'Gameday',
    note: 'This week\'s matchup and date, straight from the schedule.',
    gameday: true,
    draw(ctx, { W, H, device, surface, fields, marks, sample }) {
      const f = frame(W, H, device, surface);
      const g = getGameday();
      const stampSize = W * 0.028;
      const stripH = Math.round(H * 0.03);
      const stripTop = tickerTop(H, f, device, surface, stripH);

      const foot = join(g.venue, labeled('SEC', fields.section), fields.name);
      let y = stripTop - stripH * 0.8;
      const footY = has(foot) ? y : null;
      if (footY !== null) y -= stampSize * 2.4;

      const dateLine = join(pick(fields.kicker, defaultKicker(g)), kickoffLabel(g));
      const dateY = has(dateLine) ? y : null;
      if (dateY !== null) y -= stampSize * 2.4;

      const headline = pick(fields.headline, matchup(g), 'HOUSTON TEXANS');
      const layout = layoutDisplay(ctx, headline, {
        size: W * 0.145, maxWidth: f.width, maxHeight: (y - f.top) * 0.85, maxLines: 3,
      });
      y -= layout.height;
      const ruleY = y - H * 0.02;

      protectBand(ctx, W, H, {
        fromFrac: Math.max(0, ruleY - H * 0.03) / H,
        toFrac: (stripTop + stripH) / H, tone: TONE.white, floor: 0.5, sample,
      });
      tickerStrip(ctx, W, stripTop, stripH);

      rule(ctx, f.left, ruleY, W * 0.18, Math.max(1, H * 0.006));
      drawDisplay(ctx, layout, { x: f.left, y, color: BRAND.white });
      if (dateY !== null) monoStamp(ctx, dateLine, f.left, dateY, stampSize, BRAND.battleRed, 'left', f.width);
      if (footY !== null) monoStamp(ctx, foot, f.left, footY, stampSize, 'rgba(255,255,255,.82)', 'left', f.width);
    },
  },
];

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
}
