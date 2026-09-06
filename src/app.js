import { DEVICES, DEVICE_GROUPS, getDevice } from './devices.js';
import { TEMPLATES, getTemplate } from './templates.js';
import {
  loadFonts, decodeImage, coverRect, coverSlack, makeSampler, clamp, drawGuides, ImageError,
} from './compose.js';
import { saveItem, listItems, removeItem, thumbFor, storageKind } from './collection.js';

const $ = sel => document.querySelector(sel);

const state = {
  device: DEVICES[0],
  surface: 'lock',
  template: TEMPLATES[0],
  image: null,
  imageLabel: '',
  photoLibraryId: null,
  sourceWidth: 0,
  sourceHeight: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  guides: false,
  fields: { headline: '', name: '', number: '', section: '', since: '', kicker: 'WEEK 01' },
};

const marks = {};
const LIBRARY_INDEX = new Map();
const canvas = $('#stage');
const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });

// Desktop has no lock screen, so asking for one would leave the guides and the
// safe band undefined. Everything downstream reads this, never state.surface.
const effectiveSurface = () =>
  state.surface === 'lock' && !state.device.lock ? 'home' : state.surface;

// --- rendering -------------------------------------------------------------

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(state.guides); });
}

function render(withGuides) {
  const { w: W, h: H } = state.device;
  const surface = effectiveSurface();
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  ctx.fillStyle = '#021118';
  ctx.fillRect(0, 0, W, H);

  let rect = null;
  if (state.image) {
    rect = coverRect(state.image, W, H, state.zoom, state.panX, state.panY);
    ctx.drawImage(state.image, rect.x, rect.y, rect.w, rect.h);
  } else {
    placeholder(W, H);
  }

  // Scrims size themselves to the photo. Sampling a 64px proxy of the same
  // geometry keeps that off the full-size canvas, which cost ~15ms a frame.
  const sample = makeSampler(state.image, W, H, rect);

  state.template.draw(ctx, { W, H, device: state.device, surface, fields: state.fields, marks, sample });

  if (withGuides) drawGuides(ctx, W, H, state.device, surface);
}

function placeholder(W, H) {
  ctx.save();
  ctx.fillStyle = '#0a1d27';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = Math.max(2, W * 0.004);
  const inset = W * 0.06;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.restore();
}

// --- photo loading ---------------------------------------------------------

// A big photo takes ~750ms to decode and a small one ~50ms, so without a
// generation guard a fan's second pick loses to their first.
let loadGeneration = 0;

async function useSource(source, label, libraryId = null) {
  const generation = ++loadGeneration;
  setStatus(`Decoding ${label}…`);
  try {
    const { bitmap, sourceWidth, sourceHeight, downscaled } = await decodeImage(source);
    if (generation !== loadGeneration) { bitmap.close?.(); return; }

    state.image?.close?.();
    state.image = bitmap;
    state.imageLabel = label;
    state.photoLibraryId = libraryId;
    state.sourceWidth = sourceWidth;
    state.sourceHeight = sourceHeight;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    $('#zoom').value = '1';
    $('#export').disabled = false;

    // Report the photo's real size, not the post-cap size.
    let note = `${label} — ${sourceWidth} x ${sourceHeight}`;
    if (downscaled) note += ' (scaled down for speed)';
    const upscale = state.device.w / bitmap.width;
    if (upscale > 1.6) {
      setStatus(`${note} — small for this screen, it will look soft`, true);
    } else {
      setStatus(note);
    }
    scheduleRender();
  } catch (err) {
    if (generation !== loadGeneration) return;
    setStatus(err instanceof ImageError ? err.message : 'That photo could not be opened.', true);
    console.error('[studio]', err);
  }
}

async function useLibraryPhoto(entry) {
  try {
    const res = await fetch(entry.file);
    if (!res.ok) throw new ImageError(`Could not load ${entry.file} (${res.status}).`);
    await useSource(await res.blob(), entry.title || entry.id, entry.id);
  } catch (err) {
    setStatus(err instanceof ImageError ? err.message : 'Could not load that photo.', true);
  }
}

function setStatus(text, isError = false) {
  const el = $('#status');
  el.textContent = text;
  el.classList.toggle('err', isError);
}

// --- controls --------------------------------------------------------------

