import { DEVICES, DEVICE_GROUPS, getDevice, detectDevice, SHARE_SQUARE } from './devices.js';
import { TEMPLATES, getTemplate } from './templates.js';
import {
  loadFonts, decodeImage, coverRect, coverSlack, makeSampler, clamp, drawGuides, ImageError,
} from './compose.js';
import { saveItem, listItems, removeItem, thumbFor, storageKind } from './collection.js';
import { loadGameday, getGameday, defaultKicker } from './gameday.js';

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
  fields: { headline: '', name: '', number: '', section: '', row: '', seat: '', since: '', kicker: '' },
  wallpaperDevice: null,
};

const marks = {};
const LIBRARY_INDEX = new Map();
const canvas = $('#stage');
const ctx = canvas.getContext('2d', { alpha: false });

const effectiveSurface = () =>
  state.surface === 'lock' && !state.device.lock ? 'home' : state.surface;

const isShareMode = () => state.surface === 'share';

// Share swaps the canvas to a square card and back, remembering which handset
// the fan was on so the wallpaper is unchanged when they switch back.
function applySurface(next) {
  const wasShare = isShareMode();
  state.surface = next;
  if (next === 'share' && !wasShare) {
    state.wallpaperDevice = state.device.id;
    state.device = getDevice(SHARE_SQUARE);
    // A card should carry the matchup, which the gameday templates do outright
    // and the frames do through their fallback line. Anything else gets swapped
    // for My Seat — but a fan who chose a frame keeps it rather than losing it
    // on the way to the share sheet.
    const carriesGameday = state.template.gameday === true || state.template.frame === true;
    if (!carriesGameday) state.template = getTemplate('my-seat');
  } else if (next !== 'share' && wasShare) {
    state.device = getDevice(state.wallpaperDevice || state.device.id);
  }
  document.getElementById('app').classList.toggle('share-mode', next === 'share');
  $('#share').hidden = next !== 'share';
  $('#export').textContent = next === 'share' ? 'Save the card' : 'Download wallpaper';
  syncTemplateButtons();
  setDeviceLabel();
  syncSurfaceControls();
  scheduleRender();
}

function syncTemplateButtons() {
  document.querySelectorAll('.tpl').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.id === state.template.id)));
}

// --- rendering -------------------------------------------------------------

// The preview is drawn at preview resolution, not export resolution. Painting
// the full 3.8-megapixel export surface on every pointermove cost 161ms a frame
// on a phone-class CPU — about 6fps — to update a 184px picture. Templates size
// everything as a fraction of W and H, so a smaller surface is identical bar
// the pixel count.
function previewSize() {
  const box = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const aspect = state.device.w / state.device.h;
  const availW = Math.max(1, box.width - 12);
  const availH = Math.max(1, box.height - 12);
  let cssW = availW;
  let cssH = cssW / aspect;
  if (cssH > availH) { cssH = availH; cssW = cssH * aspect; }
  return {
    cssW, cssH,
    w: Math.max(2, Math.round(Math.min(cssW * dpr, state.device.w))),
    h: Math.max(2, Math.round(Math.min(cssH * dpr, state.device.h))),
  };
}

