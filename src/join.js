// The one place the studio asks a fan for anything.
//
// Rules this module keeps, because the page promises them in writing:
//   - it is never shown before a save, and never blocks one
//   - the download works identically whether a fan joins, declines or is
//     offline; nothing here can fail in a way that costs them their wallpaper
//   - consent is a box the fan ticks, unticked to begin with, and the exact
//     sentence they agreed to is sent with the signup and stored beside it
//   - no photograph, filename or image data is ever sent. The endpoint caps
//     bodies at 2KB precisely so that cannot drift.

import { getGameday, matchup } from './gameday.js';

// The sentence the fan agrees to. Changing this changes what new rows record,
// which is the point — old rows keep the wording their fan actually saw.
export const CONSENT_TEXT =
  'Email me when new Texans photos and frames drop. I can unsubscribe any time.';

const SEEN_KEY = 'texans-studio-join';
const $ = sel => document.querySelector(sel);

// localStorage throws outright in some privacy modes, so every touch is
// guarded and a failure just means the card shows again next time.
function joined() {
  try { return localStorage.getItem(SEEN_KEY) === 'done'; } catch { return false; }
}
function remember() {
  try { localStorage.setItem(SEEN_KEY, 'done'); } catch { /* fine */ }
}

let wired = false;
let shownThisSession = false;

export function initJoin() {
  if (wired) return;
  wired = true;
  $('#join-dismiss')?.addEventListener('click', () => hide());
  $('#join-form')?.addEventListener('submit', submit);
}

export function offerJoin(source = 'after-save') {
  const card = $('#join');
  if (!card || joined() || shownThisSession) return;
  shownThisSession = true;
  card.dataset.source = source;
  card.hidden = false;
  // Bring it into view without stealing focus from the save confirmation.
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function hide() {
  const card = $('#join');
  if (card) card.hidden = true;
}

function setNote(text, isError = false) {
  const note = $('#join-note');
  if (!note) return;
  note.textContent = text;
  note.classList.toggle('err', isError);
}

async function submit(event) {
  event.preventDefault();
  const card = $('#join');
  const email = $('#join-email')?.value ?? '';
  const consent = $('#join-consent')?.checked === true;
  const code = ($('#join-code')?.value ?? '').trim();
  const button = $('#join-submit');

  if (!consent) { setNote('Tick the box and you are on the list.', true); return; }

  const g = getGameday();
  const payload = {
    email,
    consent: true,
    consentText: CONSENT_TEXT,
    game: matchup(g) || null,
    section: $('[data-field="section"]')?.value?.trim() || null,
    // Typing the code shown in the stadium is a claim of being there. It is
    // never inferred from an address or a location.
    attended: Boolean(g.attendanceCode) && code.toUpperCase() === String(g.attendanceCode).toUpperCase(),
    source: card?.dataset.source || 'studio',
  };

  if (button) { button.disabled = true; button.textContent = 'Joining…'; }
  setNote('');
  try {
    const res = await fetch('/api/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote(data.error || 'That did not go through. Try again in a moment.', true);
      return;
    }
    remember();
    setNote(payload.attended ? 'You are on the list — and we have you at the game.' : 'You are on the list.');
    setTimeout(hide, 2200);
  } catch {
    // Offline, blocked, stadium wifi. The wallpaper is already saved; this is
    // the only thing that failed, and saying so plainly beats a spinner.
    setNote('No connection right now. Your wallpaper is saved either way.', true);
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Join the list'; }
  }
}
