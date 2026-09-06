// This week's game, read from gameday.json at the site root.
//
// Everything gameday-themed reads from here so the digital team changes one
// file a week rather than editing templates. A missing or broken file must
// never break the studio: it falls back to neutral Texans branding.

const FALLBACK = {
  week: '', opponentShort: '', opponent: '', home: true,
  venue: 'NRG Stadium', kickoff: null, theme: '', hashtag: '', attendanceCode: null,
};

let cached = null;

export async function loadGameday() {
  if (cached) return cached;
  try {
    const res = await fetch('gameday.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const raw = await res.json();
    cached = { ...FALLBACK, ...raw };
  } catch {
    cached = { ...FALLBACK };
  }
  return cached;
}

export const getGameday = () => cached || FALLBACK;

// "TEXANS VS COLTS" / "TEXANS AT COLTS" — empty when no opponent is set, so a
// template can fall back rather than render a dangling preposition.
export function matchup(g = getGameday()) {
  if (!g.opponentShort) return '';
  return `TEXANS ${g.home ? 'VS' : 'AT'} ${g.opponentShort}`;
}

// "SUN 27 SEP" — short, uppercase, no comma, in the venue's own timezone as
// written in the file.
export function kickoffLabel(g = getGameday()) {
  if (!g.kickoff) return '';
  const d = new Date(g.kickoff);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const date = d.getDate();
  const mon = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return `${day} ${date} ${mon}`;
}

// The stamp line templates use when the fan has not typed their own kicker.
export function defaultKicker(g = getGameday()) {
  return [g.week, g.theme].filter(Boolean).join(' // ');
}
