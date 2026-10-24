// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, BAND_LABELS, C, dbSum } from '../acoustics/bands.js';
import { MATERIALS, material } from '../acoustics/materials.js';
import { buildRoom, fromFrame, inFrame } from '../acoustics/room.js';
import { roomImages } from '../acoustics/images.js';
import { FAVOURABLE_RATIOS, bonello, dimensionGrid, ituBs1116, keepBest, modeList, scoreDimensions, steps } from '../acoustics/modalDistribution.js';
import { ABS_DEV_MAX_HZ, sbirDeviation, sbirFreqs, searchPositions } from '../acoustics/sbir.js';
import { FORMULAS, RT_TARGETS, absorberAreaFor, applyAbsorber, rtFormulas, rtTarget } from '../acoustics/reverbTargets.js';

/**
 * ACOUSTIC X (CLASSIC)
 *
 * In the style of Pilchner-Schoustal's 1998 Windows 95 room-acoustics program
 * (reviewed in Sound On Sound, December 1998) — not their software, none of
 * their code or artwork: the same four questions it asked, laid out the way
 * its windows laid them out, answered by this app's own acoustics.
 *
 *   MODAL RESPONSE   how the box's modes spread (modalDistribution.js), the
 *                    Bonello check and a dimension optimiser.
 *   SBIR             a speaker's boundary interference at the listener
 *                    (sbir.js) and a search for the placement that has least.
 *   RAY TRACING      the early reflections by surface and by time. Done with
 *                    image sources, exact for a box; the ray angles are kept
 *                    for the classic layout and only feed the Total Traces readout.
 *   REVERB TIME      six surfaces, four formulas, a target by room type, and
 *                    the area of absorber that hits it (reverbTargets.js).
 *   CALCULATOR       the bench sums: inverse square, dB addition, wavelength,
 *                    comb-filter notches.
 *
 * THE CLASSIC MODEL. Like the original, these windows think in a plain box:
 * L front-to-back, W left-to-right, H high, six surfaces with one material
 * each. Positions are CLASSIC coordinates — X from the left wall, Y from the
 * front wall, Z above the floor. Every window opens on the room being
 * designed (engine.out.room: its working-space L × W × H, its face
 * materials, the speaker pair and the mix mic, mapped through the room's
 * front frame), and stays LINKED to it — redrawn as the room changes — until
 * an input is edited for a what-if. "↻ From room" links it again. Patches
 * painted in the CAD are not part of the classic model.
 *
 * All the windows share that one model, so a dimension typed into one is the
 * dimension every other one shows. Metres inside; feet or metres on screen.
 */

const FT = 3.28084;
const FACES6 = ['floor', 'ceiling', 'front', 'back', 'left', 'right'];
const FACE_LABEL = { floor: 'Floor', ceiling: 'Ceiling', front: 'Front wall', back: 'Back wall', left: 'Left wall', right: 'Right wall' };
export const ACX_LABEL = "Acoustic X (classic) — in the style of Pilchner-Schoustal's 1998 program";
const SVG = 'http://www.w3.org/2000/svg';
const FONT = '10px "MS Sans Serif", Tahoma, "Microsoft Sans Serif", Arial, sans-serif';

// ── tiny DOM kit ───────────────────────────────────────────────────────────

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'for') el.htmlFor = v;
    else if (k in el && !k.startsWith('data-')) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
const group = (legend, ...kids) => h('fieldset', {}, h('legend', {}, legend), ...kids);
const readout = (title) => h('span', { class: 'readout', title });
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function injectCss() {
  if (document.querySelector('link[data-acx]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('../../css/acoustx.css', import.meta.url).href, 'data-acx': '1' }));
}

/** A generic loudspeaker glyph for the title bars — not the original program's icon. */
function icon() {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('class', 'ico');
  s.innerHTML = '<rect x="1.5" y="5.5" width="4" height="5" fill="#c0c0c0" stroke="#000"/><path d="M5.5 5.5 L10.5 1.5 L10.5 14.5 L5.5 10.5 Z" fill="#ffff00" stroke="#000"/><path d="M12.5 5 Q14.5 8 12.5 11" fill="none" stroke="#fff" stroke-width="1.2"/>';
  return s;
}

// ── canvas kit: black panels, grey grid and text, the original's colours ──

const COL = { grid: '#3c3c3c', text: '#a8a8a8', title: '#d0d0d0', frame: '#808080', green: '#00c000', lime: '#40ff40', red: '#ff2020', orange: '#ffa000', yellow: '#ffff00', grey: '#909090', white: '#ffffff', cyan: '#00ffff', purple: '#b040ff' };

function prep(cv) {
  const r = cv.getBoundingClientRect();
  const w = Math.round(r.width);
  const hh = Math.round(r.height);
  if (w < 20 || hh < 20) return null;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(hh * dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, hh);
  ctx.font = FONT;
  ctx.lineWidth = 1;
  return { ctx, w, h: hh };
}

/**
 * Grid, ticks and titles; returns the value → pixel maps. `xticks` are
 * [{ v, label }]; a categorical axis passes `cats` (labels) instead and gets
 * `slot(i)` → { x, w }.
 */
function axes(ctx, w, hh, o) {
  const pad = { l: 36, r: 10, t: 18, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = hh - pad.t - pad.b;
  const X = (v) => pad.l + (o.xlog ? Math.log(v / o.x0) / Math.log(o.x1 / o.x0) : (v - o.x0) / (o.x1 - o.x0)) * iw;
  const Xinv = (px) => (o.xlog ? o.x0 * (o.x1 / o.x0) ** ((px - pad.l) / iw) : o.x0 + ((px - pad.l) / iw) * (o.x1 - o.x0));
  const Y = (v) => pad.t + (1 - (clamp(v, o.y0, o.y1) - o.y0) / (o.y1 - o.y0)) * ih;
  const slot = (i) => ({ x: pad.l + (i * iw) / o.cats.length, w: iw / o.cats.length });
  ctx.strokeStyle = COL.grid;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  for (const v of o.yticks ?? []) {
    ctx.moveTo(pad.l, Math.round(Y(v)) + 0.5);
    ctx.lineTo(w - pad.r, Math.round(Y(v)) + 0.5);
  }
  for (const t of o.xticks ?? []) {
    ctx.moveTo(Math.round(X(t.v)) + 0.5, pad.t);
    ctx.lineTo(Math.round(X(t.v)) + 0.5, hh - pad.b);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COL.text;
  ctx.textAlign = 'right';
  for (const v of o.yticks ?? []) ctx.fillText(o.fmtY ? o.fmtY(v) : String(v), pad.l - 4, Y(v) + 3);
  ctx.textAlign = 'center';
  for (const t of o.xticks ?? []) ctx.fillText(t.label, X(t.v), hh - pad.b + 12);
  if (o.cats) o.cats.forEach((c, i) => ctx.fillText(c, slot(i).x + slot(i).w / 2, hh - pad.b + 12));
  ctx.strokeStyle = COL.frame;
  ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, iw, ih);
  ctx.fillStyle = COL.title;
  ctx.textAlign = 'left';
  ctx.fillText(o.title ?? '', pad.l, 12);
  ctx.textAlign = 'right';
  ctx.fillStyle = COL.text;
  if (o.xLabel) ctx.fillText(o.xLabel, w - pad.r, hh - 3);
  ctx.textAlign = 'left';
  return { X, Xinv, Y, slot, pad, iw, ih };
}

/** Integer ticks for a count axis: a 1-2-5 step giving about six of them, and the top rounded up to one. */
function countTicks(maxV) {
  const raw = Math.max(1, maxV / 6);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((k) => k * p).find((k) => k >= raw));
  const max = Math.ceil(maxV / step) * step;
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step) };
}

const FREQ_TICKS = [16, 31.5, 63, 125, 250, 500, 1000].map((v) => ({ v, label: v >= 1000 ? `${v / 1000}k` : String(v) }));

// ── the component ──────────────────────────────────────────────────────────

/**
 * Put an "Acoustic X ▾" menu into `mount` (the header bar) and the five
 * classic windows on a layer over the page. `onDrawRoom({ L, W, H })`, if
 * given, is called with the dimensions (metres) the Modal optimiser's
 * "Use these" picks — the host decides what drawing that room means.
 */
