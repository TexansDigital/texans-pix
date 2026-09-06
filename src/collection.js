// The fan's collection.
//
// This is the identity moment in the strategy: the download stays free and
// ungated forever, and the ask happens here instead — after someone has made
// something they like and wants to keep it. Never in front of the file.
//
// What gets stored is the *recipe*, not the photograph: template, device,
// surface and the personalisation fields. A fan's own photo never leaves their
// device, so it is never written to shared storage. Preview thumbnails are
// kept in localStorage only, which is per-device and never sent anywhere.

const LOCAL_KEY = 'texans.studio.collection.v1';
const THUMB_KEY = 'texans.studio.thumbs.v1';
const MAX_ITEMS = 60;

let remote = null;
let remoteChecked = false;

// Shared storage when the page has been granted it; otherwise this device only.
async function getRemote() {
  if (remoteChecked) return remote;
  remoteChecked = true;
  try {
    remote = (await window.claude?.use?.('db')) ?? null;
  } catch {
    remote = null;
  }
  return remote;
}

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // private window, blocked storage, or quota
  }
}

export function thumbFor(id) {
  return readLocal(THUMB_KEY)[id] || null;
}

function putThumb(id, dataUrl) {
  const all = readLocal(THUMB_KEY);
  all[id] = dataUrl;
  const ids = Object.keys(all);
  // Thumbnails are the only heavy thing here, so trim oldest first on quota.
  while (ids.length > MAX_ITEMS && !writeLocal(THUMB_KEY, all)) delete all[ids.shift()];
  writeLocal(THUMB_KEY, all);
}

function dropThumb(id) {
  const all = readLocal(THUMB_KEY);
  delete all[id];
  writeLocal(THUMB_KEY, all);
}

export async function saveItem(recipe, thumbDataUrl) {
  const id = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const item = { id, created: Date.now(), ...recipe };

  if (thumbDataUrl) putThumb(id, thumbDataUrl);

  const db = await getRemote();
  if (db) {
    try {
      // data/users/me is private to this viewer, even from the page's owner.
      await db.doc(`data/users/me/wallpapers/${id}`).set(item);
      return { item, where: 'account' };
    } catch {
      // fall through to local
    }
  }
  const local = readLocal(LOCAL_KEY);
  local[id] = item;
  writeLocal(LOCAL_KEY, local);
  return { item, where: 'device' };
}

export async function listItems() {
  const db = await getRemote();
  if (db) {
    try {
      const snap = await db.collection('data/users/me/wallpapers').orderBy('created', 'desc').limit(MAX_ITEMS).get();
      const rows = snap?.docs?.map(d => d.data()) ?? [];
      if (rows.length) return rows;
    } catch {
      // fall through to local
    }
  }
  return Object.values(readLocal(LOCAL_KEY)).sort((a, b) => b.created - a.created).slice(0, MAX_ITEMS);
}

export async function removeItem(id) {
  dropThumb(id);
  const db = await getRemote();
  if (db) {
    try {
      await db.doc(`data/users/me/wallpapers/${id}`).delete();
    } catch {
      // fall through to local
    }
  }
  const local = readLocal(LOCAL_KEY);
  delete local[id];
  writeLocal(LOCAL_KEY, local);
}

// Where the collection actually lives, for honest copy in the UI.
export async function storageKind() {
  return (await getRemote()) ? 'account' : 'device';
}
