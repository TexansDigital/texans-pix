import { DEVICES, DEVICE_GROUPS, getDevice } from './devices.js';
import { TEMPLATES, getTemplate } from './templates.js';
import {
  loadFonts, decodeImage, coverRect, clamp, drawGuides, ImageError,
} from './compose.js';

const $ = sel => document.querySelector(sel);

const state = {
  device: DEVICES[0],
  surface: 'lock',
  template: TEMPLATES[0],
  image: null,
  imageLabel: '',
  zoom: 1,
  panX: 0,
  panY: 0,
  guides: false,
  fields: { headline: '', name: '', number: '', section: '', since: '', kicker: 'WEEK 01' },
};

const marks = {};
const canvas = $('#stage');
const ctx = canvas.getContext('2d', { alpha: false });

// --- rendering -------------------------------------------------------------

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(state.guides); });
}

function render(withGuides) {
  const { w: W, h: H } = state.device;
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  ctx.fillStyle = '#021118';
  ctx.fillRect(0, 0, W, H);

  if (state.image) {
    const r = coverRect(state.image, W, H, state.zoom, state.panX, state.panY);
    ctx.drawImage(state.image, r.x, r.y, r.w, r.h);
  } else {
    placeholder(W, H);
  }

  state.template.draw(ctx, {
    W, H, device: state.device, surface: state.surface, fields: state.fields, marks,
  });

  if (withGuides) drawGuides(ctx, W, H, state.device, state.surface);
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

async function useSource(source, label) {
  setStatus('Decoding photo…');
  try {
    const bitmap = await decodeImage(source);
    if (state.image && state.image.close) state.image.close();
    state.image = bitmap;
    state.imageLabel = label;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    $('#zoom').value = '1';
    setStatus(`${label} — ${bitmap.width} x ${bitmap.height}`);
    scheduleRender();
  } catch (err) {
    const message = err instanceof ImageError ? err.message : 'That photo could not be opened.';
    setStatus(message, true);
    console.error('[studio]', err);
  }
}

async function useLibraryPhoto(entry) {
  try {
    const res = await fetch(entry.file);
    if (!res.ok) throw new ImageError(`Could not load ${entry.file} (${res.status}).`);
    await useSource(await res.blob(), entry.title || entry.id);
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
      grid.appendChild(btn);
    }
  } catch (err) {
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

  canvas.addEventListener('pointerdown', e => {
    if (!state.image) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY;
    startPanX = state.panX; startPanY = state.panY;
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    // Pan is normalised -1..1 across the available slack, so translate the
    // pointer delta by the displayed size rather than the canvas pixel size.
    state.panX = clamp(startPanX + (e.clientX - startX) / (rect.width / 2), -1, 1);
    state.panY = clamp(startPanY + (e.clientY - startY) / (rect.height / 2), -1, 1);
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
  // Guides are preview-only: re-render clean before reading the canvas.
  render(false);
  const { w, h } = state.device;
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.94));
  if (!blob) { setStatus('Export failed.', true); return; }
  const stamp = `${state.device.id}-${state.surface}-${state.template.id}`;
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

async function loadMarks() {
  const load = src => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  marks.bullhead = await load('assets/logos/bullhead-on-dark.png');
  marks.wordmark = await load('assets/logos/wordmark-red-white.png');
}

// --- boot ------------------------------------------------------------------

async function init() {
  buildDeviceSelect();
  buildTemplateList();
  wireFields();
  wirePanZoom();
  wireFileInput();

  $('#device').addEventListener('change', e => {
    state.device = getDevice(e.target.value);
    $('#dims').textContent = `${state.device.w} x ${state.device.h}`;
    scheduleRender();
  });
  document.querySelectorAll('[name="surface"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.surface = radio.value;
      scheduleRender();
    });
  });
  $('#guides').addEventListener('change', e => {
    state.guides = e.target.checked;
    scheduleRender();
  });
  $('#export').addEventListener('click', exportWallpaper);

  $('#dims').textContent = `${state.device.w} x ${state.device.h}`;

  const loaded = await loadFonts();
  if (loaded.length < 4) {
    setStatus(`Only ${loaded.length} of 4 display cuts loaded — type will fall back.`, true);
  }
  await loadMarks();
  scheduleRender();
  buildLibrary();
}

init();

// Exposed for the QA harness to drive the app without clicking through the UI.
window.__studio = {
  state,
  render,
  useSource,
  setDevice: id => { state.device = getDevice(id); scheduleRender(); },
  setTemplate: id => { state.template = getTemplate(id); scheduleRender(); },
  setSurface: s => { state.surface = s; scheduleRender(); },
  setFields: patch => { Object.assign(state.fields, patch); scheduleRender(); },
};
