// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { BANDS, BAND_LABELS, C, dbSum } from '../acoustics/bands.js';
import { MATERIALS, material as baseMaterial } from '../acoustics/materials.js';
import { buildRoom, fromFrame, inFrame } from '../acoustics/room.js';
import { SPEAKER_PRESETS, boxSize } from '../acoustics/devices.js';
import { FAVOURABLE_RATIOS, bonello, dimensionGrid, ituBs1116, keepBest, modeList, scoreDimensions, steps, thirdOctaveBands } from '../acoustics/modalDistribution.js';
import { sbirDeviation, sbirFreqs } from '../acoustics/sbir.js';
import { FORMULAS, RT_TARGETS, rtFormulas, rtTarget } from '../acoustics/reverbTargets.js';
import {
  ACOUSTX_ABSORBERS,
  ACOUSTX_FREQ_3RD,
  ACOUSTX_FREQ_OCTAVE,
  ACOUSTX_SPEAKERS,
  findAbsorber,
  findSpeaker,
} from './database.js';

const material = (id) => findAbsorber(id) ?? baseMaterial(id);
import {
  MODE_WEIGHTS,
  UNITS,
  addLevels,
  airDbPerM,
  combNulls,
  convert,
  crossoverCheck,
  equalAreaDirections,
  idealCounts,
  inverseSquare,
  listenerGeometry,
  modeFreq,
  modeShape,
  modeType,
  optimiseAreas,
  polarEnergy,
  pressureField,
  raysToward,
  roomFigures,
  rtFromMeasured,
  sbirScore,
  specularAbsorbers,
  speedOfSound,
  surroundPositions,
  traceRays,
} from './classic.js';
import { DEFAULT_USER, VIEWS, boxPath, drawBox, fit, nudgeUser, project } from './roomView.js';
import { renderMarkdown } from './markdown.js';