// One draw path, any surface size. Used by the preview and by the export.
function paint(target, W, H, withGuides, { overlay = true } = {}) {
  target.fillStyle = '#021118';
  target.fillRect(0, 0, W, H);

  let rect = null;
  if (state.image) {
    rect = coverRect(state.image, W, H, state.zoom, state.panX, state.panY);
    target.drawImage(state.image, rect.x, rect.y, rect.w, rect.h);
  } else {
    target.save();
    target.fillStyle = '#0a1d27';
    target.fillRect(0, 0, W, H);
    target.strokeStyle = 'rgba(255,255,255,.14)';
    target.lineWidth = Math.max(1, W * 0.004);
    const inset = W * 0.06;
    target.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    target.restore();
  }

  const sample = makeSampler(state.image, W, H, rect);
  // `overlay: false` paints the photograph alone. The frame templates are
  // checked by rendering both and differencing the middle, which only means
  // anything if the photo path is byte-identical either way — so it is the
  // same function, not a second one that could drift from it.
  if (overlay) {
    state.template.draw(target, {
      W, H, device: state.device, surface: effectiveSurface(), fields: state.fields, marks, sample,
    });
  }
  if (withGuides) drawGuides(target, W, H, state.device, effectiveSurface());
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

// `render(false)` is the documented way to get a guide-free preview canvas
// before reading pixels off it. It took no argument, so it silently ignored one
// and painted whatever state.guides happened to be — a caller following the
// contract got a canvas full of guide ink and no way to tell.
function render(withGuides = state.guides) {
  const { w, h, cssW, cssH } = previewSize();
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.style.width = `${Math.round(cssW)}px`;
  canvas.style.height = `${Math.round(cssH)}px`;
  paint(ctx, w, h, withGuides);
}

// Full-resolution surface, built only when the fan actually downloads.
function renderExport() {
  const { w, h } = state.device;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  paint(out.getContext('2d', { alpha: false }), w, h, false);
  return out;
}

// --- photo loading ---------------------------------------------------------

let loadGeneration = 0;

async function useSource(source, label, libraryId = null) {
  const generation = ++loadGeneration;
  setStatus(`Opening ${label}…`);
  try {
    const { bitmap, sourceWidth, sourceHeight, downscaled } = await decodeImage(source);
    if (generation !== loadGeneration) { bitmap.close?.(); return; }

    state.image?.close?.();
    state.image = bitmap;
    state.imageLabel = label;
    state.photoLibraryId = libraryId;
    state.sourceWidth = sourceWidth;
    state.sourceHeight = sourceHeight;
    resetFraming();
    $('#export').disabled = false;
    $('#app').classList.add('has-photo');

    const upscale = state.device.w / bitmap.width;
    if (upscale > 1.6) setStatus(`${label} — small for this screen, it will look soft`, true);
    else setStatus(downscaled ? `${label} — ${sourceWidth} x ${sourceHeight}` : label);
    scheduleRender();
  } catch (err) {
    if (generation !== loadGeneration) return;
    setStatus(err instanceof ImageError ? err.message : 'That photo could not be opened.', true);
    console.error('[studio]', err);
  }
}

async function useLibraryPhoto(entry) {
  try {
    // Prefer the display derivative: the full original is up to 2.4MB, which is
    // 48 seconds on a congested stadium connection.
    const src = entry.display || entry.file;
    setStatus(`Loading ${entry.title || entry.id}…`);
    const res = await fetch(src);
    if (!res.ok) throw new ImageError(`Could not load that photo (${res.status}).`);
    await useSource(await res.blob(), entry.title || entry.id, entry.id);
    if (entry.tonight && entry.moment) {
      state.fields.kicker = entry.moment;
      const input = document.querySelector('[data-field="kicker"]');
      if (input) input.value = entry.moment;
      scheduleRender();
    }
  } catch (err) {
    setStatus(err instanceof ImageError ? err.message : 'Could not load that photo.', true);
  }
}

function setStatus(text, isError = false) {
  const el = $('#status');
  el.textContent = text;
  el.classList.toggle('err', isError);
}

function resetFraming() {
  state.zoom = 1; state.panX = 0; state.panY = 0;
}

// --- controls --------------------------------------------------------------

function setDeviceLabel() {
  $('#dims').textContent = `${state.device.w} × ${state.device.h}`;
}

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
  const lock = document.querySelector('[name="surface"][value="lock"]');
  const noLock = !state.device.lock;
  lock.disabled = noLock;
  if (noLock) document.querySelector('[name="surface"][value="home"]').checked = true;
}

function buildTemplateList() {
  const wrap = $('#templates');
  // Eleven looks is more than a phone can scan as one run. Split them by what
  // they do to the photograph: frames brand the edges and leave the middle
  // alone, the rest set type across it.
  const groups = [
    ['Frames — the photo stays clear', TEMPLATES.filter(t => t.frame)],
    ['Type over the photo', TEMPLATES.filter(t => !t.frame)],
  ];
  for (const [heading, list] of groups) {
    if (!list.length) continue;
    const h = document.createElement('p');
    h.className = 'tpl-group';
    h.textContent = heading;
    wrap.appendChild(h);
    buildTemplateGroup(wrap, list);
  }
}

