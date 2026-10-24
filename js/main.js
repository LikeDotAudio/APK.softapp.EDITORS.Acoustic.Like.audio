// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { listen } from './audio/auralize.js';
import { ELEVATION_LAYER, elevationFaceOf, seedOutline } from './acoustics/elevations.js';
import { buildRoom } from './acoustics/room.js';
import { arrayFront, carryArray, LAYOUTS } from './acoustics/layouts.js';
import { powerMean, roomSeats, seatWeight } from './compute/compute.js';
import { widthSweep } from './acoustics/widthFinder.js';
import { paletteItems } from './acoustics/materials.js';
import { furnish, grabBag, roomById } from './acoustics/roomLibrary.js';
import { makeMic } from './acoustics/devices.js';
import { connectCad, METRES_PER_UNIT } from './cad/cadLink.js';
import { buildMarks, hashOf, MARK_KEYS } from './cad/marks.js';
import { F_MAX, F_MIN } from './compute/compute.js';
import { createAcousticX } from './acoustx/acoustx.js';
import { makePoppable } from './ui/popout.js';
import { hz } from './ui/meters.js';
import { createEngine, patchesFromCad } from './compute/engine.js';
import { createStore } from './model/store.js';
import { createInspector } from './ui/inspector.js';
import { createMeters } from './ui/meters.js';
import { createFaceView } from './views/faceView.js';
import { FACE_COLOURS } from './views/glyphs.js';
import { fieldScale, rampGradient } from './views/paint.js';
import { createPlanView, planLabel } from './views/plan.js';
import { createView3d } from './views/view3d.js';

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
const views = document.getElementById('views');
const status = document.getElementById('status');

const cad = { link: null };

const engine = createEngine(store, (out, phase) => {
  if (phase === 'frame') {
    // a sweep frame painted ahead: only the response chart's markers change
    meters.render();
    return;
  }
  out.scale = fieldScale(out.values, store.state.settings.rangeDb);
  if (phase === 'room') {
    status.textContent = '⟳ computing…';
    renderGeometry();
    return;
  }
  status.textContent = out.error ? '⚠ field error — see console' : `${out.room.walls.length} walls · ${store.state.speakers.length} spk · ${store.state.mics.length} mic${out.virtual ? ' · virtual room' : ''}`;
  if (out.error) console.error(out.error);
  renderAll();
  syncMarks();
  pickDrawnRoom();
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
  if (sheet === 'plan' || sheet === 'ceiling') {
    cad.link.sheet(engine.out.planLayer ?? '0');
    // A layer with nothing drawn on it does not move the view, so this leaves the plan in sight.
    if (sheet === 'ceiling') cad.link.sheet(CEILING_LAYER, { color: FACE_COLOURS.ceiling });
    return;
  }
  const room = engine.out.room;
  const k = METRES_PER_UNIT[store.state.cad.geometry?.units ?? store.state.cad.view?.units ?? 'm'] ?? 1;
  const drawn = engine.out.elevations?.some((e) => e.face === sheet);
  const seed = !drawn && room ? seedOutline(room, sheet).map((p) => [+(p.x / k).toFixed(4), +(p.y / k).toFixed(4)]) : undefined;
  cad.link.sheet(ELEVATION_LAYER[sheet], { color: FACE_COLOURS[sheet], seed });
}

const plan = createPlanView({ tile: document.querySelector('.tile.plan .stage'), iframe, store, engine, onDrag });
const faces = ['ceiling', 'front', 'back', 'left', 'right'].map((face) => createFaceView({ tile: document.querySelector(`.tile[data-face="${face}"]`), face, store, engine, onDrag, onJump: () => jumpTo(face), onPickPatch: (id) => inspector.showPatch(id) }));
const view3d = createView3d({ canvas: document.querySelector('.tile.t3d canvas'), store, engine });
const meters = createMeters({
  root: document.getElementById('meters'),
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
  if (cad.link.popped) cad.link.dockIn();
  else if (!cad.link.popOut()) status.textContent = '⚠ the browser blocked the CAD window — allow pop-ups here';
});

let frame = 0;
function renderGeometry() {
  plan.render();
  for (const f of faces) f.render();
  view3d.render();
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
  });
}

