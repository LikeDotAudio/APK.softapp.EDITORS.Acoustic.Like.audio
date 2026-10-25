// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { listen } from './audio/auralize.js';
import { ELEVATION_LAYER, elevationFaceOf, seedOutline } from './acoustics/elevations.js';
import { buildRoom } from './acoustics/room.js';
import { elevationOrigin, faceCoords } from './acoustics/patches.js';
import { activeSet, arrangedSpeakers, arrayFront, LAYOUTS, NO_LAYOUT, relayArray, selectSet, setLayout, SPEAKER_SETS } from './acoustics/layouts.js';
import { powerMean, roomSeats, seatWeight } from './compute/compute.js';
import { widthSweep } from './acoustics/widthFinder.js';
import { CLEAR_M, growthDetail, growthText, roomGrowth } from './acoustics/roomFit.js';
import { consoleOf, consoleSettled, consoleSpot } from './acoustics/console.js';
import { paletteItems } from './acoustics/materials.js';
import { ROOM_LIBRARY, furnish, grabBag, roomById } from './acoustics/roomLibrary.js';
import { makeMic } from './acoustics/devices.js';
import { makeWindow } from './acoustics/windows.js';
import { connectCad, METRES_PER_UNIT } from './cad/cadLink.js';
import { buildMarks, furnitureLayer, hashOf, MARK_KEYS, spacesOf } from './cad/marks.js';
import { F_MAX, F_MIN } from './compute/compute.js';
import { createAcousticX } from './acoustx/acoustx.js';
import { makePoppable } from './ui/popout.js';
import { createMeterFold } from './ui/meterFold.js';
import { installSashes } from './ui/sashes.js';
import { watchForUpdates } from './ui/freshness.js';
import { crossings, DIRECT_MARKS_MS, GAP_MARKS_MS, radiusLanes } from './acoustics/radiusScale.js';
import { hz } from './ui/meters.js';
import { createEngine, patchesFromCad, sweepFrames } from './compute/engine.js';
import { createStore } from './model/store.js';
import { createInspector } from './ui/inspector.js';
import { createMeters } from './ui/meters.js';
import { createFaceView } from './views/faceView.js';
import { createWallBuilder } from './views/wallBuilder.js';
import { FACE_COLOURS } from './views/glyphs.js';
import { fieldScale, rampGradient } from './views/paint.js';
import { createPlanView, planLabel } from './views/plan.js';
import { createView3d } from './views/view3d.js';
import { askLicence } from './ui/licence.js';
import { createTour } from './ui/tour.js';
import { makeFold } from './ui/fold.js';
import { createPlayer } from './ui/player.js';
import { createMonitor } from './ui/monitor.js';

const CEILING_LAYER = 'Ceiling';

/**
 * ACOUSTIC.LIKE.AUDIO
 *
 * A softapp built on CAD.Like.audio: the CAD is the plan, live in an iframe,
 * and everything acoustic is laid over and around it — speakers and mics, six
 * drawings of the room with its sound field painted on each surface, a 3-D
 * cut-away, and a meter bridge for whatever the selected mic hears.
 *
 * The wiring is one loop: the CAD bridge and the inspector write the store;
 * the store tells the engine; the engine's answer redraws every view.
 */

const store = createStore();
const iframe = document.getElementById('cad');
// the plan tile can be in a window of its own (⇱), where the page's getElementById no longer finds what is in it
const planTile = document.querySelector('.tile.plan');
const inPlan = (id) => planTile.querySelector(`#${id}`);
const views = document.getElementById('views');
const status = document.getElementById('status');

const cad = { link: null };
/** The dB window dragged out on the colour ramp ({ top, range }), or null for the whole field. Not saved: a way of looking. */
let scaleZoom = null;

const engine = createEngine(store, (out, phase) => {
  if (phase === 'frame') {
    // a sweep frame painted ahead: only the response chart's markers change
    meters.render();
    return;
  }
  out.scale = fieldScale(out.values, store.state.settings.rangeDb, scaleZoom);
  if (phase === 'room') {
    status.textContent = '⟳ computing…';
    renderGeometry();
    return;
  }
  status.textContent = out.error ? '⚠ field error — see console' : `${out.room.walls.length} walls · ${store.state.speakers.length} spk · ${store.state.mics.length} mic${out.virtual ? ' · virtual room' : ''}`;
  if (out.error) console.error(out.error);
  // nothing ever stands outside the rooms: whatever left one (a layout, a carried array, a smaller plan) comes back, and this runs again
  if (out.room && store.keepInside(out.room, (out.rooms ?? []).map((l) => l.poly))) return;
  renderAll();
  syncMarks();
  followConsole();
  pickDrawnRoom();
  placePendingLayout();
});

/** Views report drag start/end; the store's 'drag' events already drive the coarse recompute. */
const onDrag = () => {};

/**
 * Jump the CAD to one of the room's drawings — all in the one file, each on
 * its own layer: 'plan', 'ceiling', or a wall's face. The ceiling is the
 * plan seen from below, so it shows the plan with the `Ceiling` layer
 * current — clouds and tiles placed there land on the ceiling. A wall not drawn yet is seeded
 * with the room's current outline in that view, under the plan, so there is
 * something to drag into a slope or a vault.
 */
function jumpTo(sheet) {
  if (!cad.link) return;
  store.setSheet(sheet);
  const room = engine.out.room;
  const k = METRES_PER_UNIT[store.state.cad.geometry?.units ?? store.state.cad.view?.units ?? 'm'] ?? 1;
  if (sheet === 'plan' || sheet === 'ceiling') {
    const seed = room ? room.poly.map((p) => [+(p.x / k).toFixed(4), +(p.y / k).toFixed(4)]) : undefined;
    cad.link.sheet(engine.out.planLayer ?? '0', { color: '#e5e7eb', seed });
    // A layer with nothing drawn on it does not move the view, so this leaves the plan in sight.
    if (sheet === 'ceiling') cad.link.sheet(CEILING_LAYER, { color: FACE_COLOURS.ceiling });
    cad.link.fit();
    return;
  }
  const drawn = engine.out.elevations?.some((e) => e.face === sheet);
  const seed = !drawn && room ? seedOutline(room, sheet).map((p) => [+(p.x / k).toFixed(4), +(p.y / k).toFixed(4)]) : undefined;
  cad.link.sheet(ELEVATION_LAYER[sheet], { color: FACE_COLOURS[sheet], seed });
  cad.link.fit();
}