function buildTemplateGroup(wrap, list) {
  for (const t of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tpl';
    btn.dataset.id = t.id;
    btn.setAttribute('aria-pressed', String(t.id === state.template.id));
    btn.innerHTML = `<span class="tpl-name"></span><span class="tpl-note"></span>`;
    btn.querySelector('.tpl-name').textContent = t.label;
    btn.querySelector('.tpl-note').textContent = t.note;
    btn.addEventListener('click', () => {
      state.template = t;
      wrap.querySelectorAll('.tpl').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.id === t.id)));
      scheduleRender();
    });
    wrap.appendChild(btn);
  }
}

function makeThumb(entry, grid) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'thumb';
  btn.title = entry.moment || entry.title || entry.id;
  const img = document.createElement('img');
  img.src = entry.thumb || entry.file;
  img.alt = entry.title || entry.id;
  img.loading = 'lazy';
  btn.appendChild(img);
  if (entry.tonight && entry.moment) {
    const m = document.createElement('span');
    m.className = 'moment';
    m.textContent = entry.moment;
    btn.appendChild(m);
  }
  btn.addEventListener('click', () => {
    document.querySelectorAll('.thumb').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    useLibraryPhoto(entry);
  });
  LIBRARY_INDEX.set(entry.id, entry);
  grid.appendChild(btn);
}

async function buildLibrary() {
  const grid = $('#library');
  const live = $('#tonight');
  try {
    const res = await fetch('library/manifest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const photos = (await res.json()).photos || [];
    grid.innerHTML = '';
    live.innerHTML = '';

    const tonight = photos.filter(p => p.tonight);
    const season = photos.filter(p => !p.tonight);

    // The frame from two minutes ago leads; the season shelf is below it.
    $('#tonight-block').hidden = tonight.length === 0;
    $('#tonight-count').textContent = tonight.length ? `${tonight.length} from this game` : '';
    for (const entry of tonight) makeThumb(entry, live);

    if (!season.length && !tonight.length) {
      grid.innerHTML = '<p class="empty">No photos yet. Drop this week\'s files into <code>library/photos/</code> and run <code>npm run library</code>.</p>';
      return;
    }
    $('#lib-count').textContent = season.length ? `${season.length} this week` : '';
    for (const entry of season) makeThumb(entry, grid);
  } catch {
    grid.innerHTML = '<p class="empty">Library manifest missing. Run <code>npm run library</code>.</p>';
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
  const more = $('#more-fields');
  more.addEventListener('click', () => {
    const extra = $('#extra-fields');
    const open = extra.hidden;
    extra.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    more.textContent = open ? 'Fewer details' : 'More details';
  });
}

function wireTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  tabs.forEach(tab => tab.addEventListener('click', () => {
    tabs.forEach(t => t.setAttribute('aria-selected', String(t === tab)));
    document.querySelectorAll('.pane').forEach(p => {
      p.hidden = p.dataset.pane !== tab.dataset.tab;
      p.classList.toggle('on', !p.hidden);
    });
    if (tab.dataset.tab === 'saved') renderCollection();
  }));
}

// --- gestures --------------------------------------------------------------

function wireGestures() {
  const pointers = new Map();
  let panStart = null;
  let pinchStart = null;
  let lastTap = 0;

  const slackInCss = () => {
    if (!state.image) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const shown = rect.width / canvas.width || 1;
    const slack = coverSlack(state.image, canvas.width, canvas.height, state.zoom);
    return { x: slack.x * shown, y: slack.y * shown };
  };

  const dist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener('pointerdown', e => {
    if (!state.image) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);

    if (pointers.size === 1) {
      const now = Date.now();
      if (now - lastTap < 320) { resetFraming(); scheduleRender(); setStatus('Framing reset.'); }
      lastTap = now;
      const gain = slackInCss();
      panStart = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY, gain };
    } else if (pointers.size === 2) {
      panStart = null;
      pinchStart = { d: dist(), zoom: state.zoom };
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2 && pinchStart) {
      // Pinch is the gesture people reach for on a photo. Previously both
      // fingers hit the pan handler and the last one won, so a pinch slammed
      // the photo into a corner and never changed the zoom.
      e.preventDefault();
      const d = dist();
      if (pinchStart.d > 8) {
        state.zoom = clamp(pinchStart.zoom * (d / pinchStart.d), 1, 3);
        scheduleRender();
      }
      return;
    }

    if (panStart) {
      const { gain } = panStart;
      // Only claim the gesture once the photo can actually move; otherwise let
      // the page have it, so a swipe on the preview is never a dead zone.
      if (gain.x < 0.5 && gain.y < 0.5) return;
      e.preventDefault();
      if (gain.x > 0.5) state.panX = clamp(panStart.panX + (e.clientX - panStart.x) / gain.x, -1, 1);
      if (gain.y > 0.5) state.panY = clamp(panStart.panY + (e.clientY - panStart.y) / gain.y, -1, 1);
      scheduleRender();
    }
  });

  const end = e => {
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) panStart = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  $('#reset-btn').addEventListener('click', () => {
    resetFraming(); scheduleRender(); setStatus('Framing reset.');
  });
}

