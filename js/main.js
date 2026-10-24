// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { listen } from './audio/auralize.js';
import { ELEVATION_LAYER, seedOutline } from './acoustics/elevations.js';

const CEILING_LAYER = 'Ceiling';
import { paletteItems } from './acoustics/materials.js';
import { connectCad, METRES_PER_UNIT } from './cad/cadLink.js';
import { createEngine } from './compute/engine.js';
import { createStore } from './model/store.js';
import { createInspector } from './ui/inspector.js';
import { createMeters } from './ui/meters.js';
import { createFaceView } from './views/faceView.js';
import { FACE_COLOURS } from './views/glyphs.js';
import { fieldScale } from './views/paint.js';
import { createPlanView } from './views/plan.js';
import { createView3d } from './views/view3d.js';

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
  out.scale = fieldScale(out.values, store.state.settings.rangeDb);
  if (phase === 'room') {
    status.textContent = '⟳ computing…';
    renderGeometry();
    return;
  }
  status.textContent = out.error ? '⚠ field error — see console' : `${out.room.walls.length} walls · ${store.state.speakers.length} spk · ${store.state.mics.length} mic${out.virtual ? ' · virtual room' : ''}`;
  if (out.error) console.error(out.error);
  renderAll();
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
const inspector = createInspector({ root: document.getElementById('inspector'), store, engine, cad, jumpTo });
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
  document.getElementById('freqOut').textContent = settings.method === 'energy' ? `${[125, 250, 500, '1k', '2k', '4k'][settings.band]} oct` : `${settings.freq} Hz`;
  freq.disabled = settings.method === 'energy';
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
  if (e.target.closest?.('input, select, textarea')) return;
  if (e.key === 'Escape') store.setMode('cad');
  if ((e.key === 'Delete' || e.key === 'Backspace') && store.state.selected) store.remove(store.state.selected.kind, store.state.selected.id);
});

new ResizeObserver(() => renderGeometry()).observe(views);

// `?debug` hands the console the store and engine; nothing reads them otherwise.
if (new URLSearchParams(location.search).has('debug')) window.acoustic = { store, engine };

store.load(null);
engine.update();