const plan = createPlanView({ tile: document.querySelector('.tile.plan .stage'), iframe, store, engine, onDrag, cad });
const faces = ['ceiling', 'front', 'back', 'left', 'right'].map((face) => createFaceView({ tile: document.querySelector(`.tile[data-face="${face}"]`), face, store, engine, onDrag, onJump: () => jumpTo(face), onPickPatch: (id) => inspector.showPatch(id) }));
// the header's Reveal fader: how fast a room builds up in 3-D (views/view3d.js) — this browser's taste, not the session's
const reveal = { speed: 1 };
try {
  const v = parseFloat(localStorage.getItem('acoustic.revealSpeed'));
  if (Number.isFinite(v)) reveal.speed = v;
} catch {
  // no storage: 1×
}
const view3d = createView3d({ canvas: document.querySelector('.tile.t3d canvas'), store, engine, introSpeed: () => reveal.speed });
// a new frequency rendering: the meters fold away and the views take their height until it is done (ui/meterFold.js)
createMeterFold({ store, engine, meters: document.getElementById('meters'), onUnfold: () => meters.render() });
{
  const input = document.getElementById('revealSpeed');
  const out = document.getElementById('revealOut');
  const show = () => (out.textContent = reveal.speed ? `${reveal.speed}×` : 'off');
  input.value = String(reveal.speed);
  show();
  input.addEventListener('input', () => {
    reveal.speed = parseFloat(input.value);
    show();
    try {
      localStorage.setItem('acoustic.revealSpeed', String(reveal.speed));
    } catch {
      // the speed just does not outlive the page
    }
    view3d.replay();
  });
}
const wallBuilder = createWallBuilder({ root: document.querySelector('.tile.wall'), store, engine, cad, inputs: () => wallInputs(store.state.cad.geometry), jumpTo });
const meters = createMeters({
  root: document.getElementById('meters'),
  tray: document.getElementById('meterTray'),
  store,
  engine,
  onListen: () => {
    const rep = engine.out.reports?.[engine.out.monitorId];
    if (rep) listen(rep.echogram);
  },
});
const inspector = createInspector({ root: document.getElementById('inspector'), store, engine, cad, jumpTo, drawRoom: (id) => drawRoom(roomById(id)), onSubs: () => plan.render(), moveArray, findWidth });
document.getElementById('toPlan').addEventListener('click', () => jumpTo('plan'));
document.getElementById('popCad').addEventListener('click', () => {
  if (cad.link.popped) {
    autoPop.wanted = false;
    cad.link.dockIn();
  } else if (!cad.link.popOut()) status.textContent = '⚠ the browser blocked the CAD window — allow pop-ups here';
});

/**
 * The CAD belongs in a window of its own: it pops out by itself as soon as the docked one is ready. A browser
 * that blocks a window nobody clicked for gets it on the first click anywhere on the page instead. Docked by
 * hand (⇲ Dock, or its window closed), it stays docked until this page is reloaded.
 */
const autoPop = { wanted: true };
function popCadByItself() {
  if (!autoPop.wanted || !cad.link || cad.link.popped || !store.state.cad.connected) return;
  if (cad.link.popOut()) autoPop.wanted = false;
}
document.addEventListener('pointerdown', popCadByItself, true);

/** Docked, ⇱ Pop out pulses for as long as it is: the CAD wants its own window. */
function askToPop() {
  const pop = inPlan('popCad');
  pop.classList.toggle('ask', !store.state.cad.popped);
}
new ResizeObserver(askToPop).observe(iframe);

/** How many tiles each layout lays out in its own areas: with one of them out in a window of its own, the rest share its space. */
const LAID_OUT = { six: 6, three: 2, wall: 2 };
function relayoutViews() {
  const mode = Object.keys(LAID_OUT).find((m) => views.classList.contains(m));
  views.classList.remove('loose');
  for (const t of views.querySelectorAll(':scope > .tile')) t.style.gridColumn = '';
  const shown = [...views.querySelectorAll(':scope > .tile')].filter((t) => getComputedStyle(t).display !== 'none');
  if (!mode || views.classList.contains('maxed') || shown.length >= LAID_OUT[mode] || !shown.length) {
    views.style.gridTemplateColumns = '';
    views.style.gridTemplateRows = '';
    return;
  }
  // the grid whose cells come nearest a 4:3 tile, every tile in one, the last stretched over any cells left
  const n = shown.length;
  const w = views.clientWidth;
  const h = views.clientHeight;
  let best = { c: n, score: Infinity };
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    const score = Math.abs(Math.log(w / c / (h / r) / (4 / 3))) + (c * r - n) * 0.3;
    if (score < best.score) best = { c, score };
  }
  views.classList.add('loose');
  views.style.gridTemplateColumns = `repeat(${best.c}, minmax(0, 1fr))`;
  views.style.gridTemplateRows = `repeat(${Math.ceil(n / best.c)}, minmax(0, 1fr))`;
  const left = best.c * Math.ceil(n / best.c) - n;
  if (left) shown[n - 1].style.gridColumn = `span ${left + 1}`;
}

let frame = 0;
function renderGeometry() {
  relayoutViews();
  plan.render();
  for (const f of faces) f.render();
  view3d.render();
  if (store.state.settings.view === 'wall') wallBuilder.render();
}
function renderAll() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    // the layout first: a tile the toolbar just un-hid (3-D) must have its size before it is drawn
    syncToolbar();
    renderGeometry();
    syncFieldScale();
    meters.render();
    inspector.render();
    monitor.render();
  });
}

/**
 * The app opens on the room in 3-D, heard modally; a CAD with nothing drawn on it
 * gets a room by the dice, furnished and seated, so there is a room to hear at once.
 */
let opened = false;
function opening(geometry) {
  opened = true;
  store.setSettings({ view: '3d', method: 'modal' });
  if (!geometry.walls?.length && !geometry.rooms?.length) drawRoom(grabBag(store.state.settings.lastLibraryRoom));
}

cad.link = connectCad(iframe, {
  onReady: () => {
    store.setCad({ connected: true });
    popCadByItself();
  },
  onView: (msg) => {
    store.setCad({ view: msg, connected: true }, 'view');
    plan.render();
  },
  onGeometry: (msg) => {
    const first = !store.state.cad.geometry || msg.fileName !== store.state.fileName;
    store.setCad({ geometry: msg, connected: true }, 'geometry');
    if (first && msg.fileName !== store.state.fileName) store.load(msg.fileName);
    if (!opened) opening(msg);
    engine.update();
  },
  onMirror: (msg) => {
    const k = METRES_PER_UNIT[store.state.cad.geometry?.units ?? store.state.cad.view?.units ?? 'm'] ?? 1;
    store.setCad({ mirror: { ...msg, xMetres: msg.x * k, axesMetres: (msg.axes ?? []).map((x) => x * k) } }, 'mirror');
    engine.update();
  },
  onPopped: (popped) => {
    // its window closed: the user wants it here
    if (!popped) autoPop.wanted = false;
    store.setCad({ popped }, 'view');
    syncToolbar();
    plan.render();
  },
});

// The finishes and products the CAD can paint onto the room; cadLink sends them again on every `ready`.
cad.link.palette('Acoustic finishes & products', paletteItems());

// ------------------------------------------------------------------ the graphs over the views, shown or hidden — this browser's taste
{
  const btn = document.getElementById('graphsBtn');
  const show = (on) => {
    document.body.classList.toggle('meters-hidden', !on);
    btn.classList.toggle('on', on);
    if (on) requestAnimationFrame(() => meters.render());
  };
  let on = true;
  try {
    on = localStorage.getItem('acoustic.graphs') !== 'off';
  } catch {
    // no storage: shown
  }
  show(on);
  btn.addEventListener('click', () => {
    on = !on;
    show(on);
    try {
      localStorage.setItem('acoustic.graphs', on ? 'on' : 'off');
    } catch {
      // the choice just does not outlive the page
    }
  });
}

// ------------------------------------------------------------------ undo, and the warning that asks for it
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const notice = document.getElementById('notice');
let noticeShown = null;
function syncUndo() {
  undoBtn.disabled = !store.canUndo();
  redoBtn.disabled = !store.canRedo();
  if (store.state.notice === noticeShown) return;
  noticeShown = store.state.notice;
  notice.hidden = !noticeShown;
  notice.querySelector('span').textContent = noticeShown ?? '';
}
undoBtn.addEventListener('click', () => store.undo());
redoBtn.addEventListener('click', () => store.redo());
notice.addEventListener('click', (e) => {
  const act = e.target.closest('button')?.dataset.act;
  if (act === 'undo') store.undo();
  if (act === 'close') notice.hidden = true;
});
store.subscribe((_, what) => {
  if (what !== 'drag') syncUndo();
});

