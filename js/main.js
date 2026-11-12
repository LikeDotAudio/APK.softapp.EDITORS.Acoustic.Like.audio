// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { listen } from './audio/auralize.js';
import { ELEVATION_LAYER, seedOutline } from './acoustics/elevations.js';
import { middleOf } from './acoustics/inRoom.js';
import { paletteItems } from './acoustics/materials.js';
import { grabBag, roomById } from './acoustics/roomLibrary.js';
import { connectCad, METRES_PER_UNIT } from './cad/cadLink.js';
import { SITE } from './site.js';
import { createAcousticX } from './acoustx/acoustx.js';
import { makePoppable } from './ui/popout.js';
import { createMeterFold } from './ui/meterFold.js';
import { installSashes } from './ui/sashes.js';
import { watchForUpdates } from './ui/freshness.js';
import { REFINE_LABEL, createEngine } from './compute/engine.js';
import { createStore } from './model/store.js';
import { createInspector } from './ui/inspector.js';
import { createMeters } from './ui/meters.js';
import { createFaceView } from './views/faceView.js';
import { createWallBuilder } from './views/wallBuilder.js';
import { FACE_COLOURS } from './views/glyphs.js';
import { fieldScale } from './views/paint.js';
import { createPlanView } from './views/plan.js';
import { createView3d } from './views/view3d.js';
import { installPuck } from './ui/puck.js';
import { bimApi, loadSpeakerParts } from './acoustics/speakerLibrary.js';
import { SPEAKER_PARTS } from './acoustics/speakerParts.js';
import { showProblem } from './ui/problem.js';
import { startToolbar } from './main/toolbar.js';
import { startWidthLanes } from './main/widthLanes.js';
import { startRooms } from './main/rooms.js';
import { startLayers } from './main/layers.js';
import { startTour } from './main/tour.js';
import { startSessions } from './main/sessions.js';
import { startWizard } from './main/wizard.js';

const CEILING_LAYER = 'Ceiling';

/**
 * ACOUSTICS.LIKE.AUDIO
 *
 * A softapp built on CAD.Like.audio: the CAD is the plan, live in an iframe,
 * and everything acoustic is laid over and around it — speakers and mics, six
 * drawings of the room with its sound field painted on each surface, a 3-D
 * cut-away, and a meter bridge for whatever the selected mic hears.
 *
 * The wiring is one loop: the CAD bridge and the inspector write the store;
 * the store tells the engine; the engine's answer redraws every view.
 */

// what this app takes in, puts out and lets you control: the ? button (F1), drawn by the vendored APKSoftapp client
globalThis.APKSoftapp?.describe({
  name: 'Acoustics.Like.audio',
  does: 'Room acoustics over a live CAD plan: speakers, mics and furniture in the room, the sound field painted on the plan, ceiling, four elevations and a 3-D cut-away, and a meter bridge for the selected mic.',
  inputs: [
    { name: 'Room drawing', from: 'the CAD in the plan tile (host bridge cad.like.audio/host@1): walls, rooms, patches, Virtual Mirror' },
    { name: 'Project', from: '📂 Open project: a .acoustic-session.json saved here, its .ifc twin, or an architect\'s IFC room (IfcSpace + walls/slabs, IFC4 or IFC4X3)', kind: 'file' },
    { name: 'Floor plan', from: '📐 Open floor plan: a .dxf (becomes the drawing) or an image (traced over)', kind: 'file' },
    { name: 'Song', from: '🎵 Song: any audio file the browser plays (WAV, MP3, FLAC...)', kind: 'file' },
    { name: 'Measured impulse response', from: 'Inspector: a WAV from REW or a sweep tool', kind: 'file' },
    { name: 'Rack parts', from: 'the BIM library at /api/bim/parts (rack gear; absent on a static host, then typed by hand)' },
    { name: 'Speaker parts', from: 'the BIM library: GET /api/bim/parts/<id> gives each box its figures, /parts/<id>.ifc its IFC type in the saved room (absent on a static host, then the same parts as speakerParts.js holds them, written from the library)', kind: 'http' },
  ],
  outputs: [
    { name: 'Project', to: '💾 Save (Ctrl+S): <drawing>.acoustic-session.json and its .acoustic-session.ifc twin (IFC4X3_ADD2, mm), both or neither, into a folder picked once (Save Model) or as downloads; the CAD saves the drawing itself', kind: 'file' },
    { name: 'Marks, furniture and finishes', to: 'the CAD drawing, on their own layers' },
    { name: 'Overlay JSON / CSV schedules / meter PNG and CSV', to: 'downloads from the Inspector and each meter', kind: 'file' },
    { name: 'Tour video', to: 'a window of its own, saved as a video' },
    { name: 'Audition', to: 'the speakers: the song or noise through the monitor controller' },
  ],
  controls: [
    { name: 'Wizard', how: 'room, what is in it, the system, the walls, then what you want to know' },
    { name: 'Room library / dice', how: 'draw a room shape into the CAD' },
    { name: 'CAD / Walls / Speaker / Mic modes', how: 'click the plan to place or work walls (Esc back to CAD; Shift keeps placing)' },
    { name: 'Speaker sets A B C', how: 'pick an arrangement and Place it around the mix seat' },
    { name: 'Furniture', how: 'arm a piece, then click the plan where it goes' },
    { name: 'Views / ray tracing / method', how: 'six views, 3-D, one wall; trace on or off; wave or energy' },
    { name: 'Sweep / Tour / Song', how: 'sweep the frequency, film every view, or let a song drive it' },
    { name: 'Monitor', how: 'set, volume, dim, mute, per-speaker mute / solo / polarity / trim, noise, calibration' },
    { name: 'Undo / Redo', how: 'Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y' },
    { name: '⇱ on any tile', how: 'give it a window of its own; ⇲ Dock brings it back' },
  ],
  problems: ['bad_json', 'bad_input', 'file_unreadable', 'timeout', 'permission_denied', 'storage_full', 'script_error'],
});