function buildDeviceSelect() {
  const sel = $('#device');
  for (const group of DEVICE_GROUPS) {
    const og = document.createElement('optgroup');
    og.label = group;
    for (const d of DEVICES.filter(x => x.group === group)) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.label} — ${d.w}x${d.h}`;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
  sel.value = state.device.id;
}

function syncSurfaceControls() {
  const lockRadio = document.querySelector('[name="surface"][value="lock"]');
  const noLock = !state.device.lock;
  lockRadio.disabled = noLock;
  lockRadio.closest('label').classList.toggle('off', noLock);
  if (noLock) document.querySelector('[name="surface"][value="home"]').checked = true;
}

function buildTemplateList() {
  const wrap = $('#templates');
  for (const t of TEMPLATES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tpl';
    btn.dataset.id = t.id;
    btn.setAttribute('aria-pressed', String(t.id === state.template.id));
    btn.innerHTML = `<span class="tpl-name">${t.label}</span><span class="tpl-note">${t.note}</span>`;
    btn.addEventListener('click', () => {
      state.template = t;
      wrap.querySelectorAll('.tpl').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === t.id)));
      scheduleRender();
    });
    wrap.appendChild(btn);
  }
}

async function buildLibrary() {
  const grid = $('#library');
  try {
    const res = await fetch('library/manifest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const manifest = await res.json();
    const photos = manifest.photos || [];
    grid.innerHTML = ''; // clear the loading line before anything is appended
    if (!photos.length) {
      grid.innerHTML = '<p class="empty">No photos in the library yet. Drop this week\'s files into <code>library/photos/</code> and run <code>npm run library</code>.</p>';
      return;
    }
    $('#lib-count').textContent = `${photos.length} this week`;
    for (const entry of photos) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb';
      btn.title = entry.title || entry.id;
      const img = document.createElement('img');
      img.src = entry.thumb || entry.file;
      img.alt = entry.title || entry.id;
      img.loading = 'lazy';
      btn.appendChild(img);
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.thumb').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        useLibraryPhoto(entry);
      });
      LIBRARY_INDEX.set(entry.id, entry);
      grid.appendChild(btn);
    }
  } catch {
    grid.innerHTML = '<p class="empty">Library manifest missing. Run <code>npm run library</code> to build it.</p>';
  }
}

function wireFields() {
  for (const key of Object.keys(state.fields)) {
    const input = document.querySelector(`[data-field="${key}"]`);
    if (!input) continue;
    input.value = state.fields[key];
    input.addEventListener('input', () => {
      state.fields[key] = input.value;
      scheduleRender();
    });
  }
}

function wirePanZoom() {
  let dragging = false;
  let startX = 0, startY = 0, startPanX = 0, startPanY = 0;
  let gainX = 0, gainY = 0;

  canvas.addEventListener('pointerdown', e => {
    if (!state.image) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY;
    startPanX = state.panX; startPanY = state.panY;

    // Pan is a fraction of the available slack, so the pointer delta has to be
    // divided by that slack measured in *displayed* pixels. Dividing by half
    // the preview instead made the gain swing from 0.2x to 51x with the photo
    // aspect and zoom.
    const rect = canvas.getBoundingClientRect();
    const shown = rect.width / canvas.width || 1;
    const slack = coverSlack(state.image, state.device.w, state.device.h, state.zoom);
    gainX = slack.x * shown;
    gainY = slack.y * shown;
  });

  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    if (gainX > 0.5) state.panX = clamp(startPanX + (e.clientX - startX) / gainX, -1, 1);
    if (gainY > 0.5) state.panY = clamp(startPanY + (e.clientY - startY) / gainY, -1, 1);
    scheduleRender();
  });

  const end = e => {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  $('#zoom').addEventListener('input', e => {
    state.zoom = Number(e.target.value);
    scheduleRender();
  });
}

function wireFileInput() {
  const input = $('#file');
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) useSource(file, file.name);
    input.value = ''; // so picking the same file twice still fires
  });
  $('#pick').addEventListener('click', () => input.click());

  const drop = $('#dropzone');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => {
    e.preventDefault(); drop.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => {
    e.preventDefault(); drop.classList.remove('over');
  }));
  drop.addEventListener('drop', e => {
    const file = e.dataTransfer?.files?.[0];
    if (file) useSource(file, file.name);
  });
}

async function exportWallpaper() {
  if (!state.image) {
    setStatus('Pick a photo first.', true);
    return;
  }
  // Guides are preview-only: re-render clean before reading the canvas.
  render(false);
  const { w, h } = state.device;
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.94));
  if (!blob) { setStatus('Export failed.', true); return; }
  const stamp = `${state.device.id}-${effectiveSurface()}-${state.template.id}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `texans-${stamp}-${w}x${h}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  setStatus(`Exported ${w} x ${h} — ${(blob.size / 1024).toFixed(0)} KB`);
  if (state.guides) scheduleRender();
}

// --- collection ------------------------------------------------------------

function currentRecipe() {
  return {
    template: state.template.id,
    device: state.device.id,
    surface: effectiveSurface(),
    fields: { ...state.fields },
    zoom: state.zoom, panX: state.panX, panY: state.panY,
    // Only a library id is portable. A fan's own photo stays on their device,
    // so the recipe records that it was theirs and nothing more.
    photo: state.photoLibraryId ? { kind: 'library', id: state.photoLibraryId } : { kind: 'own' },
    label: state.imageLabel,
  };
}

function previewThumb() {
  try {
    const t = document.createElement('canvas');
    t.width = 150;
    t.height = Math.round(150 * canvas.height / canvas.width);
    t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

async function keepCurrent() {
  if (!state.image) { setStatus('Make something first.', true); return; }
  render(false);
  const { where } = await saveItem(currentRecipe(), previewThumb());
  setStatus(where === 'account' ? 'Kept in your collection.' : 'Kept on this device.');
  if (state.guides) scheduleRender();
  await renderCollection();
}

async function restore(item) {
  state.template = getTemplate(item.template);
  state.device = getDevice(item.device);
  state.surface = item.surface;
  Object.assign(state.fields, item.fields || {});

  $('#device').value = state.device.id;
  $('#dims').textContent = `${state.device.w} x ${state.device.h}`;
  const radio = document.querySelector(`[name="surface"][value="${state.surface}"]`);
  if (radio) radio.checked = true;
  syncSurfaceControls();
  document.querySelectorAll('.tpl').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.id === state.template.id)));
  for (const [key, value] of Object.entries(state.fields)) {
    const input = document.querySelector(`[data-field="${key}"]`);
    if (input) input.value = value;
  }

  if (item.photo?.kind === 'library') {
    const entry = LIBRARY_INDEX.get(item.photo.id);
    if (entry) { await useLibraryPhoto(entry); }
    else setStatus('That photo is no longer in this week\'s library.', true);
  } else {
    setStatus('Pick your photo again — your own photos stay on your device.');
  }
  state.zoom = item.zoom ?? 1;
  state.panX = item.panX ?? 0;
  state.panY = item.panY ?? 0;
  $('#zoom').value = String(state.zoom);
  scheduleRender();
}

async function renderCollection() {
  const grid = $('#collection');
  const items = await listItems();
  grid.innerHTML = '';
  for (const item of items) {
    const cell = document.createElement('div');
    cell.className = 'keep';
    const open = document.createElement('button');
    open.type = 'button';
    open.style.cssText = 'all:unset;display:block;width:100%;height:100%;cursor:pointer';
    open.title = `Open ${item.label || item.template}`;
    const thumb = thumbFor(item.id);
    if (thumb) {
      const img = document.createElement('img');
      img.src = thumb;
      img.alt = item.label || item.template;
      open.appendChild(img);
    }
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = item.template;
    open.appendChild(meta);
    open.addEventListener('click', () => restore(item));
    const drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'drop';
    drop.textContent = '\u00d7';
    drop.title = 'Remove';
    drop.addEventListener('click', async e => {
      e.stopPropagation();
      await removeItem(item.id);
      await renderCollection();
    });
    cell.append(open, drop);
    grid.appendChild(cell);
  }
}

async function loadMarks() {
  const load = src => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  // Two variants: the badge sits outside the scrim, so it picks whichever
  // reads against the photo behind it rather than vanishing into a bright frame.
  marks.bullhead = await load('assets/logos/bullhead-on-dark.png');
  marks.bullheadRed = await load('assets/logos/bullhead-red.png');
  marks.wordmark = await load('assets/logos/wordmark-red-white.png');
}

// --- boot ------------------------------------------------------------------

async function init() {
  buildDeviceSelect();
  buildTemplateList();
  wireFields();
  wirePanZoom();
  wireFileInput();
  syncSurfaceControls();

  $('#device').addEventListener('change', e => {
    state.device = getDevice(e.target.value);
    $('#dims').textContent = `${state.device.w} x ${state.device.h}`;
    syncSurfaceControls();
    scheduleRender();
  });
  document.querySelectorAll('[name="surface"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) state.surface = radio.value;
      scheduleRender();
    });
  });
  $('#guides').addEventListener('change', e => {
    state.guides = e.target.checked;
    scheduleRender();
  });
  $('#export').addEventListener('click', exportWallpaper);
  $('#keep').addEventListener('click', keepCurrent);
  $('#export').disabled = true;
  $('#dims').textContent = `${state.device.w} x ${state.device.h}`;

  const fonts = await loadFonts();
  const warnings = [];
  if (fonts.display.length < 4) warnings.push(`${4 - fonts.display.length} of 4 display cuts missing`);
  if (!fonts.mono) warnings.push('the mono face did not load');
  await loadMarks();
  scheduleRender();
  if (warnings.length) setStatus(`Type will fall back — ${warnings.join(', ')}.`, true);
  else setStatus('Pick a photo to start');
  buildLibrary();
  storageKind().then(kind => {
    $('#coll-where').textContent = kind === 'account'
      ? 'Kept to your account, so they follow you between devices.'
      : 'Kept on this device. Sign in later and they follow you everywhere.';
  });
  renderCollection();
}

init();

// Exposed for the QA harness to drive the app without clicking through the UI.
window.__studio = {
  state,
  render,
  useSource,
  effectiveSurface,
  setDevice: id => { state.device = getDevice(id); syncSurfaceControls(); scheduleRender(); },
  setTemplate: id => { state.template = getTemplate(id); scheduleRender(); },
  setSurface: s => { state.surface = s; scheduleRender(); },
  setFields: patch => { Object.assign(state.fields, patch); scheduleRender(); },
  keepCurrent, renderCollection,
};