let dragFrame = 0;
store.subscribe((state, what) => {
  if (what === 'drag') {
    if (!dragFrame)
      dragFrame = requestAnimationFrame(() => {
        dragFrame = 0;
        engine.update(true);
      });
    renderGeometry();
    return;
  }
  if (what === 'model' || what === 'settings' || what === 'state') engine.update();
  else if (what === 'selection') {
    // a wall touched on the plan: its form is on the Inspect tab
    if (state.selected?.kind === 'wall') inspector.showWall(state.selected.id);
    engine.update();
    renderAll();
  } else if (what === 'fit') {
    syncWidthTicks();
    inspector.render();
  } else if (what === 'mode') {
    plan.render();
    syncToolbar();
  }
});

// ------------------------------------------------------------------ toolbar
// the edit modes (CAD, Walls) and the placing ones (＋ Speaker, ＋ Mic), grouped apart on the bar
for (const id of ['modes', 'place'])
  document.getElementById(id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (b) store.setMode(b.dataset.mode);
  });
document.getElementById('viewmode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (b) store.setSettings({ view: b.dataset.view });
});
document.getElementById('method').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-method]');
  if (b) store.setSettings({ method: b.dataset.method });
});
const freq = document.getElementById('freq');
freq.addEventListener('input', () => store.setSettings({ freq: Math.round(10 ** parseFloat(freq.value)) }));

/** One colour scale for every drawing of the field — they all share it, so it is shown once, above the meters. */
const scaleBar = document.getElementById('fieldScale');
scaleBar.querySelector('.ramp').style.background = rampGradient();
function syncFieldScale() {
  const { scale } = engine.out;
  const { settings, speakers } = store.state;
  scaleBar.hidden = !(settings.show.field && scale && speakers.length);
  if (scaleBar.hidden) return;
  const lo = scale.top - scale.range;
  scaleBar.querySelector('.lo').textContent = `${+lo.toFixed(1)} dB`;
  const hi = scaleBar.querySelector('.hi');
  // the frequency is the slider's under the ramp, said once there; a window dragged out offers the whole field back
  hi.replaceChildren(`${+scale.top.toFixed(1)} dB`);
  if (scaleZoom) {
    const all = Object.assign(document.createElement('button'), { className: 'scaleAll', textContent: '⤢ all', title: 'Back to the whole field: the loudest cell sets the top' });
    all.onclick = () => zoomScale(null);
    hi.append(' ', all);
  }
  const ramp = scaleBar.querySelector('.ramp');
  ramp.replaceChildren();
  // the dB scale over the ramp: a tick every 1, 2 or 5 dB, a number every five ticks
  const step = [1, 2, 5, 10].find((s) => scale.range / s <= 16) ?? 10;
  for (let v = Math.ceil(lo / step) * step; v <= scale.top + 1e-9; v += step) {
    const at = ((v - lo) / scale.range) * 100;
    const major = Math.round(v / step) % 5 === 0;
    ramp.append(Object.assign(document.createElement('i'), { className: `dbTick${major ? ' major' : ''}`, style: `left:${at}%` }));
    if (major) ramp.append(Object.assign(document.createElement('span'), { className: 'dbNum', style: `left:${at}%`, textContent: String(+v.toFixed(1)) }));
  }
  // markers: what the mix seat and the whole room read on this scale, at the current frequency — a small triangle under the ramp each
  const { reports } = engine.out;
  const read = (rep) => (!rep ? NaN : settings.method === 'energy' ? rep.energy?.[settings.band]?.total : settings.method === 'modal' ? rep.modal : rep.wave);
  const mix = store.state.mics.find((m) => m.mix);
  const seats = roomSeats(store.state.mics);
  const marks = [['MIX', read(reports?.[mix?.id]), '#f43f5e']];
  if (seats.length > 1) marks.push([`room ·${seats.length}`, powerMean(seats.map((m) => read(reports?.[m.id])), seats.map(seatWeight)), '#a3e635']);
  for (const [name, db, colour] of marks) {
    if (!Number.isFinite(db)) continue;
    const t = Math.max(0, Math.min(1, (db - (scale.top - scale.range)) / scale.range));
    const mark = Object.assign(document.createElement('i'), { className: `mark${t <= 0 || t >= 1 ? ' off' : ''}`, title: `${name}: ${db.toFixed(1)} dB at the current frequency${t <= 0 || t >= 1 ? ' — outside this window' : ''}` });
    mark.style.left = `${t * 100}%`;
    mark.style.setProperty('--c', colour);
    mark.append(Object.assign(document.createElement('span'), { textContent: `${name} ${db.toFixed(1)}` }));
    ramp.append(mark);
  }
  if (rampDrag.sel) ramp.append(rampDrag.sel);
}

/** A window of the scale to look at: the field's colours spread over it alone, every view repainted (no recompute). */
function zoomScale(zoom) {
  scaleZoom = zoom;
  engine.out.scale = fieldScale(engine.out.values, store.state.settings.rangeDb, zoom);
  renderGeometry();
  syncFieldScale();
  meters.render();
}

// drag across the ramp to look at that range of dB; ⤢ all (or a double-click) gives the whole field back
const rampDrag = { from: null, sel: null };
{
  const ramp = scaleBar.querySelector('.ramp');
  const dbAt = (e) => {
    const { scale } = engine.out;
    const box = ramp.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
    return { t, db: scale.top - scale.range + t * scale.range };
  };
  ramp.addEventListener('pointerdown', (e) => {
    if (!engine.out.scale || e.button !== 0) return;
    ramp.setPointerCapture(e.pointerId);
    rampDrag.from = dbAt(e);
    rampDrag.sel = Object.assign(document.createElement('i'), { className: 'sel' });
    ramp.append(rampDrag.sel);
  });
  ramp.addEventListener('pointermove', (e) => {
    const now = dbAt(e);
    ramp.title = `${now.db.toFixed(1)} dB — drag to look at a range`;
    if (!rampDrag.from) return;
    const [a, b] = [Math.min(rampDrag.from.t, now.t), Math.max(rampDrag.from.t, now.t)];
    Object.assign(rampDrag.sel.style, { left: `${a * 100}%`, width: `${(b - a) * 100}%` });
    rampDrag.sel.textContent = `${Math.min(rampDrag.from.db, now.db).toFixed(1)} – ${Math.max(rampDrag.from.db, now.db).toFixed(1)}`;
  });
  const end = (e) => {
    if (!rampDrag.from) return;
    const now = dbAt(e);
    const [lo, hi] = [Math.min(rampDrag.from.db, now.db), Math.max(rampDrag.from.db, now.db)];
    rampDrag.sel?.remove();
    rampDrag.from = rampDrag.sel = null;
    // a click is not a range: a window narrower than 1 dB is ignored
    if (e.type === 'pointerup' && hi - lo >= 1) zoomScale({ top: +hi.toFixed(1), range: +(hi - lo).toFixed(1) });
  };
  ramp.addEventListener('pointerup', end);
  ramp.addEventListener('pointercancel', end);
  ramp.addEventListener('dblclick', () => scaleZoom && zoomScale(null));
}