cad.link = connectCad(iframe, {
  onReady: () => store.setCad({ connected: true }),
  onView: (msg) => {
    store.setCad({ view: msg, connected: true }, 'view');
    plan.render();
  },
  onGeometry: (msg) => {
    const first = !store.state.cad.geometry || msg.fileName !== store.state.fileName;
    store.setCad({ geometry: msg, connected: true }, 'geometry');
    if (first && msg.fileName !== store.state.fileName) store.load(msg.fileName);
    engine.update();
  },
  onMirror: (msg) => {
    const k = METRES_PER_UNIT[store.state.cad.geometry?.units ?? store.state.cad.view?.units ?? 'm'] ?? 1;
    store.setCad({ mirror: { ...msg, xMetres: msg.x * k, axesMetres: (msg.axes ?? []).map((x) => x * k) } }, 'mirror');
    engine.update();
  },
  onPopped: (popped) => {
    store.setCad({ popped }, 'view');
    syncToolbar();
    plan.render();
  },
});

// The finishes and products the CAD can paint onto the room; cadLink sends them again on every `ready`.
cad.link.palette('Acoustic finishes & products', paletteItems());

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
document.getElementById('modes').addEventListener('click', (e) => {
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
  scaleBar.querySelector('.lo').textContent = `${scale.top - scale.range} dB`;
  const hi = scaleBar.querySelector('.hi');
  hi.replaceChildren(`${scale.top} dB · `, Object.assign(document.createElement('span'), { className: 'freqNow', textContent: settings.method === 'energy' ? planLabel(settings) : `${settings.method} · current frequency ${hz(settings.freq)} Hz` }));
  // markers: what the mix seat and the whole room read on this scale, at the current frequency
  const ramp = scaleBar.querySelector('.ramp');
  ramp.replaceChildren();
  const { reports } = engine.out;
  const read = (rep) => (!rep ? NaN : settings.method === 'energy' ? rep.energy?.[settings.band]?.total : settings.method === 'modal' ? rep.modal : rep.wave);
  const mix = store.state.mics.find((m) => m.mix);
  const seats = roomSeats(store.state.mics);
  const marks = [['MIX', read(reports?.[mix?.id]), '#f43f5e']];
  if (seats.length > 1) marks.push([`room ·${seats.length}`, powerMean(seats.map((m) => read(reports?.[m.id])), seats.map(seatWeight)), '#a3e635']);
  for (const [name, db, colour] of marks) {
    if (!Number.isFinite(db)) continue;
    const t = Math.max(0, Math.min(1, (db - (scale.top - scale.range)) / scale.range));
    const mark = Object.assign(document.createElement('i'), { className: 'mark', title: `${name}: ${db.toFixed(1)} dB at the current frequency` });
    mark.style.left = `${t * 100}%`;
    mark.style.background = colour;
    mark.append(Object.assign(document.createElement('span'), { textContent: `${name} ${db.toFixed(1)} dB` }));
    mark.firstChild.style.color = colour;
    ramp.append(mark);
  }
}

function syncToolbar() {
  const { mode, settings } = store.state;
  for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b.dataset.mode === mode);
  for (const b of document.querySelectorAll('#viewmode button')) b.classList.toggle('on', b.dataset.view === settings.view);
  for (const b of document.querySelectorAll('#method button')) b.classList.toggle('on', b.dataset.method === settings.method);
  views.className = settings.view === '3d' ? 'three' : 'six';
  const { sheet } = store.state;
  document.getElementById('sheetName').textContent = sheet === 'plan' ? 'draw the room here · click an elevation to draw that wall' : sheet === 'ceiling' ? `treating the ceiling — layer “${CEILING_LAYER}”: place clouds and tiles over the plan` : `editing the ${sheet} elevation — layer “${ELEVATION_LAYER[sheet]}”`;
  document.getElementById('toPlan').hidden = sheet === 'plan';
  const popped = store.state.cad.popped;
  const pop = document.getElementById('popCad');
  pop.textContent = popped ? '⇲ Dock' : '⇱ Pop out';
  pop.title = popped ? 'Bring the CAD back into this tile (or just close its window)' : 'Give the CAD a window of its own — the plan stays here';
  if (popped) document.getElementById('sheetName').textContent = 'the CAD is in its own window · the plan here places and moves speakers and mics';
  for (const t of document.querySelectorAll('.tile.face')) t.classList.toggle('editing', t.dataset.face === sheet);
  if (document.activeElement !== freq) freq.value = Math.log10(settings.freq);
  const freqOut = document.getElementById('freqOut');
  freqOut.replaceChildren(Object.assign(document.createElement('small'), { textContent: settings.method === 'energy' ? 'current band' : 'current frequency' }), settings.method === 'energy' ? `${[125, 250, 500, '1k', '2k', '4k'][settings.band]} oct` : `${hz(settings.freq)} Hz`);
  freq.disabled = settings.method === 'energy';
  for (const b of document.querySelectorAll('#arrangement button[data-preset]')) b.classList.toggle('on', b.dataset.preset === settings.layout.preset);
  for (const input of document.querySelectorAll('.arrayFields input')) {
    if (document.activeElement === input) continue;
    const key = input.dataset.array;
    input.value = Math.round(key === 'radius' ? (settings.layout.radius ?? 2) * 1000 : key === 'rotate' ? settings.layout.rotate ?? 0 : settings.layout.offset?.[key] ?? 0);
  }
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
  if (e.key === 'Escape') store.setMode('cad');
  if ((e.key === 'Delete' || e.key === 'Backspace') && store.state.selected) store.remove(store.state.selected.kind, store.state.selected.id);
});