function wireFileInput() {
  const input = $('#file');
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) useSource(file, file.name);
    input.value = '';
  });
  $('#pick').addEventListener('click', () => input.click());
  $('#start-pick').addEventListener('click', () => input.click());
  $('#start-lib').addEventListener('click', () => {
    // Reveal the app on the Photo tab with the library in view.
    $('#app').classList.add('has-photo', 'browsing');
    document.querySelector('.tab[data-tab="photo"]').click();
    $('#library').scrollIntoView({ block: 'nearest' });
  });

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
  if (!state.image) { setStatus('Pick a photo first.', true); return; }
  const { w, h } = state.device;
  setStatus('Building your wallpaper…');
  const out = renderExport();
  const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.94));
  if (!blob) { setStatus('Export failed.', true); return; }

  const filename = `texans-${state.device.id}-${effectiveSurface()}-${state.template.id}-${w}x${h}.jpg`;
  let downloads = null;
  try { downloads = await window.claude?.use?.('downloads') ?? null; } catch { downloads = null; }

  if (downloads) {
    try {
      await downloads.save({ filename, data: blob });
      setStatus(`Saved ${w} × ${h}`);
    } catch (err) {
      if (err?.code === 'declined') setStatus('Save cancelled.');
      else setStatus('This view cannot save files.', true);
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus(`Downloaded ${w} × ${h} — ${(blob.size / 1024).toFixed(0)} KB`);
  }
}

// --- collection ------------------------------------------------------------

function currentRecipe() {
  return {
    template: state.template.id,
    device: state.device.id,
    surface: effectiveSurface(),
    fields: { ...state.fields },
    zoom: state.zoom, panX: state.panX, panY: state.panY,
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
  } catch { return null; }
}

async function keepCurrent() {
  if (!state.image) { setStatus('Make something first.', true); return; }
  const { where } = await saveItem(currentRecipe(), previewThumb());
  setStatus(where === 'account' ? 'Kept in your collection.' : 'Kept on this device.');
  await renderCollection();
}

async function restore(item) {
  state.template = getTemplate(item.template);
  state.device = getDevice(item.device);
  state.surface = item.surface;
  Object.assign(state.fields, item.fields || {});

  $('#device').value = state.device.id;
  setDeviceLabel();
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
    if (entry) await useLibraryPhoto(entry);
    else setStatus('That photo is no longer in this week\'s library.', true);
  } else {
    setStatus('Pick your photo again — your own photos stay on your device.');
  }
  state.zoom = item.zoom ?? 1;
  state.panX = item.panX ?? 0;
  state.panY = item.panY ?? 0;
  scheduleRender();
}

async function renderCollection() {
  const grid = $('#collection');
  const items = await listItems();
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<p class="empty">Nothing saved yet.</p>';
    return;
  }
  for (const item of items) {
    const cell = document.createElement('div');
    cell.className = 'keep';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'open';
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
    drop.textContent = '×';
    drop.title = 'Remove';
    drop.addEventListener('click', async e => {
      e.stopPropagation();
      // No undo behind this, so it asks. It used to be a 22px corner tap.
      if (!confirm('Remove this wallpaper from your collection?')) return;
      await removeItem(item.id);
      await renderCollection();
    });
    cell.append(open, drop);
    grid.appendChild(cell);
  }
}