function syncToolbar() {
  const { mode, settings, placeKind } = store.state;
  for (const b of document.querySelectorAll('button[data-mode]')) b.classList.toggle('on', b.dataset.mode === mode);
  for (const b of document.querySelectorAll('#viewmode button')) b.classList.toggle('on', b.dataset.view === settings.view);
  for (const b of document.querySelectorAll('#method button')) b.classList.toggle('on', b.dataset.method === settings.method);
  for (const b of document.querySelectorAll('#furniture button[data-arm]')) b.classList.toggle('on', mode === 'place-furniture' && b.dataset.arm === placeKind?.furniture);
  views.className = settings.view === '3d' || settings.view === 'rays' ? 'three' : settings.view === 'wall' ? 'wall' : 'six';
  const { sheet } = store.state;
  inPlan('sheetName').textContent = sheet === 'plan' ? '' : sheet === 'ceiling' ? `treating the ceiling — layer “${CEILING_LAYER}”: place clouds and tiles over the plan` : `editing the ${sheet} elevation — layer “${ELEVATION_LAYER[sheet]}”`;
  inPlan('toPlan').hidden = sheet === 'plan';
  const popped = store.state.cad.popped;
  const pop = inPlan('popCad');
  pop.textContent = popped ? '⇲ Dock CAD' : '⇱ Pop out';
  pop.title = popped ? 'Bring the CAD back into this tile (or just close its window)' : 'Give the CAD a window of its own — the plan stays here';
  askToPop();
  syncRoomGrowth();
  syncWidthScale();
  if (popped) inPlan('sheetName').textContent = 'the CAD is in its own window · the plan here places and moves speakers and mics';
  for (const t of document.querySelectorAll('.tile.face')) t.classList.toggle('editing', t.dataset.face === sheet);
  if (document.activeElement !== freq) freq.value = Math.log10(settings.freq);
  const freqOut = document.getElementById('freqOut');
  freqOut.replaceChildren(Object.assign(document.createElement('small'), { textContent: settings.method === 'energy' ? 'current band' : 'current frequency' }), settings.method === 'energy' ? `${[125, 250, 500, '1k', '2k', '4k'][settings.band]} oct` : `${hz(settings.freq)} Hz`);
  freq.disabled = settings.method === 'energy';
  for (const row of document.querySelectorAll('#arrangement .speakerSet')) {
    const live = row.dataset.set === activeSet(settings);
    const preset = setLayout(settings, row.dataset.set).preset;
    row.classList.toggle('live', live);
    row.querySelector('.setLetter').classList.toggle('on', live);
    for (const b of row.querySelectorAll('button[data-preset]')) b.classList.toggle('on', b.dataset.preset === preset);
  }
  for (const input of document.querySelectorAll('.arrayFields input')) {
    if (document.activeElement === input) continue;
    const key = input.dataset.array;
    input.value = Math.round(key === 'radius' ? (settings.layout.radius ?? 2) * 1000 : key === 'rotate' ? settings.layout.rotate ?? 0 : settings.layout.offset?.[key] ?? 0);
  }
  const spreader = document.getElementById('spreader');
  if (spreader) spreader.hidden = !LAYOUTS[setLayout(settings, activeSet(settings)).preset];
  const arrayBtn = document.getElementById('arrayBtn');
  if (arrayBtn) arrayBtn.textContent = `◎ r ${Math.round((settings.layout.radius ?? 2) * 1000)}${settings.layout.rotate ? ` ⟲${Math.round(settings.layout.rotate)}°` : ''} ▾`;
}

for (const header of document.querySelectorAll('.tile header, .tile.face canvas, .tile.t3d canvas')) {
  header.addEventListener('dblclick', (e) => {
    const tile = e.currentTarget.closest('.tile');
    const was = tile.classList.contains('max');
    for (const t of document.querySelectorAll('.tile')) t.classList.remove('max');
    if (!was) tile.classList.add('max');
    views.classList.toggle('maxed', !was);
    requestAnimationFrame(renderGeometry);
  });
}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveSession();
    return;
  }
  if (e.target.closest?.('input, select, textarea')) return;
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
    e.preventDefault();
    if (e.key === 'y' || e.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (e.key === 'Escape') store.setMode('cad');
  if ((e.key === 'Delete' || e.key === 'Backspace') && store.state.selected) store.remove(store.state.selected.kind, store.state.selected.id);
});

new ResizeObserver(() => {
  // the pairs lay out by the shape of the space they get: a letterbox in one row, a tall one in three
  const aspect = views.clientWidth / Math.max(1, views.clientHeight);
  views.dataset.shape = aspect > 3.2 ? 'wide' : aspect < 1.1 ? 'tall' : '';
  renderGeometry();
}).observe(views);

// ------------------------------------------------------------------ the slider, read as a log scale
{
  const ticks = document.getElementById('freqTicks');
  const lo = Math.log10(F_MIN);
  const span = Math.log10(F_MAX) - lo;
  for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const at = ((Math.log10(f) - lo) / span) * 100;
    ticks.insertAdjacentHTML('beforeend', `<i style="left:${at}%"></i>${[20, 100, 1000, 10000].includes(f) ? `<span style="left:${at}%">${hz(f)}</span>` : ''}`);
  }
}

/** The Width slider's range, mm. */
const WIDTH_MM = [800, 6000];
const widthLanes = { key: [], list: [] };