new ResizeObserver(() => renderGeometry()).observe(views);

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

// ------------------------------------------------------------------ speaker arrangements
{
  const bar = document.getElementById('arrangement');
  for (const [preset, l] of Object.entries(LAYOUTS)) {
    const b = document.createElement('button');
    b.dataset.preset = preset;
    b.textContent = preset;
    b.title = `${l.label}: show its reference angles over the room`;
    b.onclick = () => store.setSettings({ layout: { ...store.state.settings.layout, preset }, show: { ...store.state.settings.show, arrangement: true } });
    bar.append(b);
  }
  const place = document.createElement('button');
  place.textContent = '⤓';
  place.title = 'Place this arrangement around the mix seat (replaces the arranged speakers)';
  place.onclick = () => {
    if (!inspector.placeLayout()) status.textContent = '⚠ place a mix-position mic first';
  };
  bar.append(place);

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
  const width = Object.assign(document.createElement('input'), { type: 'range', min: 800, max: 6000, step: 50, title: 'Array width: its radius round the listener — the placed speakers follow' });
  width.dataset.array = 'radius';
  width.addEventListener('input', () => moveArray('radius', parseFloat(width.value), true));
  width.addEventListener('change', () => moveArray('radius', parseFloat(width.value)));
  // the best width, once found, is a tick on the slider (and on the Layout tab's)
  width.setAttribute('list', 'bestWidth');
  const ticks = Object.assign(document.createElement('datalist'), { id: 'bestWidth' });
  const find = Object.assign(document.createElement('button'), { textContent: '⌖', title: 'Find the width with the flattest low end over the room’s seats' });
  find.onclick = () => findWidth();
  fields.append(width, ticks, find);
  bar.after(fields);
}

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

/** The best width as a tick on every Width slider. */
function syncWidthTicks() {
  const fit = store.state.widthFit;
  const best = fit?.preset === store.state.settings.layout.preset ? fit.best : null;
  const list = document.getElementById('bestWidth');
  if (list) list.replaceChildren(...(best ? [Object.assign(document.createElement('option'), { value: Math.round(best.r * 1000) })] : []));
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
  const moved = carryArray(speakers, settings, mix, next, engine.out.room?.H);
  // mid-drag: the quick recompute (field, response, meters) on every step; the release saves and runs it in full
  if (moved.length) store.updateMany('speaker', moved, true);
  // turning the array turns the mixer with it: the listener always faces the array's front
  if (key === 'rotate' && mix) store.updateMany('mic', [{ id: mix.id, aim: +arrayFront({ ...settings, layout: next }).toFixed(1) }], true);
  store.setSettings({ layout: next }, live);
}

// ------------------------------------------------------------------ furniture: the CAD draws it, at true size
document.getElementById('furniture').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-arm]');
  if (!b || !cad.link) return;
  if (store.state.sheet !== 'plan') jumpTo('plan');
  cad.link.arm(b.dataset.arm);
  store.setMode('cad');
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