export function createAcousticX({ store, engine, mount, onDrawRoom } = {}) {
  injectCss();

  // ── the shared classic model (see the header) ──
  const M = {
    units: 'ft',
    L: 7,
    W: 5,
    H: 3,
    V: null,
    areas: null,
    mats: { floor: 'wood-floor', ceiling: 'acoustic-tile', front: 'gypsum', back: 'absorber-100', left: 'gypsum', right: 'gypsum' },
    spk1: { X: 1.5, Y: 1, Z: 1.2 },
    lis: { X: 2.5, Y: 2.7, Z: 1.2 },
    ids: [null, null],
    extra: null,
    linked: true,
  };
  const toU = (m) => (M.units === 'ft' ? m * FT : m);
  const fromU = (v) => (M.units === 'ft' ? v / FT : v);
  const areaU = (m2) => (M.units === 'ft' ? m2 * FT * FT : m2);
  const areaFromU = (v) => (M.units === 'ft' ? v / (FT * FT) : v);
  const aUnit = () => (M.units === 'ft' ? 'ft²' : 'm²');
  const spk2 = () => ({ X: M.W - M.spk1.X, Y: M.spk1.Y, Z: M.spk1.Z });

  const realRoom = () => engine?.out?.room ?? null;

  function toClassic(room, p) {
    const q = inFrame(room, p);
    return { X: q.fromLeft, Y: q.fromFront, Z: (p.z ?? 1.2) - (room.zFloor ?? 0) };
  }
  function toSheetReal(room, P) {
    return { ...fromFrame(room, P.Y, P.X), z: P.Z + (room.zFloor ?? 0) };
  }

  function pickSpeakers(st) {
    const spk = st.speakers ?? [];
    const sel = st.selected?.kind === 'speaker' ? spk.find((s) => s.id === st.selected.id) : null;
    const s1 = sel ?? spk.find((s) => s.pairId && s.side === 'L') ?? spk.find((s) => s.pairId) ?? spk[0] ?? null;
    const s2 = s1?.pairId ? (spk.find((s) => s.pairId === s1.pairId && s.id !== s1.id) ?? null) : null;
    return { s1, s2 };
  }

  /** Re-read the classic model from the room being designed, and link it. */
  function pullFromRoom() {
    const st = store?.state ?? {};
    const room = realRoom();
    if (st.settings?.faceMaterials) M.mats = { ...st.settings.faceMaterials };
    if (room) {
      M.L = room.L;
      M.W = room.W;
      M.H = room.H;
      M.V = room.V;
      M.areas = {};
      for (const s of room.surfaces ?? []) M.areas[s.face] = (M.areas[s.face] ?? 0) + s.area;
    } else if (st.settings) {
      M.L = st.settings.virtualRoom?.l ?? M.L;
      M.W = st.settings.virtualRoom?.w ?? M.W;
      M.H = st.settings.roomHeight ?? M.H;
      M.V = null;
      M.areas = null;
    }
    const { s1, s2 } = pickSpeakers(st);
    M.ids = [s1?.id ?? null, s2?.id ?? null];
    M.spk1 = s1 && room ? toClassic(room, s1) : { X: M.W * 0.3, Y: Math.min(1, M.L * 0.15), Z: 1.2 };
    const mic = (st.mics ?? []).find((m) => m.mix) ?? st.mics?.[0];
    M.lis = mic && room ? toClassic(room, mic) : { X: M.W / 2, Y: M.L * 0.38, Z: 1.2 };
    M.extra = null;
    M.linked = true;
  }

  // The plain box the windows compute in, built by room.js so walls, faces and materials mean what they mean everywhere.
  let boxKey = '';
  let boxCache = null;
  function box() {
    const key = JSON.stringify([M.L, M.W, M.H, M.mats]);
    if (key !== boxKey || !boxCache) {
      boxKey = key;
      const poly = [{ x: 0, y: 0 }, { x: M.W, y: 0 }, { x: M.W, y: M.L }, { x: 0, y: M.L }];
      boxCache = buildRoom(poly, { ...(store?.state?.settings ?? {}), roomHeight: M.H, frontDeg: 90, faceMaterials: M.mats });
    }
    return boxCache;
  }
  /** Classic X / Y / Z → the box's sheet frame (front wall at y = L, left wall at x = 0). */
  const toBox = (P) => ({ x: P.X, y: M.L - P.Y, z: P.Z });

  function boxAreas() {
    return { floor: M.L * M.W, ceiling: M.L * M.W, front: M.W * M.H, back: M.W * M.H, left: M.L * M.H, right: M.L * M.H };
  }
  function classicRoom(withExtra = true) {
    const b = boxAreas();
    let room = { V: M.V ?? M.L * M.W * M.H, surfaces: FACES6.map((f) => ({ face: f, key: f, area: M.areas?.[f] ?? b[f], material: material(M.mats[f]) })) };
    if (withExtra && M.extra) room = applyAbsorber(room, M.extra.id, M.extra.area, { face: M.extra.face || null });
    return room;
  }

  /** A dimension changed: volume and areas follow the box again. */
  function dimsChanged() {
    M.V = null;
    M.areas = null;
  }

  // ── windows ──
  const wins = {};
  let zTop = 10;
  const desk = h('div', { class: 'acx acx-desk' });
  document.body.append(desk);

  function edited() {
    M.linked = false;
    refreshAll();
  }
  function refreshAll() {
    for (const w of Object.values(wins)) if (!w.el.hidden) w.refresh();
  }

  function front(win) {
    win.el.style.zIndex = String(++zTop);
    for (const w of Object.values(wins)) w.el.classList.toggle('front', w === win);
  }

  function makeWindow(name, title, size, build) {
    const k = Object.keys(wins).length;
    const el = h('div', { class: 'acx-win', hidden: true, style: `left:${40 + 28 * k}px;top:${56 + 24 * k}px;width:${size.w}px;height:${size.h}px` });
    const win = { name, el, syncers: [], status: null, progress: null, refresh: null, render: () => {}, compute: () => {} };
    const minB = h('button', { title: 'Minimise', onclick: () => el.classList.toggle('min') }, '_');
    const maxB = h('button', { title: 'Maximise', onclick: () => toggleMax() }, '□');
    const xB = h('button', { class: 'x', title: 'Close', onclick: () => close(name) }, '×');
    const bar = h('div', { class: 'acx-title', ondblclick: () => toggleMax() }, icon(), h('span', { class: 'txt' }, title), minB, maxB, xB);
    function toggleMax() {
      el.classList.remove('min');
      el.classList.toggle('max');
      maxB.textContent = el.classList.contains('max') ? '❐' : '□';
      requestAnimationFrame(() => win.render());
    }
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || el.classList.contains('max')) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = el.offsetLeft;
      const oy = el.offsetTop;
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => {
        el.style.left = `${clamp(ox + ev.clientX - sx, 60 - el.offsetWidth, window.innerWidth - 60)}px`;
        el.style.top = `${clamp(oy + ev.clientY - sy, 0, window.innerHeight - 20)}px`;
      };
      const up = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        bar.removeEventListener('pointercancel', up);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
      bar.addEventListener('pointercancel', up);
    });
    el.addEventListener('pointerdown', () => front(win), true);
    el.append(bar);
    win.status = h('div', { class: 'acx-status' });
    const bar2 = h('div');
    win.progress = (fr) => (bar2.style.width = `${clamp(fr, 0, 1) * 100}%`);
    win.sync = () => win.syncers.forEach((f) => f());
    win.refresh = () => {
      win.sync();
      win.compute();
      win.render();
      win.status.textContent = M.linked ? 'Linked to the room being designed' : 'What-if: edited here — ↻ From room to re-link';
    };
    const startB = h('button', { class: 'start', title: 'Recompute', onclick: () => start(win) }, 'Start');
    build(win);
    if (size.foot !== false) el.append(h('div', { class: 'acx-foot' }, win.status, h('div', { class: 'acx-progress' }, bar2), startB));
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => !el.hidden && win.render()).observe(el);
    desk.append(el);
    wins[name] = win;
    return win;
  }

  function start(win) {
    win.progress(0.15);
    requestAnimationFrame(() => {
      win.refresh();
      win.progress(1);
      setTimeout(() => win.progress(0), 500);
    });
  }

  /** Run `n` slices of work a few at a time so the page stays live; the progress bar follows. */
  function job(win, n, slice, done) {
    const token = (win.jobToken = (win.jobToken ?? 0) + 1);
    let i = 0;
    const tick = () => {
      if (token !== win.jobToken) return;
      const t0 = performance.now();
      while (i < n && performance.now() - t0 < 30) slice(i++);
      win.progress(n ? i / n : 1);
      if (i < n) setTimeout(tick, 0);
      else {
        done();
        setTimeout(() => win.progress(0), 500);
      }
    };
    tick();
  }

  // ── shared field builders ──

  function lenField(win, label, get, set, { disabled, title, local } = {}) {
    const inp = h('input', { type: 'number', step: 0.01, title });
    const unit = h('span', { class: 'unit' });
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!Number.isFinite(v)) return win.sync();
      set(fromU(v));
      if (local) win.refresh();
      else edited();
    });
    win.syncers.push(() => {
      if (document.activeElement !== inp) inp.value = fmt(toU(get()), 2);
      unit.textContent = M.units;
      inp.disabled = Boolean(disabled?.());
    });
    return h('div', { class: 'row' }, h('label', { title }, label), inp, unit);
  }

  function numField(win, label, unit, get, set, { step = 1, title, local = true, width } = {}) {
    const inp = h('input', { type: 'number', step, title, style: width ? `width:${width}px` : null });
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!Number.isFinite(v)) return win.sync();
      set(v);
      if (local) win.refresh();
      else edited();
    });
    win.syncers.push(() => {
      if (document.activeElement !== inp) inp.value = String(+get().toFixed(3));
    });
    return h('div', { class: 'row' }, h('label', { title }, label), inp, h('span', { class: 'unit' }, unit));
  }

  function unitsRow(win) {
    const name = `acx-u-${win.name}`;
    const ft = h('input', { type: 'radio', name, onchange: () => ((M.units = 'ft'), refreshAll()) });
    const m = h('input', { type: 'radio', name, onchange: () => ((M.units = 'm'), refreshAll()) });
    win.syncers.push(() => {
      ft.checked = M.units === 'ft';
      m.checked = M.units === 'm';
    });
    return h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Units'), h('label', { class: 'opt' }, ft, 'Feet'), h('label', { class: 'opt' }, m, 'Metres'));
  }

  const fromRoomBtn = () =>
    h('button', { title: 'Reset every classic window to the room being designed, and link them to it again', onclick: () => (pullFromRoom(), refreshAll()) }, '↻ From room');

  function dimsGroup(win, extra = []) {
    const set = (k) => (v) => {
      M[k] = Math.max(0.5, v);
      dimsChanged();
    };
    return group(
      'Room Dimensions',
      lenField(win, 'Room Length', () => M.L, set('L'), { title: 'Front wall to back wall' }),
      lenField(win, 'Room Width', () => M.W, set('W'), { title: 'Left wall to right wall' }),
      lenField(win, 'Room Height', () => M.H, set('H'), { title: 'Floor to ceiling (the mean, for a sloped ceiling)' }),
      unitsRow(win),
      ...extra,
      h('div', { class: 'btns' }, fromRoomBtn()),
    );
  }

  function matOptions() {
    const cats = [...new Set(MATERIALS.map((m) => m.category))];
    return cats.map((c) => h('optgroup', { label: c }, MATERIALS.filter((m) => m.category === c).map((m) => h('option', { value: m.id }, m.name))));
  }
  function matSelect(win, get, set, title) {
    const s = h('select', { class: 'list', title }, matOptions());
    s.addEventListener('change', () => set(s.value));
    win.syncers.push(() => (s.value = get()));
    return s;
  }
  const faceMatSelect = (win, face) => matSelect(win, () => M.mats[face], (v) => ((M.mats[face] = v), edited()), FACE_LABEL[face]);

  function pointGroup(win, legend, get, set, { disabled } = {}) {
    const field = (label, k, title) => lenField(win, label, () => get()[k], (v) => set({ ...get(), [k]: v }), { disabled, title });
    return group(legend, field('X', 'X', 'From the left wall'), field('Y', 'Y', 'From the front wall'), field('Z', 'Z', 'Above the floor'));
  }

  function tabs(win, names) {
    const strip = h('div', { class: 'acx-tabs' });
    const sheet = h('div', { class: 'acx-sheet' });
    const pages = {};
    const tabEls = {};
    const show = (n) => {
      for (const k of names) {
        tabEls[k].classList.toggle('on', k === n);
        pages[k].hidden = k !== n;
      }
    };
    for (const n of names) {
      tabEls[n] = h('div', { class: 'acx-tab', onclick: () => show(n) }, n);
      pages[n] = h('div', { class: 'acx-page' });
      strip.append(tabEls[n]);
      sheet.append(pages[n]);
    }
    show(names[0]);
    return { nodes: [strip, sheet], pages, show };
  }

  const chartBox = (style = '') => {
    const cv = h('canvas');
    return { box: h('div', { class: 'acx-chart', style }, cv), cv };
  };

  // ═════════════════════════════════════════════════════════════════════════
  // 1. MODAL RESPONSE
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('modal', 'Acoustic X — Modal Response', { w: 800, h: 540 }, (win) => {
    const S = { sel: null, show: { axial: true, tangential: true, oblique: true }, ratioMode: false, ratiosOpen: false, ranges: null, step: 0.05, results: [], resSel: 0, coarse: null, res: null };
    const dims = () => ({ L: M.L, W: M.W, H: M.H });
    const minDim = () => Math.min(M.L, M.W, M.H);

    // Room tab
    const ratioBox = (k) => {
      const inp = h('input', { type: 'number', step: 0.01, title: 'Ratio to the smallest dimension' });
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (!Number.isFinite(v) || v < 1) return win.sync();
        M[k] = minDim() * v;
        dimsChanged();
        edited();
      });
      win.syncers.push(() => {
        if (document.activeElement !== inp) inp.value = fmt(M[k] / minDim(), 2);
        inp.readOnly = !S.ratioMode || M[k] === minDim();
        inp.classList.toggle('ro', inp.readOnly);
      });
      return inp;
    };
    const dimRow = (label, k, title) => {
      const row = lenField(win, label, () => M[k], (v) => ((M[k] = Math.max(0.5, v)), dimsChanged()), { title, disabled: () => S.ratioMode && M[k] !== minDim() });
      row.append(ratioBox(k));
      return row;
    };
    const sizeR = h('input', { type: 'radio', name: 'acx-sr', onchange: () => ((S.ratioMode = false), win.sync()) });
    const ratioR = h('input', { type: 'radio', name: 'acx-sr', onchange: () => ((S.ratioMode = true), win.sync()) });
    win.syncers.push(() => {
      sizeR.checked = !S.ratioMode;
      ratioR.checked = S.ratioMode;
    });
    const ratioList = h('select', { class: 'list', size: 8 }, FAVOURABLE_RATIOS.map((r) => h('option', { value: r.id }, r.ratio ? `${r.name}   ${r.ratio.map((x) => x.toFixed(2)).join(' : ')}` : r.name)));
    const ratioNote = h('div', { class: 'small muted' });
    const ratioPanel = h('div', { hidden: true }, ratioList, ratioNote, h('div', { class: 'btns' }, h('button', { onclick: applyRatio, title: 'Keep the height, set width and length from the ratio' }, 'Apply ratio')));
    ratioList.addEventListener('change', () => {
      const r = FAVOURABLE_RATIOS.find((x) => x.id === ratioList.value);
      if (r?.check) {
        const c = r.check(dims());
        ratioNote.textContent = c.ok ? 'This room is inside the BS.1116 bounds.' : c.notes.join('; ');
      } else ratioNote.textContent = r ? `H : W : L = ${r.ratio.join(' : ')}` : '';
    });
    function applyRatio() {
      const r = FAVOURABLE_RATIOS.find((x) => x.id === ratioList.value);
      if (!r?.ratio) return;
      M.W = M.H * r.ratio[1];
      M.L = M.H * r.ratio[2];
      dimsChanged();
      edited();
    }
    const showRatiosB = h('button', { onclick: () => ((ratioPanel.hidden = !ratioPanel.hidden), (showRatiosB.textContent = ratioPanel.hidden ? 'Show Favorable Room Ratios' : 'Hide Favorable Room Ratios')) }, 'Show Favorable Room Ratios');
    const bonelloBox = h('div', { class: 'scroll small', style: 'max-height:110px;min-height:40px' });

    // Optimize tab
    const rng = (k, i) => () => (S.ranges ??= defaultRanges())[k][i];
    const setRng = (k, i) => (v) => ((S.ranges ??= defaultRanges())[k][i] = Math.max(0.5, v));
    function defaultRanges() {
      const r = (v, a, b) => [Math.round(v * a * 20) / 20, Math.round(v * b * 20) / 20];
      return { L: r(M.L, 0.9, 1.1), W: r(M.W, 0.9, 1.1), H: [M.H, M.H] };
    }
    const optList = h('select', { class: 'list', size: 10 });
    optList.addEventListener('change', () => (S.resSel = optList.selectedIndex));
    const optNote = h('div', { class: 'small muted' });
    const rangeRows = ['L', 'W', 'H'].map((k) =>
      h('div', { class: 'cols' }, lenField(win, `${k} min`, rng(k, 0), setRng(k, 0), { local: true }), lenField(win, 'max', rng(k, 1), setRng(k, 1), { local: true })),
    );
    function runOptimise() {
      const ranges = (S.ranges ??= defaultRanges());
      let step = S.step;
      let grid = dimensionGrid(ranges, step);
      while (grid.count > 40000) grid = dimensionGrid(ranges, (step *= 2));
      S.coarse = step !== S.step ? step : null;
      const best = [];
      optNote.textContent = `Searching ${grid.count} rooms…`;
      job(
        win,
        grid.L.length,
        (i) => {
          const L = grid.L[i];
          for (const W of grid.W)
            for (const H of grid.H) {
              const s = scoreDimensions({ L, W, H });
              keepBest(best, { L, W, H, score: s.score, ok: s.ok }, 10);
            }
        },
        () => {
          S.results = best;
          S.resSel = 0;
          optNote.textContent = `${grid.count} rooms tried${S.coarse ? `, step coarsened to ${fmt(toU(S.coarse), 2)} ${M.units}` : ''}. Score = 2·(Bonello failures) + spread of the axial and of all mode spacings — lower is better.`;
          win.render();
        },
      );
    }
    function useThese() {
      const r = S.results[S.resSel];
      if (!r) return;
      M.L = r.L;
      M.W = r.W;
      M.H = r.H;
      dimsChanged();
      edited();
      onDrawRoom?.({ L: r.L, W: r.W, H: r.H });
    }

    // Mode1 / Mode2 tabs
    const modeTable = h('tbody');
    const filters = ['axial', 'tangential', 'oblique'].map((t) => {
      const c = h('input', { type: 'checkbox', checked: true, onchange: () => ((S.show[t] = c.checked), win.render()) });
      win.syncers.push(() => (c.checked = S.show[t]));
      return h('label', { class: 'opt' }, c, t[0].toUpperCase() + t.slice(1));
    });
    const bandTable = h('tbody');
    const axialTable = h('tbody');

    const T = tabs(win, ['Room', 'Optimize', 'Mode1', 'Mode2']);
    T.pages.Room.append(
      group('Room Dimensions', dimRow('Room Length', 'L', 'Front wall to back wall'), dimRow('Room Width', 'W', 'Left wall to right wall'), dimRow('Room Height', 'H', 'Floor to ceiling'), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Enter'), h('label', { class: 'opt' }, sizeR, 'Size'), h('label', { class: 'opt' }, ratioR, 'Ratio')), unitsRow(win), h('div', { class: 'btns' }, showRatiosB, fromRoomBtn())),
      ratioPanel,
      group('Bonello Criterion', bonelloBox),
    );
    T.pages.Optimize.append(
      group('Dimension Limits', ...rangeRows, numField(win, 'Step', 'm', () => S.step, (v) => (S.step = Math.max(0.01, v)), { step: 0.01, title: 'Grid step, metres' })),
      h('div', { class: 'btns' }, h('button', { onclick: runOptimise }, 'Optimize'), h('button', { onclick: useThese, title: 'Take the selected room into every classic window (and hand it to the host to draw)' }, 'Use these')),
      h('div', { style: 'margin-top:6px' }, optList),
      optNote,
    );
    T.pages.Mode1.append(h('div', { class: 'row' }, ...filters), h('div', { class: 'scroll', style: 'max-height:330px' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['#', 'Hz', 'Nx', 'Ny', 'Nz', 'Type'].map((t) => h('th', {}, t)))), modeTable)));
    T.pages.Mode2.append(
      group('Modes per 1/3 Octave', h('div', { class: 'scroll', style: 'max-height:170px' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['Band', 'Edges Hz', 'Modes', ''].map((t) => h('th', {}, t)))), bandTable))),
      group('Axial Modes (Hz)', h('div', { class: 'scroll', style: 'max-height:120px' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['n', 'Length', 'Width', 'Height'].map((t) => h('th', {}, t)))), axialTable))),
    );

    // right side
    const top = chartBox('flex:1.25');
    const bot = chartBox('flex:1');
    const ro = { nx: readout(), ny: readout(), nz: readout(), f: readout(), dev: readout('Standard deviation of the gaps between neighbouring modes') };
    const byF = h('input', { type: 'number', step: 0.1, title: 'Type a frequency to find the mode nearest it', style: 'width:56px' });
    byF.addEventListener('change', () => {
      const f = parseFloat(byF.value);
      if (!Number.isFinite(f) || !S.res) return;
      S.sel = nearest(S.res.modes.filter((m) => S.show[m.type]), f);
      win.render();
    });
    const nearest = (modes, f) => modes.reduce((b, m) => (!b || Math.abs(m.f - f) < Math.abs(b.f - f) ? m : b), null);
    top.cv.addEventListener('click', (e) => {
      if (!S.res || !top.map) return;
      const r = top.cv.getBoundingClientRect();
      S.sel = nearest(S.res.modes.filter((m) => S.show[m.type]), top.map.Xinv(e.clientX - r.left));
      win.render();
    });
    const rr = (l, el, u) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, l), el, u ? h('span', {}, u) : null);
    const body = h(
      'div',
      { class: 'acx-body' },
      h('div', { class: 'acx-left' }, T.nodes),
      h(
        'div',
        { class: 'acx-right' },
        h('fieldset', { class: 'grow' }, h('legend', {}, 'Display Mode Distribution'), h('div', { style: 'display:flex;flex-direction:column;gap:4px;flex:1;min-height:0' }, top.box, bot.box)),
        group('Chart View Manager', h('div', { class: 'manager' }, rr('Nx', ro.nx), rr('Ny', ro.ny), rr('Nz', ro.nz), rr('Frequency', ro.f, 'Hz'), rr('Deviation', ro.dev, 'Hz'), rr('By Frequency', byF, 'Hz'))),
      ),
    );
    win.el.append(body);

    win.compute = () => {
      const modes = modeList(dims(), 200);
      const b = bonello(dims(), 200);
      const gaps = modes.slice(1).map((m, i) => m.f - modes[i].f);
      const mean = gaps.reduce((s, g) => s + g, 0) / (gaps.length || 1);
      const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / (gaps.length || 1));
      S.res = { modes, bonello: b, sd };
      if (S.sel && !modes.some((m) => m.nx === S.sel.nx && m.ny === S.sel.ny && m.nz === S.sel.nz)) S.sel = null;
      else if (S.sel) S.sel = modes.find((m) => m.nx === S.sel.nx && m.ny === S.sel.ny && m.nz === S.sel.nz);
    };

    win.render = () => {
      const res = S.res;
      if (!res) return;
      // Bonello box
      bonelloBox.replaceChildren(
        h('div', { class: res.bonello.ok ? '' : 'warn' }, res.bonello.ok ? '✓ Passes: counts never fall, no coincident modes in a thin band.' : `⚠ ${res.bonello.warnings.length} warning${res.bonello.warnings.length === 1 ? '' : 's'}:`),
        res.bonello.warnings.map((w) => h('div', { class: 'warn' }, `• ${w}`)),
      );
      // Optimize list
      optList.replaceChildren(...S.results.map((r, i) => h('option', { selected: i === S.resSel }, `${fmt(toU(r.L))} × ${fmt(toU(r.W))} × ${fmt(toU(r.H))} ${M.units}   ${fmt(r.score, 3)} ${r.ok ? '✓' : '⚠'}`)));
      // Mode1 table
      const vis = res.modes.filter((m) => S.show[m.type]);
      modeTable.replaceChildren(
        ...vis.map((m, i) =>
          h('tr', { class: m === S.sel ? 'sel' : '', onclick: () => ((S.sel = m), win.render()) }, h('td', {}, i + 1), h('td', {}, fmt(m.f, 1)), h('td', {}, m.nx), h('td', {}, m.ny), h('td', {}, m.nz), h('td', {}, m.type)),
        ),
      );
      // Mode2 tables
      const counts = res.bonello.counts;
      bandTable.replaceChildren(
        ...counts.map((b, i) => {
          const drop = i > 0 && counts.slice(0, i).some((x) => x.count > 0) && b.count < counts[i - 1].count;
          return h('tr', {}, h('td', {}, `${b.fc} Hz`), h('td', {}, `${fmt(b.lo, 1)}–${fmt(b.hi, 1)}`), h('td', {}, b.count), h('td', { class: 'warn' }, drop ? 'falls' : ''));
        }),
      );
      axialTable.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('tr', {}, h('td', {}, n), h('td', {}, fmt((n * C) / (2 * M.L), 1)), h('td', {}, fmt((n * C) / (2 * M.W), 1)), h('td', {}, fmt((n * C) / (2 * M.H), 1)))));
      // readouts
      ro.nx.textContent = S.sel ? S.sel.nx : '';
      ro.ny.textContent = S.sel ? S.sel.ny : '';
      ro.nz.textContent = S.sel ? S.sel.nz : '';
      ro.f.textContent = S.sel ? fmt(S.sel.f, 2) : '';
      ro.dev.textContent = fmt(res.sd, 2);
      drawModes(vis);
      drawThirds(counts);
    };

    function drawModes(vis) {
      const p = prep(top.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      // stack coincident modes: bar height = how many share that frequency
      const groups = [];
      for (const m of vis) {
        const g = groups.find((x) => Math.abs(x.f - m.f) <= 0.005 * x.f);
        if (g) g.modes.push(m);
        else groups.push({ f: m.f, modes: [m] });
      }
      const t = countTicks(Math.max(4, ...groups.map((g) => g.modes.length + 1)));
      const a = axes(ctx, w, hh, { title: 'Number of Modes / Frequency', x0: 0, x1: 200, y0: 0, y1: t.max, xticks: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((v) => ({ v, label: String(v) })), yticks: t.ticks, xLabel: 'Hz' });
      top.map = a;
      const rank = { axial: 0, tangential: 1, oblique: 2 };
      for (const g of groups) {
        const t = g.modes.reduce((b, m) => (rank[m.type] < rank[b] ? m.type : b), 'oblique');
        const x = Math.round(a.X(g.f));
        const sel = S.sel && g.modes.includes(S.sel);
        ctx.fillStyle = sel ? COL.white : t === 'axial' ? COL.red : t === 'tangential' ? COL.orange : COL.grey;
        const bw = t === 'axial' ? 3 : t === 'tangential' ? 2 : 1;
        const y = a.Y(g.modes.length);
        ctx.fillRect(x - Math.floor(bw / 2), y, bw, a.Y(0) - y);
      }
      // legend
      ctx.textAlign = 'right';
      [['Axial', COL.red], ['Tangential', COL.orange], ['Oblique', COL.grey]].forEach(([l, c], i) => {
        ctx.fillStyle = c;
        ctx.fillText(l, w - 14, 30 + i * 12);
      });
      ctx.textAlign = 'left';
    }

    function drawThirds(counts) {
      const p = prep(bot.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const t = countTicks(Math.max(...counts.map((c) => c.count)) * 1.12 + 1);
      const a = axes(ctx, w, hh, { title: 'Number of Modes / 1/3 Octave Frequency Band', cats: counts.map((c) => String(c.fc)), y0: 0, y1: t.max, x0: 0, x1: 1, yticks: t.ticks, xLabel: 'Hz' });
      counts.forEach((c, i) => {
        const s = a.slot(i);
        const bw = Math.max(4, s.w * 0.55);
        const x = s.x + (s.w - bw) / 2;
        const y = a.Y(c.count);
        ctx.fillStyle = COL.green;
        if (c.count) ctx.fillRect(x, y, bw, a.Y(0) - y);
        const drop = i > 0 && counts.slice(0, i).some((q) => q.count > 0) && c.count < counts[i - 1].count;
        ctx.fillStyle = drop ? COL.yellow : COL.lime;
        ctx.textAlign = 'center';
        ctx.fillText(String(c.count), s.x + s.w / 2, y - 3);
      });
      ctx.textAlign = 'left';
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. SPEAKER BOUNDARY INTERFERENCE RESPONSE
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('sbir', 'Acoustic X — Speaker Boundary Interference Response', { w: 820, h: 560 }, (win) => {
    const S = { view: 'chart', perOct: 12, xover: [80, 0], ranges: null, step: 0.1, results: [], resSel: 0, res: null };
    const T = tabs(win, ['Room', 'SPK', 'Listener', 'Search']);
    const exc = { nx: readout(), ny: readout(), nz: readout(), f: readout() };
    T.pages.Room.append(dimsGroup(win), group('Surfaces', ...FACES6.map((f) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, FACE_LABEL[f]), faceMatSelect(win, f)))));
    T.pages.SPK.append(
      pointGroup(win, 'Speaker1', () => M.spk1, (v) => (M.spk1 = v)),
      pointGroup(win, 'Speaker2 (mirror image)', spk2, () => {}, { disabled: () => true }),
      group('Mode Excited By Position', h('div', { class: 'manager' }, h('div', { class: 'row' }, 'Nx', exc.nx), h('div', { class: 'row' }, 'Ny', exc.ny), h('div', { class: 'row' }, 'Nz', exc.nz)), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Frequency'), exc.f, 'Hz'), h('div', { class: 'small muted' }, 'The one of the lowest twenty modes this speaker and the listener couple to most strongly.')),
    );
    T.pages.Listener.append(pointGroup(win, 'Listener', () => M.lis, (v) => (M.lis = v)), h('div', { class: 'small muted' }, 'X from the left wall, Y from the front wall, Z above the floor. Linked, it is the mix mic.'));

    const rng = (k, i) => () => (S.ranges ??= defaultRanges())[k][i];
    const setRng = (k, i) => (v) => ((S.ranges ??= defaultRanges())[k][i] = v);
    function defaultRanges() {
      const s = M.spk1;
      return { X: [Math.max(0.2, s.X - 0.5), Math.min(M.W - 0.2, s.X + 0.5)], Y: [Math.max(0.2, s.Y - 0.5), s.Y + 0.5], Z: [s.Z, s.Z] };
    }
    const resList = h('select', { class: 'list', size: 8 });
    resList.addEventListener('change', () => (S.resSel = resList.selectedIndex));
    const searchNote = h('div', { class: 'small muted' }, `Least absolute deviation (mean |dev| ≤ ${ABS_DEV_MAX_HZ} Hz). Speaker2 follows as the mirror image.`);
    T.pages.Search.append(
      group('Search Limits (Speaker1)', ...['X', 'Y', 'Z'].map((k) => h('div', { class: 'cols' }, lenField(win, `${k} min`, rng(k, 0), setRng(k, 0), { local: true }), lenField(win, 'max', rng(k, 1), setRng(k, 1), { local: true }))), numField(win, 'Step', 'm', () => S.step, (v) => (S.step = Math.max(0.02, v)), { step: 0.01 })),
      h('div', { class: 'btns' }, h('button', { onclick: runSearch }, 'Search'), h('button', { onclick: applyResult, title: "Move the design's speaker (and its mirror twin) to the selected position" }, 'Apply')),
      h('div', { style: 'margin-top:6px' }, resList),
      searchNote,
    );

    function runSearch() {
      const r = (S.ranges ??= defaultRanges());
      const room = box();
      const s = toBox(M.spk1);
      const l = toBox(M.lis);
      const xs = steps(r.X, S.step);
      let best = [];
      job(
        win,
        xs.length,
        (i) => {
          const part = searchPositions(room, s, l, { x: [xs[i], xs[i]], y: [M.L - Math.max(...r.Y), M.L - Math.min(...r.Y)], z: r.Z }, { step: S.step, top: 8 });
          best = [...best, ...part].sort((a, b) => a.absDev - b.absDev).slice(0, 8);
        },
        () => {
          S.results = best.map((p) => ({ X: p.x, Y: M.L - p.y, Z: p.z, absDev: p.absDev }));
          S.resSel = 0;
          win.render();
        },
      );
    }
    function applyResult() {
      const P = S.results[S.resSel];
      if (!P) return;
      const real = realRoom();
      const [id1, id2] = M.ids;
      const speakers = store?.state?.speakers ?? [];
      if (!real || !id1 || !speakers.some((s) => s.id === id1)) {
        M.spk1 = { X: P.X, Y: P.Y, Z: P.Z };
        edited();
        win.status.textContent = 'No speaker in the design to move — the classic Speaker1 moved instead';
        return;
      }
      const wasLinked = M.linked;
      const sizeDiffers = Math.abs(real.L - M.L) > 0.01 || Math.abs(real.W - M.W) > 0.01 || Math.abs(real.H - M.H) > 0.01;
      const p = toSheetReal(real, P);
      store.update('speaker', id1, { x: p.x, y: p.y, z: p.z });
      const s1 = store.state.speakers.find((s) => s.id === id1);
      if (id2 && !s1?.pairId) {
        const q = toSheetReal(real, { X: real.W - P.X, Y: P.Y, Z: P.Z });
        store.update('speaker', id2, { x: q.x, y: q.y, z: q.z });
      }
      M.spk1 = { X: P.X, Y: P.Y, Z: P.Z };
      if (!wasLinked) refreshAll();
      if (sizeDiffers) win.status.textContent = 'Applied — note the classic room is not the size of the designed one';
    }

    // right side
    const chart = chartBox();
    const resRadios = [
      [1, 'Octave'],
      [3, '1/3'],
      [6, '1/6'],
      [12, '1/12'],
    ].map(([n, l]) => {
      const r = h('input', { type: 'radio', name: 'acx-sbir-res', onchange: () => ((S.perOct = n), win.render()) });
      win.syncers.push(() => (r.checked = S.perOct === n));
      return h('label', { class: 'opt' }, r, l);
    });
    const absRo = readout(`Mean |deviation| at or below ${ABS_DEV_MAX_HZ} Hz`);
    const xo = (i) => numField(win, i ? 'Crossover 2' : 'Crossover', 'Hz', () => S.xover[i], (v) => (S.xover[i] = Math.max(0, v)), { step: 10, title: 'Drawn as a yellow marker; 0 hides it', width: 52 });
    const viewBtns = [
      ['plan', 'Plan'],
      ['side', 'Side Elevation'],
      ['end', 'End Elevation'],
      ['3d', '3-Dimensional'],
      ['chart', 'SBIR Chart'],
    ].map(([v, l]) => {
      const b = h('button', { onclick: () => ((S.view = S.view === v && v !== 'chart' ? 'chart' : v), win.render()) }, l);
      b.dataset.v = v;
      return b;
    });
    const body = h(
      'div',
      { class: 'acx-body' },
      h('div', { class: 'acx-left' }, T.nodes),
      h(
        'div',
        { class: 'acx-right' },
        h('fieldset', { class: 'grow' }, h('legend', {}, 'SBIR'), h('div', { class: 'manager' }, ...resRadios, xo(0), xo(1)), chart.box, h('div', { class: 'row' }, h('span', { class: 'lbl', style: 'width:auto' }, 'Absolute Deviation'), absRo, 'dB')),
        group('Room View Manager', h('div', { class: 'btns', style: 'margin:0' }, viewBtns)),
      ),
    );
    win.el.append(body);

    win.compute = () => {
      const room = box();
      const fine = sbirDeviation(room, toBox(M.spk1), toBox(M.lis), sbirFreqs(16, 1000, 48));
      const modes = modeList({ L: M.L, W: M.W, H: M.H }, 200).slice(0, 20);
      const psi = (m, P) => Math.cos((m.nx * Math.PI * P.Y) / M.L) * Math.cos((m.ny * Math.PI * P.X) / M.W) * Math.cos((m.nz * Math.PI * P.Z) / M.H);
      const exm = modes.reduce((b, m) => {
        const c = Math.abs(psi(m, M.spk1) * psi(m, M.lis));
        return !b || c > b.c + 1e-9 ? { m, c } : b;
      }, null);
      S.res = { fine, exm };
    };

    win.render = () => {
      if (!S.res) return;
      const { fine, exm } = S.res;
      absRo.textContent = fmt(fine.absDev, 2);
      exc.nx.textContent = exm?.m.nx ?? '';
      exc.ny.textContent = exm?.m.ny ?? '';
      exc.nz.textContent = exm?.m.nz ?? '';
      exc.f.textContent = exm ? fmt(exm.m.f, 1) : '';
      resList.replaceChildren(...S.results.map((r, i) => h('option', { selected: i === S.resSel }, `X ${fmt(toU(r.X))}  Y ${fmt(toU(r.Y))}  Z ${fmt(toU(r.Z))} ${M.units}   ${fmt(r.absDev, 2)} dB`)));
      for (const b of viewBtns) b.classList.toggle('down', b.dataset.v === S.view);
      if (S.view === 'chart') drawSbir(fine);
      else drawRoomView(chart.cv, S.view, [M.spk1, spk2()], M.lis);
    };

    function drawSbir(fine) {
      const p = prep(chart.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const a = axes(ctx, w, hh, { title: 'SBIR — Deviation (dB) / Frequency (Hz)', x0: 16, x1: 1000, xlog: true, y0: -30, y1: 12, xticks: FREQ_TICKS, yticks: [-30, -24, -18, -12, -6, 0, 6, 12], xLabel: 'Hz' });
      const half = 1 / (2 * S.perOct);
      for (const fc of sbirFreqs(16, 1000, S.perOct)) {
        let s = 0;
        let n = 0;
        fine.freqs.forEach((f, i) => {
          if (Math.abs(Math.log2(f / fc)) <= half + 1e-9) {
            s += fine.dev[i];
            n++;
          }
        });
        const v = n ? s / n : 0;
        const x0 = a.X(Math.max(16, fc * 2 ** -half));
        const x1 = a.X(Math.min(1000, fc * 2 ** half));
        ctx.fillStyle = COL.green;
        const y0 = a.Y(0);
        const y1 = a.Y(v);
        ctx.fillRect(x0 + 0.5, Math.min(y0, y1), Math.max(1, x1 - x0 - 1), Math.max(1, Math.abs(y1 - y0)));
      }
      ctx.strokeStyle = COL.frame;
      ctx.beginPath();
      ctx.moveTo(a.pad.l, Math.round(a.Y(0)) + 0.5);
      ctx.lineTo(w - a.pad.r, Math.round(a.Y(0)) + 0.5);
      ctx.stroke();
      ctx.strokeStyle = COL.yellow;
      for (const f of S.xover)
        if (f >= 16 && f <= 1000) {
          ctx.beginPath();
          ctx.moveTo(Math.round(a.X(f)) + 0.5, a.pad.t);
          ctx.lineTo(Math.round(a.X(f)) + 0.5, hh - a.pad.b);
          ctx.stroke();
          ctx.fillStyle = COL.yellow;
          ctx.fillText(`${f} Hz`, a.X(f) + 3, a.pad.t + 10);
        }
    }
  });

  /**
   * The room as the original drew it: a purple wireframe — plan, side
   * elevation (Y–Z), end elevation (X–Z) or axonometric — with the speakers as
   * red boxes and the listener as a red circle.
   */
  function drawRoomView(cv, view, speakers, lis) {
    const p = prep(cv);
    if (!p) return;
    const { ctx, w, h: hh } = p;
    const cos30 = Math.cos(Math.PI / 6);
    const proj = {
      plan: (P) => [P.X, P.Y],
      side: (P) => [P.Y, -P.Z],
      end: (P) => [P.X, -P.Z],
      '3d': (P) => [(P.X - P.Y) * cos30, (P.X + P.Y) * 0.5 - P.Z],
    }[view];
    const corners = [];
    for (const X of [0, M.W]) for (const Y of [0, M.L]) for (const Z of [0, M.H]) corners.push({ X, Y, Z });
    const pts = corners.map(proj);
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min((w - 60) / (maxX - minX || 1), (hh - 60) / (maxY - minY || 1));
    const ox = (w - (maxX - minX) * k) / 2 - minX * k;
    const oy = (hh - (maxY - minY) * k) / 2 - minY * k;
    const S2 = (P) => {
      const [u, v] = proj(P);
      return [ox + u * k, oy + v * k];
    };
    const line = (A, B) => {
      const a = S2(A);
      const b = S2(B);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    };
    const boxEdges = (x0, x1, y0, y1, z0, z1) => {
      const c = (X, Y, Z) => ({ X, Y, Z });
      for (const [Y, Z] of [[y0, z0], [y1, z0], [y0, z1], [y1, z1]]) line(c(x0, Y, Z), c(x1, Y, Z));
      for (const [X, Z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) line(c(X, y0, Z), c(X, y1, Z));
      for (const [X, Y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) line(c(X, Y, z0), c(X, Y, z1));
    };
    // a faint floor grid, one line a metre, then the room
    ctx.strokeStyle = 'rgba(176,64,255,0.28)';
    ctx.beginPath();
    for (let X = 1; X < M.W; X++) line({ X, Y: 0, Z: 0 }, { X, Y: M.L, Z: 0 });
    for (let Y = 1; Y < M.L; Y++) line({ X: 0, Y, Z: 0 }, { X: M.W, Y, Z: 0 });
    ctx.stroke();
    ctx.strokeStyle = COL.purple;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    boxEdges(0, M.W, 0, M.L, 0, M.H);
    ctx.stroke();
    ctx.strokeStyle = COL.red;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const s of speakers) boxEdges(s.X - 0.13, s.X + 0.13, s.Y - 0.08, s.Y + 0.16, s.Z - 0.2, s.Z + 0.2);
    ctx.stroke();
    const L0 = S2(lis);
    ctx.beginPath();
    ctx.arc(L0[0], L0[1], 6, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = COL.title;
    const names = { plan: 'Plan', side: 'Side Elevation', end: 'End Elevation', '3d': '3-Dimensional' };
    ctx.fillText(`Room View — ${names[view]}   ${fmt(toU(M.L))} × ${fmt(toU(M.W))} × ${fmt(toU(M.H))} ${M.units}`, 8, 14);
    ctx.fillStyle = COL.text;
    if (view === 'plan') ctx.fillText('front wall ↑', 8, hh - 8);
    if (view === 'side') ctx.fillText('← front wall', 8, hh - 8);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3. RAY TRACING
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('rays', 'Acoustic X — Ray Tracing', { w: 820, h: 560 }, (win) => {
    const S = { band: 3, order: 2, spk2: true, va: { step: 5, begin: -90, end: 90 }, ha: { step: 5, begin: 0, end: 355 }, mode: 'total', idx: 1, res: null };
    const T = tabs(win, ['Room', 'SPK', 'LS', 'Acoustics', 'Sim']);
    T.pages.Room.append(dimsGroup(win));
    const s2c = h('input', { type: 'checkbox', onchange: () => ((S.spk2 = s2c.checked), win.refresh()) });
    win.syncers.push(() => (s2c.checked = S.spk2));
    T.pages.SPK.append(pointGroup(win, 'Speaker1', () => M.spk1, (v) => (M.spk1 = v)), h('label', { class: 'opt' }, s2c, 'Speaker2 on (mirror image)'), pointGroup(win, 'Speaker2', spk2, () => {}, { disabled: () => true }));
    T.pages.LS.append(pointGroup(win, 'Listening Position', () => M.lis, (v) => (M.lis = v)));
    const bandSel = h('select', {}, BAND_LABELS.map((l, i) => h('option', { value: i }, l)));
    bandSel.addEventListener('change', () => ((S.band = +bandSel.value), win.refresh()));
    const alphaRo = Object.fromEntries(FACES6.map((f) => [f, readout('α in the chosen band')]));
    win.syncers.push(() => {
      bandSel.value = String(S.band);
      for (const f of FACES6) alphaRo[f].textContent = `α ${fmt(material(M.mats[f]).alpha[S.band], 2)}`;
    });
    T.pages.Acoustics.append(
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Octave band'), bandSel),
      group('Surfaces', ...FACES6.map((f) => h('div', {}, h('div', { class: 'row' }, h('span', { class: 'lbl' }, FACE_LABEL[f]), alphaRo[f]), faceMatSelect(win, f)))),
    );
    const cosmetic = 'Cosmetic: this window traces image sources, which is exact for a box. The angles are kept for the classic layout and only feed the Total Traces readout.';
    const orderSel = h('select', { title: 'Image-source order: how many bounces a path may take' }, [1, 2, 3, 4].map((n) => h('option', { value: n }, n)));
    orderSel.addEventListener('change', () => ((S.order = +orderSel.value), win.refresh()));
    win.syncers.push(() => (orderSel.value = String(S.order)));
    const traces = readout();
    const imgs = readout();
    const ang = (o, legend) =>
      h('fieldset', { title: cosmetic }, h('legend', {}, legend), numField(win, 'Step', '°', () => o.step, (v) => (o.step = Math.max(0.5, v)), { title: cosmetic }), numField(win, 'Begin', '°', () => o.begin, (v) => (o.begin = v), { title: cosmetic }), numField(win, 'End', '°', () => o.end, (v) => (o.end = v), { title: cosmetic }));
    T.pages.Sim.append(
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Number of Reflections'), orderSel),
      ang(S.va, 'Vertical Angle'),
      ang(S.ha, 'Horizontal Angle'),
      h('div', { class: 'row', title: cosmetic }, h('span', { class: 'lbl' }, 'Total Traces'), traces),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Image sources'), imgs),
    );

    const top = chartBox('flex:1');
    const bot = chartBox('flex:1.2');
    const modeR = [
      ['single', 'Single Impulse / Surface'],
      ['total', 'Total Energy / Surface'],
    ].map(([v, l]) => {
      const r = h('input', { type: 'radio', name: 'acx-ray-mode', onchange: () => ((S.mode = v), win.render()) });
      win.syncers.push(() => (r.checked = S.mode === v));
      return h('label', { class: 'opt' }, r, l);
    });
    const ro = { t: readout(), l: readout(), s: readout(), flag: readout('Reflections within 10 dB of the direct sound') };
    const stepTo = (d) => {
      const n = S.res?.arrivals.length ?? 0;
      if (!n) return;
      S.idx = (S.idx + d + n) % n;
      S.mode = 'single';
      win.sync();
      win.render();
    };
    bot.cv.addEventListener('click', (e) => {
      if (!S.res || !bot.map) return;
      const r = bot.cv.getBoundingClientRect();
      const t = bot.map.Xinv(e.clientX - r.left);
      let best = 0;
      S.res.arrivals.forEach((a, i) => Math.abs(a.t - t) < Math.abs(S.res.arrivals[best].t - t) && (best = i));
      S.idx = best;
      S.mode = 'single';
      win.sync();
      win.render();
    });
    const rr = (l, el, u) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, l), el, u ?? null);
    win.el.append(
      h(
        'div',
        { class: 'acx-body' },
        h('div', { class: 'acx-left' }, T.nodes),
        h(
          'div',
          { class: 'acx-right' },
          h('fieldset', { class: 'grow' }, h('legend', {}, 'Energy'), h('div', { style: 'display:flex;flex-direction:column;gap:4px;flex:1;min-height:0' }, top.box, bot.box)),
          group('Chart View Manager', h('div', { class: 'manager' }, ...modeR), h('div', { class: 'manager' }, rr('Time', ro.t, 'ms'), rr('Level', ro.l, 'dB'), rr('Surface', ro.s), rr('Flagged', ro.flag), h('button', { onclick: () => stepTo(-1) }, '◄ Prev'), h('button', { onclick: () => stepTo(1) }, 'Next ►'))),
        ),
      ),
    );

    const BUCKETS = ['direct', 'left', 'back', 'right', 'front', 'floor', 'ceiling'];
    win.compute = () => {
      const room = box();
      const l = toBox(M.lis);
      const srcs = [M.spk1, ...(S.spk2 ? [spk2()] : [])].map(toBox);
      const arrivals = [];
      let nImg = 0;
      srcs.forEach((src, si) => {
        const images = roomImages(room, src, S.order);
        nImg += images.length;
        for (const img of images) {
          const r = Math.max(0.05, Math.hypot(img.x - l.x, img.y - l.y, img.z - l.z));
          const e = img.reflAbs[S.band] / (r * r);
          const touched = img.order === 0 ? ['direct'] : [...new Set([...img.walls.map((i) => room.walls[i].face), ...(img.floor ? ['floor'] : []), ...(img.ceiling ? ['ceiling'] : [])])];
          arrivals.push({ speaker: si, t: (r / C) * 1000, e, order: img.order, surfaces: touched });
        }
      });
      const ref = Math.max(...arrivals.filter((a) => a.order === 0).map((a) => a.e));
      for (const a of arrivals) a.level = 10 * Math.log10(a.e / ref);
      const kept = arrivals.filter((a) => a.level > -60).sort((a, b) => a.t - b.t);
      const totals = Object.fromEntries(BUCKETS.map((b) => [b, dbSum(kept.filter((a) => a.surfaces.includes(b)).map((a) => a.level))]));
      S.res = { arrivals: kept, totals, nImg };
      if (S.idx >= kept.length) S.idx = 0;
      const n = (o) => Math.max(1, Math.floor(Math.abs(o.end - o.begin) / o.step) + 1);
      traces.textContent = String(n(S.va) * n(S.ha) * srcs.length);
      imgs.textContent = String(nImg);
    };

    win.render = () => {
      if (!S.res) return;
      const { arrivals, totals } = S.res;
      const cur = arrivals[S.idx];
      const flagged = arrivals.filter((a) => a.order > 0 && a.level > -10);
      ro.t.textContent = cur ? fmt(cur.t, 2) : '';
      ro.l.textContent = cur ? fmt(cur.level, 1) : '';
      ro.s.textContent = cur ? cur.surfaces.join(' + ') : '';
      ro.flag.textContent = String(flagged.length);
      drawSurfaces(S.mode === 'single' && cur ? Object.fromEntries(BUCKETS.map((b) => [b, cur.surfaces.includes(b) ? cur.level : -Infinity])) : totals);
      drawTime(arrivals, cur);
    };

    function drawSurfaces(levels) {
      const p = prep(top.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const a = axes(ctx, w, hh, { title: `Energy (dB) / Surface — ${S.mode === 'single' ? 'single impulse' : 'total energy'}, ${BAND_LABELS[S.band]}`, cats: ['Direct', 'Left', 'Back', 'Right', 'Front', 'Floor', 'Ceiling'], x0: 0, x1: 1, y0: -50, y1: 5, yticks: [-50, -40, -30, -20, -10, 0] });
      BUCKETS.forEach((b, i) => {
        const v = levels[b];
        if (!Number.isFinite(v)) return;
        const s = a.slot(i);
        const bw = s.w * 0.5;
        const y = a.Y(v);
        ctx.fillStyle = COL.white;
        ctx.fillRect(s.x + (s.w - bw) / 2, y, bw, a.Y(-50) - y);
        ctx.fillStyle = COL.text;
        ctx.textAlign = 'center';
        ctx.fillText(fmt(v, 1), s.x + s.w / 2, y - 3);
        ctx.textAlign = 'left';
      });
    }

    function drawTime(arrivals, cur) {
      const p = prep(bot.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const tEnd = Math.max(20, Math.ceil((Math.max(...arrivals.map((x) => x.t)) + 5) / 10) * 10);
      const step = tEnd > 100 ? 20 : 10;
      const a = axes(ctx, w, hh, { title: 'Energy (dB) / Time (ms)', x0: 0, x1: tEnd, y0: -50, y1: 5, xticks: Array.from({ length: Math.floor(tEnd / step) + 1 }, (_, i) => ({ v: i * step, label: String(i * step) })), yticks: [-50, -40, -30, -20, -10, 0], xLabel: 'ms' });
      bot.map = a;
      for (const x of arrivals) {
        const px = Math.round(a.X(x.t));
        const y = a.Y(x.level);
        ctx.fillStyle = x === cur ? COL.white : COL.green;
        ctx.fillRect(px - 1, y, 2, a.Y(-50) - y);
        if (x.order > 0 && x.level > -10) {
          ctx.fillStyle = COL.red;
          ctx.beginPath();
          ctx.moveTo(px, y - 3);
          ctx.lineTo(px - 4, y - 9);
          ctx.lineTo(px + 4, y - 9);
          ctx.fill();
        }
      }
      ctx.strokeStyle = COL.cyan;
      ctx.beginPath();
      ctx.moveTo(a.pad.l, Math.round(a.Y(-10)) + 0.5);
      ctx.lineTo(w - a.pad.r, Math.round(a.Y(-10)) + 0.5);
      ctx.stroke();
      ctx.fillStyle = COL.cyan;
      ctx.textAlign = 'right';
      ctx.fillText('−10 dB re direct', w - a.pad.r - 4, a.Y(-10) - 4);
      ctx.textAlign = 'left';
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 4. REVERB TIME
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('reverb', 'Acoustic X — Reverb Time', { w: 820, h: 560 }, (win) => {
    const S = { target: 'control', user: 0.4, formula: 'sabine', absorber: 'absorber-100', face: '', band: 2, sol: null, res: null };
    const T = tabs(win, ['Surfaces', 'Room Type', 'Optimise']);
    const volRo = readout();
    const areaField = (f) => {
      const inp = h('input', { type: 'number', step: 0.1, style: 'width:58px', title: `${FACE_LABEL[f]} area` });
      const unit = h('span', { class: 'unit' });
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (!Number.isFinite(v) || v < 0) return win.sync();
        M.areas = { ...(M.areas ?? boxAreas()), [f]: areaFromU(v) };
        edited();
      });
      win.syncers.push(() => {
        if (document.activeElement !== inp) inp.value = fmt(areaU(M.areas?.[f] ?? boxAreas()[f]), 1);
        unit.textContent = aUnit();
      });
      return [inp, unit];
    };
    const extraRow = h('div', { class: 'small' });
    T.pages.Surfaces.append(
      dimsGroup(win, [h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Volume'), volRo)]),
      group('Surfaces', ...FACES6.map((f) => h('div', {}, h('div', { class: 'row' }, h('span', { class: 'lbl' }, FACE_LABEL[f]), ...areaField(f)), faceMatSelect(win, f))), extraRow),
    );
    const typeRadios = RT_TARGETS.map((t) => {
      const r = h('input', { type: 'radio', name: 'acx-rt-type', onchange: () => ((S.target = t.id), win.refresh()) });
      win.syncers.push(() => (r.checked = S.target === t.id));
      return h('div', {}, h('label', { class: 'opt', title: t.source }, r, t.label), h('span', { class: 'small muted' }, t.source));
    });
    const formulaRadios = FORMULAS.map((f) => {
      const r = h('input', { type: 'radio', name: 'acx-rt-f', onchange: () => ((S.formula = f.id), win.refresh()) });
      win.syncers.push(() => (r.checked = S.formula === f.id));
      return h('div', {}, h('label', { class: 'opt' }, r, f.label));
    });
    T.pages['Room Type'].append(group('Room Type (reference)', ...typeRadios, numField(win, 'User target', 's', () => S.user, (v) => (S.user = clamp(v, 0.05, 5)), { step: 0.05 })), group('Formula', ...formulaRadios));

    const absSel = matSelect(win, () => S.absorber, (v) => ((S.absorber = v), win.refresh()), 'The material to add');
    const faceSel = h('select', {}, h('option', { value: '' }, 'Anywhere (spread)'), FACES6.map((f) => h('option', { value: f }, FACE_LABEL[f])));
    faceSel.addEventListener('change', () => ((S.face = faceSel.value), win.refresh()));
    const bandSel = h('select', {}, BAND_LABELS.map((l, i) => h('option', { value: i }, l)));
    bandSel.addEventListener('change', () => ((S.band = +bandSel.value), win.refresh()));
    win.syncers.push(() => {
      faceSel.value = S.face;
      bandSel.value = String(S.band);
    });
    const solBox = h('div', { class: 'small', style: 'margin-top:6px' });
    T.pages.Optimise.append(
      group('Absorber', absSel, h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Replacing'), faceSel), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Solve at'), bandSel)),
      h(
        'div',
        { class: 'btns' },
        h('button', { onclick: () => ((S.sol = solve()), win.render()), title: 'How much of it hits the reference in the chosen band (Sabine)' }, 'Optimise'),
        h('button', { onclick: () => S.sol && ((M.extra = { id: S.absorber, area: S.sol.area, face: S.face }), edited()) }, 'Apply'),
        h('button', { onclick: () => ((M.extra = null), edited()) }, 'Remove'),
      ),
      solBox,
    );
    function solve() {
      const room = classicRoom(false);
      const tgt = rtTarget(S.target, room.V, S.user).rt[S.band];
      return { ...absorberAreaFor(room, S.absorber, tgt, S.band, { face: S.face || null }), tgt };
    }

    const chart = chartBox();
    const tbl = h('tbody');
    win.el.append(
      h(
        'div',
        { class: 'acx-body' },
        h('div', { class: 'acx-left' }, T.nodes),
        h(
          'div',
          { class: 'acx-right' },
          h('fieldset', { class: 'grow' }, h('legend', {}, 'Reverb Time'), chart.box),
          group('Formula Comparison (s)', h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, ''), BAND_LABELS.map((l) => h('th', {}, l)))), tbl)),
        ),
      ),
    );

    win.compute = () => {
      const room = classicRoom();
      const all = BANDS.map((_, b) => rtFormulas(room, b));
      S.res = { room, all, target: rtTarget(S.target, room.V, S.user) };
    };

    win.render = () => {
      if (!S.res) return;
      const { room, all, target } = S.res;
      volRo.textContent = M.units === 'ft' ? `${fmt(room.V * FT ** 3, 0)} ft³` : `${fmt(room.V, 1)} m³`;
      extraRow.textContent = M.extra ? `+ ${fmt(areaU(M.extra.area), 1)} ${aUnit()} of ${material(M.extra.id).name} on ${M.extra.face ? FACE_LABEL[M.extra.face] : 'every surface'}` : '';
      if (S.sol) {
        const s = S.sol;
        solBox.replaceChildren(
          h('div', {}, `Target ${fmt(s.tgt, 2)} s at ${BAND_LABELS[S.band]}: needs A = ${fmt(s.needA, 1)} m² (now ${fmt(s.haveA, 1)}).`),
          h('div', { class: s.feasible ? '' : 'warn' }, s.feasible ? `Add ${fmt(areaU(s.area), 1)} ${aUnit()} of ${material(S.absorber).name}.` : s.needA < s.haveA ? 'The room is already deader than the target — this cannot help.' : `Not enough area: even ${fmt(areaU(s.maxArea), 1)} ${aUnit()} falls short.`),
        );
      } else solBox.textContent = '';
      tbl.replaceChildren(
        ...FORMULAS.map((f) => h('tr', { class: f.id === S.formula ? 'sel' : '' }, h('td', {}, f.label), all.map((r) => h('td', {}, fmt(r[f.id], 2))))),
        h('tr', {}, h('td', {}, 'Reference'), target.rt.map((t) => h('td', {}, fmt(t, 2)))),
      );
      drawRt(all.map((r) => r[S.formula]), target);
    };

    function drawRt(rt, target) {
      const p = prep(chart.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const top = Math.max(0.5, Math.ceil(Math.max(...rt.filter(Number.isFinite), ...target.hi) * 12) / 10);
      const tick = top > 2 ? 0.5 : top > 1 ? 0.2 : 0.1;
      const a = axes(ctx, w, hh, { title: `Reverb Time (s) / Frequency (Hz) — ${FORMULAS.find((f) => f.id === S.formula).label}`, cats: BANDS.map((b) => (b >= 1000 ? `${b / 1000}k` : String(b))), x0: 0, x1: 1, y0: 0, y1: top, yticks: Array.from({ length: Math.floor(top / tick + 1e-9) + 1 }, (_, i) => +(i * tick).toFixed(2)), fmtY: (v) => v.toFixed(1), xLabel: 'Hz' });
      const mid = (i) => a.slot(i).x + a.slot(i).w / 2;
      rt.forEach((v, i) => {
        const s = a.slot(i);
        const bw = s.w * 0.5;
        const y = a.Y(v);
        ctx.fillStyle = COL.green;
        ctx.fillRect(s.x + (s.w - bw) / 2, y, bw, a.Y(0) - y);
        ctx.fillStyle = COL.lime;
        ctx.textAlign = 'center';
        ctx.fillText(fmt(v, 2), mid(i), y - 3);
        ctx.textAlign = 'left';
      });
      const poly = (vals, style, dash) => {
        ctx.strokeStyle = style;
        ctx.setLineDash(dash);
        ctx.beginPath();
        vals.forEach((v, i) => (i ? ctx.lineTo(mid(i), a.Y(v)) : ctx.moveTo(mid(i), a.Y(v))));
        ctx.stroke();
        ctx.setLineDash([]);
      };
      poly(target.lo, COL.grey, [3, 3]);
      poly(target.hi, COL.grey, [3, 3]);
      ctx.lineWidth = 2;
      poly(target.rt, COL.yellow, []);
      ctx.lineWidth = 1;
      ctx.fillStyle = COL.yellow;
      ctx.textAlign = 'right';
      ctx.fillText(`Reference: ${RT_TARGETS.find((t) => t.id === S.target).label}`, w - 14, 30);
      ctx.textAlign = 'left';
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 5. CALCULATOR
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('calc', 'Acoustic X — Calculator', { w: 400, h: 540, foot: false }, (win) => {
    const S = { metric: true };
    const k = () => (S.metric ? 1 : FT);
    const u = () => (S.metric ? 'm' : 'ft');
    const inp = (v, title) => h('input', { type: 'text', value: v, title, oninput: () => calc() });
    const out = () => readout();
    const mR = h('input', { type: 'radio', name: 'acx-calc-u', checked: true, onchange: () => ((S.metric = true), calc()) });
    const iR = h('input', { type: 'radio', name: 'acx-calc-u', onchange: () => ((S.metric = false), calc()) });
    const I = { l1: inp('90', 'Level at the first distance, dB'), d1: inp('1'), d2: inp('4'), levels: inp('90, 90, 87', 'Levels to add, separated by commas'), f: inp('100'), lam: inp('1'), delay: inp('1', 'Delay, ms'), path: inp('0.343', 'Path difference') };
    const O = { l2: out(), sum: out(), lamOut: out(), fOut: out(), notches: h('div', { class: 'small', style: 'margin-top:3px' }), first: out(), pathMs: out() };
    const unitSpans = [];
    const U = () => {
      const s = h('span', { class: 'unit' });
      unitSpans.push(s);
      return s;
    };
    const row = (l, ...kids) => h('div', { class: 'row' }, h('label', {}, l), ...kids);
    win.el.append(
      h(
        'div',
        { class: 'acx-calc' },
        group('Units', h('label', { class: 'opt' }, mR, 'Metric'), h('label', { class: 'opt' }, iR, 'Imperial'), h('span', { class: 'small muted' }, `c = 343 m/s (1125 ft/s)`)),
        group('Inverse Square Law', row('Level at d1 (dB)', I.l1), row('d1', I.d1, U()), row('d2', I.d2, U()), row('Level at d2 (dB)', O.l2)),
        group('Add Levels', row('Levels (dB)', I.levels), row('Sum (dB)', O.sum)),
        group('Frequency ↔ Wavelength', row('Frequency (Hz)', I.f), row('Wavelength', O.lamOut), row('Wavelength', I.lam, U()), row('Frequency (Hz)', O.fOut)),
        group('Comb Filter', row('Delay (ms)', I.delay), row('First notch (Hz)', O.first), O.notches, row('Path difference', I.path, U()), row('Delay (ms)', O.pathMs)),
      ),
    );
    const num = (el) => parseFloat(String(el.value).replace(',', '.'));
    function calc() {
      for (const s of unitSpans) s.textContent = u();
      const l1 = num(I.l1);
      const d1 = num(I.d1);
      const d2 = num(I.d2);
      O.l2.textContent = d1 > 0 && d2 > 0 ? fmt(l1 - 20 * Math.log10(d2 / d1), 1) : '—';
      const lv = String(I.levels.value).split(/[,;\s]+/).map(Number).filter(Number.isFinite);
      O.sum.textContent = lv.length ? fmt(dbSum(lv), 1) : '—';
      const f = num(I.f);
      O.lamOut.textContent = f > 0 ? `${fmt((C / f) * k(), 3)} ${u()}  (½ ${fmt((C / f / 2) * k(), 3)}, ¼ ${fmt((C / f / 4) * k(), 3)})` : '—';
      const lam = num(I.lam) / k();
      O.fOut.textContent = lam > 0 ? fmt(C / lam, 1) : '—';
      const tau = num(I.delay) / 1000;
      if (tau > 0) {
        O.first.textContent = fmt(1 / (2 * tau), 1);
        O.notches.textContent = `Notches every ${fmt(1 / tau, 1)} Hz: ${Array.from({ length: 8 }, (_, n) => fmt((2 * n + 1) / (2 * tau), 0)).join(', ')} Hz …`;
      } else {
        O.first.textContent = '—';
        O.notches.textContent = '';
      }
      const path = num(I.path) / k();
      O.pathMs.textContent = path >= 0 ? fmt((path / C) * 1000, 3) : '—';
    }
    win.refresh = calc;
    calc();
  });

  // ── About ──
  makeWindow('about', 'About Acoustic X (classic)', { w: 380, h: 210, foot: false }, (win) => {
    win.el.append(
      h(
        'div',
        { class: 'about' },
        h('p', {}, h('b', {}, ACX_LABEL)),
        h('p', {}, 'Modal response, speaker boundary interference, early reflections and reverberation time, laid out the way the 1998 Windows 95 program (reviewed in Sound On Sound, December 1998) laid them out.'),
        h('p', { class: 'muted' }, "Not Pilchner-Schoustal's software: every number here is computed by ACOUSTIC.LIKE.AUDIO's own acoustics, from the room being designed."),
        h('div', { class: 'btns' }, h('button', { onclick: () => close('about') }, 'OK')),
      ),
    );
    win.refresh = () => {};
  });

  // ── the launcher ──
  const MENU = [
    ['modal', 'Modal Response'],
    ['sbir', 'Speaker Boundary Interference Response'],
    ['rays', 'Ray Tracing'],
    ['reverb', 'Reverb Time'],
    ['calc', 'Calculator'],
  ];
  const menu = h('div', { class: 'acx-menu', hidden: true }, h('div', { class: 'note small' }, ACX_LABEL), h('div', { class: 'sep' }), MENU.map(([n, l]) => h('div', { class: 'item', onclick: () => (open(n), (menu.hidden = true)) }, l)), h('div', { class: 'sep' }), h('div', { class: 'item', onclick: () => (open('about'), (menu.hidden = true)) }, 'About…'));
  const launchB = h('button', { title: ACX_LABEL, onclick: (e) => (e.stopPropagation(), (menu.hidden = !menu.hidden)) }, 'Acoustic X ▾');
  const launch = h('span', { class: 'acx acx-launch' }, launchB, menu);
  document.addEventListener('pointerdown', (e) => !launch.contains(e.target) && (menu.hidden = true));
  mount?.append(launch);

  function open(name) {
    const w = wins[name];
    if (!w) return;
    if (M.linked) pullFromRoom();
    w.el.hidden = false;
    w.el.classList.remove('min');
    front(w);
    requestAnimationFrame(() => w.refresh());
  }
  function close(name) {
    const w = wins[name];
    if (w) w.el.hidden = true;
  }

  // ── follow the room ──
  let pending = 0;
  store?.subscribe?.((state, what) => {
    if (!['model', 'settings', 'state', 'geometry', 'mirror'].includes(what)) return;
    if (!Object.values(wins).some((w) => !w.el.hidden)) return;
    clearTimeout(pending);
    // after the host's own subscriber has run engine.update(), so engine.out.room is the new room
    pending = setTimeout(() => {
      if (M.linked) pullFromRoom();
      boxKey = '';
      refreshAll();
    }, 30);
  });
  pullFromRoom();

  return { open, close };
}