// ------------------------------------------------------------------ speaker arrangements
{
  const bar = document.getElementById('arrangement');
  // one row per speaker set (layouts.js SPEAKER_SETS): its letter selects it, a preset selects it and lays that
  // arrangement over the room, ⤓ places it round the mix seat — only the selected set sounds
  const pick = (k, patch = {}) => {
    const settings = selectSet(store.state.settings, k);
    store.setSettings({ speakerSet: settings.speakerSet ?? 'A', layout: { ...settings.layout, ...patch }, layoutSets: settings.layoutSets, ...(patch.preset && patch.preset !== NO_LAYOUT ? { show: { ...settings.show, arrangement: true } } : {}) });
  };
  for (const [k, set] of Object.entries(SPEAKER_SETS)) {
    const row = document.createElement('div');
    row.className = 'group speakerSet';
    row.dataset.set = k;
    const letter = Object.assign(document.createElement('button'), { className: 'setLetter', textContent: set.label, title: `${set.title}: make it the set that sounds` });
    letter.onclick = () => pick(k);
    const none = document.createElement('button');
    none.dataset.preset = NO_LAYOUT;
    none.textContent = 'None';
    none.title = 'No arrangement: place speakers by hand — every one of this set sounds, nothing is checked against a layout';
    none.onclick = () => pick(k, { preset: NO_LAYOUT });
    row.append(letter, none);
    for (const preset of set.presets) {
      const l = LAYOUTS[preset];
      const b = document.createElement('button');
      b.dataset.preset = preset;
      b.textContent = preset;
      b.title = `${set.title} · ${l.label}: show its reference angles over the room`;
      b.onclick = () => pick(k, { preset });
      row.append(b);
    }
    const place = document.createElement('button');
    place.textContent = '⤓';
    place.title = `Place this arrangement around the mix seat (replaces the ${set.title.split(' — ')[0]}'s arranged speakers)`;
    place.onclick = () => {
      if (k !== activeSet(store.state.settings)) pick(k);
      if (!LAYOUTS[store.state.settings.layout.preset]) status.textContent = '⚠ pick an arrangement to place — None places nothing';
      else if (!inspector.placeLayout()) status.textContent = '⚠ place a mix-position mic first';
    };
    row.append(place);
    bar.append(row);
  }

  // the array's centre off the mix seat, and its radius, in mm — moving either carries the placed speakers with it
  const field = (key, glyph, title) => {
    const input = Object.assign(document.createElement('input'), { type: 'number', step: key === 'rotate' ? 1 : 10, title });
    input.dataset.array = key;
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) moveArray(key, v);
    });
    const label = document.createElement('label');
    label.className = 'arrayField';
    label.title = title;
    label.append(glyph, input);
    return label;
  };
  const fields = document.createElement('div');
  fields.className = 'group arrayFields';
  fields.append(
    field('right', '↔', 'Array centre: mm to the listener’s right of the mix seat'),
    field('front', '↕', 'Array centre: mm toward the front from the mix seat'),
    field('up', '⇡', 'Array centre: mm above the mix seat’s ears'),
    field('radius', 'r', 'Array radius, mm — the placed speakers scale with it'),
    field('rotate', '⟲', 'Array rotation, degrees counter-clockwise — the placed speakers turn round the listener with it'),
  );
  // the array's width as a slider: drag it and the placed speakers spread out or close in round the listener
  const width = Object.assign(document.createElement('input'), { type: 'range', min: WIDTH_MM[0], max: WIDTH_MM[1], step: 10, title: 'Array width: its radius round the listener — the placed speakers follow' });
  width.dataset.array = 'radius';
  width.addEventListener('input', () => moveArray('radius', parseFloat(width.value), true));
  width.addEventListener('change', () => moveArray('radius', parseFloat(width.value)));
  // the best width, once found, is a tick on the slider (and on the Layout tab's)
  width.setAttribute('list', 'bestWidth');
  const ticks = Object.assign(document.createElement('datalist'), { id: 'bestWidth' });
  const find = Object.assign(document.createElement('button'), { textContent: '⌖', title: 'Find the width with the flattest low end over the room’s seats' });
  find.onclick = () => findWidth();
  // the array wider than the room allows: how much bigger the room would have to be (acoustics/roomFit.js)
  const grow = Object.assign(document.createElement('span'), { id: 'roomGrow', className: 'roomGrow', hidden: true });
  // under the slider, its scale: metres, the room's footprint, and the arrival and first-reflection times (syncWidthScale)
  const scale = Object.assign(document.createElement('div'), { className: 'widthScale' });
  const lanes = Object.assign(document.createElement('div'), { id: 'widthLanes', className: 'lanes' });
  lanes.addEventListener('pointermove', (e) => {
    const box = lanes.getBoundingClientRect();
    const r = (WIDTH_MM[0] + ((e.clientX - box.left - 8) / (box.width - 16)) * (WIDTH_MM[1] - WIDTH_MM[0])) / 1000;
    const near = widthLanes.list.reduce((b, l) => (!b || Math.abs(l.r - r) < Math.abs(b.r - r) ? l : b), null);
    lanes.title = near ? laneText(near) : '';
  });
  scale.append(width, lanes);
  // the spreader stays on the bar while an arrangement is chosen, to space the speakers without opening anything
  const spreader = Object.assign(document.createElement('div'), { id: 'spreader', className: 'group arrayFields' });
  spreader.append(scale, ticks, find);
  // the fields fold behind one button over the views; the warning that the room is too small stays on the bar
  const arrayBtn = Object.assign(document.createElement('button'), { id: 'arrayBtn', title: 'The array: its centre off the mix seat, its width and its turn — the placed speakers follow' });
  bar.after(arrayBtn);
  makeFold(arrayBtn, fields);
  arrayBtn.parentNode.after(spreader, grow);
}
const monitor = createMonitor({ root: document.getElementById('monitor'), store, engine });
makeFold(document.getElementById('monitorBtn'), document.getElementById('monitor'), { sticky: true, onOpen: () => monitor.render() });
makeFold(document.getElementById('furnitureBtn'), document.getElementById('furniture'), { closeOn: 'button[data-arm]' });
makeFold(document.getElementById('moreBtn'), document.getElementById('more'), { closeOn: '#tour' });

/**
 * Sweep the array's width for the flattest low end over the room's seats
 * (acoustics/widthFinder.js), a few radii a frame so the page keeps drawing.
 * The answer goes in state.widthFit (not saved) and shows as a tick on both
 * Width sliders; the Layout tab offers to snap to it.
 */
function findWidth() {
  const room = engine.out.room;
  const { speakers, mics, settings } = store.state;
  if (!room || !mics.some((m) => m.mix)) {
    status.textContent = '⚠ place a mix-position mic first';
    return;
  }
  const sweep = widthSweep(room, speakers, mics, settings, { to: Math.min(6, Math.max(1, Math.hypot(room.L, room.W) / 2)) });
  let done = 0;
  const tick = () => {
    const t0 = performance.now();
    let more = true;
    while (more && performance.now() - t0 < 30) {
      more = sweep.step();
      done++;
    }
    store.state.widthFit = { ...sweep.result, running: more, done, total: sweep.total };
    store.emit('fit');
    if (more) requestAnimationFrame(tick);
  };
  tick();
}

/** The arranged speakers through a wall or the ceiling: the room they would need, beside the Width slider. */
function syncRoomGrowth() {
  const el = document.getElementById('roomGrow');
  if (!el) return;
  const g = roomGrowth(engine.out.room, arrangedSpeakers(store.state.speakers, store.state.settings));
  el.hidden = !g.any;
  el.textContent = g.any ? `⤢ room ${growthText(g)}` : '';
  el.title = g.any ? `This width puts speakers outside the room. To keep them ${CLEAR_M} m clear of the walls: ${growthDetail(g)} — the dashed outline on the plan.` : '';
}

const laneText = (l) => `r ${l.r.toFixed(2)} m · direct ${l.direct.toFixed(1)} ms · first reflection +${l.gap.toFixed(1)} ms${l.fits ? '' : ' · outside the room'}`;

/**
 * The scale under the Width slider (acoustics/radiusScale.js): a metre ruler; the room's footprint as a strip,
 * green where the carried speakers fit and red where they would go through a wall; ticks where the main speakers'
 * direct sound reaches the mix seat in a round number of ms (blue), and where the first reflection's lag behind
 * it falls through 20, 10, 5 ms (amber). Recomputed only when the room, the boxes, the seats or the layout change.
 */