/** Once the CAD has drawn it, the new loop becomes the room. */
function pickDrawnRoom() {
  if (!pendingRoom) return;
  const loop = engine.out.rooms?.find((r) => r.layerId === pendingRoom.layer);
  if (!loop) return;
  const { h, id, entry, ox, oy, k } = pendingRoom;
  pendingRoom = null;
  const heights = { ...store.state.settings.roomHeights, [loop.layerId]: +h.toFixed(3) };
  store.setSettings({ roomId: loop.id, roomHeight: +h.toFixed(3), lastLibraryRoom: id, frontDeg: 90, roomHeights: heights });
  // furnished, and with its people in it: the console, couch and rack into the CAD as real blocks, the listeners seated
  if (entry.group) {
    const { furniture, seats } = furnish(entry);
    if (furniture.length) cad.link.place('Furniture', furniture.map((f) => ({ paletteId: f.paletteId, at: [+((f.x + ox) / k).toFixed(4), +((f.y + oy) / k).toFixed(4)], rotation: f.rotation })));
    store.seat(seats.map((s) => makeMic(s.kind, { x: s.x + ox, y: s.y + oy, z: s.z }, { aim: s.aim, mix: Boolean(s.mix) })));
  }
}

document.getElementById('grabBag').addEventListener('click', () => drawRoom(grabBag(store.state.settings.lastLibraryRoom)));

// ------------------------------------------------------------------ what this app draws into the CAD file
let marksTimer = 0;
function syncMarks() {
  clearTimeout(marksTimer);
  marksTimer = setTimeout(() => {
    const g = store.state.cad.geometry;
    if (!cad.link || !g || engine.out.virtual || !engine.out.room) return;
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
    const sets = buildMarks({ room: engine.out.room, state: store.state, planLayer: engine.out.planLayer, sheetBounds, k, layers, rooms });
    const onSheet = g.marks ?? {};
    for (const key of MARK_KEYS) {
      const items = sets[key];
      const hash = hashOf(items);
      if (onSheet[key] === hash || (onSheet[key] === undefined && !items.length)) continue;
      cad.link.marks(key, hash, items);
    }
  }, 350);
}

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
  if (views.classList.contains('maxed')) maximise(null);
}

/**
 * Up and down the frames the engine has painted, a lap every `seconds`
 * however many are ready — coarse at first, smoother as the gaps fill in.
 * With `slides`, each view of the room in turn takes the screen.
 */
function startSweep({ seconds = 16, slides = null } = {}) {
  stopSweep();
  const t0 = performance.now();
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
      if (slides) {
        const i = Math.floor(((now - t0) / 1000 / seconds) * slides.length) % slides.length;
        if (sweep.slide !== i) {
          sweep.slide = i;
          showSlide(slides[i]);
        }
      }
    }, 30),
    slide: -1,
    stepped: 0,
    dir: 1,
  };
  (slides ? tourBtn : sweepBtn).classList.add('on');
  sweepBtn.textContent = '■ Stop';
}

/** The tour: top, back, the sides, front, ceiling, then the room in 3-D. */
const SLIDES = ['plan', 'back', 'left', 'right', 'front', 'ceiling', '3d'];
function showSlide(face) {
  if (face === '3d') {
    if (store.state.settings.view !== '3d') store.setSettings({ view: '3d' });
    maximise(document.querySelector('.tile.t3d'));
    return;
  }
  if (store.state.settings.view !== 'six') store.setSettings({ view: 'six' });
  maximise(document.querySelector(`.tile[data-face="${face}"]`));
}

function maximise(tile) {
  for (const t of document.querySelectorAll('.tile')) t.classList.toggle('max', t === tile);
  views.classList.toggle('maxed', Boolean(tile));
  requestAnimationFrame(renderGeometry);
}

sweepBtn.addEventListener('click', () => (sweep ? stopSweep() : startSweep()));
tourBtn.addEventListener('click', () => (sweep ? stopSweep() : startSweep({ seconds: SLIDES.length * 5, slides: SLIDES })));

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
makePoppable(document.getElementById('inspector'), {
  title: 'Inspector',
  onChange: () => inspector.render(),
  onPopped: (out) => document.querySelector('main').classList.toggle('inspector-out', out),
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
