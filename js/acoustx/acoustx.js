// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { buildRoom, fromFrame, inFrame } from '../acoustics/room.js';
import { MODE_WEIGHTS } from './classic.js';
import { REPORTS, topicFor } from './topics.js';
import { material, FT, FACES6, ACX_LABEL, h, clamp, injectCss, icon, setOpenTopic } from './kit.js';
import { createWidgets } from './widgets.js';
import { modalWindow } from './windows/modal.js';
import { sbirWindow } from './windows/sbir.js';
import { raysWindow } from './windows/rays.js';
import { reverbWindow } from './windows/reverb.js';
import { calcWindow } from './windows/calc.js';
import { createScreens } from './windows/screens.js';

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
 *                    band of them, on a plane or through the room; the
 *                    Criteria tab (Bolt's map, Louden's index, Everest's
 *                    axial check, Sepmeyer's directions) and each mode's
 *                    own decay (Knudsen).
 *   SBIR             a speaker's boundary interference at the listener above
 *                    its LF cut-off, the crossover check, an absolute or
 *                    negative-only placement search, the modes the position
 *                    excites, the listening window and the specular absorbers
 *                    that keep it clean, and the centre and rears.
 *   RAY TRACING      equal-area rays from each speaker, followed for up to
 *                    fourteen bounces and caught at the listener: energy by
 *                    surface and by time, the 10 dB window, the polar energy,
 *                    the room's figures and the comb nulls by surface; the
 *                    Time tab: precedence and echo (Haas), the decay and
 *                    EDT / T20 / T30 (Schroeder).
 *   REVERB TIME      materials laid on each surface by area, four formulas
 *                    or a measured empty room, criteria by room type or your
 *                    own, and the optimiser that tries every combination of
 *                    up to five material areas; Beranek's hall checks.
 *   CALCULATOR       units, spreading, level addition, frequency /
 *                    wavelength / period, comb filters; and from the
 *                    suggested references: walls (mass law, Rw),
 *                    resonators, QRD diffusers, NC, speech and gain,
 *                    pistons and boxes, impedance, two tones, loudness.
 *   TOPICS           a 📖 on a group's legend: where the idea came from
 *                    and which reference to read (topics.js).
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

export { ACX_LABEL } from './kit.js';

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

  // ── the shared context the window modules read (windows/*.js, widgets.js) ──
  let guideFor = 'start';
  const acx = {
    areaFromU, areaU, aUnit, box, boxAreas, classicRoom, close, dimsChanged, edited, fromU, job, M,
    makeWindow, onDrawRoom, open, pullFromRoom, realRoom, refreshAll, spk2, store, toBox, toSheetReal, toU,
    wins,
    get guideFor() {
      return guideFor;
    },
  };

  Object.assign(acx, createWidgets(acx));

  // ═════════════════════════════════════════════════════════════════════════
  // THE FIVE MODULE WINDOWS (windows/*.js)
  // ═════════════════════════════════════════════════════════════════════════
  modalWindow(acx);
  sbirWindow(acx);
  raysWindow(acx);
  reverbWindow(acx);
  calcWindow(acx);

  // START SCREEN · GENERAL PARAMETERS · FAST GUIDE · REPORTS · ABOUT · HELP (windows/screens.js)
  const { MODULES, GUIDE, HELP_FOR, openHelp } = createScreens(acx);

  // ── the topic pop-up: a group's history and its sources (topics.js) ──
  const topicPop = h('div', { class: 'acx acx-topic-pop', hidden: true });
  document.body.append(topicPop);
  setOpenTopic((legend, anchor) => {
    const t = topicFor(legend);
    if (!t) return;
    if (!topicPop.hidden && topicPop.dataset.legend === legend) return (topicPop.hidden = true);
    topicPop.dataset.legend = legend;
    const read = (n) => openHelp(`acoustic-x/references/${REPORTS[n][0]}`);
    topicPop.replaceChildren(
      h('div', { class: 'acx-title' }, h('span', { class: 'txt' }, legend), h('button', { class: 'x', title: 'Close', onclick: () => (topicPop.hidden = true) }, '×')),
      h('div', { class: 'body' }, h('p', {}, t.history), h('div', { class: 'small' }, 'Read:'), h('ul', {}, t.refs.map((n) => h('li', {}, h('a', { href: '#', onclick: (e) => (e.preventDefault(), (topicPop.hidden = true), read(n)) }, REPORTS[n][1]))))),
    );
    topicPop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = topicPop.offsetWidth;
    const hh = topicPop.offsetHeight;
    topicPop.style.left = `${clamp(r.left, 4, window.innerWidth - w - 4)}px`;
    topicPop.style.top = `${r.bottom + 4 + hh > window.innerHeight ? Math.max(4, r.top - hh - 4) : r.bottom + 4}px`;
  });
  document.addEventListener('pointerdown', (e) => !topicPop.hidden && !topicPop.contains(e.target) && !e.target.closest?.('.acx-topic') && (topicPop.hidden = true));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && (topicPop.hidden = true));
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

  /** The report of the modules named (MODULES ids), previewed in a window of its own — the wizard's Go. */
  function report(names) {
    pullFromRoom();
    wins.reports.print(names);
  }

  return { open, close, report };
}