function syncWidthScale() {
  const el = document.getElementById('widthLanes');
  if (!el) return;
  const { speakers, mics, settings } = store.state;
  const key = [engine.out.room, speakers, mics, settings.layout];
  if (key.every((k, i) => k === widthLanes.key[i])) return;
  widthLanes.key = key;
  const list = radiusLanes(engine.out.room, speakers, mics, settings, { from: WIDTH_MM[0] / 1000, to: WIDTH_MM[1] / 1000 });
  widthLanes.list = list;
  const span = WIDTH_MM[1] - WIDTH_MM[0];
  const pos = (r) => `left: calc(8px + (100% - 16px) * ${((r * 1000 - WIDTH_MM[0]) / span).toFixed(4)})`;
  const parts = [];
  // the footprint strip: one gradient stop per change of fit
  if (list.length) {
    const stops = [];
    list.forEach((l, i) => {
      const f = ((l.r * 1000 - WIDTH_MM[0]) / span) * 100;
      const c = l.fits ? 'var(--ok)' : 'var(--bad)';
      if (i === 0 || l.fits !== list[i - 1].fits) stops.push(`${c} ${f.toFixed(2)}%`);
      if (i === list.length - 1 || l.fits !== list[i + 1].fits) stops.push(`${c} ${f.toFixed(2)}%`);
    });
    parts.push(`<i class="foot" style="background: linear-gradient(90deg, ${stops.join(', ')})" title="The room's footprint: green, the speakers fit; red, they would go through a wall or the ceiling"></i>`);
  }
  for (let r = Math.ceil(WIDTH_MM[0] / 500) * 0.5; r * 1000 <= WIDTH_MM[1]; r += 0.5) {
    parts.push(`<i class="tick${r % 1 ? '' : ' major'}" style="${pos(r)}"></i>`);
    if (!(r % 1)) parts.push(`<span class="m" style="${pos(r)}">${r}${r === 1 ? ' m' : ''}</span>`);
  }
  for (const c of crossings(list, 'direct', DIRECT_MARKS_MS)) parts.push(`<b class="mark direct" style="${pos(c.r)}" title="The direct sound reaches the mix seat in ${c.ms} ms at r ${c.r.toFixed(2)} m">${c.ms}</b>`);
  for (const c of crossings(list, 'gap', GAP_MARKS_MS)) parts.push(`<b class="mark gap" style="${pos(c.r)}" title="The first reflection arrives ${c.ms} ms after the direct sound at r ${c.r.toFixed(2)} m — narrower keeps it later">+${c.ms}</b>`);
  el.innerHTML = parts.join('');
}

/** The best width as a tick on every Width slider. */
function syncWidthTicks() {
  const fit = store.state.widthFit;
  const best = fit?.preset === store.state.settings.layout.preset ? fit.best : null;
  const list = document.getElementById('bestWidth');
  if (list) list.replaceChildren(...(best ? [Object.assign(document.createElement('option'), { value: Math.round(best.r * 1000) })] : []));
}

/**
 * Keep the console at the mixer's nose (acoustics/console.js): after every
 * recompute — so while the seat is dragged or turned too — the nearest
 * console on the sheet is moved square in front of the mix seat, its near
 * edge the set number of people clear. Nothing is sent once it is there.
 */
function followConsole() {
  const { settings, mics, cad: { geometry } } = store.state;
  const mix = mics.find((m) => m.mix);
  if (!cad.link || !geometry || !mix || settings.console?.follow === false) return;
  const desk = consoleOf(patchesFromCad(geometry), mix);
  if (!desk) return;
  const spot = consoleSpot(mix, desk.paletteId, settings.console?.people ?? 2);
  if (consoleSettled(desk, spot)) return;
  const k = METRES_PER_UNIT[geometry.units] ?? 1;
  cad.link.move([{ id: desk.id, at: [+(spot.x / k).toFixed(4), +(spot.y / k).toFixed(4)], rotation: spot.rotation }]);
}

/** Change the array's centre offset or radius (mm), or its rotation (degrees), carrying the speakers placed in it along. */
function moveArray(key, mm, live = false) {
  const { settings, speakers, mics } = store.state;
  const layout = settings.layout;
  const next =
    key === 'radius' ? { ...layout, radius: Math.max(0.3, mm / 1000) }
    : key === 'rotate' ? { ...layout, rotate: ((((mm + 180) % 360) + 360) % 360) - 180 }
    : { ...layout, offset: { ...layout.offset, [key]: mm } };
  const mix = mics.find((m) => m.mix);
  // the arrangement laid over the moved array again, not its squeezed places scaled (layouts.js relayArray)
  const moved = relayArray(speakers, settings, mix, next, engine.out.room);
  // mid-drag: the quick recompute (field, response, meters) on every step; the release saves and runs it in full
  if (moved.length) store.updateMany('speaker', moved, true);
  // turning the array turns the mixer with it: the listener always faces the array's front
  if (key === 'rotate' && mix) store.updateMany('mic', [{ id: mix.id, aim: +arrayFront({ ...settings, layout: next }).toFixed(1) }], true);
  store.setSettings({ layout: next }, live);
}

// ------------------------------------------------------------------ furniture: the CAD draws it, at true size
document.getElementById('furniture').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-arm]');
  if (!b) return;
  const paletteId = b.dataset.arm;
  const inFurnitureMode = store.state.mode === 'place-furniture';
  const currentArm = store.state.placeKind.furniture;
  if (inFurnitureMode && currentArm === paletteId) {
    store.setMode('cad');
    return;
  }
  store.setPlaceKind('furniture', paletteId);
  store.setMode('place-furniture');
  jumpTo('plan');
  if (cad.link) cad.link.arm(paletteId);
});

// ------------------------------------------------------------------ the room library
let pendingRoom = null;

/** Draw a library room into the CAD beside whatever is there, on a layer of its own, and make it the room. */
function drawRoom(entry) {
  if (!entry || !cad.link) return;
  const g = store.state.cad.geometry;
  const k = METRES_PER_UNIT[g?.units ?? store.state.cad.view?.units ?? 'm'] ?? 1;
  const xs = (g?.walls ?? []).flatMap((w) => [w.a[0], w.b[0]]).map((x) => x * k);
  const ys = (g?.walls ?? []).flatMap((w) => [w.a[1], w.b[1]]).map((y) => y * k);
  // far enough from the last room that its blow-up (ceiling, floor and walls drawn above it) has room
  const gap = Math.max(4, 2 * (entry.h ?? 3) + 2);
  const ox = xs.length ? Math.max(...xs) + gap - Math.min(...entry.poly.map(([x]) => x)) : 0;
  const oy = ys.length ? Math.min(...ys) : 0;
  const layer = `Room · ${entry.name}`;
  const seed = entry.poly.map(([x, y]) => [+((x + ox) / k).toFixed(4), +((y + oy) / k).toFixed(4)]);
  pendingRoom = { layer, h: entry.h, id: entry.id, entry, ox, oy, k };
  store.setSheet('plan');
  cad.link.sheet(layer, { color: '#e5e7eb', seed });
  status.textContent = `drawing “${entry.name}” into the CAD…`;
}

/** A dice room's arrangement waits for the engine to make the drawn loop the room and seat the mixer, then goes in. */
let pendingLayout = null;
function placePendingLayout() {
  if (!pendingLayout || engine.out.planLayer !== pendingLayout) return;
  if (!store.state.mics.some((m) => m.mix)) return;
  pendingLayout = null;
  inspector.placeLayout();
}