async function shareCard() {
  if (!state.image) { setStatus('Pick a photo first.', true); return; }
  const g = getGameday();
  const out = renderExport();
  const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) { setStatus('Could not build the card.', true); return; }

  const seat = state.fields.section
    ? `Section ${state.fields.section}` : '';
  const text = [seat, [g.week, g.venue].filter(Boolean).join(' at '), g.hashtag]
    .filter(Boolean).join(' \u2605 ');
  const file = new File([blob], `texans-${g.week || 'gameday'}-seat.jpg`.replace(/\s+/g, '-').toLowerCase(), { type: 'image/jpeg' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      setStatus('Sent.');
    } catch (err) {
      if (err?.name !== 'AbortError') setStatus('Could not open the share sheet.', true);
    }
    return;
  }
  // Desktop and older browsers have no share sheet; fall back to a download.
  setStatus('Sharing is not available here — saving instead.');
  exportWallpaper();
}

async function loadMarks() {
  const load = src => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  [marks.bullhead, marks.bullheadRed] = await Promise.all([
    load('assets/logos/bullhead-on-dark.png'),
    load('assets/logos/bullhead-red.png'),
  ]);
}

// --- boot ------------------------------------------------------------------

async function init() {
  // Preselect the fan's actual handset. Everyone used to start on an iPhone
  // 16 Pro Max and had to find themselves in a list of sixteen.
  const detected = detectDevice();
  if (detected) state.device = detected.device;

  buildDeviceSelect();
  buildTemplateList();
  wireFields();
  wireTabs();
  wireGestures();
  wireFileInput();
  syncSurfaceControls();
  setDeviceLabel();

  $('#device').addEventListener('change', e => {
    state.device = getDevice(e.target.value);
    setDeviceLabel();
    syncSurfaceControls();
    scheduleRender();
  });
  $('#device-btn').addEventListener('click', () => $('#device-sheet').showModal());
  document.querySelectorAll('[name="surface"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) applySurface(radio.value);
    });
  });
  $('#guides-btn').addEventListener('click', e => {
    state.guides = !state.guides;
    e.currentTarget.setAttribute('aria-pressed', String(state.guides));
    scheduleRender();
  });
  $('#export').addEventListener('click', exportWallpaper);
  $('#share').addEventListener('click', shareCard);
  $('#keep').addEventListener('click', keepCurrent);
  $('#export').disabled = true;

  new ResizeObserver(() => scheduleRender()).observe(canvas.parentElement);
  window.addEventListener('orientationchange', () => setTimeout(scheduleRender, 250));

  // First paint before the fonts and marks land, so the fan sees the frame
  // immediately rather than after 600KB of assets.
  scheduleRender();
  buildLibrary();

  const g = await loadGameday();
  if (!state.fields.kicker) {
    state.fields.kicker = defaultKicker(g);
    const input = document.querySelector('[data-field="kicker"]');
    if (input) input.value = state.fields.kicker;
  }
  if (g.week) {
    const el = document.querySelector('.start-kicker');
    if (el) el.textContent = [g.week, g.opponentShort && `vs ${g.opponentShort}`].filter(Boolean).join(' // ');
  }

  const fonts = await loadFonts();
  await loadMarks();
  scheduleRender();

  const warnings = [];
  if (fonts.display.length < 4) warnings.push('display type is falling back');
  if (!fonts.mono) warnings.push('the mono face did not load');
  if (warnings.length) setStatus(warnings.join(', '), true);
  else if (detected) {
    setStatus(detected.exact ? 'Pick a photo to start' : 'Pick a photo to start');
  }

  storageKind().then(kind => {
    $('#coll-where').textContent = kind === 'account'
      ? 'Kept to your account, so they follow you between devices.'
      : 'Kept on this device. Sign in later and they follow you everywhere.';
  });
}

init();

// Exposed so harnesses can drive the app without clicking through the UI.
window.__studio = {
  state, render, paint, useSource, effectiveSurface, previewSize, renderExport,
  templates: TEMPLATES,
  setDevice: id => { state.device = getDevice(id); $('#device').value = id; setDeviceLabel(); syncSurfaceControls(); scheduleRender(); },
  setTemplate: id => { state.template = getTemplate(id); scheduleRender(); },
  setSurface: s => { state.surface = s; scheduleRender(); },
  setFields: patch => { Object.assign(state.fields, patch); scheduleRender(); },
  setTab: name => document.querySelector(`.tab[data-tab="${name}"]`)?.click(),
  applySurface, isShareMode, shareCard,
  keepCurrent, renderCollection,
};