/**
 * ACOUSTIC X (CLASSIC)
 *
 * In the style of Pilchner-Schoustal's 1997 room-acoustics program (its
 * manual: Acoustic-X Release 1.0; reviewed in Sound On Sound, December 1998)
 * — not their software, none of their code or artwork: the same questions it
 * asked, laid out the way its windows laid them out, answered by this app's
 * own acoustics (classic.js holds the arithmetic, roomView.js the wire-frame).
 *
 *   START SCREEN     the modules, and the project (description, client,
 *                    location) every report carries.
 *   MODAL RESPONSE   how the box's modes spread against the count a room of
 *                    that volume should have (Bolt), the Bonello check, the
 *                    dimension optimiser, and the pressure of one mode or a
 *                    band of them, on a plane or through the room.
 *   SBIR             a speaker's boundary interference at the listener above
 *                    its LF cut-off, the crossover check, an absolute or
 *                    negative-only placement search, the modes the position
 *                    excites, the listening window and the specular absorbers
 *                    that keep it clean, and the centre and rears.
 *   RAY TRACING      equal-area rays from each speaker, followed for up to
 *                    fourteen bounces and caught at the listener: energy by
 *                    surface and by time, the 10 dB window, the polar energy,
 *                    the room's figures and the comb nulls by surface.
 *   REVERB TIME      materials laid on each surface by area, four formulas
 *                    or a measured empty room, criteria by room type or your
 *                    own, and the optimiser that tries every combination of
 *                    up to five material areas.
 *   CALCULATOR       units, spreading, level addition, frequency /
 *                    wavelength / period, comb filters.
 *   GENERAL          temperature (the speed of sound) and humidity (the air's
 *   PARAMETERS       absorption), the Display Axis, the modal weights, the
 *                    SBIR search limits and surround options.
 *   FAST GUIDE       five steps for the module in front.
 *   REPORTS          every module's Data View, previewed, printed, or saved as
 *                    CSV, HTML, tab-separated or plain text.
 *
 * Each module window shows its results three ways, as the original did: the
 * ROOM VIEW (the box as a wire-frame — plan, side, end, 3-D, or a user view
 * turned and moved with the Set panel), the CHART VIEW, and the DATA VIEW
 * (the lists and the report).
 *
 * THE CLASSIC MODEL. Like the original, these windows think in a plain box:
 * L front-to-back, W left-to-right, H high, six surfaces with one material
 * each (and, in Reverb Time, materials laid on them by area). Positions are
 * CLASSIC coordinates — X from the left wall, Y from the front wall, Z above
 * the floor. Every window opens on the room being designed (engine.out.room:
 * its working-space L × W × H, its face materials, the speaker pair and the
 * mix mic, mapped through the room's front frame), and stays LINKED to it —
 * redrawn as the room changes — until an input is edited for a what-if.
 * "↻ From room" links it again. Patches painted in the CAD are not part of
 * the classic model.
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
/** A sunken read-only value. Its own class: the app's .readout is absolutely placed, and must never reach in here. */
const readout = (title) => h('span', { class: 'acx-ro', title });
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
    linked: true,
    /** General Parameters: temperature (c), humidity (air), Display Axis, modal weights, SBIR search and surround options. */
    gen: { tempC: 20, rh: 50, axis: true, weights: { ...MODE_WEIGHTS }, sbir: { custom: false, frontMin: 0.3, frontMax: 2, sideMin: 0.3, sideMax: 2, minSpk: 1.2, centre: false, rear: false, rearRise: 0 } },
    /** The Start Screen's project lines, on every report. */
    project: { description: '', client: '', location: '' },
    /** The speaker: its cabinet, woofer height above its bottom, LF cut-off and crossover (SBIR). */
    spkModel: 'acx-spk-4',
    spkSize: { w: 0.25, d: 0.29, h: 0.393 },
    woofer: 0.12,
    centerHeight: 0.24,
    lfCut: 48,
    xover: 2200,
    /** Reverb Time: materials laid on each surface by area, { face: [{ id, area }] }; the base material covers the rest. */
    layers: {},
    /** A measured empty-room RT60 per octave, or null. */
    measured: null,
    /** The specular absorbers the SBIR window last placed, for Ray Tracing. */
    absorbers: null,
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
    // the left main: the selected speaker, or the arrangement's L, or the left of a mirrored pair
    const s1 = sel ?? spk.find((s) => s.role === 'L') ?? spk.find((s) => s.pairId && s.side === 'L') ?? spk.find((s) => s.pairId) ?? spk[0] ?? null;
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
  /** The six surfaces, each its base material over what the laid materials leave, and the laid ones as surfaces of their own on the same face. */
  function classicRoom() {
    const b = boxAreas();
    const surfaces = [];
    for (const f of FACES6) {
      const area = M.areas?.[f] ?? b[f];
      const layers = M.layers[f] ?? [];
      const used = Math.min(area, layers.reduce((s, l) => s + l.area, 0));
      surfaces.push({ face: f, key: f, area: Math.max(0, area - used), material: material(M.mats[f]) });
      layers.forEach((l, i) => surfaces.push({ face: f, key: `${f}+${i}`, area: Math.min(l.area, area), material: material(l.id) }));
    }
    return { V: M.V ?? M.L * M.W * M.H, surfaces };
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

  /** The window in front: what the tool bar, the Display menu and F1 act on. */
  let frontWin = null;
  function front(win) {
    frontWin = win;
    win.el.style.zIndex = String(++zTop);
    for (const w of Object.values(wins)) w.el.classList.toggle('front', w === win);
    // the Fast Guide follows the module in front
    if (GUIDE[win.name] && guideFor !== win.name) {
      guideFor = win.name;
      if (!wins.guide?.el.hidden) wins.guide.refresh();
    }
  }

  function makeWindow(name, title, size, build) {
    const k = Object.keys(wins).length;
    const el = h('div', { class: 'acx-win', hidden: true, style: `left:${40 + 28 * k}px;top:${56 + 24 * k}px;width:${size.w}px;height:${size.h}px` });
    const win = { name, el, syncers: [], status: null, progress: null, refresh: null, render: () => {}, compute: () => {} };
    const helpB = h('button', { title: 'Help on this window (F1)', onclick: () => openHelp(HELP_FOR[name]) }, '?');
    const minB = h('button', { title: 'Minimise', onclick: () => el.classList.toggle('min') }, '_');
    const maxB = h('button', { title: 'Maximise', onclick: () => toggleMax() }, '□');
    const xB = h('button', { class: 'x', title: 'Close', onclick: () => close(name) }, '×');
    // the control menu behind the title-bar icon, as Windows 95 had it: a click opens it, a double-click closes the window
    const item = (label, act, enabled = () => true) => {
      const it = h('div', { class: 'item', onclick: (e) => (e.stopPropagation(), (sys.hidden = true), enabled() && act()) }, label);
      it.dataset.label = label;
      return [it, enabled];
    };
    const sysItems = [
      item('Restore', () => (el.classList.contains('max') ? toggleMax() : el.classList.remove('min')), () => el.classList.contains('max') || el.classList.contains('min')),
      item('Minimize', () => el.classList.add('min'), () => !el.classList.contains('min')),
      item('Maximize', () => toggleMax(), () => !el.classList.contains('max')),
    ];
    const closeItem = item('Close', () => close(name));
    const sys = h('div', { class: 'acx-menu acx-sys', hidden: true }, sysItems.map(([it]) => it), h('div', { class: 'sep' }), closeItem[0]);
    const ico = icon();
    ico.addEventListener('click', (e) => {
      e.stopPropagation();
      for (const [it, en] of sysItems) it.classList.toggle('off', !en());
      sys.hidden = !sys.hidden;
    });
    ico.addEventListener('dblclick', (e) => (e.stopPropagation(), close(name)));
    document.addEventListener('pointerdown', (e) => !sys.contains(e.target) && e.target !== ico && !ico.contains(e.target) && (sys.hidden = true));
    const bar = h('div', { class: 'acx-title', ondblclick: () => toggleMax() }, ico, h('span', { class: 'txt' }, title), helpB, minB, maxB, xB, sys);
    function toggleMax() {
      el.classList.remove('min');
      el.classList.toggle('max');
      maxB.textContent = el.classList.contains('max') ? '❐' : '□';
      requestAnimationFrame(() => win.render());
    }
    bar.addEventListener('pointerdown', (e) => {
      // the buttons, the icon and its menu take their own clicks: only the bare title bar drags
      if (e.target.closest('button, .ico, .acx-sys') || el.classList.contains('max')) return;
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
    const sources = [...new Set(ACOUSTX_ABSORBERS.map((a) => a.source || 'Other'))];
    const acxGroups = sources.map((src) =>
      h(
        'optgroup',
        { label: `Acoustic X · ${src}` },
        ACOUSTX_ABSORBERS.filter((a) => (a.source || 'Other') === src).map((a) =>
          h('option', { value: a.id }, `${a.name}${a.comments ? ` (${a.comments})` : ''}`),
        ),
      ),
    );
    const cats = [...new Set(MATERIALS.map((m) => m.category))];
    const cadGroups = cats.map((c) =>
      h('optgroup', { label: `CAD · ${c}` }, MATERIALS.filter((m) => m.category === c).map((m) => h('option', { value: m.id }, m.name))),
    );
    return [...acxGroups, ...cadGroups];
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

  /** The speed of sound the General Parameters' temperature gives. */
  const cNow = () => speedOfSound(M.gen.tempC);
  /** Dimensions scaled so the 343 m/s mode tables give this temperature's frequencies (f ∝ c / size). */
  const dimsAtC = () => {
    const k = C / cNow();
    return { L: M.L * k, W: M.W * k, H: M.H * k };
  };

  // ── the three views every module window has ──

  /**
   * Room View · Chart View · Data View, as the original's tool bar offered:
   * `panes` { room, chart, data } are the three containers; the strip of
   * buttons shows one at a time.
   */
  function viewStrip(win, panes, initial = 'chart') {
    const btns = {};
    const strip = h(
      'div',
      { class: 'btns acx-views' },
      [
        ['room', 'Room View', 'The room as a wire-frame, with what this module computes drawn in it'],
        ['chart', 'Chart View', 'The results as charts'],
        ['data', 'Data View', 'The lists and the report'],
      ].map(([k, l, t]) => (btns[k] = h('button', { title: t, onclick: () => show(k) }, l))),
    );
    function show(k) {
      win.pane = k;
      for (const [n, el] of Object.entries(panes)) el.hidden = n !== k;
      for (const [n, b] of Object.entries(btns)) b.classList.toggle('down', n === k);
      requestAnimationFrame(() => win.render());
    }
    win.pane = initial;
    for (const [n, el] of Object.entries(panes)) el.hidden = n !== initial;
    btns[initial].classList.add('down');
    win.showPane = show;
    return strip;
  }

  /**
   * The Room View Manager: Plan View, Side and End Elevation, 3-Dimensional,
   * User View — and Set, which swaps in the arrows that turn (R) or move (M)
   * the user view, with zoom and a reset between them. `RV` is the window's
   * { view, user, mode }. Dragging on a user view turns it too.
   */
  function roomManager(win, RV, cv) {
    const vb = (v) => {
      const b = h('button', { onclick: () => ((RV.view = v), sync(), win.render()) }, VIEWS.find((x) => x[0] === v)[1]);
      b.dataset.v = v;
      return b;
    };
    const setB = h('button', { title: 'Turn and move the user view', onclick: () => ((main.hidden = true), (pad.hidden = false), (RV.view = 'user'), sync(), win.render()) }, 'Set');
    const main = h('div', { class: 'rvm' }, vb('plan'), h('div', { class: 'pair' }, vb('side'), vb('end')), vb('3d'), h('div', { class: 'pair' }, vb('user'), setB));
    const rB = h('button', { title: 'The arrows turn the view', onclick: () => ((RV.mode = 'R'), sync()) }, 'R');
    const mB = h('button', { title: 'The arrows move the view', onclick: () => ((RV.mode = 'M'), sync()) }, 'M');
    const go = (dir) => () => ((RV.user = nudgeUser(RV.user, RV.mode, dir)), (RV.view = 'user'), sync(), win.render());
    const zoom = (k) => () => ((RV.user = { ...RV.user, zoom: clamp(RV.user.zoom * k, 0.3, 6) }), win.render());
    const pad = h(
      'div',
      { class: 'rvm', hidden: true },
      h('div', { class: 'pad' }, h('span'), h('button', { onclick: go('up') }, '▲'), h('span'), h('button', { onclick: go('left') }, '◄'), h('button', { title: 'Back to the preset', onclick: () => ((RV.user = { ...DEFAULT_USER }), win.render()) }, '◎'), h('button', { onclick: go('right') }, '►'), h('span'), h('button', { onclick: go('down') }, '▼'), h('span')),
      h('div', { class: 'pair' }, rB, mB, h('button', { title: 'Zoom in', onclick: zoom(1.2) }, '+'), h('button', { title: 'Zoom out', onclick: zoom(1 / 1.2) }, '−')),
      h('button', { onclick: () => ((pad.hidden = true), (main.hidden = false)) }, 'Back to Room View Manager'),
    );
    function sync() {
      for (const b of main.querySelectorAll('button[data-v]')) b.classList.toggle('down', b.dataset.v === RV.view);
      rB.classList.toggle('down', RV.mode === 'R');
      mB.classList.toggle('down', RV.mode === 'M');
    }
    win.syncers.push(sync);
    if (cv) {
      cv.addEventListener('pointerdown', (e) => {
        if (RV.view !== 'user' || RV.onPick) return;
        const sx = e.clientX;
        const sy = e.clientY;
        const u0 = { ...RV.user };
        cv.setPointerCapture(e.pointerId);
        const move = (ev) => {
          RV.user = { ...u0, yaw: (((u0.yaw + (ev.clientX - sx) * 0.5) % 360) + 360) % 360, pitch: clamp(u0.pitch - (ev.clientY - sy) * 0.4, -90, 90) };
          win.render();
        };
        const up = () => {
          cv.removeEventListener('pointermove', move);
          cv.removeEventListener('pointerup', up);
        };
        cv.addEventListener('pointermove', move);
        cv.addEventListener('pointerup', up);
      });
      cv.addEventListener('click', (e) => {
        if (!RV.onPick || RV.view !== 'plan' || !RV.last) return;
        const r = cv.getBoundingClientRect();
        const [X, Y] = RV.last.inv(e.clientX - r.left, e.clientY - r.top);
        RV.onPick({ X: clamp(X, 0, M.W), Y: clamp(Y, 0, M.L) });
      });
    }
    return group('Room View Manager', main, pad);
  }

  const newRV = (view = '3d') => ({ view, user: { ...DEFAULT_USER }, mode: 'R', last: null, onPick: null });

  /**
   * Draw a room view: the box (with the Display Axis when it is on), the
   * speakers as red boxes, the listener as a red circle; `under` and `over`
   * draw the window's own layers below and above them. Returns { S, k }.
   */
  function drawRoom(cv, RV, { speakers = [], lis = null, under = null, over = null, note = '' } = {}) {
    const p = prep(cv);
    if (!p) return null;
    const { ctx, w, h: hh } = p;
    const dims = { L: M.L, W: M.W, H: M.H };
    const proj = project(RV.view, dims, RV.user);
    const f = fit(proj, dims, w, hh, { margin: 34, user: RV.view === 'user' ? RV.user : null });
    RV.last = f;
    const { S } = f;
    under?.(ctx, S, f);
    drawBox(ctx, S, dims, { axis: M.gen.axis && lis ? { listener: lis, speakers } : null });
    const sz = M.spkSize;
    ctx.strokeStyle = COL.red;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const s of speakers) boxPath(ctx, S, s.X - sz.w / 2, s.X + sz.w / 2, s.Y - sz.d / 2, s.Y + sz.d / 2, s.Z - M.woofer, s.Z - M.woofer + sz.h);
    ctx.stroke();
    if (lis) {
      const L0 = S(lis);
      ctx.beginPath();
      ctx.arc(L0[0], L0[1], 6, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    over?.(ctx, S, f);
    ctx.fillStyle = COL.title;
    ctx.fillText(`Room Display (${VIEWS.find((v) => v[0] === RV.view)[1]})   ${fmt(toU(M.L))} × ${fmt(toU(M.W))} × ${fmt(toU(M.H))} ${M.units}${note ? `   ${note}` : ''}`, 8, 14);
    ctx.fillStyle = COL.text;
    if (RV.view === 'plan') ctx.fillText('front wall ↑', 8, hh - 8);
    if (RV.view === 'side') ctx.fillText('← front wall', 8, hh - 8);
    if (RV.view === 'end') ctx.fillText('looking at the front wall', 8, hh - 8);
    if (RV.view === 'user') ctx.fillText(`turn ${Math.round(RV.user.yaw)}° · tip ${Math.round(RV.user.pitch)}° — drag to turn`, 8, hh - 8);
    return f;
  }

  /** A report table as rows of cells, for the Data View and every export. */
  const reportTable = (head, rows) => h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, head.map((t) => h('th', {}, t)))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))));
  function reportNode(rep) {
    return h(
      'div',
      { class: 'report' },
      h('h4', {}, rep.title),
      projectLines().map((l) => h('div', { class: 'small' }, l)),
      rep.sections.map((s) => h('div', {}, h('h5', {}, s.heading), s.text ? h('p', {}, s.text) : null, s.rows ? reportTable(s.head ?? [], s.rows) : null)),
    );
  }
  const projectLines = () => [M.project.description && `Project: ${M.project.description}`, M.project.client && `Client: ${M.project.client}`, M.project.location && `Location: ${M.project.location}`].filter(Boolean);

  // ═════════════════════════════════════════════════════════════════════════
  // 1. MODAL RESPONSE
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('modal', 'Acoustic X — Modal Response', { w: 860, h: 600 }, (win) => {
    const S = {
      sel: null,
      sort: 'all',
      order: 'asc',
      listed: 'all',
      ratioMode: false,
      ranges: null,
      step: 0.05,
      pct: 25,
      results: [],
      resSel: 0,
      res: null,
      idx: { nx: 1, ny: 0, nz: 0 },
      multi: false,
      lf: 40,
      hf: 60,
      dbase: 'third',
      dres: 0.3048,
      disp: 'horizontal',
      at: { horizontal: 0, length: null, width: null },
      param: 'pressure',
      hold: false,
      held: [],
      field: null,
      hover: null,
      RV: newRV('3d'),
    };
    const dims = () => ({ L: M.L, W: M.W, H: M.H });
    const minDim = () => Math.min(M.L, M.W, M.H);

    // ── Room tab
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
    const bonelloBox = h('div', { class: 'scroll small', style: 'max-height:110px;min-height:40px' });

    // ── Optimize tab
    const rng = (k, i) => () => (S.ranges ??= defaultRanges())[k][i];
    const setRng = (k, i) => (v) => ((S.ranges ??= defaultRanges())[k][i] = Math.max(0.5, v));
    function defaultRanges() {
      const r = (v, a, b) => [Math.round(v * a * 20) / 20, Math.round(v * b * 20) / 20];
      return { L: r(M.L, 0.9, 1.1), W: r(M.W, 0.9, 1.1), H: [M.H, M.H] };
    }
    const searchOn = { L: true, W: true, H: false };
    const elemChecks = ['L', 'W', 'H'].map((k) => {
      const c = h('input', { type: 'checkbox', onchange: () => (searchOn[k] = c.checked) });
      win.syncers.push(() => (c.checked = searchOn[k]));
      return h('label', { class: 'opt' }, c, { L: 'Length', W: 'Width', H: 'Height' }[k]);
    });
    function fromPct() {
      const p = S.pct / 100;
      S.ranges = Object.fromEntries(['L', 'W', 'H'].map((k) => [k, searchOn[k] ? [M[k] * (1 - p), M[k] * (1 + p)] : [M[k], M[k]]]));
      win.refresh();
    }
    const optList = h('select', { class: 'list', size: 9 });
    optList.addEventListener('change', () => (S.resSel = optList.selectedIndex));
    const optNote = h('div', { class: 'small muted' });
    const rangeRows = ['L', 'W', 'H'].map((k) => h('div', { class: 'cols' }, lenField(win, `${k} min`, rng(k, 0), setRng(k, 0), { local: true }), lenField(win, 'max', rng(k, 1), setRng(k, 1), { local: true })));
    function runOptimise() {
      const ranges = (S.ranges ??= defaultRanges());
      let step = S.step;
      const k = C / cNow();
      let grid = dimensionGrid(ranges, step);
      while (grid.count > 40000) grid = dimensionGrid(ranges, (step *= 2));
      const coarse = step !== S.step ? step : null;
      const best = [];
      optNote.textContent = `Searching ${grid.count} rooms…`;
      job(
        win,
        grid.L.length,
        (i) => {
          const L = grid.L[i];
          for (const W of grid.W)
            for (const H of grid.H) {
              const s = scoreDimensions({ L: L * k, W: W * k, H: H * k });
              keepBest(best, { L, W, H, score: s.score, ok: s.ok }, 10);
            }
        },
        () => {
          S.results = best;
          S.resSel = 0;
          const ok = best.filter((b) => b.ok).length;
          optNote.textContent = `${grid.count} rooms tried${coarse ? `, step coarsened to ${fmt(toU(coarse), 2)} ${M.units}` : ''}; ${ok} of the best ten meet the criteria. Score = 2·(Bonello failures) + spread of the axial and of all mode spacings — lower is better.`;
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

    // ── Mode 1 tab: which mode, or which band of them
    const idxField = (k, label) => numField(win, label, '', () => S.idx[k], (v) => ((S.idx[k] = Math.max(0, Math.round(v))), (S.multi = false)), { title: { nx: 'Related to room length', ny: 'Related to room width', nz: 'Related to room height' }[k], width: 46 });
    const modeFRo = readout('The frequency of the mode entered');
    const multiC = h('input', { type: 'checkbox', onchange: () => ((S.multi = multiC.checked), win.refresh()) });
    win.syncers.push(() => (multiC.checked = S.multi));
    const countRo = readout('How many modes the band holds');
    const dbSel = h('select', {}, h('option', { value: 'octave' }, 'Octave'), h('option', { value: 'third' }, '1/3 Octave'));
    const fcSel = h('select', {});
    const fillFc = () => {
      const list = S.dbase === 'octave' ? ACOUSTX_FREQ_OCTAVE : ACOUSTX_FREQ_3RD;
      fcSel.replaceChildren(h('option', { value: '' }, 'centre…'), ...list.map((b) => h('option', { value: String(b.center) }, `${b.center} Hz`)));
    };
    dbSel.addEventListener('change', () => ((S.dbase = dbSel.value), fillFc()));
    fcSel.addEventListener('change', () => {
      const list = S.dbase === 'octave' ? ACOUSTX_FREQ_OCTAVE : ACOUSTX_FREQ_3RD;
      const b = list.find((x) => String(x.center) === fcSel.value);
      if (!b) return;
      S.lf = b.lower;
      S.hf = b.upper;
      S.multi = true;
      win.refresh();
    });
    win.syncers.push(() => (dbSel.value = S.dbase));
    fillFc();
    const getFreq = () => {
      if (!S.sel) return;
      S.lf = +(S.sel.f - 0.05).toFixed(2);
      S.hf = +(S.sel.f + 0.05).toFixed(2);
      S.multi = true;
      win.refresh();
    };

    // ── Mode 2 tab: how to show it
    const radios = (name, key, list, after = () => win.refresh()) =>
      list.map(([v, l]) => {
        const r = h('input', { type: 'radio', name, onchange: () => ((S[key] = v), after()) });
        win.syncers.push(() => (r.checked = S[key] === v));
        return h('div', {}, h('label', { class: 'opt' }, r, l));
      });
    const planeAt = () => S.at[S.disp] ?? (S.disp === 'length' ? M.W : S.disp === 'width' ? M.L : 0);
    const atRow = lenField(win, 'Plane distance', planeAt, (v) => (S.at[S.disp] = Math.max(0, v)), { local: true, title: 'Horizontal: above the floor · Length: from the left wall · Width: from the front wall', disabled: () => S.disp === '3d' });
    const holdC = h('input', { type: 'checkbox', onchange: () => (S.hold = holdC.checked) });
    win.syncers.push(() => (holdC.checked = S.hold));

    const T = tabs(win, ['Room', 'Optimize', 'Mode 1', 'Mode 2']);
    const ratioList = h('select', { class: 'list', size: 7 }, FAVOURABLE_RATIOS.filter((r) => r.ratio).map((r) => h('option', { value: r.id }, `${r.name}   ${r.ratio.map((x) => x.toFixed(2)).join(' : ')}`)));
    T.pages.Room.append(
      group('Enter Input Data', dimRow('Room Length', 'L', 'Front wall to back wall'), dimRow('Room Width', 'W', 'Left wall to right wall'), dimRow('Room Height', 'H', 'Floor to ceiling'), unitsRow(win)),
      group('Data Edit Options', h('label', { class: 'opt' }, sizeR, 'Change room dimensions'), h('br'), h('label', { class: 'opt' }, ratioR, 'Change ratio of dimensions')),
      group('Favourable Room Ratios', ratioList, h('div', { class: 'btns' }, h('button', { onclick: applyRatio, title: 'The 1 is the floor-to-ceiling height: width and length follow' }, 'Apply ratio'), fromRoomBtn())),
      group('Bonello Criterion', bonelloBox),
    );
    function applyRatio() {
      const r = FAVOURABLE_RATIOS.find((x) => x.id === ratioList.value);
      if (!r?.ratio) return;
      M.W = M.H * r.ratio[1];
      M.L = M.H * r.ratio[2];
      dimsChanged();
      edited();
    }
    T.pages.Optimize.append(
      group('Select Elements To Search', ...elemChecks),
      group('Enter Extent Of Search', numField(win, 'Search size ±', '%', () => S.pct, (v) => (S.pct = clamp(v, 1, 80)), { step: 1 }), numField(win, 'Search step', 'm', () => S.step, (v) => (S.step = Math.max(0.01, v)), { step: 0.01, title: 'Grid step, metres (0.15 m is about 6 in)' }), h('div', { class: 'btns' }, h('button', { onclick: fromPct }, 'Set limits from ±%'))),
      group('Dimension Limits', ...rangeRows),
      h('div', { class: 'btns' }, h('button', { onclick: runOptimise }, 'Optimize'), h('button', { onclick: useThese, title: 'Take the selected room into every classic window (and hand it to the host to draw)' }, 'Use these')),
      h('div', { style: 'margin-top:6px' }, optList),
      optNote,
    );
    T.pages['Mode 1'].append(
      group('Enter Mode Index', h('div', { class: 'cols' }, idxField('nx', 'Nx'), idxField('ny', 'Ny'), idxField('nz', 'Nz')), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Mode frequency'), modeFRo, 'Hz')),
      group(
        'Multi-Mode Summation',
        h('label', { class: 'opt' }, multiC, 'Sum every mode in the band'),
        numField(win, 'LF cut-off', 'Hz', () => S.lf, (v) => ((S.lf = Math.max(1, v)), (S.multi = true)), { step: 0.5 }),
        numField(win, 'HF cut-off', 'Hz', () => S.hf, (v) => ((S.hf = Math.max(1, v)), (S.multi = true)), { step: 0.5 }),
        h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Bandwidth'), dbSel, fcSel),
        h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Modes summed'), countRo),
        h('div', { class: 'btns' }, h('button', { onclick: getFreq, title: 'Take the mode picked on the chart' }, 'Get freq.')),
      ),
      group('Display Resolution', lenField(win, 'Display res.', () => S.dres, (v) => (S.dres = clamp(v, 0.05, 2)), { local: true, title: 'Grid spacing of the pressure display — smaller is finer and slower' })),
    );
    T.pages['Mode 2'].append(
      group('Display Type', ...radios('acx-md-disp', 'disp', [['3d', '3-Dimensional'], ['horizontal', 'Horizontal Plane'], ['length', 'Vertical Plane (Length)'], ['width', 'Vertical Plane (Width)']], () => (S.disp !== '3d' && S.RV.view === '3d' ? 0 : 0, win.refresh())), atRow),
      group('Display Parameter', ...radios('acx-md-par', 'param', [['pressure', 'Relative Sound Pressure'], ['intensity', 'Relative Sound Intensity'], ['phase', 'Relative Phase Addition']])),
      group('Hold', h('label', { class: 'opt' }, holdC, 'Hold previous display'), h('div', { class: 'btns' }, h('button', { onclick: () => ((S.held = []), win.render()) }, 'Clear held'))),
      h('div', { class: 'small muted' }, 'Brighter is more pressure. Low-frequency absorbers go where it is brightest — for many modes at once, usually the corners.'),
    );

    // ── right side: the three views
    const roomCv = h('canvas');
    const roomPane = h('div', { class: 'acx-pane' }, h('div', { class: 'acx-chart' }, roomCv), roomManager(win, S.RV, roomCv));
    const top = chartBox('flex:1.2');
    const bot = chartBox('flex:1');
    const ro = { n: readout(), f: readout(), idx: readout(), band: readout(), dev: readout('Actual − ideal modes in the band under the mouse') };
    const byF = h('input', { type: 'number', step: 0.1, title: 'Type a frequency to find the mode nearest it', style: 'width:56px' });
    byF.addEventListener('change', () => {
      const f = parseFloat(byF.value);
      if (!Number.isFinite(f) || !S.res) return;
      S.sel = nearest(listedModes(), f);
      win.render();
    });
    const nearest = (modes, f) => modes.reduce((b, m) => (!b || Math.abs(m.f - f) < Math.abs(b.f - f) ? m : b), null);
    const pickTop = (e, click) => {
      if (!S.res || !top.map) return;
      const r = top.cv.getBoundingClientRect();
      const m = nearest(listedModes(), top.map.Xinv(e.clientX - r.left));
      if (!m) return;
      if (click && S.sel && Math.abs(S.sel.f - m.f) < 0.01 * m.f) {
        // clicking a stack again toggles through its modes
        const stack = listedModes().filter((x) => Math.abs(x.f - m.f) <= 0.005 * m.f);
        S.sel = stack[(stack.indexOf(S.sel) + 1) % stack.length];
      } else S.sel = m;
      if (click) Object.assign(S.idx, { nx: S.sel.nx, ny: S.sel.ny, nz: S.sel.nz });
      win.render();
    };
    top.cv.addEventListener('mousemove', (e) => pickTop(e, false));
    top.cv.addEventListener('click', (e) => pickTop(e, true));
    bot.cv.addEventListener('mousemove', (e) => {
      if (!bot.map || !S.res) return;
      const r = bot.cv.getBoundingClientRect();
      const i = Math.floor(((e.clientX - r.left - bot.map.pad.l) / bot.map.iw) * S.res.counts.length);
      S.hover = i >= 0 && i < S.res.counts.length ? i : null;
      win.render();
    });
    const rr = (l, el, u) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, l), el, u ? h('span', {}, u) : null);
    const chartPane = h(
      'div',
      { class: 'acx-pane' },
      h('fieldset', { class: 'grow' }, h('legend', {}, 'Display Mode Distribution'), h('div', { style: 'display:flex;flex-direction:column;gap:4px;flex:1;min-height:0' }, top.box, bot.box)),
      group('Chart View Manager', h('div', { class: 'manager' }, rr('Modes', ro.n), rr('Frequency', ro.f, 'Hz'), rr('Index', ro.idx), rr('By frequency', byF, 'Hz'), h('button', { onclick: getFreq }, 'Get freq.')), h('div', { class: 'manager' }, rr('Band', ro.band), rr('Deviation', ro.dev))),
    );
    const sortR = radios('acx-md-sort', 'sort', [['all', 'All modes'], ['axial', 'Axial modes'], ['tangential', 'Tangential modes'], ['oblique', 'Oblique modes']], () => win.render());
    const ordR = radios('acx-md-ord', 'order', [['asc', 'Ascending'], ['desc', 'Descending']], () => win.render());
    const modeTable = h('tbody');
    const bandTable = h('tbody');
    const dataPane = h(
      'div',
      { class: 'acx-pane' },
      group('Data View Manager', h('div', { class: 'manager' }, ...sortR), h('div', { class: 'manager' }, ...ordR, h('button', { onclick: () => ((S.listed = S.sort), win.render()), title: 'Show only these modes on the Chart View, and in the report' }, 'List data'))),
      h('div', { class: 'scroll', style: 'flex:1;min-height:0' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['#', 'Hz', 'Nx', 'Ny', 'Nz', 'Type'].map((t) => h('th', {}, t)))), modeTable)),
      group('Modes per 1/3 Octave — actual against ideal', h('div', { class: 'scroll', style: 'max-height:150px' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['Band', 'Edges Hz', 'Actual', 'Ideal', 'Deviation', ''].map((t) => h('th', {}, t)))), bandTable))),
    );
    const strip = viewStrip(win, { room: roomPane, chart: chartPane, data: dataPane });
    win.el.append(h('div', { class: 'acx-body' }, h('div', { class: 'acx-left' }, T.nodes), h('div', { class: 'acx-right' }, strip, roomPane, chartPane, dataPane)));

    const listedModes = () => (S.res?.modes ?? []).filter((m) => S.listed === 'all' || m.type === S.listed);
    const fieldModes = () => {
      if (!S.res) return [];
      if (S.multi) return S.res.modes.filter((m) => m.f >= S.lf && m.f <= S.hf);
      const { nx, ny, nz } = S.idx;
      if (!(nx || ny || nz)) return [];
      return [{ nx, ny, nz, f: modeFreq(dims(), nx, ny, nz, cNow()), type: modeType(nx, ny, nz) }];
    };

    win.compute = () => {
      const k = cNow() / C;
      const scaled = dimsAtC();
      const modes = modeList(scaled, 200).map((m) => ({ ...m }));
      const b = bonello(scaled, 200);
      const counts = b.counts;
      const ideal = idealCounts(dims(), counts, cNow());
      S.res = { modes, bonello: b, counts, ideal, k };
      if (S.sel) S.sel = modes.find((m) => m.nx === S.sel.nx && m.ny === S.sel.ny && m.nz === S.sel.nz) ?? null;
      const fm = fieldModes();
      const at = planeAt();
      const field = fm.length ? pressureField(dims(), fm, { plane: S.disp, at, res: S.dres, weights: M.gen.weights, param: S.param }) : null;
      if (S.hold && S.field && field && (S.field.plane !== field.plane || S.field.at !== field.at)) S.held = [...S.held, S.field].slice(-6);
      S.field = field;
      S.fieldN = fm.length;
    };

    win.report = () => {
      const res = S.res;
      const shown = listedModes();
      return {
        title: 'Modal Response',
        sections: [
          { heading: 'Room', rows: [['Length', `${fmt(toU(M.L))} ${M.units}`], ['Width', `${fmt(toU(M.W))} ${M.units}`], ['Height', `${fmt(toU(M.H))} ${M.units}`], ['Ratio H : W : L', `1 : ${fmt(M.W / M.H)} : ${fmt(M.L / M.H)}`], ['Speed of sound', `${fmt(cNow(), 1)} m/s at ${M.gen.tempC} °C`]] },
          { heading: 'Bonello criterion', text: res.bonello.ok ? 'Passes: the count per third-octave never falls, and no two modes coincide in a band of fewer than five.' : res.bonello.warnings.join('; ') },
          { heading: `Modes below 200 Hz — ${S.listed}`, head: ['#', 'Hz', 'Nx', 'Ny', 'Nz', 'Type'], rows: shown.map((m, i) => [i + 1, fmt(m.f, 1), m.nx, m.ny, m.nz, m.type]) },
          { heading: 'Modes per 1/3 octave', head: ['Band Hz', 'Low', 'High', 'Actual', 'Ideal', 'Deviation'], rows: res.counts.map((b, i) => [b.fc, fmt(b.lo, 1), fmt(b.hi, 1), b.count, fmt(res.ideal[i], 1), fmt(b.count - res.ideal[i], 1)]) },
        ],
      };
    };

    win.render = () => {
      const res = S.res;
      if (!res) return;
      bonelloBox.replaceChildren(
        h('div', { class: res.bonello.ok ? '' : 'warn' }, res.bonello.ok ? '✓ This room meets the criteria: counts never fall, no coincident modes in a thin band.' : `⚠ ${res.bonello.warnings.length} reason${res.bonello.warnings.length === 1 ? '' : 's'} it does not:`),
        ...res.bonello.warnings.map((w) => h('div', { class: 'warn' }, `• ${w}`)),
        (() => {
          const itu = ituBs1116(dims());
          return h('div', { class: itu.ok ? 'muted' : 'warn' }, itu.ok ? 'Inside the ITU-R BS.1116 proportions.' : `ITU-R BS.1116: ${itu.notes.join('; ')}`);
        })(),
      );
      optList.replaceChildren(...S.results.map((r, i) => h('option', { selected: i === S.resSel }, `${fmt(toU(r.L))} × ${fmt(toU(r.W))} × ${fmt(toU(r.H))} ${M.units}   ${fmt(r.score, 3)} ${r.ok ? '✓' : '⚠'}`)));
      const fm = fieldModes();
      modeFRo.textContent = !S.multi && fm[0] ? fmt(fm[0].f, 2) : '';
      countRo.textContent = String(S.multi ? fm.length : fm.length ? 1 : 0);
      // data view
      const sorted = res.modes.filter((m) => S.sort === 'all' || m.type === S.sort);
      if (S.order === 'desc') sorted.reverse();
      modeTable.replaceChildren(...sorted.map((m, i) => h('tr', { class: m === S.sel ? 'sel' : '', onclick: () => ((S.sel = m), Object.assign(S.idx, { nx: m.nx, ny: m.ny, nz: m.nz }), (S.multi = false), win.refresh()) }, h('td', {}, i + 1), h('td', {}, fmt(m.f, 1)), h('td', {}, m.nx), h('td', {}, m.ny), h('td', {}, m.nz), h('td', {}, m.type))));
      bandTable.replaceChildren(
        ...res.counts.map((b, i) => {
          const drop = i > 0 && res.counts.slice(0, i).some((x) => x.count > 0) && b.count < res.counts[i - 1].count;
          return h('tr', { class: i === S.hover ? 'sel' : '' }, h('td', {}, `${b.fc} Hz`), h('td', {}, `${fmt(b.lo, 1)}–${fmt(b.hi, 1)}`), h('td', {}, b.count), h('td', {}, fmt(res.ideal[i], 1)), h('td', {}, fmt(b.count - res.ideal[i], 1)), h('td', { class: 'warn' }, drop ? 'falls' : ''));
        }),
      );
      // chart view manager
      const stack = S.sel ? listedModes().filter((m) => Math.abs(m.f - S.sel.f) <= 0.005 * S.sel.f) : [];
      ro.n.textContent = S.sel ? String(stack.length) : '';
      ro.f.textContent = S.sel ? fmt(S.sel.f, 2) : '';
      ro.idx.textContent = S.sel ? `${S.sel.nx} ${S.sel.ny} ${S.sel.nz}` : '';
      const hb = S.hover != null ? res.counts[S.hover] : null;
      ro.band.textContent = hb ? `${hb.fc} Hz: ${hb.count} / ${fmt(res.ideal[S.hover], 1)}` : '';
      ro.dev.textContent = hb ? fmt(hb.count - res.ideal[S.hover], 1) : '';
      if (win.pane === 'chart') {
        drawModes(listedModes());
        drawThirds(res.counts, res.ideal);
      }
      if (win.pane === 'room') drawField();
    };

    function drawModes(vis) {
      const p = prep(top.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const groups = [];
      for (const m of vis) {
        const g = groups.find((x) => Math.abs(x.f - m.f) <= 0.005 * x.f);
        if (g) g.modes.push(m);
        else groups.push({ f: m.f, modes: [m] });
      }
      const t = countTicks(Math.max(4, ...groups.map((g) => g.modes.length + 1)));
      const a = axes(ctx, w, hh, { title: `Number of Modes / Frequency${S.listed === 'all' ? '' : ` — ${S.listed} only`}`, x0: 0, x1: 200, y0: 0, y1: t.max, xticks: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((v) => ({ v, label: String(v) })), yticks: t.ticks, xLabel: 'Hz' });
      top.map = a;
      const rank = { axial: 0, tangential: 1, oblique: 2 };
      if (S.multi) {
        ctx.fillStyle = 'rgba(255,255,0,0.18)';
        ctx.fillRect(a.X(Math.max(0, S.lf)), a.pad.t, Math.max(2, a.X(Math.min(200, S.hf)) - a.X(Math.max(0, S.lf))), a.ih);
      }
      for (const g of groups) {
        const tt = g.modes.reduce((b, m) => (rank[m.type] < rank[b] ? m.type : b), 'oblique');
        const x = Math.round(a.X(g.f));
        const sel = S.sel && g.modes.includes(S.sel);
        const inBand = S.multi && g.f >= S.lf && g.f <= S.hf;
        ctx.fillStyle = sel || inBand ? COL.yellow : tt === 'axial' ? COL.red : tt === 'tangential' ? COL.orange : COL.grey;
        const bw = tt === 'axial' ? 3 : tt === 'tangential' ? 2 : 1;
        const y = a.Y(g.modes.length);
        ctx.fillRect(x - Math.floor(bw / 2), y, bw, a.Y(0) - y);
      }
      ctx.textAlign = 'right';
      [['Axial', COL.red], ['Tangential', COL.orange], ['Oblique', COL.grey], ['Selected', COL.yellow]].forEach(([l, c], i) => {
        ctx.fillStyle = c;
        ctx.fillText(l, w - 14, 30 + i * 12);
      });
      ctx.textAlign = 'left';
    }

    function drawThirds(counts, ideal) {
      const p = prep(bot.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const t = countTicks(Math.max(...counts.map((c) => c.count), ...ideal) * 1.12 + 1);
      const a = axes(ctx, w, hh, { title: 'Number of Modes / 1/3 Octave Band — green this room, blue the ideal for its volume', cats: counts.map((c) => String(c.fc)), y0: 0, y1: t.max, x0: 0, x1: 1, yticks: t.ticks, xLabel: 'Hz' });
      bot.map = a;
      counts.forEach((c, i) => {
        const s = a.slot(i);
        const bw = Math.max(4, s.w * 0.5);
        const x = s.x + (s.w - bw) / 2;
        const y = a.Y(c.count);
        ctx.fillStyle = i === S.hover ? COL.lime : COL.green;
        if (c.count) ctx.fillRect(x, y, bw, a.Y(0) - y);
        const drop = i > 0 && counts.slice(0, i).some((q) => q.count > 0) && c.count < counts[i - 1].count;
        ctx.fillStyle = drop ? COL.yellow : COL.lime;
        ctx.textAlign = 'center';
        ctx.fillText(String(c.count), s.x + s.w / 2, y - 3);
      });
      ctx.textAlign = 'left';
      ctx.strokeStyle = '#4080ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ideal.forEach((v, i) => {
        const s = a.slot(i);
        const y = a.Y(v);
        if (i) ctx.lineTo(s.x, y);
        else ctx.moveTo(s.x, y);
        ctx.lineTo(s.x + s.w, y);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    /** The pressure display: each held plane and the current one as shaded cells, or the volume as dots. */
    function drawField() {
      const shade = (v, param) => {
        if (param === 'phase') return v >= 0 ? `rgba(255,${Math.round(220 - 160 * v)},60,${0.2 + 0.75 * v})` : `rgba(60,${Math.round(220 + 160 * v)},255,${0.2 - 0.75 * v})`;
        const g = Math.round(40 + 215 * v);
        return `rgb(${g},${g},${g})`;
      };
      const paint = (ctx, S2, field) => {
        if (!field) return;
        if (field.plane === '3d') {
          for (const p of field.points) {
            if (Math.abs(p.value) < 0.15) continue;
            const q = S2(p);
            ctx.fillStyle = shade(p.value, field.param ?? S.param);
            ctx.globalAlpha = 0.25 + 0.6 * Math.abs(p.value);
            ctx.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3);
          }
          ctx.globalAlpha = 1;
          return;
        }
        const pt = (u, v) => (field.plane === 'horizontal' ? { X: u, Y: v, Z: field.at } : field.plane === 'length' ? { X: field.at, Y: u, Z: v } : { X: u, Y: field.at, Z: v });
        const { us, vs, grid } = field;
        ctx.globalAlpha = 0.85;
        for (let j = 0; j + 1 < vs.length; j++)
          for (let i = 0; i + 1 < us.length; i++) {
            const v = (grid[j][i] + grid[j][i + 1] + grid[j + 1][i] + grid[j + 1][i + 1]) / 4;
            const c4 = [pt(us[i], vs[j]), pt(us[i + 1], vs[j]), pt(us[i + 1], vs[j + 1]), pt(us[i], vs[j + 1])].map(S2);
            ctx.fillStyle = shade(v, field.param);
            ctx.beginPath();
            c4.forEach((q, n) => (n ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
            ctx.closePath();
            ctx.fill();
          }
        ctx.globalAlpha = 1;
      };
      const fm = fieldModes();
      const label = !fm.length ? 'enter a mode index or a band (Mode 1)' : S.multi ? `${fm.length} modes, ${fmt(S.lf, 1)}–${fmt(S.hf, 1)} Hz` : `mode ${S.idx.nx} ${S.idx.ny} ${S.idx.nz} · ${fmt(fm[0].f, 1)} Hz`;
      drawRoom(roomCv, S.RV, {
        under: (ctx, S2) => {
          for (const f of S.held) paint(ctx, S2, f);
          paint(ctx, S2, S.field);
        },
        note: label,
      });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. SPEAKER BOUNDARY INTERFERENCE RESPONSE
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('sbir', 'Acoustic X — Speaker Boundary Interference Response', { w: 880, h: 610 }, (win) => {
    const S = { perOct: 12, mode: 'absolute', noSearch: false, ranges: null, step: 0.15, results: [], resSel: 0, res: null, spkOpt: 'position', win: 1, RV: newRV('3d') };
    const T = tabs(win, ['Room', 'SPK', 'Listener', 'Search']);
    T.pages.Room.append(dimsGroup(win), group('Surfaces', ...FACES6.map((f) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, FACE_LABEL[f]), faceMatSelect(win, f)))));

    // ── SPK: size (or from the database) and position
    function spkOptions() {
      const makers = [...new Set(ACOUSTX_SPEAKERS.map((s) => s.maker))];
      return [
        h('option', { value: '' }, '— speaker database —'),
        ...makers.map((m) =>
          h(
            'optgroup',
            { label: `Acoustic X · ${m}` },
            ACOUSTX_SPEAKERS.filter((s) => s.maker === m).map((s) => h('option', { value: s.key }, s.label)),
          ),
        ),
        h(
          'optgroup',
          { label: 'Modern presets' },
          Object.entries(SPEAKER_PRESETS)
            .filter(([k]) => k !== 'sub')
            .map(([k, p]) => h('option', { value: `preset:${k}` }, p.label)),
        ),
      ];
    }
    const dbSel = h('select', { class: 'list' }, ...spkOptions());
    dbSel.addEventListener('change', () => {
      const v = dbSel.value;
      if (!v) return;
      if (v.startsWith('preset:')) {
        const k = v.slice(7);
        const p = SPEAKER_PRESETS[k];
        if (!p) return;
        const b = boxSize({ kind: k, litres: p.litres });
        M.spkModel = k;
        M.spkSize = { w: b.w, d: b.d, h: b.h };
        M.woofer = +(b.h * 0.3).toFixed(3);
        M.centerHeight = +(b.h * 0.5).toFixed(3);
        if (p.fLow) M.lfCut = p.fLow;
      } else {
        const s = findSpeaker(v);
        if (!s) return;
        M.spkModel = s.key;
        M.spkSize = { w: s.w, d: s.d, h: s.h };
        M.woofer = s.wooferHeight;
        M.centerHeight = s.centerHeight;
        M.lfCut = s.fLow;
        if (s.fCross) M.xover = s.fCross;
      }
      edited();
    });
    win.syncers.push(() => (dbSel.value = M.spkModel ?? ''));
    const sizeF = (label, k, title) => lenField(win, label, () => M.spkSize[k], (v) => (M.spkSize = { ...M.spkSize, [k]: Math.max(0.05, v) }), { title });
    const sizePanel = h('div', {}, group('Speaker Database', dbSel), group('Size', sizeF('Depth', 'd', 'Front to back of the cabinet'), sizeF('Width', 'w'), sizeF('Height', 'h'), lenField(win, 'Center height', () => M.centerHeight ?? +(M.spkSize.h * 0.5).toFixed(3), (v) => (M.centerHeight = Math.max(0, v)), { title: 'Acoustic center height of the speaker above the bottom of the cabinet' }), lenField(win, 'Woofer height', () => M.woofer, (v) => (M.woofer = Math.max(0, v)), { title: 'Centre of the woofer above the bottom of the cabinet: the boundary calculation places the woofer' })));
    const exc = { idx: readout(), f: readout() };
    const posPanel = h('div', {}, pointGroup(win, 'Speaker1 (woofer centre)', () => M.spk1, (v) => (M.spk1 = v)), pointGroup(win, 'Speaker2 (mirror image)', spk2, () => {}, { disabled: () => true }), group('Mode Excited By Position', h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Index'), exc.idx), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Frequency'), exc.f, 'Hz'), h('div', { class: 'small muted' }, 'The lowest mode the speaker sits on a pressure maximum of, and the listener hears. Magenta on the chart.')));
    const optR = ['size', 'position'].map((v) => {
      const r = h('input', { type: 'radio', name: 'acx-sb-opt', onchange: () => ((S.spkOpt = v), sync()) });
      win.syncers.push(() => (r.checked = S.spkOpt === v));
      return h('label', { class: 'opt' }, r, v === 'size' ? 'Size' : 'Position');
    });
    const sync = () => {
      sizePanel.hidden = S.spkOpt !== 'size';
      posPanel.hidden = S.spkOpt !== 'position';
    };
    win.syncers.push(sync);
    T.pages.SPK.append(sizePanel, posPanel, group('Option', ...optR));

    // ── Listener: where, the critical frequencies, what the geometry says
    const geo = { angle: readout(), d: readout(), tilt: readout(), rear: readout() };
    const geoWarn = h('div', { class: 'warn small' });
    T.pages.Listener.append(
      pointGroup(win, 'Listener', () => M.lis, (v) => (M.lis = v)),
      group('Speaker Critical Frequency', numField(win, 'LF cut-off', 'Hz', () => M.lfCut, (v) => (M.lfCut = Math.max(10, v)), { step: 1, title: 'Red on the chart: only frequencies above it count toward the deviation', local: false }), numField(win, 'LF cross-over', 'Hz', () => M.xover, (v) => (M.xover = Math.max(0, v)), { step: 10, title: 'Yellow on the chart: a dip here is flagged', local: false })),
      group('Valid Listening Window', lenField(win, 'Window size', () => S.win, (v) => (S.win = clamp(v, 0.2, 3)), { local: true, title: 'How far the head may move round the mix position and still hear no first reflection — the specular absorbers are sized to it' })),
      group('Listener / Speakers', h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Angle between'), geo.angle, '°'), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Distance'), geo.d), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Speaker tilt'), geo.tilt, '°'), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Rear angle'), geo.rear), geoWarn),
    );

    // ── Search
    const rng = (k, i) => () => (S.ranges ??= defaultRanges())[k][i];
    const setRng = (k, i) => (v) => ((S.ranges ??= defaultRanges())[k][i] = v);
    function defaultRanges() {
      const g = M.gen.sbir;
      if (g.custom) return { X: [g.sideMin, g.sideMax], Y: [g.frontMin, g.frontMax] };
      return { X: [0.3, Math.max(0.35, M.W / 2 - M.gen.sbir.minSpk / 2)], Y: [0.3, Math.max(0.35, Math.min(M.L * 0.45, M.lis.Y - 0.5))] };
    }
    const resList = h('select', { class: 'list', size: 8 });
    resList.addEventListener('change', () => (S.resSel = resList.selectedIndex));
    const searchNote = h('div', { class: 'small muted' });
    const noC = h('input', { type: 'checkbox', onchange: () => (S.noSearch = noC.checked) });
    win.syncers.push(() => (noC.checked = S.noSearch));
    const modeR = [
      ['absolute', 'Min. Absolute Deviation'],
      ['negative', 'Min. Negative Deviation'],
    ].map(([v, l]) => {
      const r = h('input', { type: 'radio', name: 'acx-sb-mode', onchange: () => ((S.mode = v), win.refresh()) });
      win.syncers.push(() => (r.checked = S.mode === v));
      return h('div', {}, h('label', { class: 'opt' }, r, l));
    });
    T.pages.Search.append(
      group('Search Parameters', h('label', { class: 'opt' }, noC, 'No search — check the position as it is'), lenField(win, 'Search step', () => S.step, (v) => (S.step = Math.max(0.02, v)), { local: true, title: 'The grid the optimiser walks (0.15 m ≈ 6 in)' }), ...modeR),
      group('Search Limits (Speaker1)', h('div', { class: 'small muted' }, 'X from the side wall, Y from the front wall. The height stays where the SPK tab puts it.'), ...['X', 'Y'].map((k) => h('div', { class: 'cols' }, lenField(win, `${k} min`, rng(k, 0), setRng(k, 0), { local: true }), lenField(win, 'max', rng(k, 1), setRng(k, 1), { local: true }))), h('div', { class: 'btns' }, h('button', { onclick: () => ((S.ranges = null), win.refresh()) }, 'Automatic limits'))),
      h('div', { class: 'btns' }, h('button', { onclick: () => runSearch() }, 'Search'), h('button', { onclick: applyResult, title: "Move the design's speaker (and its mirror twin) to the selected position" }, 'Apply')),
      h('div', { style: 'margin-top:6px' }, resList),
      searchNote,
    );

    /** The deviation at the listener for one speaker position, at this temperature. */
    function devAt(P, perOct = 48) {
      const freqs = sbirFreqs(16, 1000, perOct);
      const k = C / cNow();
      const out = sbirDeviation(box(), toBox(P), toBox(M.lis), freqs.map((f) => f * k));
      return { freqs, dev: out.dev };
    }
    const scoreOf = (d) => sbirScore(d.freqs, d.dev, { lfCut: M.lfCut, fMax: 300, mode: S.mode });

    function runSearch(avoidDip = false) {
      if (S.noSearch) {
        win.refresh();
        win.showPane('chart');
        return;
      }
      const r = (S.ranges ??= defaultRanges());
      const xs = steps(r.X, S.step).filter((X) => M.W - 2 * X >= M.gen.sbir.minSpk - 1e-9);
      const ys = steps(r.Y, S.step);
      if (!xs.length) {
        searchNote.textContent = `⚠ No X in the limits keeps the speakers ${fmt(toU(M.gen.sbir.minSpk))} ${M.units} apart.`;
        return;
      }
      const all = [];
      job(
        win,
        xs.length,
        (i) => {
          for (const Y of ys) {
            const P = { X: xs[i], Y, Z: M.spk1.Z };
            const d = devAt(P, 24);
            const x = crossoverCheck(d.freqs, d.dev, M.xover);
            all.push({ ...P, score: scoreOf(d), dips: x.dips });
          }
        },
        () => {
          all.sort((a, b) => a.score - b.score);
          const pool = avoidDip ? all.filter((p) => !p.dips) : all;
          S.results = pool.slice(0, 8);
          S.resSel = 0;
          const best = S.results[0];
          searchNote.textContent = `${all.length} positions tried, ${S.mode === 'negative' ? 'least negative' : 'least absolute'} deviation above ${M.lfCut} Hz.`;
          win.render();
          if (best?.dips && !avoidDip && M.xover > 0 && window.confirm(`The best position has a negative deviation at the ${M.xover} Hz crossover. Find a position where it does not?`)) runSearch(true);
        },
      );
    }
    function applyResult() {
      const P = S.results[S.resSel];
      if (!P) return;
      const real = realRoom();
      const [id1, id2] = M.ids;
      const speakers = store?.state?.speakers ?? [];
      M.spk1 = { X: P.X, Y: P.Y, Z: P.Z };
      if (!real || !id1 || !speakers.some((s) => s.id === id1)) {
        edited();
        win.status.textContent = 'No speaker in the design to move — the classic Speaker1 moved instead';
        return;
      }
      const wasLinked = M.linked;
      const p = toSheetReal(real, P);
      store.update('speaker', id1, { x: p.x, y: p.y, z: p.z });
      const s1 = store.state.speakers.find((s) => s.id === id1);
      if (id2 && !s1?.pairId) {
        const q = toSheetReal(real, { X: real.W - P.X, Y: P.Y, Z: P.Z });
        store.update('speaker', id2, { x: q.x, y: q.y, z: q.z });
      }
      if (!wasLinked) refreshAll();
    }

    // ── right side
    const chart = chartBox();
    const resRadios = [[1, 'Octave'], [3, '1/3'], [6, '1/6'], [12, '1/12']].map(([n, l]) => {
      const r = h('input', { type: 'radio', name: 'acx-sbir-res', onchange: () => ((S.perOct = n), win.render()) });
      win.syncers.push(() => (r.checked = S.perOct === n));
      return h('label', { class: 'opt' }, r, l);
    });
    const devRo = readout();
    const devLbl = h('span', { class: 'lbl', style: 'width:auto' });
    const xoWarn = h('span', { class: 'warn small' });
    const chartPane = h('div', { class: 'acx-pane' }, h('fieldset', { class: 'grow' }, h('legend', {}, 'SBIR'), h('div', { class: 'manager' }, ...resRadios, xoWarn), chart.box, h('div', { class: 'row' }, devLbl, devRo, 'dB')));
    const roomCv = h('canvas');
    const absBox = h('div', { class: 'small' });
    const roomPane = h('div', { class: 'acx-pane' }, h('div', { class: 'acx-chart' }, roomCv), h('div', { class: 'cols' }, roomManager(win, S.RV, roomCv), group('Absorption', absBox)));
    const devTable = h('tbody');
    const repBox = h('div', { class: 'scroll', style: 'flex:1;min-height:0' });
    const dataPane = h('div', { class: 'acx-pane' }, h('div', { class: 'cols', style: 'flex:1;min-height:0' }, h('div', { class: 'scroll', style: 'max-width:200px' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['Hz', 'dB'].map((t) => h('th', {}, t)))), devTable)), repBox));
    const strip = viewStrip(win, { room: roomPane, chart: chartPane, data: dataPane });
    win.el.append(h('div', { class: 'acx-body' }, h('div', { class: 'acx-left' }, T.nodes), h('div', { class: 'acx-right' }, strip, roomPane, chartPane, dataPane)));

    const speakersNow = () => {
      const out = [M.spk1, spk2()];
      const g = M.gen.sbir;
      if (g.centre || g.rear) {
        const sur = surroundPositions(M.spk1, M.lis, { rearRise: g.rearRise });
        if (g.centre) out.push(sur.centre);
        if (g.rear) out.push(sur.rearLeft, sur.rearRight);
      }
      return out;
    };

    win.compute = () => {
      const fine = devAt(M.spk1, 48);
      const score = scoreOf(fine);
      const xo = crossoverCheck(fine.freqs, fine.dev, M.xover);
      // the modes the position excites: the speaker within 5 % of a pressure maximum, the listener not on a null
      const dims = { L: M.L, W: M.W, H: M.H };
      const modes = modeList(dimsAtC(), 300);
      const excited = modes.filter((m) => Math.abs(modeShape(dims, m, M.spk1)) >= 0.95 && Math.abs(modeShape(dims, m, M.lis)) >= 0.3).slice(0, 6);
      const absorbers = specularAbsorbers(dims, [M.spk1, spk2()], M.lis, S.win);
      const sur = surroundPositions(M.spk1, M.lis, { rearRise: M.gen.sbir.rearRise });
      S.res = { fine, score, xo, excited, absorbers, geo: listenerGeometry(M.spk1, spk2(), M.lis), sur };
      M.absorbers = absorbers;
    };

    win.report = () => {
      const r = S.res;
      const A = r.absorbers;
      const surf = (n, a) => (a ? [n, `${fmt(toU(a.u0))}–${fmt(toU(a.u1))}`, `${fmt(toU(a.v0))}–${fmt(toU(a.v1))}`, `${fmt(areaU(a.area), 1)} ${aUnit()}`] : [n, '—', '—', '—']);
      const pos = (n, P) => [n, fmt(toU(P.X)), fmt(toU(P.Y)), fmt(toU(P.Z))];
      return {
        title: 'Speaker Boundary Interference Response',
        sections: [
          { heading: `Positions (${M.units}: X from the left wall, Y from the front wall, Z above the floor)`, head: ['', 'X', 'Y', 'Z'], rows: [pos('Speaker 1 (woofer)', M.spk1), pos('Speaker 2 (woofer)', spk2()), pos('Listener', M.lis), ...(M.gen.sbir.centre ? [pos('Centre', r.sur.centre)] : []), ...(M.gen.sbir.rear ? [pos('Rear left', r.sur.rearLeft), pos('Rear right', r.sur.rearRight)] : [])] },
          { heading: 'Speaker', rows: [['Model', findSpeaker(M.spkModel)?.label ?? SPEAKER_PRESETS[M.spkModel]?.label ?? 'entered by size'], ['Size (w × d × h)', `${fmt(toU(M.spkSize.w))} × ${fmt(toU(M.spkSize.d))} × ${fmt(toU(M.spkSize.h))} ${M.units}`], ['Center height', `${fmt(toU(M.centerHeight ?? M.spkSize.h * 0.5))} ${M.units}`], ['Woofer height', `${fmt(toU(M.woofer))} ${M.units}`], ['LF cut-off', `${M.lfCut} Hz`], ['LF cross-over', `${M.xover} Hz`]] },
          { heading: 'Result', rows: [[S.mode === 'negative' ? 'Negative deviation' : 'Absolute deviation', `${fmt(r.score, 2)} dB`], ['At the crossover', Number.isFinite(r.xo.dev) ? `${fmt(r.xo.dev, 1)} dB${r.xo.dips ? ' — dips' : ''}` : '—'], ['Angle between speakers', `${fmt(r.geo.angle, 1)}°`], ['Speaker tilt', `${fmt(r.geo.tilt, 1)}° ${r.geo.warn}`], ['Modes excited', r.excited.map((m) => `${m.nx}${m.ny}${m.nz} ${fmt(m.f, 1)} Hz`).join(', ') || 'none flagged']] },
          { heading: `Specular absorption for a ${fmt(toU(S.win))} ${M.units} listening window (u, v on the surface)`, head: ['Surface', 'u', 'v', 'Area'], rows: [surf('Left wall (u = Y, v = Z)', A.left), surf('Right wall (u = Y, v = Z)', A.right), surf('Ceiling (u = X, v = Y)', A.ceiling)] },
          { heading: 'Deviation, 1/12 octave', head: ['Hz', 'dB'], rows: thinned(r.fine, 12).map(([f, d]) => [fmt(f, 1), fmt(d, 1)]) },
        ],
      };
    };
    const thinned = (d, perOct) => {
      const out = [];
      for (const fc of sbirFreqs(16, 1000, perOct)) {
        const i = d.freqs.reduce((b, f, j) => (Math.abs(Math.log(f / fc)) < Math.abs(Math.log(d.freqs[b] / fc)) ? j : b), 0);
        out.push([fc, d.dev[i]]);
      }
      return out;
    };

    win.render = () => {
      if (!S.res) return;
      const r = S.res;
      devLbl.textContent = S.mode === 'negative' ? 'Negative Deviation' : 'Absolute Deviation';
      devRo.textContent = fmt(r.score, 2);
      xoWarn.textContent = r.xo.dips ? `⚠ ${fmt(r.xo.dev, 1)} dB at the ${M.xover} Hz crossover` : '';
      exc.idx.textContent = r.excited[0] ? `${r.excited[0].nx} ${r.excited[0].ny} ${r.excited[0].nz}` : '—';
      exc.f.textContent = r.excited[0] ? fmt(r.excited[0].f, 1) : '';
      geo.angle.textContent = fmt(r.geo.angle, 1);
      geo.d.textContent = `${fmt(toU(r.geo.d1))} ${M.units}`;
      geo.tilt.textContent = fmt(r.geo.tilt, 1);
      geo.rear.textContent = M.gen.sbir.rear ? `±110°, tilt ${fmt(r.sur.rearTilt, 1)}°` : 'rears off';
      geoWarn.textContent = r.geo.warn ? `⚠ ${r.geo.warn}` : '';
      resList.replaceChildren(...S.results.map((p, i) => h('option', { selected: i === S.resSel }, `X ${fmt(toU(p.X))}  Y ${fmt(toU(p.Y))} ${M.units}   ${fmt(p.score, 2)} dB${p.dips ? ' ⚠ xover' : ''}`)));
      const A = r.absorbers;
      absBox.replaceChildren(...[['Left wall', A.left], ['Right wall', A.right], ['Ceiling', A.ceiling]].map(([n, a]) => h('div', {}, `${n}: ${a ? `${fmt(areaU(a.area), 1)} ${aUnit()}` : '—'}`)), h('div', { class: 'muted' }, `for a ${fmt(toU(S.win))} ${M.units} window`));
      if (win.pane === 'chart') drawSbir(r);
      if (win.pane === 'room') drawSbirRoom(r);
      if (win.pane === 'data') {
        devTable.replaceChildren(...thinned(r.fine, 12).map(([f, d]) => h('tr', {}, h('td', {}, fmt(f, 1)), h('td', { class: d < 0 && S.mode === 'negative' ? 'warn' : '' }, fmt(d, 1)))));
        repBox.replaceChildren(reportNode(win.report()));
      }
    };

    function drawSbir(r) {
      const p = prep(chart.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const a = axes(ctx, w, hh, { title: `SBIR — Deviation (dB) / Frequency (Hz) — ${S.mode === 'negative' ? 'negative deviation in red' : 'absolute'}`, x0: 16, x1: 1000, xlog: true, y0: -30, y1: 12, xticks: FREQ_TICKS, yticks: [-30, -24, -18, -12, -6, 0, 6, 12], xLabel: 'Hz' });
      const half = 1 / (2 * S.perOct);
      for (const fc of sbirFreqs(16, 1000, S.perOct)) {
        let s = 0;
        let n = 0;
        r.fine.freqs.forEach((f, i) => {
          if (Math.abs(Math.log2(f / fc)) <= half + 1e-9) {
            s += r.fine.dev[i];
            n++;
          }
        });
        const v = n ? s / n : 0;
        const x0 = a.X(Math.max(16, fc * 2 ** -half));
        const x1 = a.X(Math.min(1000, fc * 2 ** half));
        ctx.fillStyle = fc < M.lfCut ? '#305030' : S.mode === 'negative' && v < 0 ? COL.red : COL.green;
        const y0 = a.Y(0);
        const y1 = a.Y(v);
        ctx.fillRect(x0 + 0.5, Math.min(y0, y1), Math.max(1, x1 - x0 - 1), Math.max(1, Math.abs(y1 - y0)));
      }
      ctx.strokeStyle = COL.frame;
      ctx.beginPath();
      ctx.moveTo(a.pad.l, Math.round(a.Y(0)) + 0.5);
      ctx.lineTo(w - a.pad.r, Math.round(a.Y(0)) + 0.5);
      ctx.stroke();
      const vline = (f, colour, label) => {
        if (!(f >= 16 && f <= 1000)) return;
        ctx.strokeStyle = colour;
        ctx.beginPath();
        ctx.moveTo(Math.round(a.X(f)) + 0.5, a.pad.t);
        ctx.lineTo(Math.round(a.X(f)) + 0.5, hh - a.pad.b);
        ctx.stroke();
        ctx.fillStyle = colour;
        ctx.fillText(label, a.X(f) + 3, a.pad.t + 10);
      };
      vline(M.lfCut, COL.red, `LF cut-off ${M.lfCut} Hz`);
      vline(M.xover, COL.yellow, `x-over ${M.xover} Hz`);
      r.excited.forEach((m, i) => {
        if (!(m.f >= 16 && m.f <= 1000)) return;
        ctx.strokeStyle = '#ff40ff';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(a.X(m.f)) + 0.5, a.pad.t);
        ctx.lineTo(Math.round(a.X(m.f)) + 0.5, hh - a.pad.b);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ff40ff';
        ctx.fillText(`${m.nx}${m.ny}${m.nz}`, a.X(m.f) + 3, hh - a.pad.b - 6 - 11 * i);
      });
    }

    function drawSbirRoom(r) {
      const A = r.absorbers;
      drawRoom(roomCv, S.RV, {
        speakers: speakersNow(),
        lis: M.lis,
        over: (ctx, S2) => {
          const quad = (pts, fill, stroke) => {
            const q = pts.map(S2);
            ctx.beginPath();
            q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = stroke;
            ctx.stroke();
          };
          // the valid listening window, at ear height
          const w2 = S.win / 2;
          quad([{ X: M.lis.X - w2, Y: M.lis.Y - w2, Z: M.lis.Z }, { X: M.lis.X + w2, Y: M.lis.Y - w2, Z: M.lis.Z }, { X: M.lis.X + w2, Y: M.lis.Y + w2, Z: M.lis.Z }, { X: M.lis.X - w2, Y: M.lis.Y + w2, Z: M.lis.Z }], 'rgba(255,255,0,0.15)', COL.yellow);
          // the specular absorbers on the side walls and the ceiling
          const side = (X, a) => a && quad([{ X, Y: a.u0, Z: a.v0 }, { X, Y: a.u1, Z: a.v0 }, { X, Y: a.u1, Z: a.v1 }, { X, Y: a.u0, Z: a.v1 }], 'rgba(0,192,255,0.25)', COL.cyan);
          side(0, A.left);
          side(M.W, A.right);
          if (A.ceiling) quad([{ X: A.ceiling.u0, Y: A.ceiling.v0, Z: M.H }, { X: A.ceiling.u1, Y: A.ceiling.v0, Z: M.H }, { X: A.ceiling.u1, Y: A.ceiling.v1, Z: M.H }, { X: A.ceiling.u0, Y: A.ceiling.v1, Z: M.H }], 'rgba(0,192,255,0.2)', COL.cyan);
          // corner absorbers: the two front corners, floor to ceiling, 0.6 m across
          const c = 0.42;
          for (const [X0, X1] of [[0, c], [M.W - c, M.W]]) {
            ctx.strokeStyle = COL.orange;
            ctx.beginPath();
            const Ycorner = X0 === 0 ? (X) => c - X : (X) => c - (M.W - X);
            const a = { X: X0 === 0 ? 0 : M.W, Y: c };
            const b = { X: X0 === 0 ? c : M.W - c, Y: 0 };
            for (const Z of [0, M.H]) {
              const p1 = S2({ ...a, Z });
              const p2 = S2({ ...b, Z });
              ctx.moveTo(p1[0], p1[1]);
              ctx.lineTo(p2[0], p2[1]);
            }
            for (const P of [a, b]) {
              const p1 = S2({ ...P, Z: 0 });
              const p2 = S2({ ...P, Z: M.H });
              ctx.moveTo(p1[0], p1[1]);
              ctx.lineTo(p2[0], p2[1]);
            }
            ctx.stroke();
            void Ycorner;
          }
          ctx.fillStyle = COL.text;
          ctx.fillText('yellow: listening window · cyan: specular absorption · orange: corner absorbers', 8, 28);
        },
      });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 3. RAY TRACING
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('rays', 'Acoustic X — Ray Tracing', { w: 880, h: 610 }, (win) => {
    const S = {
      band: 2,
      refl: 14,
      v: { step: 5, begin: -90, end: 90 },
      hz: { begin: 0, end: 360 },
      radius: 0.3,
      sources: { s1: true, s2: true, c: false, rl: false, rr: false },
      align: true,
      aimAt: null,
      suppress: [false, false, false, false],
      showTrace: true,
      items: { speakers: true, absorbers: true, listener: true, polar: true },
      absAlpha: 0.9,
      follow: 0.5,
      mode: 'total',
      idx: 0,
      res: null,
      RV: newRV('plan'),
      mouseEdit: false,
    };
    const T = tabs(win, ['Room', 'SPK', 'LS', 'Acoustic', 'Sim.']);
    T.pages.Room.append(dimsGroup(win));
    const check = (obj, key, label, title, after = () => win.refresh()) => {
      const c = h('input', { type: 'checkbox', onchange: () => ((obj[key] = c.checked), after()) });
      win.syncers.push(() => (c.checked = Boolean(obj[key])));
      return h('div', {}, h('label', { class: 'opt', title }, c, label));
    };
    T.pages.SPK.append(
      pointGroup(win, 'Speaker1', () => M.spk1, (v) => (M.spk1 = v)),
      pointGroup(win, 'Speaker2 (mirror image)', spk2, () => {}, { disabled: () => true }),
      group('Parameters', check(S, 'align', 'Automatic speaker alignment', 'On: the speakers always point at the listener. Off: they keep the aim they had', () => ((S.aimAt = S.align ? null : { ...M.lis }), win.refresh()))),
    );
    const mouseB = h('button', { title: 'Click on the Plan View to put the listener there', onclick: () => ((S.mouseEdit = !S.mouseEdit), (S.RV.onPick = S.mouseEdit ? pick : null), S.mouseEdit && ((S.RV.view = 'plan'), win.showPane('room')), syncMouse()) }, 'Mouse Edit');
    const syncMouse = () => mouseB.classList.toggle('down', S.mouseEdit);
    win.syncers.push(syncMouse);
    const pick = (P) => {
      M.lis = { ...M.lis, X: P.X, Y: P.Y };
      edited();
    };
    T.pages.LS.append(pointGroup(win, 'Listening Position', () => M.lis, (v) => (M.lis = v)), h('div', { class: 'btns' }, mouseB, h('button', { title: 'Back to the room being designed', onclick: () => (pullFromRoom(), refreshAll()) }, 'Reset positions')), lenField(win, 'Sphere radius', () => S.radius, (v) => (S.radius = clamp(v, 0.05, 2)), { local: true, title: 'The energy tracking sphere round the listener: bigger catches more reflections' }));
    const bandSel = h('select', {}, BAND_LABELS.map((l, i) => h('option', { value: i }, l)));
    bandSel.addEventListener('change', () => ((S.band = +bandSel.value), win.refresh()));
    const alphaRo = Object.fromEntries(FACES6.map((f) => [f, readout('α in the chosen band')]));
    win.syncers.push(() => {
      bandSel.value = String(S.band);
      for (const f of FACES6) alphaRo[f].textContent = `α ${fmt(material(M.mats[f]).alpha[S.band], 2)}`;
    });
    T.pages.Acoustic.append(
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Octave band'), bandSel),
      group('Rect. Room', ...FACES6.map((f) => h('div', {}, h('div', { class: 'row' }, h('span', { class: 'lbl' }, FACE_LABEL[f]), alphaRo[f]), faceMatSelect(win, f)))),
      group('Specular Absorbers', numField(win, 'α', '', () => S.absAlpha, (v) => (S.absAlpha = clamp(v, 0, 1)), { step: 0.05, title: 'The absorbers the SBIR window places on the side walls and the ceiling' }), check(S.items, 'absorbers', 'Use them in the trace')),
    );
    const traces = readout();
    const angGroup = (legend, o, withStep) => group(legend, ...(withStep ? [numField(win, 'Step', '°', () => o.step, (v) => (o.step = clamp(v, 0.5, 30)), { step: 0.5 })] : []), numField(win, 'Begin', '°', () => o.begin, (v) => (o.begin = v)), numField(win, 'End', '°', () => o.end, (v) => (o.end = v)));
    T.pages['Sim.'].append(
      group('Trace', numField(win, 'Number of ref.', '', () => S.refl, (v) => (S.refl = clamp(Math.round(v), 1, 40)), { title: 'How many reflections each ray is followed for (14: the direct sound and 13 bounces)' }), h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Total traces'), traces)),
      angGroup('Vertical Angle', S.v, true),
      angGroup('Horizontal Angle (step follows)', S.hz, false),
      group('Display Items', check(S.items, 'speakers', 'Speakers'), check(S.items, 'listener', 'Listener'), check(S.items, 'polar', 'Polar energy'), check(S, 'showTrace', 'Show the traces')),
      group('Suppression', ...['Direct energy', 'First reflection', 'Second reflection', 'Third reflection'].map((l, i) => check(S.suppress, i, l))),
      group('SPK Source', check(S.sources, 's1', 'Speaker 1'), check(S.sources, 's2', 'Speaker 2'), check(S.sources, 'c', 'Centre (General Parameters)'), check(S.sources, 'rl', 'Rear left'), check(S.sources, 'rr', 'Rear right')),
      numField(win, 'Follow time', '%', () => S.follow * 100, (v) => (S.follow = clamp(v, 5, 100) / 100), { step: 5, title: 'The share of the reverb time the time display tracks' }),
    );

    // ── right side
    const top = chartBox('flex:1');
    const bot = chartBox('flex:1.2');
    const modeR = [['single', 'Single impulse / surface'], ['total', 'Total energy / surface']].map(([v, l]) => {
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
      if (!S.res?.arrivals.length || !bot.map) return;
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
    const chartPane = h(
      'div',
      { class: 'acx-pane' },
      h('fieldset', { class: 'grow' }, h('legend', {}, 'Impulse Answer'), h('div', { style: 'display:flex;flex-direction:column;gap:4px;flex:1;min-height:0' }, top.box, bot.box)),
      group('Chart View Manager', h('div', { class: 'manager' }, ...modeR), h('div', { class: 'manager' }, rr('X', ro.t, 'ms'), rr('Y', ro.l, 'dB'), rr('Surface', ro.s), rr('Within 10 dB', ro.flag), h('button', { onclick: () => stepTo(-1) }, '◄ Prev'), h('button', { onclick: () => stepTo(1) }, 'Next ►'))),
    );
    const roomCv = h('canvas');
    const roomPane = h('div', { class: 'acx-pane' }, h('div', { class: 'acx-chart' }, roomCv), roomManager(win, S.RV, roomCv));
    const params = h('tbody');
    const repBox = h('div', { class: 'scroll', style: 'flex:1;min-height:0' });
    const dataPane = h('div', { class: 'acx-pane' }, group('Acoustic Parameters', h('table', { class: 'grid' }, params)), repBox);
    const strip = viewStrip(win, { room: roomPane, chart: chartPane, data: dataPane });
    win.el.append(h('div', { class: 'acx-body' }, h('div', { class: 'acx-left' }, T.nodes), h('div', { class: 'acx-right' }, strip, roomPane, chartPane, dataPane)));

    const ORDER_COL = [COL.red, '#4060ff', '#60c0ff', COL.green];
    const orderCol = (o) => ORDER_COL[Math.min(3, o)];
    const BUCKETS = ['direct', 'left', 'back', 'right', 'front', 'floor', 'ceiling'];

    function sourcesNow() {
      const sur = surroundPositions(M.spk1, M.lis, { rearRise: M.gen.sbir.rearRise });
      return [
        ['Speaker 1', M.spk1, S.sources.s1],
        ['Speaker 2', spk2(), S.sources.s2],
        ['Centre', sur.centre, S.sources.c],
        ['Rear left', sur.rearLeft, S.sources.rl],
        ['Rear right', sur.rearRight, S.sources.rr],
      ].filter((x) => x[2]);
    }

    win.compute = () => {
      const dims = { L: M.L, W: M.W, H: M.H };
      const alpha = Object.fromEntries(FACES6.map((f) => [f, material(M.mats[f]).alpha[S.band]]));
      const A = M.absorbers ?? specularAbsorbers(dims, [M.spk1, spk2()], M.lis);
      const patches = S.items.absorbers ? [['left', A.left], ['right', A.right], ['ceiling', A.ceiling]].filter((x) => x[1]).map(([face, a]) => ({ face, ...a, alpha: S.absAlpha })) : [];
      const local = equalAreaDirections({ step: S.v.step, vBegin: S.v.begin, vEnd: S.v.end, hBegin: S.hz.begin, hEnd: S.hz.end });
      const c = cNow();
      const airDb = airDbPerM(BANDS[S.band], M.gen.tempC, M.gen.rh);
      const srcs = sourcesNow();
      const aim = S.align || !S.aimAt ? M.lis : S.aimAt;
      let arrivals = [];
      let traces = [];
      let d0min = Infinity;
      for (const [, P] of srcs) d0min = Math.min(d0min, Math.hypot(P.X - M.lis.X, P.Y - M.lis.Y, P.Z - M.lis.Z));
      srcs.forEach(([name, P], si) => {
        const out = traceRays(dims, P, M.lis, { dirs: raysToward(P, aim, local), alpha, patches, maxRefl: S.refl - 1, radius: S.radius, c, airDb, keepTraces: Math.ceil(300 / srcs.length) });
        const d0 = Math.hypot(P.X - M.lis.X, P.Y - M.lis.Y, P.Z - M.lis.Z);
        const shift = 20 * Math.log10(d0min / d0);
        arrivals.push(...out.arrivals.map((a) => ({ ...a, speaker: si, name, level: a.level + shift })));
        traces.push(...out.traces);
      });
      const kept = arrivals.filter((a) => !(a.order <= 3 && S.suppress[a.order]) && a.level > -60).sort((a, b) => a.t - b.t);
      const totals = Object.fromEntries(BUCKETS.map((b) => [b, dbSum(kept.filter((a) => (b === 'direct' ? a.order === 0 : a.faces.includes(b))).map((a) => a.level))]));
      // the figures the Data View lists
      const room = classicRoom();
      const Sarea = room.surfaces.reduce((s, x) => s + x.area, 0);
      const abar = room.surfaces.reduce((s, x) => s + x.area * x.material.alpha[S.band], 0) / Sarea;
      const fig = roomFigures({ V: room.V, S: Sarea, abar, follow: S.follow, c });
      S.res = { arrivals: kept, totals, traces, fig, rays: local.length * srcs.length, srcs, polar: polarEnergy(kept, 36) };
      if (S.idx >= kept.length) S.idx = 0;
    };

    win.report = () => {
      const r = S.res;
      const f = r.fig;
      const c = cNow();
      // per speaker, per surface: the first-order reflection's lag behind the direct sound, and its comb filter
      const rows = [];
      for (const [name, P] of r.srcs) {
        const d0 = Math.hypot(P.X - M.lis.X, P.Y - M.lis.Y, P.Z - M.lis.Z);
        for (const [face, k, plane] of [['left', 'X', 0], ['right', 'X', M.W], ['front', 'Y', 0], ['back', 'Y', M.L], ['floor', 'Z', 0], ['ceiling', 'Z', M.H]]) {
          const img = { ...P, [k]: 2 * plane - P[k] };
          const d = Math.hypot(img.X - M.lis.X, img.Y - M.lis.Y, img.Z - M.lis.Z);
          const dt = (d - d0) / c;
          const n = combNulls(dt);
          rows.push([name, face, fmt(dt * 1000, 2), fmt(toU(d - d0), 2), fmt(n.first, 0), fmt(n.spacing, 0)]);
        }
      }
      return {
        title: 'Ray Tracing',
        sections: [
          { heading: `Acoustic parameters, ${BAND_LABELS[S.band]}`, rows: paramRows(f, r) },
          { heading: 'Arrivals (within 60 dB)', head: ['ms', 'dB', 'Order', 'Speaker', 'Surfaces'], rows: r.arrivals.slice(0, 120).map((a) => [fmt(a.t, 2), fmt(a.level, 1), a.order, a.name, a.order ? a.faces.join(' → ') : 'direct']) },
          { heading: 'First-order reflections and their nulls', text: 'Calculated for cross-checking against a measurement: they are where nulls would be, not proof that they are there.', head: ['Speaker', 'Surface', 'Δt ms', `Δpath ${M.units}`, 'First null Hz', 'Spacing Hz'], rows },
        ],
      };
    };
    const paramRows = (f, r) => [
      ['Room volume', M.units === 'ft' ? `${fmt(f.V * FT ** 3, 0)} ft³` : `${fmt(f.V, 1)} m³`],
      ['Room surface area', `${fmt(areaU(f.S), 1)} ${aUnit()}`],
      ['Alpha (mean α)', fmt(f.abar, 3)],
      ['RT60 (Sabine)', `${fmt(f.rt60, 2)} s`],
      ['MFP (mean free path)', `${fmt(toU(f.mfp), 2)} ${M.units}`],
      ['RC (room constant)', `${fmt(areaU(f.R), 1)} ${aUnit()}`],
      ['Critical distance (Q = 2)', `${fmt(toU(f.dc), 2)} ${M.units}`],
      ['Pref. # of reflections', `${f.prefReflections} (to follow ${Math.round(S.follow * 100)} % of RT60)`],
      ['Total traces', String(r.rays)],
      ['Follow time', `${Math.round(Math.min(1, ((S.refl - 1) * f.mfp) / cNow() / f.rt60) * 100)} % of RT60 with ${S.refl} reflections`],
    ];

    win.render = () => {
      if (!S.res) return;
      const { arrivals, totals } = S.res;
      const cur = arrivals[S.idx];
      traces.textContent = String(S.res.rays);
      ro.t.textContent = cur ? fmt(cur.t, 2) : '';
      ro.l.textContent = cur ? fmt(cur.level, 1) : '';
      ro.s.textContent = cur ? (cur.order ? cur.faces.join(' → ') : 'direct') : '';
      ro.flag.textContent = String(arrivals.filter((a) => a.order > 0 && a.level > -10).length);
      if (win.pane === 'chart') {
        drawSurfaces(S.mode === 'single' && cur ? Object.fromEntries(BUCKETS.map((b) => [b, (b === 'direct' ? cur.order === 0 : cur.faces.includes(b)) ? cur.level : -Infinity])) : totals);
        drawTime(arrivals, cur);
      }
      if (win.pane === 'room') drawRays();
      if (win.pane === 'data') {
        params.replaceChildren(...paramRows(S.res.fig, S.res).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v))));
        repBox.replaceChildren(reportNode(win.report()));
      }
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
        const bw = Math.max(2, s.w * 0.08);
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
      const follow = S.follow * S.res.fig.rt60 * 1000;
      const tEnd = Math.max(20, Math.ceil(Math.max(follow, ...arrivals.map((x) => x.t)) / 10) * 10);
      const step = tEnd > 400 ? 100 : tEnd > 200 ? 50 : tEnd > 100 ? 20 : 10;
      const a = axes(ctx, w, hh, { title: 'Energy (dB) / Time (ms) — red direct, blue 1st, light blue 2nd, green later', x0: 0, x1: tEnd, y0: -50, y1: 5, xticks: Array.from({ length: Math.floor(tEnd / step) + 1 }, (_, i) => ({ v: i * step, label: String(i * step) })), yticks: [-50, -40, -30, -20, -10, 0], xLabel: 'ms' });
      bot.map = a;
      for (const x of arrivals) {
        const px = Math.round(a.X(x.t));
        const y = a.Y(x.level);
        ctx.fillStyle = x === cur && S.mode === 'single' ? COL.yellow : orderCol(x.order);
        ctx.fillRect(px - 1, y, 2, a.Y(-50) - y);
      }
      // the 10 dB window: the strongest arrival, and 10 dB under it
      const top0 = Math.max(...arrivals.map((x) => x.level), -50);
      ctx.strokeStyle = '#4080ff';
      for (const v of [top0, top0 - 10]) {
        ctx.beginPath();
        ctx.moveTo(a.pad.l, Math.round(a.Y(v)) + 0.5);
        ctx.lineTo(w - a.pad.r, Math.round(a.Y(v)) + 0.5);
        ctx.stroke();
      }
      ctx.fillStyle = '#4080ff';
      ctx.textAlign = 'right';
      ctx.fillText('10 dB window', w - a.pad.r - 4, a.Y(top0 - 10) - 4);
      ctx.textAlign = 'left';
    }

    function drawRays() {
      const r = S.res;
      drawRoom(roomCv, S.RV, {
        speakers: S.items.speakers ? r.srcs.map((x) => x[1]) : [],
        lis: S.items.listener ? M.lis : null,
        under: (ctx, S2) => {
          if (!S.showTrace) return;
          ctx.globalAlpha = 0.35;
          for (const poly of r.traces) {
            for (let i = 1; i < poly.length; i++) {
              const order = poly[i].order;
              if (order <= 3 && S.suppress[order]) continue;
              const a = S2(poly[i - 1]);
              const b = S2(poly[i]);
              ctx.strokeStyle = orderCol(order);
              ctx.beginPath();
              ctx.moveTo(a[0], a[1]);
              ctx.lineTo(b[0], b[1]);
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;
        },
        over: (ctx, S2, f) => {
          if (!S.items.polar || S.RV.view !== 'plan') return;
          // the polar energy round the listener: two blue circles, the strongest direction and 10 dB under it
          const c = S2(M.lis);
          const R = Math.min(90, 0.3 * Math.min(M.W, M.L) * f.k);
          const rOf = (db) => R * Math.max(0, 1 + db / 30);
          ctx.strokeStyle = '#4080ff';
          for (const db of [0, -10]) {
            ctx.beginPath();
            ctx.arc(c[0], c[1], rOf(db), 0, 2 * Math.PI);
            ctx.stroke();
          }
          ctx.strokeStyle = COL.yellow;
          ctx.fillStyle = 'rgba(255,255,0,0.25)';
          ctx.beginPath();
          r.polar.forEach((db, i) => {
            const brg = ((i + 0.5) * 10 * Math.PI) / 180;
            // bearing 0° is toward the front wall (up on the plan), clockwise
            const x = c[0] + Math.sin(brg) * rOf(Number.isFinite(db) ? db : -30);
            const y = c[1] - Math.cos(brg) * rOf(Number.isFinite(db) ? db : -30);
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          });
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = COL.text;
          ctx.fillText(`polar energy: outer circle the strongest direction, inner −10 dB${S.mouseEdit ? ' · click to move the listener' : ''}`, 8, 28);
        },
      });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 4. REVERB TIME
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('reverb', 'Acoustic X — Reverb Time', { w: 880, h: 610 }, (win) => {
    const S = { target: 'control', user: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4], formula: 'sabine', face: 'back', selMat: 'absorber-100', vars: {}, sol: null, res: null, show: 'rt', editUser: false, editMeas: false, RV: newRV('3d') };

    // ── Type: what to aim for
    const typeRadios = RT_TARGETS.map((t) => {
      const r = h('input', { type: 'radio', name: 'acx-rt-type', onchange: () => ((S.target = t.id), win.refresh()) });
      win.syncers.push(() => (r.checked = S.target === t.id));
      return h('div', {}, h('label', { class: 'opt', title: t.source }, r, t.label), h('span', { class: 'small muted' }, t.id === 'user' ? 'your own, per band' : t.source));
    });
    const bandInputs = (arr, set) => h('div', { class: 'bandin' }, BAND_LABELS.map((l, i) => h('label', {}, l, (() => {
      const inp = h('input', { type: 'number', step: 0.05, style: 'width:52px' });
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value);
        if (Number.isFinite(v) && v > 0) set(i, v);
        win.refresh();
      });
      win.syncers.push(() => {
        const a = arr();
        if (document.activeElement !== inp) inp.value = a ? String(a[i]) : '';
      });
      return inp;
    })())));
    const userPanel = h('div', { hidden: true }, group("User's RT60 Criteria (s)", bandInputs(() => S.user, (i, v) => (S.user[i] = v)), h('div', { class: 'btns' }, h('button', { onclick: () => ((userPanel.hidden = true), (S.target = 'user'), win.refresh()) }, 'Done'))));
    const measPanel = h('div', { hidden: true }, group('RT60 Of Empty Room (s)', bandInputs(() => M.measured, (i, v) => (M.measured = (M.measured ?? [0.8, 0.8, 0.8, 0.8, 0.8, 0.8]).map((x, j) => (j === i ? v : x)))), h('div', { class: 'btns' }, h('button', { onclick: () => ((measPanel.hidden = true), (S.formula = 'measured'), win.refresh()) }, 'Done'))));

    // ── RT60: how to calculate it
    const formulaList = [...FORMULAS, { id: 'measured', label: 'Measured empty RT' }];
    const formulaRadios = formulaList.map((f) => {
      const r = h('input', { type: 'radio', name: 'acx-rt-f', onchange: () => ((S.formula = f.id), win.refresh()) });
      win.syncers.push(() => {
        r.checked = S.formula === f.id;
        r.disabled = f.id === 'measured' && !M.measured;
      });
      return h('div', {}, h('label', { class: 'opt' }, r, f.label));
    });

    // ── Surface: what each surface is made of
    const faceList = h('select', { class: 'list', size: 6 }, FACES6.map((f) => h('option', { value: f }, FACE_LABEL[f])));
    faceList.addEventListener('change', () => ((S.face = faceList.value), win.refresh()));
    const nextFace = () => ((S.face = FACES6[(FACES6.indexOf(S.face) + 1) % 6]), win.refresh());
    const layerBox = h('div');
    const remainRo = readout('What the base material still covers');
    const matList = h('select', { class: 'list', size: 9, title: 'Double-click to lay it on the surface' }, matOptions());
    const srcRo = h('div', { class: 'small muted' });
    matList.addEventListener('change', () => ((S.selMat = matList.value), win.render()));
    const attach = () => {
      const layers = (M.layers[S.face] ??= []);
      if (layers.length >= 8) return (win.status.textContent = 'Eight materials per surface at most');
      const free = faceArea(S.face) - layers.reduce((s, l) => s + l.area, 0);
      layers.push({ id: S.selMat, area: +Math.max(0, Math.min(free, 1)).toFixed(2) });
      edited();
    };
    matList.addEventListener('dblclick', attach);
    win.syncers.push(() => {
      faceList.value = S.face;
      if (document.activeElement !== matList) matList.value = S.selMat;
    });

    // ── Optimise: the absorber overview
    const overview = h('tbody');
    const optNote = h('div', { class: 'small', style: 'margin-top:4px' });
    function goOptimise() {
      const chosen = Object.entries(S.vars).filter(([, v]) => v.on).slice(0, 5);
      if (!chosen.length) return (optNote.textContent = 'Tick up to five materials to vary, with their Begin, End and Step.');
      const tgt = targetNow().rt;
      try {
        const vars = chosen.map(([, v]) => v);
        const keys = chosen.map(([k]) => k);
        const best = optimiseAreas(vars, tgt, (areas) => rtWith(keys, areas));
        S.sol = { ...best, keys };
        optNote.replaceChildren(h('div', {}, `${best.tried} combinations tried. Best:`), ...keys.map((k, i) => h('div', {}, `• ${layerName(k)}: ${fmt(areaU(best.areas[i]), 1)} ${aUnit()}`)), h('div', {}, `RT ${best.rt.map((t) => fmt(t, 2)).join(' · ')} s`), h('div', { class: 'btns' }, h('button', { onclick: applySol }, 'Apply')));
      } catch (e) {
        optNote.textContent = `⚠ ${e.message}`;
      }
    }
    const layerName = (k) => {
      const [face, i] = k.split(':');
      return `${material(M.layers[face][+i].id).name} on the ${FACE_LABEL[face].toLowerCase()}`;
    };
    function rtWith(keys, areas) {
      const saved = keys.map((k) => {
        const [face, i] = k.split(':');
        return [face, +i, M.layers[face][+i].area];
      });
      keys.forEach((k, j) => {
        const [face, i] = k.split(':');
        M.layers[face][+i].area = Math.min(areas[j], faceArea(face));
      });
      const rt = rtNow();
      for (const [face, i, a] of saved) M.layers[face][i].area = a;
      return rt;
    }
    function applySol() {
      if (!S.sol) return;
      S.sol.keys.forEach((k, j) => {
        const [face, i] = k.split(':');
        M.layers[face][+i].area = Math.min(S.sol.areas[j], faceArea(face));
      });
      edited();
    }

    const T = tabs(win, ['Type', 'RT60', 'Surface', 'Optimize', 'Show Item']);
    T.pages.Type.append(group('Criteria Type', ...typeRadios), h('div', { class: 'btns' }, h('button', { onclick: () => (userPanel.hidden = !userPanel.hidden) }, 'Edit user defined RT60 criteria')), userPanel);
    T.pages.RT60.append(group('Calculation Method', ...formulaRadios), h('div', { class: 'btns' }, h('button', { onclick: () => ((M.measured ??= [0.8, 0.8, 0.8, 0.8, 0.8, 0.8]), (measPanel.hidden = !measPanel.hidden), win.sync()) }, 'Edit Measured RT60 (Empty)'), h('button', { onclick: () => ((M.measured = null), S.formula === 'measured' && (S.formula = 'sabine'), win.refresh()) }, 'No Measured RT60')), measPanel, h('div', { class: 'small muted' }, 'A measured empty room already includes the air, so none is added. Fitzroy suits a room whose absorption is uneven — a hard floor and ceiling under absorbent walls.'));
    T.pages.Surface.append(
      dimsGroup(win),
      group('Surface Editor', faceList, h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Base'), faceMatSelect(win, 'floor')), layerBox, h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Unspecified'), remainRo), h('div', { class: 'btns' }, h('button', { onclick: nextFace }, 'Next Surface'))),
      group('Absorber Edit Manager', srcRo, matList, h('div', { class: 'btns' }, h('button', { onclick: attach }, 'Attach to surface'))),
    );
    // the base select above is rebuilt per surface in render
    const baseRow = T.pages.Surface.querySelector('fieldset:nth-of-type(2) .row');
    T.pages.Optimize.append(group('Absorber Overview', h('div', { class: 'scroll', style: 'max-height:260px' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['', 'Material · surface', 'Now', 'Begin', 'End', 'Step'].map((t) => h('th', {}, t)))), overview))), h('div', { class: 'btns' }, h('button', { onclick: goOptimise }, 'Go Optimize')), optNote);
    const showR = [['rt', 'Reverb Time Data'], ['alpha', 'Average Absorption Coefficients']].map(([v, l]) => {
      const r = h('input', { type: 'radio', name: 'acx-rt-show', onchange: () => ((S.show = v), win.render()) });
      win.syncers.push(() => (r.checked = S.show === v));
      return h('div', {}, h('label', { class: 'opt' }, r, l));
    });
    T.pages['Show Item'].append(group('Show Item (Data View)', ...showR));

    // ── right side
    const alphaC = chartBox('flex:0.8');
    const rtC = chartBox('flex:1.2');
    const chartPane = h('div', { class: 'acx-pane' }, h('fieldset', { class: 'grow' }, h('legend', {}, 'Reverb Time'), h('div', { style: 'display:flex;gap:4px;flex:1;min-height:0' }, alphaC.box, rtC.box)));
    const roomCv = h('canvas');
    const roomPane = h('div', { class: 'acx-pane' }, h('div', { class: 'acx-chart' }, roomCv), roomManager(win, S.RV, roomCv));
    const tbl = h('tbody');
    const repBox = h('div', { class: 'scroll', style: 'flex:1;min-height:0' });
    const dataPane = h('div', { class: 'acx-pane' }, group('Data Table', h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, ''), BAND_LABELS.map((l) => h('th', {}, l)))), tbl)), repBox);
    const strip = viewStrip(win, { room: roomPane, chart: chartPane, data: dataPane });
    win.el.append(h('div', { class: 'acx-body' }, h('div', { class: 'acx-left' }, T.nodes), h('div', { class: 'acx-right' }, strip, roomPane, chartPane, dataPane)));

    const faceArea = (f) => M.areas?.[f] ?? boxAreas()[f];
    const targetNow = () => {
      const V = classicRoom().V;
      if (S.target !== 'user') return rtTarget(S.target, V);
      return { rt: [...S.user], lo: S.user.map((t) => t * 0.9), hi: S.user.map((t) => t * 1.1) };
    };
    function rtNow(formula = S.formula) {
      const room = classicRoom();
      if (formula === 'measured' && M.measured) {
        const added = [];
        for (const f of FACES6) for (const l of M.layers[f] ?? []) added.push({ alpha: material(l.id).alpha, area: l.area, under: material(M.mats[f]).alpha });
        return rtFromMeasured(room.V, M.measured, added);
      }
      return BANDS.map((_, b) => rtFormulas(room, b)[formula === 'measured' ? 'sabine' : formula]);
    }

    win.compute = () => {
      const room = classicRoom();
      const all = BANDS.map((_, b) => rtFormulas(room, b));
      const Sarea = room.surfaces.reduce((s, x) => s + x.area, 0);
      const abar = BANDS.map((_, b) => room.surfaces.reduce((s, x) => s + x.area * x.material.alpha[b], 0) / Sarea);
      S.res = { room, all, rt: rtNow(), target: targetNow(), abar, measured: M.measured ? rtNow('measured') : null };
    };

    win.report = () => {
      const r = S.res;
      const rows = [];
      for (const f of FACES6) {
        const layers = M.layers[f] ?? [];
        const used = layers.reduce((s, l) => s + l.area, 0);
        rows.push([FACE_LABEL[f], material(M.mats[f]).name, `${fmt(areaU(Math.max(0, faceArea(f) - used)), 1)} ${aUnit()}`]);
        for (const l of layers) rows.push(['', material(l.id).name, `${fmt(areaU(l.area), 1)} ${aUnit()}`]);
      }
      return {
        title: 'Reverb Time',
        sections: [
          { heading: 'Room', rows: [['Volume', M.units === 'ft' ? `${fmt(r.room.V * FT ** 3, 0)} ft³` : `${fmt(r.room.V, 1)} m³`], ['Criteria', S.target === 'user' ? 'user defined' : RT_TARGETS.find((t) => t.id === S.target).label], ['Method', formulaList.find((f) => f.id === S.formula).label]] },
          { heading: 'Materials by surface', head: ['Surface', 'Material', 'Area'], rows },
          { heading: 'Reverb time (s)', head: ['', ...BAND_LABELS], rows: [...FORMULAS.map((f, i) => [f.label, ...r.all.map((x) => fmt(x[f.id], 2))]), ...(r.measured ? [['Measured basis', ...r.measured.map((t) => fmt(t, 2))]] : []), ['Criteria', ...r.target.rt.map((t) => fmt(t, 2))], ['Mean α', ...r.abar.map((a) => fmt(a, 3))]] },
        ],
      };
    };

    win.render = () => {
      if (!S.res) return;
      const r = S.res;
      // surface editor
      const layers = M.layers[S.face] ?? [];
      const used = layers.reduce((s, l) => s + l.area, 0);
      remainRo.textContent = `${fmt(areaU(faceArea(S.face) - used), 1)} ${aUnit()}`;
      remainRo.classList.toggle('warn', used > faceArea(S.face) + 1e-6);
      baseRow?.replaceChildren(h('span', { class: 'lbl' }, 'Base'), matSelectFor(S.face));
      layerBox.replaceChildren(
        ...layers.map((l, i) => {
          const inp = h('input', { type: 'number', step: 0.1, value: fmt(areaU(l.area), 2), style: 'width:56px' });
          inp.addEventListener('change', () => {
            const v = parseFloat(inp.value);
            if (Number.isFinite(v) && v >= 0) l.area = areaFromU(v);
            edited();
          });
          return h('div', { class: 'row' }, h('span', { class: 'lbl', title: material(l.id).name }, material(l.id).name.slice(0, 14)), inp, h('span', { class: 'unit' }, aUnit()), h('button', { title: 'Remove', onclick: () => (layers.splice(i, 1), edited()) }, '×'));
        }),
      );
      const selM = material(S.selMat);
      srcRo.textContent = selM.source
        ? `${selM.source} · ${selM.name}${selM.comments ? ` (${selM.comments})` : ''}`
        : `${selM.category} — ${selM.name}`;
      // optimise overview
      overview.replaceChildren(
        ...FACES6.flatMap((f) =>
          (M.layers[f] ?? []).map((l, i) => {
            const k = `${f}:${i}`;
            const v = (S.vars[k] ??= { on: false, begin: 0, end: Math.round(faceArea(f)), step: Math.max(0.5, Math.round(faceArea(f) / 10)) });
            const c = h('input', { type: 'checkbox', checked: v.on, onchange: () => (v.on = c.checked) });
            const n = (key) => {
              const inp = h('input', { type: 'number', step: 0.1, value: String(+areaU(v[key]).toFixed(2)), style: 'width:44px' });
              inp.addEventListener('change', () => (v[key] = Math.max(0, areaFromU(parseFloat(inp.value) || 0))));
              return h('td', {}, inp);
            };
            return h('tr', {}, h('td', {}, c), h('td', {}, `${material(l.id).name.slice(0, 18)} · ${f}`), h('td', {}, fmt(areaU(l.area), 1)), n('begin'), n('end'), n('step'));
          }),
        ),
      );
      if (!overview.children.length) overview.append(h('tr', {}, h('td', { colspan: 6 }, 'Lay materials on the surfaces first (Surface tab).')));
      // data
      if (win.pane === 'data') {
        tbl.replaceChildren(
          ...(S.show === 'rt'
            ? [...FORMULAS.map((f) => h('tr', { class: f.id === S.formula ? 'sel' : '' }, h('td', {}, f.label), r.all.map((x) => h('td', {}, fmt(x[f.id], 2))))), ...(r.measured ? [h('tr', { class: S.formula === 'measured' ? 'sel' : '' }, h('td', {}, 'Measured basis'), r.measured.map((t) => h('td', {}, fmt(t, 2))))] : []), h('tr', {}, h('td', {}, 'Criteria'), r.target.rt.map((t) => h('td', {}, fmt(t, 2))))]
            : [h('tr', {}, h('td', {}, 'Mean α'), r.abar.map((a) => h('td', {}, fmt(a, 3)))), ...FACES6.map((f) => h('tr', {}, h('td', {}, FACE_LABEL[f]), BANDS.map((_, b) => h('td', {}, fmt(faceAlpha(f, b), 2)))))]),
        );
        repBox.replaceChildren(reportNode(win.report()));
      }
      if (win.pane === 'chart') {
        drawAlpha();
        drawRt(r.rt, r.target);
      }
      if (win.pane === 'room') drawSurfacesRoom();
    };

    const faceAlpha = (f, b) => {
      const layers = M.layers[f] ?? [];
      const A = faceArea(f);
      const used = Math.min(A, layers.reduce((s, l) => s + l.area, 0));
      return ((A - used) * material(M.mats[f]).alpha[b] + layers.reduce((s, l) => s + l.area * material(l.id).alpha[b], 0)) / Math.max(A, 1e-9);
    };
    function matSelectFor(face) {
      const s = h('select', { class: 'list' }, matOptions());
      s.value = M.mats[face];
      s.addEventListener('change', () => ((M.mats[face] = s.value), edited()));
      return s;
    }

    function drawAlpha() {
      const p = prep(alphaC.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const mat = material(S.selMat);
      const a = axes(ctx, w, hh, { title: `α — ${mat.name.slice(0, 30)}`, cats: BANDS.map((b) => (b >= 1000 ? `${b / 1000}k` : String(b))), x0: 0, x1: 1, y0: 0, y1: 1.2, yticks: [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2], fmtY: (v) => v.toFixed(1) });
      mat.alpha.forEach((v, i) => {
        const s = a.slot(i);
        const bw = s.w * 0.5;
        const y = a.Y(v);
        ctx.fillStyle = COL.cyan;
        ctx.fillRect(s.x + (s.w - bw) / 2, y, bw, a.Y(0) - y);
      });
    }

    function drawRt(rt, target) {
      const p = prep(rtC.cv);
      if (!p) return;
      const { ctx, w, h: hh } = p;
      const top = Math.max(0.5, Math.ceil(Math.max(...rt.filter(Number.isFinite), ...target.hi) * 12) / 10);
      const tick = top > 2 ? 0.5 : top > 1 ? 0.2 : 0.1;
      const a = axes(ctx, w, hh, { title: `Reverb Time (s) — ${formulaList.find((f) => f.id === S.formula).label}`, cats: BANDS.map((b) => (b >= 1000 ? `${b / 1000}k` : String(b))), x0: 0, x1: 1, y0: 0, y1: top, yticks: Array.from({ length: Math.floor(top / tick + 1e-9) + 1 }, (_, i) => +(i * tick).toFixed(2)), fmtY: (v) => v.toFixed(1), xLabel: 'Hz' });
      const mid = (i) => a.slot(i).x + a.slot(i).w / 2;
      rt.forEach((v, i) => {
        const s = a.slot(i);
        const bw = s.w * 0.5;
        const y = a.Y(v);
        const inside = v >= target.lo[i] && v <= target.hi[i];
        ctx.fillStyle = inside ? COL.green : COL.orange;
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
      poly(target.rt, COL.grey, []);
      ctx.lineWidth = 1;
      ctx.fillStyle = COL.grey;
      ctx.textAlign = 'right';
      ctx.fillText(`Criteria: ${S.target === 'user' ? 'user defined' : RT_TARGETS.find((t) => t.id === S.target).label}`, w - 14, 30);
      ctx.textAlign = 'left';
    }

    /** The room, the surface being edited filled in. */
    function drawSurfacesRoom() {
      const f = S.face;
      const { L, W, H } = M;
      const quads = { floor: [[0, 0, 0], [W, 0, 0], [W, L, 0], [0, L, 0]], ceiling: [[0, 0, H], [W, 0, H], [W, L, H], [0, L, H]], front: [[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]], back: [[0, L, 0], [W, L, 0], [W, L, H], [0, L, H]], left: [[0, 0, 0], [0, L, 0], [0, L, H], [0, 0, H]], right: [[W, 0, 0], [W, L, 0], [W, L, H], [W, 0, H]] };
      drawRoom(roomCv, S.RV, {
        under: (ctx, S2) => {
          const q = quads[f].map(([X, Y, Z]) => S2({ X, Y, Z }));
          ctx.fillStyle = 'rgba(0,255,255,0.22)';
          ctx.beginPath();
          q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
          ctx.fill();
        },
        note: `${FACE_LABEL[f]}: ${material(M.mats[f]).name}${(M.layers[f] ?? []).length ? ` + ${(M.layers[f] ?? []).length} more` : ''}`,
      });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 5. CALCULATOR
  // ═════════════════════════════════════════════════════════════════════════
  makeWindow('calc', 'Acoustic X — Calculator', { w: 420, h: 470, foot: false }, (win) => {
    const S = { dir: 'toMetric', unit: 'length', wave: 'spherical', kind: 'energy', metric: true };
    const inp = (v, title) => h('input', { type: 'text', value: v, title, oninput: () => calc() });
    const out = () => readout();
    const I = { uv: inp('10'), l1: inp('90', 'Level at the reference distance, dB'), d1: inp('1'), d2: inp('4'), levels: inp('90, 90, 87', 'Levels to add, separated by commas'), t: inp('20', '°C — corrects the speed of sound'), f: inp('100'), lam: inp(''), per: inp(''), delay: inp('1', 'Arrival time difference, ms'), path: inp('', 'Path length difference') };
    const O = { uv: out(), l2: out(), sum: out(), n: out(), c: out(), n1: out(), n2: out(), n3: out(), sp: out() };
    const row = (l, ...kids) => h('div', { class: 'row' }, h('label', {}, l), ...kids);
    const radio = (name, key, v, l) => {
      const r = h('input', { type: 'radio', name, checked: S[key] === v, onchange: () => ((S[key] = v), calc()) });
      return h('label', { class: 'opt' }, r, l);
    };
    const unitSel = h('select', {}, [...UNITS.map((u) => h('option', { value: u[0] }, `${u[0]} (${u[1]} ↔ ${u[2]})`)), h('option', { value: 'temperature' }, 'temperature (°C ↔ °F)')]);
    unitSel.addEventListener('change', () => ((S.unit = unitSel.value), calc()));
    const lenU = () => (S.metric ? 'm' : 'ft');
    const lenK = () => (S.metric ? 1 : FT);
    const T = tabs(win, ['U', 'ISL', 'Add', 'Wave', 'Comb']);
    T.pages.U.append(group('Units Conversion', h('div', {}, radio('acx-c-dir', 'dir', 'toMetric', 'IMP to MKS'), radio('acx-c-dir', 'dir', 'toImperial', 'MKS to IMP')), row('Unit', unitSel), row('Value', I.uv), row('Converted', O.uv)));
    T.pages.ISL.append(group('Inverse Square Law', h('div', {}, radio('acx-c-wave', 'wave', 'spherical', 'Spherical (point source)'), radio('acx-c-wave', 'wave', 'cylindrical', 'Cylindrical (line source)')), row('Reference dist.', I.d1), row('Level @ ref. dist.', I.l1, 'dB'), row('Distance', I.d2), row('Level @ distance', O.l2, 'dB')));
    T.pages.Add.append(group('Level Addition', h('div', {}, radio('acx-c-kind', 'kind', 'energy', 'Energy (uncorrelated)'), radio('acx-c-kind', 'kind', 'pressure', 'Pressure (in phase)')), row('Levels (dB)', I.levels), row('Quantity of level', O.n), row('Total level', O.sum, 'dB')));
    T.pages.Wave.append(group('Frequency / Wavelength / Period', h('div', {}, radio('acx-c-m', 'metric', true, 'Metric'), radio('acx-c-m', 'metric', false, 'Imperial')), row('Temperature °C', I.t), row('Speed of sound', O.c), row('Frequency (Hz)', I.f), row('Wavelength', I.lam), row('Period (ms)', I.per), h('div', { class: 'small muted' }, 'Type into any one of the three: the other two follow.')));
    T.pages.Comb.append(group('Comb-Filter', row('Arrival time diff. (ms)', I.delay), row('Path length diff.', I.path), row('First null (Hz)', O.n1), row('Second null (Hz)', O.n2), row('Third null (Hz)', O.n3), row('Null spacing (Hz)', O.sp), h('div', { class: 'small muted' }, 'Enter either difference. Useful for the reflection off a console top.')));
    win.el.append(h('div', { class: 'acx-calc' }, T.nodes));
    const num = (el) => parseFloat(String(el.value).replace(',', '.'));
    let last = { wave: 'f', comb: 'delay' };
    for (const k of ['f', 'lam', 'per']) I[k].addEventListener('input', () => (last.wave = k));
    for (const k of ['delay', 'path']) I[k].addEventListener('input', () => (last.comb = k));
    function calc() {
      const v = num(I.uv);
      O.uv.textContent = Number.isFinite(v) ? fmt(convert(S.unit, v, S.dir), 4) : '—';
      const l1 = num(I.l1);
      const d1 = num(I.d1);
      const d2 = num(I.d2);
      O.l2.textContent = d1 > 0 && d2 > 0 ? fmt(inverseSquare(l1, d1, d2, S.wave), 1) : '—';
      const lv = String(I.levels.value).split(/[,;\s]+/).map(Number).filter(Number.isFinite);
      O.n.textContent = String(lv.length);
      O.sum.textContent = lv.length ? fmt(addLevels(lv, S.kind), 1) : '—';
      const t = num(I.t);
      const c = speedOfSound(Number.isFinite(t) ? t : 20);
      O.c.textContent = `${fmt(c * lenK(), 1)} ${lenU()}/s`;
      const set = (el, val, d) => document.activeElement !== el && (el.value = Number.isFinite(val) ? fmt(val, d) : '');
      let f = num(I.f);
      if (last.wave === 'lam') f = c / (num(I.lam) / lenK());
      if (last.wave === 'per') f = 1000 / num(I.per);
      if (f > 0) {
        set(I.f, f, 2);
        set(I.lam, (c / f) * lenK(), 4);
        set(I.per, 1000 / f, 4);
      }
      let dt = num(I.delay) / 1000;
      if (last.comb === 'path') dt = num(I.path) / lenK() / c;
      const n = combNulls(dt);
      if (dt > 0) {
        set(I.delay, dt * 1000, 3);
        set(I.path, dt * c * lenK(), 3);
      }
      [O.n1, O.n2, O.n3].forEach((o, i) => (o.textContent = fmt(n.nulls[i], 1)));
      O.sp.textContent = fmt(n.spacing, 1);
    }
    win.refresh = calc;
    calc();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // START SCREEN · GENERAL PARAMETERS · FAST GUIDE · REPORTS · ABOUT
  // ═════════════════════════════════════════════════════════════════════════
  const MODULES = [
    ['modal', 'Modal Response'],
    ['sbir', 'Speaker Boundary Interference Response'],
    ['rays', 'Ray Tracing'],
    ['reverb', 'Reverb Time'],
  ];

  makeWindow('start', 'Acoustic X', { w: 460, h: 430, foot: false }, (win) => {
    const field = (label, key) => {
      const inp = h('input', { type: 'text', style: 'flex:1' });
      inp.addEventListener('input', () => (M.project[key] = inp.value));
      win.syncers.push(() => document.activeElement !== inp && (inp.value = M.project[key]));
      return h('div', { class: 'row' }, h('label', {}, label), inp);
    };
    win.el.append(
      h(
        'div',
        { class: 'acx-calc' },
        h('div', { class: 'start-title' }, 'Acoustic X', h('span', { class: 'small muted' }, ' room acoustic optimisation — in the style of the 1997 program')),
        group('Modules', h('div', { class: 'startgrid' }, ...MODULES.map(([n, l]) => h('button', { onclick: () => open(n) }, l)), h('button', { disabled: true }, '—'), h('button', { disabled: true }, '—'), h('button', { onclick: () => open('calc') }, 'Acoustic X Calculator'))),
        group('Project', field('Description', 'description'), field('Client', 'client'), field('Location', 'location'), h('div', { class: 'small muted' }, 'Pasted into every Data View report, and every printed or saved one.')),
        h('div', { class: 'btns' }, h('button', { onclick: () => open('general') }, 'General Parameters…'), h('button', { onclick: () => open('guide') }, 'Fast Guide'), h('button', { onclick: () => open('reports') }, 'Print Report…')),
      ),
    );
    win.refresh = () => win.sync();
  });

  makeWindow('general', 'Options — General Parameters', { w: 420, h: 470 }, (win) => {
    const T = tabs(win, ['General', 'Modal Response', 'SBIR']);
    const checkG = (obj, key, label, title) => {
      const c = h('input', { type: 'checkbox', onchange: () => ((obj[key] = c.checked), refreshAll()) });
      win.syncers.push(() => (c.checked = Boolean(obj[key])));
      return h('div', {}, h('label', { class: 'opt', title }, c, label));
    };
    const air = readout();
    win.syncers.push(() => (air.textContent = `c ${fmt(speedOfSound(M.gen.tempC), 1)} m/s · air ${fmt(airDbPerM(4000, M.gen.tempC, M.gen.rh) * 1000, 1)} dB/km at 4 kHz`));
    const ftC = h('input', { type: 'number', step: 1, style: 'width:56px', title: '°F' });
    ftC.addEventListener('change', () => ((M.gen.tempC = +convert('temperature', parseFloat(ftC.value) || 68, 'toMetric').toFixed(1)), refreshAll()));
    win.syncers.push(() => document.activeElement !== ftC && (ftC.value = fmt(convert('temperature', M.gen.tempC, 'toImperial'), 0)));
    T.pages.General.append(
      group('Environment', numField(win, 'Temperature', '°C', () => M.gen.tempC, (v) => (M.gen.tempC = clamp(v, -20, 50)), { step: 0.5, local: false, title: 'Sets the speed of sound everywhere in Acoustic X' }), h('div', { class: 'row' }, h('label', {}, ''), ftC, h('span', { class: 'unit' }, '°F')), numField(win, 'Humidity', '%', () => M.gen.rh, (v) => (M.gen.rh = clamp(v, 5, 100)), { step: 5, local: false, title: 'Sets the air absorption of the high frequencies (ISO 9613-1)' }), h('div', { class: 'small' }, air)),
      group('Display', checkG(M.gen, 'axis', 'Display Axis', 'Grey lines: the centre listening axis at the listener height, and each speaker’s axis to the listener'), unitsRow(win)),
    );
    const ratioList = h('select', { class: 'list', size: 9 }, FAVOURABLE_RATIOS.filter((r) => r.ratio).map((r) => h('option', { value: r.id }, `${r.name}   ${r.ratio.map((x) => x.toFixed(2)).join(' : ')}`)));
    T.pages['Modal Response'].append(
      group('Some Favourable Room Ratios', ratioList, h('div', { class: 'btns' }, h('button', { onclick: () => {
        const r = FAVOURABLE_RATIOS.find((x) => x.id === ratioList.value);
        if (!r?.ratio) return;
        M.W = M.H * r.ratio[1];
        M.L = M.H * r.ratio[2];
        dimsChanged();
        edited();
      } }, 'OK — apply')), h('div', { class: 'small muted' }, 'The 1 of the ratio is the floor-to-ceiling height. Not every favoured ratio suits every volume.')),
      group('Modal Weighting', ...['axial', 'tangential', 'oblique'].map((k) => numField(win, `${k[0].toUpperCase()}${k.slice(1)}`, '', () => M.gen.weights[k], (v) => (M.gen.weights[k] = clamp(v, 0, 2)), { step: 0.05, local: false }))),
    );
    const g = M.gen.sbir;
    T.pages.SBIR.append(
      group('Allowable Search Size', checkG(g, 'custom', 'Custom search (otherwise automatic)'), ...[['frontMin', 'Front min'], ['frontMax', 'Front max'], ['sideMin', 'Side min'], ['sideMax', 'Side max']].map(([k, l]) => lenField(win, l, () => g[k], (v) => (g[k] = Math.max(0, v)), { title: 'Distance of Speaker1 from the front / side wall' })), lenField(win, 'Min. between SPKs', () => g.minSpk, (v) => (g.minSpk = Math.max(0.2, v)), { title: 'The least the left and right speakers may be apart' })),
      group('Surround Speakers', checkG(g, 'centre', 'Center speaker'), checkG(g, 'rear', 'Rear speakers'), lenField(win, 'Rear height offset', () => g.rearRise, (v) => (g.rearRise = v), { title: 'How far above the listener’s ears the rears sit — their distance to the listener is kept' })),
    );
  });

  const GUIDE = {
    start: ['Type the project description, client and location: every report carries them.', 'Set the temperature and humidity under General Parameters.', 'Open Modal Response first: it settles the room size.', 'Then Speaker Boundary Interference to place the speakers, Ray Tracing to check the reflections, Reverb Time to balance the decay.', 'Each module also works on its own — and each starts from the room being designed.'],
    modal: ['Enter the length, width and height on the Room tab — or a ratio, or a favourable one.', 'Press Start: the Bonello box says whether the room meets the criteria.', 'Chart View: the modes at their frequencies above, the count per 1/3 octave against the ideal (blue) below. Move the mouse over them.', 'Optimize: tick the dimensions that may change, set ±% and the step, and Optimize; Use these takes a result.', 'Room View: enter a mode index or a band (Mode 1), pick a plane (Mode 2) — the bright regions are where bass traps work.'],
    sbir: ['Pick the speaker from the database (SPK · Size) or enter its size and woofer height.', 'Set the LF cut-off and crossover on the Listener tab, and the listener’s position.', 'Search tab: choose Min. Absolute or Min. Negative deviation and the step, then Search.', 'Chart View: green above the red LF cut-off counts; a dip at the yellow crossover is flagged; magenta marks a mode the position excites.', 'Room View: the listening window, the specular absorbers that keep it clean, the corner absorbers. Apply moves the design’s speakers.'],
    rays: ['Check the speaker and listening positions (SPK, LS) — Mouse Edit moves the listener on the Plan View.', 'Acoustic tab: the octave band and each surface’s material; the specular absorbers’ α.', 'Sim. tab: the number of reflections (14), the vertical step, and what to show or suppress.', 'Press Start. Chart View: energy by surface above, by time below with the 10 dB window — Next steps through each arrival.', 'Room View in plan: the polar energy shows where reflections within 10 dB come from. The Data View lists the room figures and each surface’s nulls.'],
    reverb: ['Type tab: pick the criteria for the room’s use, or enter your own.', 'RT60 tab: pick the formula — or enter a measured empty-room RT60 as the basis.', 'Surface tab: pick a surface, set its base material, then double-click materials to lay them on it and give each an area.', 'Watch the chart: green bars are inside the criteria, orange are not. Next Surface moves on.', 'Optimize tab: tick up to five materials, give each a Begin, End and Step, and Go Optimize; Apply takes the best.'],
    calc: ['U: convert between metric and imperial.', 'ISL: the level at a distance from one measured at another — spherical or cylindrical.', 'Add: levels added as energy or in-phase pressure.', 'Wave: frequency, wavelength and period, corrected for temperature.', 'Comb: the nulls of a reflection from its delay or its extra path.'],
  };
  let guideFor = 'start';
  makeWindow('guide', 'Fast Guide', { w: 330, h: 300, foot: false }, (win) => {
    const body = h('div', { class: 'acx-calc' });
    win.el.append(body);
    win.refresh = () => {
      const name = (MODULES.find(([n]) => n === guideFor) ?? [guideFor, guideFor === 'calc' ? 'Calculator' : 'Getting started'])[1];
      body.replaceChildren(h('b', {}, name), h('ol', {}, (GUIDE[guideFor] ?? GUIDE.start).map((s) => h('li', {}, s))));
    };
  });

  makeWindow('reports', 'Report Print Manager', { w: 380, h: 330, foot: false }, (win) => {
    const pick = Object.fromEntries(MODULES.map(([n]) => [n, true]));
    const fmtSel = h('select', {}, [['html', 'HTML'], ['csv', 'Comma-separated values (CSV)'], ['tsv', 'Tab-separated values'], ['txt', 'Text']].map(([v, l]) => h('option', { value: v }, l)));
    const checks = MODULES.map(([n, l]) => {
      const c = h('input', { type: 'checkbox', checked: true, onchange: () => (pick[n] = c.checked) });
      win.syncers.push(() => (c.checked = pick[n]));
      return h('div', {}, h('label', { class: 'opt' }, c, l));
    });
    const reports = () =>
      MODULES.filter(([n]) => pick[n]).map(([n]) => {
        const w = wins[n];
        if (!w.report || !S0(w)) w.refresh();
        return w.report();
      });
    const S0 = (w) => {
      try {
        return Boolean(w.report());
      } catch {
        return false;
      }
    };
    function html(reps) {
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
      const head = `<h1>Acoustic X report</h1>${projectLines().map((l) => `<div>${esc(l)}</div>`).join('')}<div>${new Date().toLocaleString()}</div>`;
      const body = reps.map((r) => `<h2>${esc(r.title)}</h2>${r.sections.map((s) => `<h3>${esc(s.heading)}</h3>${s.text ? `<p>${esc(s.text)}</p>` : ''}${s.rows ? `<table>${s.head ? `<tr>${s.head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>` : ''}${s.rows.map((r2) => `<tr>${r2.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</table>` : ''}`).join('')}`).join('');
      return `<!doctype html><html><head><meta charset="utf-8"><title>Acoustic X report</title><style>body{font:12px/1.35 Arial,sans-serif;margin:24px;color:#000;background:#fff}table{border-collapse:collapse;margin:4px 0 10px}td,th{border:1px solid #999;padding:2px 6px;text-align:left}h2{border-bottom:2px solid #000;margin-top:24px}</style></head><body>${head}${body}</body></html>`;
    }
    function delimited(reps, sep) {
      const cell = (v) => {
        const s = String(v ?? '');
        return sep === ',' && /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s.replace(/\t/g, ' ');
      };
      const lines = [...projectLines()];
      for (const r of reps) {
        lines.push('', r.title);
        for (const s of r.sections) {
          lines.push('', s.heading);
          if (s.text) lines.push(s.text);
          if (s.head) lines.push(s.head.map(cell).join(sep));
          for (const row of s.rows ?? []) lines.push(row.map(cell).join(sep));
        }
      }
      return lines.join('\n') + '\n';
    }
    function text(reps) {
      return delimited(reps, '   ');
    }
    function preview(print = false) {
      const w = window.open('', 'acx-report', 'width=820,height=900');
      if (!w) return (win.status && (win.status.textContent = 'The browser blocked the window'));
      w.document.open();
      w.document.write(html(reports()));
      w.document.close();
      if (print) w.addEventListener('load', () => w.print());
      if (print) setTimeout(() => w.print(), 300);
    }
    function exportFile() {
      const reps = reports();
      const kind = fmtSel.value;
      const [data, type] = kind === 'html' ? [html(reps), 'text/html'] : kind === 'csv' ? [delimited(reps, ','), 'text/csv'] : kind === 'tsv' ? [delimited(reps, '\t'), 'text/tab-separated-values'] : [text(reps), 'text/plain'];
      const a = h('a', { href: URL.createObjectURL(new Blob([data], { type })), download: `acoustic-x-report.${kind}` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    win.el.append(
      h(
        'div',
        { class: 'acx-calc' },
        group('Reports', ...checks, h('div', { class: 'btns' }, h('button', { onclick: () => (MODULES.forEach(([n]) => (pick[n] = true)), win.sync()) }, 'Select all reports'))),
        h('div', { class: 'btns' }, h('button', { onclick: () => preview(false) }, 'Preview'), h('button', { onclick: () => preview(true) }, 'Print')),
        group('Export', h('div', { class: 'row' }, h('label', {}, 'Format'), fmtSel), h('div', { class: 'btns' }, h('button', { onclick: exportFile }, 'Export to disk file'))),
      ),
    );
    win.refresh = () => win.sync();
  });

  makeWindow('about', 'About Acoustic X (classic)', { w: 400, h: 230, foot: false }, (win) => {
    win.el.append(
      h(
        'div',
        { class: 'about' },
        h('p', {}, h('b', {}, ACX_LABEL)),
        h('p', {}, 'Modal response, speaker boundary interference, ray tracing and reverberation time, laid out the way the 1997 Windows 95 program (Acoustic-X Release 1.0; reviewed in Sound On Sound, December 1998) laid them out.'),
        h('p', { class: 'muted' }, "Not Pilchner-Schoustal's software: every number here is computed by ACOUSTIC.LIKE.AUDIO's own acoustics, from the room being designed. The arithmetic is in Documentation/acoustic-x."),
        h('div', { class: 'btns' }, h('button', { onclick: () => close('about') }, 'OK')),
      ),
    );
    win.refresh = () => {};
  });

  // ═════════════════════════════════════════════════════════════════════════
  // HELP — the documentation, Documentation/acoustic-x and /acoustics
  // ═════════════════════════════════════════════════════════════════════════
  const DOC_BASE = new URL('../../Documentation/', import.meta.url);
  const HELP_FOR = {
    start: 'acoustic-x/01-using-acoustic-x.md',
    guide: 'acoustic-x/01-using-acoustic-x.md',
    reports: 'acoustic-x/01-using-acoustic-x.md#start-screen-fast-guide-reports',
    general: 'acoustic-x/02-general-parameters.md',
    modal: 'acoustic-x/03-modal-response.md',
    sbir: 'acoustic-x/04-sbir.md',
    rays: 'acoustic-x/05-ray-tracing.md',
    reverb: 'acoustic-x/06-reverb-time.md',
    calc: 'acoustic-x/07-calculator.md',
  };
  const HELP_TOC = [
    ['acoustic-x/README.md', 'Contents'],
    ['acoustic-x/01-using-acoustic-x.md', '1 · Using Acoustic X'],
    ['acoustic-x/02-general-parameters.md', '2 · General parameters'],
    ['acoustic-x/03-modal-response.md', '3 · Modal Response'],
    ['acoustic-x/04-sbir.md', '4 · Speaker Boundary Interference'],
    ['acoustic-x/05-ray-tracing.md', '5 · Ray Tracing'],
    ['acoustic-x/06-reverb-time.md', '6 · Reverb Time'],
    ['acoustic-x/07-calculator.md', '7 · Calculator'],
    ['acoustics/README.md', 'The acoustics engine — all of its math'],
  ];
  /** KaTeX, fetched the first time Help shows math; null if it cannot be had (the math then reads as TeX). */
  let katexP = null;
  function loadKatex() {
    katexP ??= new Promise((res) => {
      const css = h('link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css' });
      const js = h('script', { src: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js' });
      js.onload = () => res(window.katex ?? null);
      js.onerror = () => res(null);
      document.head.append(css, js);
    });
    return katexP;
  }
  let helpAt = 'acoustic-x/README.md';
  const helpBack = [];
  makeWindow('help', 'Acoustic X Help', { w: 860, h: 600, foot: false }, (win) => {
    const tocEls = HELP_TOC.map(([path, label]) => {
      const it = h('div', { class: 'item', onclick: () => showHelp(path) }, label);
      it.dataset.path = path;
      return it;
    });
    const page = h('div', { class: 'help-page' });
    const backB = h('button', { title: 'Back', onclick: () => helpBack.length && showHelp(helpBack.pop(), false) }, '◄ Back');
    const where = h('span', { class: 'small muted' });
    win.el.append(h('div', { class: 'acx-body' }, h('div', { class: 'help-toc scroll' }, tocEls), h('div', { class: 'acx-right' }, h('div', { class: 'btns', style: 'margin:0' }, backB, h('button', { onclick: () => showHelp('acoustic-x/README.md') }, 'Contents'), where), h('div', { class: 'scroll help-scroll' }, page))));
    page.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-href]');
      if (!a) return;
      e.preventDefault();
      const href = a.dataset.href;
      if (href.startsWith('#')) return page.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView();
      const url = new URL(href, new URL(helpAt.split('#')[0], DOC_BASE));
      if (url.href.startsWith(DOC_BASE.href) && /\.md$/.test(url.pathname)) showHelp(url.href.slice(DOC_BASE.href.length));
      else window.open(url.href, '_blank', 'noopener');
    });
    async function showHelp(path, remember = true) {
      const [file, hash] = path.split('#');
      if (remember && helpAt !== path) helpBack.push(helpAt);
      helpAt = path;
      for (const t of tocEls) t.classList.toggle('on', t.dataset.path === file);
      where.textContent = `Documentation/${file}`;
      backB.disabled = !helpBack.length;
      let md;
      try {
        const r = await fetch(new URL(file, DOC_BASE));
        if (!r.ok) throw new Error(`${r.status}`);
        md = await r.text();
      } catch (err) {
        page.replaceChildren(h('p', { class: 'warn' }, `This help page could not be loaded (${err.message}). The chapters are in the repository under Documentation/${file}.`));
        return;
      }
      page.innerHTML = renderMarkdown(md);
      page.parentElement.scrollTop = 0;
      if (hash) page.querySelector(`[id="${CSS.escape(hash)}"]`)?.scrollIntoView();
      const math = page.querySelectorAll('.math');
      if (!math.length) return;
      const katex = await loadKatex();
      if (!katex) return page.classList.add('tex');
      for (const el of math) {
        try {
          katex.render(el.dataset.tex, el, { displayMode: el.classList.contains('display'), throwOnError: false });
        } catch {
          /* leave it as TeX */
        }
      }
    }
    win.showHelp = showHelp;
    win.refresh = () => {};
  });
  /** Open Help at a chapter (or where it was). */
  function openHelp(path) {
    open('help');
    wins.help.showHelp(path ?? helpAt, Boolean(path));
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'F1') return;
    const anyOpen = Object.values(wins).some((w) => !w.el.hidden) || !frame.hidden;
    if (!anyOpen) return;
    e.preventDefault();
    openHelp(HELP_FOR[frontWin?.name]);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // THE LEGACY LAYOUT — one program window, as the 1997 program was
  // ═════════════════════════════════════════════════════════════════════════
  /**
   * Its menu bar (File, Edit, View, Run, Display, Module, Window, Help), its
   * tool bar (file, Run, the view group, the module group, calculator, Fast
   * Guide, help) and its status bar (what the mouse is over, the time and
   * date), with the module windows inside it. The tool bar's Room, Chart
   * and Data act on the window in front, so the windows lose their own
   * view strips. Off, the windows float over the app as before.
   */
  const LEGACY_KEY = 'acx.legacy';
  let legacy = false;
  try {
    legacy = localStorage.getItem(LEGACY_KEY) === '1';
  } catch {
    /* no storage: the floating layout */
  }
  const client = h('div', { class: 'acx-client' });
  const hint = h('div', { class: 'acx-status' }, 'Ready');
  const clock = h('div', { class: 'acx-status clock' });
  const tick = () => (clock.textContent = new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }));
  tick();
  setInterval(tick, 30000);
  const paneFront = (k) => frontWin?.showPane?.(k);
  const runFront = () => frontWin && wins[frontWin.name] === frontWin && frontWin.el.querySelector('.start') && start(frontWin);
  const visibleWins = () => Object.values(wins).filter((w) => !w.el.hidden);
  function arrange(kind) {
    const ws = visibleWins();
    const W = client.clientWidth;
    const H = client.clientHeight;
    ws.forEach((w, i) => {
      w.el.classList.remove('max', 'min');
      const st = w.el.style;
      if (kind === 'cascade') Object.assign(st, { left: `${12 + 24 * i}px`, top: `${12 + 24 * i}px`, width: `${Math.min(860, W - 40)}px`, height: `${Math.min(600, H - 40)}px` });
      else {
        const n = ws.length;
        const across = kind === 'vertical';
        const size = (across ? W : H) / n;
        Object.assign(st, across ? { left: `${i * size}px`, top: '0px', width: `${size}px`, height: `${H}px` } : { left: '0px', top: `${i * size}px`, width: `${W}px`, height: `${size}px` });
      }
      requestAnimationFrame(() => w.render());
    });
  }
  const toolbar = h('div', { class: 'acx-toolbar' });
  const statusbar = h('div', { class: 'acx-statusbar' }, hint, clock);
  const TOOLS = [
    ['↻', 'New — every window back to the room being designed', () => (pullFromRoom(), refreshAll())],
    ['🖶', 'Print Report… — the Report Print Manager', () => open('reports')],
    null,
    ['▶ Run', 'Run — start the calculation in the window in front', runFront],
    null,
    ['Room', 'Room View — the window in front', () => paneFront('room')],
    ['Chart', 'Chart View — the window in front', () => paneFront('chart')],
    ['Data', 'Data View — the window in front', () => paneFront('data')],
    null,
    ['⌂', 'Start Screen', () => open('start')],
    ['Modal', 'Modal Response', () => open('modal')],
    ['SBIR', 'Speaker Boundary Interference Response', () => open('sbir')],
    ['Ray', 'Ray Tracing', () => open('rays')],
    ['RT60', 'Reverb Time', () => open('reverb')],
    null,
    ['Calc', 'Acoustic X Calculator', () => open('calc')],
    ['Guide', 'Fast Guide', () => open('guide')],
    ['?', 'Help on the window in front (F1)', () => openHelp(HELP_FOR[frontWin?.name])],
  ];
  toolbar.append(...TOOLS.map((t) => (t ? h('button', { title: t[1], onclick: t[2] }, t[0]) : h('span', { class: 'tsep' }))));
  const MENUS = [
    ['File', [['New — from the room', () => (pullFromRoom(), refreshAll())], ['Print Report…', () => open('reports')], null, ['Close Acoustic X', () => closeFrame()]]],
    ['Edit', [['General Parameters…', () => open('general')]]],
    ['View', [['Toolbar', () => (toolbar.hidden = !toolbar.hidden), () => !toolbar.hidden], ['Status Bar', () => (statusbar.hidden = !statusbar.hidden), () => !statusbar.hidden]]],
    ['Run', [['Start', runFront]]],
    ['Display', [['Room View', () => paneFront('room')], ['Chart View', () => paneFront('chart')], ['Data View', () => paneFront('data')]]],
    ['Module', [['Main (Start Screen)', () => open('start')], ...MODULES.map(([n, l]) => [l, () => open(n)]), ['Calculator', () => open('calc')]]],
    ['Window', [['Cascade', () => arrange('cascade')], ['Tile Horizontal', () => arrange('horizontal')], ['Tile Vertical', () => arrange('vertical')], null, ['Floating windows (leave this layout)', () => setLegacy(false)]]],
    ['Help', [['Contents\tF1', () => openHelp('acoustic-x/README.md')], ['Help on this window', () => openHelp(HELP_FOR[frontWin?.name])], ['Fast Guide', () => open('guide')], null, ['About Acoustic X…', () => open('about')]]],
  ];
  let openMenu = null;
  const menubar = h('div', { class: 'acx-menubar' });
  for (const [label, items] of MENUS) {
    const drop = h('div', { class: 'acx-menu', hidden: true });
    const fill = () =>
      drop.replaceChildren(
        ...items.map((it) => {
          if (!it) return h('div', { class: 'sep' });
          const [l, act, checked] = it;
          const [text, key] = l.split('\t');
          return h('div', { class: 'item', onclick: (e) => (e.stopPropagation(), shut(), act()) }, h('span', { class: 'chk' }, checked?.() ? '✓' : ''), text, key ? h('span', { class: 'key' }, key) : null);
        }),
      );
    const mi = h('div', { class: 'mi' }, label, drop);
    const show = () => {
      shut();
      fill();
      drop.hidden = false;
      mi.classList.add('on');
      openMenu = mi;
    };
    mi.addEventListener('click', (e) => (e.stopPropagation(), openMenu === mi ? shut() : show()));
    mi.addEventListener('mouseenter', () => openMenu && openMenu !== mi && show());
    menubar.append(mi);
  }
  function shut() {
    for (const m of menubar.children) {
      m.classList.remove('on');
      m.querySelector('.acx-menu').hidden = true;
    }
    openMenu = null;
  }
  document.addEventListener('pointerdown', (e) => !menubar.contains(e.target) && shut());
  const frameTitle = h('span', { class: 'txt' }, 'Acoustic X');
  const frame = h(
    'div',
    { class: 'acx acx-frame', hidden: true },
    h('div', { class: 'acx-title' }, icon(), frameTitle, h('button', { title: 'Help (F1)', onclick: () => openHelp() }, '?'), h('button', { class: 'x', title: 'Close Acoustic X', onclick: () => closeFrame() }, '×')),
    menubar,
    toolbar,
    client,
    statusbar,
  );
  // the status bar says what the mouse is over, as the original's did
  frame.addEventListener('mouseover', (e) => {
    const t = e.target.closest?.('[title]')?.getAttribute('title');
    hint.textContent = t || 'Ready';
  });
  document.body.append(frame);
  function setLegacy(on) {
    legacy = on;
    try {
      localStorage.setItem(LEGACY_KEY, on ? '1' : '0');
    } catch {
      /* remembered for this visit only */
    }
    if (on) {
      client.append(desk);
      frame.hidden = false;
      if (!visibleWins().length) open('start');
    } else {
      document.body.append(desk);
      frame.hidden = true;
    }
    for (const w of visibleWins()) requestAnimationFrame(() => w.render());
  }
  function closeFrame() {
    for (const w of Object.values(wins)) w.el.hidden = true;
    frame.hidden = true;
  }
  const syncFrameTitle = () => (frameTitle.textContent = `Acoustic X${M.project.description ? ` — ${M.project.description}` : ''}`);

  // ── the launcher ──
  const MENU = [
    ['start', 'Start Screen'],
    ...MODULES,
    ['calc', 'Calculator'],
    null,
    ['general', 'General Parameters…'],
    ['guide', 'Fast Guide'],
    ['reports', 'Report Print Manager…'],
    ['help', 'Help…   F1'],
  ];
  const legacyItem = h('div', { class: 'item', title: 'One program window with its menu bar, tool bar and status bar, the modules inside it — as the 1997 program looked', onclick: () => ((menu.hidden = true), setLegacy(!legacy)) });
  const menu = h('div', { class: 'acx-menu', hidden: true }, h('div', { class: 'note small' }, ACX_LABEL), h('div', { class: 'sep' }), MENU.map((m) => (m ? h('div', { class: 'item', onclick: () => ((menu.hidden = true), m[0] === 'help' ? openHelp() : open(m[0])) }, m[1]) : h('div', { class: 'sep' }))), h('div', { class: 'sep' }), legacyItem, h('div', { class: 'item', onclick: () => (open('about'), (menu.hidden = true)) }, 'About…'));
  const launchB = h('button', { title: ACX_LABEL, onclick: (e) => (e.stopPropagation(), (legacyItem.textContent = `${legacy ? '✓ ' : ''}Legacy layout — one program window`), (menu.hidden = !menu.hidden)) }, 'Acoustic X ▾');
  const launch = h('span', { class: 'acx acx-launch' }, launchB, menu);
  document.addEventListener('pointerdown', (e) => !launch.contains(e.target) && (menu.hidden = true));
  mount?.append(launch);

  function open(name) {
    const w = wins[name];
    if (!w) return;
    if (legacy && frame.hidden) setLegacy(true);
    syncFrameTitle();
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