/** Once the CAD has drawn it, the new loop becomes the room. */
function pickDrawnRoom() {
  if (!pendingRoom) return;
  const loop = engine.out.rooms?.find((r) => r.layerId === pendingRoom.layer);
  if (!loop) return;
  const { h, id, entry, ox, oy, k } = pendingRoom;
  pendingRoom = null;
  const heights = { ...store.state.settings.roomHeights, [loop.layerId]: +h.toFixed(3) };
  // its glass, if it has any, belongs to the loop just drawn
  const windows = { ...store.state.settings.windows, [loop.layerId]: (entry.windows ?? []).map(makeWindow) };
  store.setSettings({ roomId: loop.id, roomHeight: +h.toFixed(3), lastLibraryRoom: id, frontDeg: 90, roomHeights: heights, windows });
  // furnished, and with its people in it: the console, couch and rack into the CAD as real blocks, the listeners seated
  if (entry.group) {
    const { furniture, seats, door } = furnish(entry);
    // each kind of furniture on a layer of its own (marks.js slices)
    for (const f of furniture) cad.link.place(furnitureLayer(f.paletteId), [{ paletteId: f.paletteId, at: [+((f.x + ox) / k).toFixed(4), +((f.y + oy) / k).toFixed(4)], rotation: f.rotation }]);
    store.seat(seats.map((s) => makeMic(s.kind, { x: s.x + ox, y: s.y + oy, z: s.z }, { aim: s.aim, mix: Boolean(s.mix) })));
    // the arrangement picked on the toolbar goes in round the new mix seat, once the engine has the room
    if (seats.some((x) => x.mix) && LAYOUTS[store.state.settings.layout.preset]) pendingLayout = loop.layerId;
    if (door) hangDoor(loop, door, h, ox, oy, k);
  }
}

/**
 * The door goes on the back elevation, where a door is drawn: its frame is
 * the one the engine will read the patch in (patches.js elevationOrigin) — the
 * back loop already drawn, or the seed under this plan — so it is built here
 * as the engine is about to build the room.
 */
function hangDoor(loop, door, h, ox, oy, k) {
  const room = buildRoom(loop.poly, { ...store.state.settings, frontDeg: 90, roomHeight: h }, engine.out.elevations ?? []);
  const origin = elevationOrigin(room, 'back');
  if (!origin) return;
  const { t } = faceCoords(room, 'back')({ x: door.x + ox, y: door.y + oy });
  // the back elevation is seen from inside, looking back: t (from the left) runs right to left on the sheet
  const at = [origin.x + room.W - t, origin.y + door.h / 2];
  cad.link.place(ELEVATION_LAYER.back, [{ paletteId: door.paletteId, at: at.map((v) => +(v / k).toFixed(4)), rotation: 0 }]);
}

document.getElementById('grabBag').addEventListener('click', () => drawRoom(grabBag(store.state.settings.lastLibraryRoom)));

// the library by name, a group per kind of room: the one picked is drawn into the CAD, as the grab bag's is
const roomPick = document.getElementById('roomPick');
roomPick.append(new Option('Room shapes …', ''));
for (const group of [...new Set(ROOM_LIBRARY.map((r) => r.group))]) {
  const og = document.createElement('optgroup');
  og.label = group;
  for (const r of ROOM_LIBRARY.filter((x) => x.group === group)) og.append(Object.assign(new Option(r.name, r.id), { title: r.note }));
  roomPick.append(og);
}
roomPick.value = roomById(store.state.settings.lastLibraryRoom) ? store.state.settings.lastLibraryRoom : '';
roomPick.addEventListener('change', () => drawRoom(roomById(roomPick.value)));
store.subscribe(() => {
  const id = store.state.settings.lastLibraryRoom;
  if (roomById(id) && roomPick.value !== id) roomPick.value = id;
});

// ------------------------------------------------------------------ what this app draws into the CAD file
/**
 * What is drawn on the walls' elevations, in sheet metres: the user's own regions and the mirrored copies
 * the symmetry made (the schedule and the wall builder list both), and the lines drawn there.
 */
function wallInputs(g) {
  if (!g) return { patches: [], lines: [] };
  const k = METRES_PER_UNIT[g.units] ?? 1;
  const names = new Map((g.layers ?? []).map((l) => [l.id, l.name]));
  return {
    patches: patchesFromCad(g).filter((p) => elevationFaceOf(p.layer) && (!p.host || p.host === 'symmetry')),
    lines: (g.walls ?? [])
      .map((w) => ({ layer: names.get(w.layerId) ?? w.layerId, a: { x: w.a[0] * k, y: w.a[1] * k }, b: { x: w.b[0] * k, y: w.b[1] * k } }))
      .filter((w) => elevationFaceOf(w.layer)),
  };
}

let marksTimer = 0;
function syncMarks() {
  clearTimeout(marksTimer);
  marksTimer = setTimeout(() => {
    const g = store.state.cad.geometry;
    if (!cad.link || !g || !engine.out.room) return;
    const k = METRES_PER_UNIT[g.units] ?? 1;
    const xs = (g.walls ?? []).flatMap((w) => [w.a[0], w.b[0]]).map((x) => x * k);
    const ys = (g.walls ?? []).flatMap((w) => [w.a[1], w.b[1]]).map((y) => y * k);
    const sheetBounds = xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : null;
    const layers = new Set((g.layers ?? []).map((l) => l.name));
    // every plan on the sheet gets its blow-up: the one being designed as the engine has it, the rest built here
    const names = new Map((g.layers ?? []).map((l) => [l.id, l.name]));
    const patches = patchesFromCad(g).filter((p) => !elevationFaceOf(p.layer));
    const settings = store.state.settings;
    const rooms = (engine.out.rooms ?? []).map((loop) => ({
      name: String(names.get(loop.layerId) ?? loop.layerId).replace(/^Room · /, ''),
      room: loop.layerId === engine.out.planLayer && !engine.out.virtual ? engine.out.room : buildRoom(loop.poly, { ...settings, roomHeight: settings.roomHeights?.[loop.layerId] ?? settings.roomHeight }, [], patches),
    }));
    const { patches: wallPatches, lines: wallLines } = wallInputs(g);
    const sets = buildMarks({ room: engine.out.room, state: store.state, planLayer: engine.out.planLayer, sheetBounds, k, layers, rooms, wallPatches, wallLines, patches: patchesFromCad(g) });
    const onSheet = g.marks ?? {};
    for (const key of MARK_KEYS) {
      const items = sets[key];
      const hash = hashOf(items);
      if (onSheet[key] === hash || (onSheet[key] === undefined && !items.length)) continue;
      cad.link.marks(key, hash, items);
    }
    // every drawing on the sheet a model space of its own, one scale for all (marks.js spacesOf)
    const spaces = spacesOf(engine.out.room, sets, k);
    const spacesHash = hashOf(spaces);
    if (spacesHash !== lastSpaces) {
      lastSpaces = spacesHash;
      cad.link.spaces(spaces);
    }
  }, 350);
}
let lastSpaces = null;

// ------------------------------------------------------------------ sweep and tour
const sweepBtn = document.getElementById('sweep');
const tourBtn = document.getElementById('tour');
let sweep = null;

function stopSweep() {
  if (!sweep) return;
  clearInterval(sweep.timer);
  sweep = null;
  engine.frames(false);
  sweepBtn.classList.remove('on');
  tourBtn.classList.remove('on');
  sweepBtn.textContent = '▶ Sweep';
}

/**
 * Up and down the frames the engine has painted, a lap every `seconds`
 * however many are ready — coarse at first, smoother as the gaps fill in.
 */
function startSweep({ seconds = 16 } = {}) {
  stopSweep();
  if (store.state.settings.method === 'energy') store.setSettings({ method: 'wave' });
  engine.frames(true);
  sweep = {
    timer: setInterval(() => {
      const now = performance.now();
      const ready = engine.out.frames.ready;
      if (ready.length && now - sweep.stepped >= Math.max(40, (seconds * 1000) / ready.length)) {
        sweep.stepped = now;
        // from wherever the slider is to the next ready frame, turning round at the ends
        const at = store.state.settings.freq;
        let i = sweep.dir > 0 ? ready.findIndex((f) => f > at) : ready.findLastIndex((f) => f < at);
        if (i < 0) {
          sweep.dir = -sweep.dir;
          i = sweep.dir > 0 ? Math.min(1, ready.length - 1) : Math.max(0, ready.length - 2);
        }
        if (ready[i] !== at) store.setSettings({ freq: ready[i] });
      }
    }, 30),
    stepped: 0,
    dir: 1,
  };
  sweepBtn.classList.add('on');
  sweepBtn.textContent = '■ Stop';
}