// every preset box is a BIM library part: read them once, so ＋ Speaker places the part's own figures
// (acoustics/speakerLibrary.js); a host with no library answers the health probe with nothing, and speakerParts.js's copy of the parts holds
const bimLibraryUp = fetch(`${bimApi()}/health`, { headers: { Accept: 'application/json' } }).then((r) => r.ok, () => false);
bimLibraryUp.then((up) => up && loadSpeakerParts(Object.values(SPEAKER_PARTS).map((p) => p.part)));

const store = createStore();
const iframe = document.getElementById('cad');
// where the CAD is comes from the one config point (site.js); the fragment is the host bridge's own
iframe.setAttribute('src', `${SITE.cad}#/drawing?host=acoustic`);
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
    // a sweep frame painted ahead: only the response chart's markers and the cache strip change
    meters.render();
    showCache();
    return;
  }
  if (phase === 'refining') {
    status.textContent = `⟳ refining — cells ${REFINE_LABEL[out.refining]}…`;
    return;
  }
  out.scale = fieldScale(out.values, store.state.settings.rangeDb, scaleZoom);
  showCache();
  if (phase === 'room') {
    status.textContent = '⟳ computing…';
    renderGeometry();
    return;
  }
  status.textContent = out.error ? '⚠ field error — see console' : `${out.room.walls.length} walls · ${store.state.speakers.length} spk · ${store.state.mics.length} mic${out.virtual ? ' · virtual room' : ''}${out.level ? ` · cells ${REFINE_LABEL[out.level]}` : ''}`;
  if (out.error) {
    console.error(out.error);
    showProblem(out.error, { subject: 'Sound field', fix: ['Undo the last change (Ctrl+Z): a wall or room the field cannot solve is the usual cause.'] });
  }
  // nothing ever stands outside the rooms: whatever left one (a layout, a carried array, a smaller plan) comes back, and this runs again
  if (out.room && store.keepInside(out.room, (out.rooms ?? []).map((l) => l.poly))) return;
  // the mix seat is always placed: none (a new room, or it was deleted) puts one in the middle of the room, facing the front
  if (out.room && store.ensureMix({ ...middleOf(out.room), z: 1.2 }, store.state.settings.frontDeg)) return;
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
 * something to drag into a slope or a vault. The CAD zooms to that sheet's
 * lines by itself — every drawing is a model space of its own on one sheet,
 * so a `fit` here would show them all instead of the one asked for.
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
    return;
  }
  const drawn = engine.out.elevations?.some((e) => e.face === sheet);
  const seed = !drawn && room ? seedOutline(room, sheet).map((p) => [+(p.x / k).toFixed(4), +(p.y / k).toFixed(4)]) : undefined;
  // the CAD zooms to the sheet's own lines; a `fit` after it would zoom back out to every drawing on the sheet
  cad.link.sheet(ELEVATION_LAYER[sheet], { color: FACE_COLOURS[sheet], seed });
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
// the SpaceMouse, posted in by the OS shell: flies the 3-D room or an elevation, or goes on to the CAD (ui/puck.js)
installPuck({ views, room: view3d, faces: Object.fromEntries(faces.map((f) => [f.tile.dataset.face, f])), iframe, cadDocked: () => !cad.link?.popped });
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
/** Is this tile on a screen — laid out, here or in a window of its own? A hidden one is not drawn; it draws when it shows. */
const onScreen = (el) => Boolean(el && el.getClientRects().length && el.clientWidth && el.clientHeight);
function renderGeometry() {
  relayoutViews();
  plan.render();
  // lazy: only the views that can be seen; the frames they would show stay in the cache for when they can
  for (const f of faces) if (onScreen(f.tile)) f.render();
  if (onScreen(document.querySelector('.tile.t3d canvas'))) view3d.render();
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
 * opens the wizard (ui/wizard.js) — or, with the wizard turned off at start, gets
 * a room by the dice, furnished and seated, so there is a room to hear at once.
 */
let opened = false;
const drawnNothing = (g) => !g?.walls?.length && !g?.rooms?.length;
function opening(geometry) {
  opened = true;
  store.setSettings({ view: '3d', method: 'modal' });
  if (!drawnNothing(geometry)) return;
  if (wizard.atStart()) wizard.open();
  else drawRoom(grabBag(store.state.settings.lastLibraryRoom));
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
    // the same drawing said again (the popped CAD answering cadLink's ping): nothing to recompute
    if (msg.fileName === store.state.fileName && JSON.stringify(msg) === JSON.stringify(store.state.cad.geometry)) return;
    const first = !store.state.cad.geometry || msg.fileName !== store.state.fileName;
    store.setCad({ geometry: msg, connected: true }, 'geometry');
    if (first && msg.fileName !== store.state.fileName) store.load(msg.fileName);
    if (msg.fileName && msg.fileName === pendingPlan) startPlan();
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
  // popped: the CAD window answering, or gone quiet — the plan draws its walls, or says there is no CAD
  onLive: () => plan.render(),
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

/** A floor plan opened and not yet back from the CAD (main/sessions.js openFloorPlan; main/rooms.js startPlan reads it). */
let pendingPlan = null;
// ── the shared context the parts read (js/main/toolbar.js, js/main/widthLanes.js, js/main/rooms.js, js/main/layers.js, js/main/tour.js, js/main/sessions.js, js/main/wizard.js) ──
const app = {
  get acx() {
    return acx;
  },
  get askToPop() {
    return askToPop;
  },
  get bimLibraryUp() {
    return bimLibraryUp;
  },
  get cad() {
    return cad;
  },
  get CEILING_LAYER() {
    return CEILING_LAYER;
  },
  get drawnNothing() {
    return drawnNothing;
  },
  get engine() {
    return engine;
  },
  get inPlan() {
    return inPlan;
  },
  get inspector() {
    return inspector;
  },
  get jumpTo() {
    return jumpTo;
  },
  get meters() {
    return meters;
  },
  get pendingPlan() {
    return pendingPlan;
  },
  set pendingPlan(v) {
    pendingPlan = v;
  },
  get renderGeometry() {
    return renderGeometry;
  },
  get scaleZoom() {
    return scaleZoom;
  },
  set scaleZoom(v) {
    scaleZoom = v;
  },
  get status() {
    return status;
  },
  get store() {
    return store;
  },
  get views() {
    return views;
  },
};
// the parts' functions main.js calls, hoisted as its own were: each looks its part up when called
function drawRoom(...a) {
  return app.drawRoom(...a);
}
function findWidth(...a) {
  return app.findWidth(...a);
}
function followConsole(...a) {
  return app.followConsole(...a);
}
function moveArray(...a) {
  return app.moveArray(...a);
}
function pickDrawnRoom(...a) {
  return app.pickDrawnRoom(...a);
}
function placePendingLayout(...a) {
  return app.placePendingLayout(...a);
}
function showCache(...a) {
  return app.showCache(...a);
}
function startPlan(...a) {
  return app.startPlan(...a);
}
function syncFieldScale(...a) {
  return app.syncFieldScale(...a);
}
function syncMarks(...a) {
  return app.syncMarks(...a);
}
function syncToolbar(...a) {
  return app.syncToolbar(...a);
}
function syncWidthTicks(...a) {
  return app.syncWidthTicks(...a);
}
function wallInputs(...a) {
  return app.wallInputs(...a);
}

// ------------------------------------------------------------------ toolbar, the field scale, keys (main/toolbar.js)
Object.assign(app, startToolbar(app));

// ------------------------------------------------------------------ the frequency slider, the speaker arrangements and their width lanes (main/widthLanes.js)
Object.assign(app, startWidthLanes(app));
const { monitor } = app;

// ------------------------------------------------------------------ furniture and the room library (main/rooms.js)
Object.assign(app, startRooms(app));

// ------------------------------------------------------------------ what this app draws into the CAD file (main/layers.js)
Object.assign(app, startLayers(app));

// ------------------------------------------------------------------ sweep and tour (main/tour.js)
Object.assign(app, startTour(app));

// ------------------------------------------------------------------ sessions (main/sessions.js)
Object.assign(app, startSessions(app));

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
const acx = createAcousticX({
  store,
  engine,
  mount: document.getElementById('acx'),
  // the Modal Response optimiser's "Use these": a shoebox of those dimensions, drawn like any library room
  onDrawRoom: ({ L, W, H }) => drawRoom({ id: 'optimised', group: 'Control rooms', name: `Optimised ${W.toFixed(2)} × ${L.toFixed(2)} × ${H.toFixed(2)} m`, h: H, poly: [[-W / 2, 0], [W / 2, 0], [W / 2, L], [-W / 2, L]] }),
});

// ------------------------------------------------------------------ the wizard: room, things, system, walls, go (main/wizard.js)
Object.assign(app, startWizard(app));
const { wizard } = app;

// `?debug` hands the console the store and engine; nothing reads them otherwise.
if (new URLSearchParams(location.search).has('debug')) window.acoustic = { store, engine };

store.load(null);
engine.update();

// a newer copy of this app on the server: a banner offers the refresh (ui/freshness.js)
watchForUpdates({ banner: document.getElementById('updated') });