// a song: the field shows the room at the frequency the music is exciting (ui/player.js); it and the sweep take turns
const player = createPlayer({
  root: document.getElementById('player'),
  store,
  engine,
  onPlay: (on) => {
    if (on) stopSweep();
  },
});
document.getElementById('songFile').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) player.load(f);
  e.target.value = '';
});

// the tour's sweep moves a twelfth of an octave a frame
const TOUR_FRAMES = sweepFrames(1 / 12);

// the tour: a window of its own plays every view in turn while the frequency sweeps, and saves it as a video
const tour = createTour({
  store,
  engine,
  // with a song loaded, the tour plays it from the top, the field following it, and records it under the pictures
  soundtrack: () => (player.loaded ? { stream: player.stream(), duration: player.duration } : null),
  onStart: (seconds, withSong) => {
    if (withSong) player.restart();
    else {
      // the views are held still while the engine paints the frames the sweep will play
      stopSweep();
      if (store.state.settings.method === 'energy') store.setSettings({ method: 'wave' });
      engine.frames(true, TOUR_FRAMES);
    }
    tourBtn.classList.add('on');
  },
  // the tour's frame nearest the point that far up the range, on a log scale — false while it is still being painted
  sweepTo: (u) => {
    const want = Math.log(F_MIN) + u * (Math.log(F_MAX) - Math.log(F_MIN));
    const f = TOUR_FRAMES.reduce((best, g) => (Math.abs(Math.log(g) - want) < Math.abs(Math.log(best) - want) ? g : best));
    if (!engine.out.frames.ready.includes(f)) return false;
    if (f !== store.state.settings.freq) store.setSettings({ freq: f });
    return true;
  },
  onStop: () => {
    if (player.playing) player.pause();
    stopSweep();
    engine.frames(false);
    tourBtn.classList.remove('on');
  },
  caption: () => {
    const { settings } = store.state;
    const room = engine.out.room;
    const size = room ? `${Math.round(room.L * 1000)} × ${Math.round(room.W * 1000)} × ${Math.round(room.H * 1000)} mm` : '';
    return [store.state.fileName, size, settings.method, settings.method === 'energy' ? '' : `${hz(settings.freq)} Hz`].filter(Boolean).join(' · ');
  },
  name: () => (store.state.fileName || 'room').replace(/\.[^.]+$/, ''),
});

sweepBtn.addEventListener('click', () => (tour.running ? tour.stop() : sweep ? stopSweep() : (player.pause(), startSweep())));
tourBtn.addEventListener('click', () => (tour.running ? tour.stop() : tour.start()));

// ------------------------------------------------------------------ sessions: the CAD drawing and this overlay, in one file
const SESSION_FORMAT = 'acoustic.like.audio/session@1';

async function saveSession() {
  status.textContent = '💾 asking the CAD for its drawing…';
  const drawing = cad.link ? await cad.link.session() : null;
  const doc = { format: SESSION_FORMAT, savedAt: new Date().toISOString(), overlay: store.exportDoc(), cad: drawing };
  const name = (store.state.fileName || drawing?.currentFileName || 'room').replace(/\.[^.]+$/, '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(doc)], { type: 'application/json' }));
  a.download = `${name}.acoustic-session.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  status.textContent = drawing ? `💾 saved ${name} — drawing, ${store.state.speakers.length} speakers, ${store.state.mics.length} mics` : '💾 saved the overlay — the CAD did not answer, so the drawing is not in the file';
}

async function openSession(file) {
  let doc;
  try {
    doc = JSON.parse(await file.text());
  } catch {
    alert('That file is not JSON.');
    return;
  }
  // an overlay file on its own (File → Export overlay) opens too
  if (doc?.format === 'acoustic.like.audio@1') doc = { format: SESSION_FORMAT, overlay: doc, cad: null };
  if (doc?.format !== SESSION_FORMAT) {
    alert('Not an acoustic.like.audio session file.');
    return;
  }
  const fileName = doc.cad?.currentFileName ?? doc.overlay?.fileName ?? null;
  store.adopt(fileName, doc.overlay);
  if (doc.cad && cad.link) cad.link.open(doc.cad);
  status.textContent = `📂 opened ${fileName ?? 'session'}`;
}

document.getElementById('saveSession').addEventListener('click', saveSession);
// 📂 Open asks for a licence key first, as the 1997 program did. A placebo: any key, Enter, and the file picker opens.
document.getElementById('openSession').closest('label').addEventListener('click', (e) => {
  if (e.target.id === 'openSession') return;
  e.preventDefault();
  askLicence(() => document.getElementById('openSession').click());
});
document.getElementById('openSession').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) openSession(f);
  e.target.value = '';
});

// ------------------------------------------------------------------ every panel can have a window of its own
for (const tile of document.querySelectorAll('.tile.face, .tile.t3d')) {
  const face = tile.dataset.face;
  makePoppable(tile, { title: face === '3d' ? '3-D room' : `${face[0].toUpperCase()}${face.slice(1)}`, onChange: () => renderGeometry() });
}
// The plan too, once the CAD has a window of its own: with the CAD still in the tile, moving the tile would
// reload the CAD, so ⇱ shows only while it is out — and docking the CAD brings the plan back first.
{
  const planPop = makePoppable(planTile, { title: 'Plan', onChange: () => renderGeometry() });
  store.subscribe((state, what) => {
    if (what !== 'view') return;
    planTile.classList.toggle('cad-out', Boolean(state.cad.popped));
    if (!state.cad.popped && planPop.window) planPop.dock();
  });
}
makePoppable(document.getElementById('inspector'), {
  title: 'Inspector',
  onChange: () => inspector.render(),
  onPopped: (out) => document.querySelector('main').classList.toggle('inspector-out', out),
});
installSashes({
  main: document.querySelector('main'),
  views,
  inspector: document.getElementById('inspector'),
  footer: document.querySelector('footer.foot'),
  meters: document.getElementById('meters'),
  onResize: renderAll,
});

// ------------------------------------------------------------------ Acoustic X, the classic windows
createAcousticX({
  store,
  engine,
  mount: document.getElementById('acx'),
  // the Modal Response optimiser's "Use these": a shoebox of those dimensions, drawn like any library room
  onDrawRoom: ({ L, W, H }) => drawRoom({ id: 'optimised', group: 'Control rooms', name: `Optimised ${W.toFixed(2)} × ${L.toFixed(2)} × ${H.toFixed(2)} m`, h: H, poly: [[-W / 2, 0], [W / 2, 0], [W / 2, L], [-W / 2, L]] }),
});

// `?debug` hands the console the store and engine; nothing reads them otherwise.
if (new URLSearchParams(location.search).has('debug')) window.acoustic = { store, engine };

store.load(null);
engine.update();

// a newer copy of this app on the server: a banner offers the refresh (ui/freshness.js)
watchForUpdates({ banner: document.getElementById('updated') });
