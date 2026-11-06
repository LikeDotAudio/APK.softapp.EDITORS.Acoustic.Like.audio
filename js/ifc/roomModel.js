// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE ROOM MODEL — what the .ifc twin holds, in mm (acoustics-2, -7).
 *
 * The app works in metres (store.js) and the CAD in its own units; the IFC
 * file is in mm, the house unit. This is the one place the two meet: a plain,
 * canonical object made from the CAD's last `geometry` + `mirror` and the
 * overlay (store.exportDoc), every length in mm to 0.1 mm, that roomToIfc
 * writes and ifcToRoom reads back EQUAL (tests/ifc.test.mjs). Nothing inside
 * the app moves to mm: the conversion happens here, at the boundary, both ways
 * (sessionFromModel is the way back).
 *
 *   {
 *     format: 'acoustic.like.audio/room@1', fileName,
 *     frontDeg, faceMaterials {floor…right},
 *     spaces:     [{ roomId, layerId, name, points [[x,y] mm], height mm, main, virtual? }]
 *     elevations: [{ roomId, layerId, name, points }]          the CAD's elevation loops, sheet mm
 *     walls:      [{ key, a, b, face, material?, note? }]      the main space's surfaces (buildRoom)
 *     materials:  { id: { id, name, category, alpha[6], alpha9?[9], scatter[6], tl, color, source? } }
 *     patches:    [{ id, paletteId, layerId, points, at?, rotation?, host? }]   what is painted, sheet mm
 *     layers:     [{ id, name, color, finish? }]
 *     mirror:     { enabled, x, axes } mm | null,  symmetry { sides, front, back }
 *     speakers / mics / furniture: the overlay's own, x/y/z in mm
 *     locked, settings (the rest of the overlay's settings, minus how the room is looked at),
 *     results:    null | { method, band, bands, sabine[], eyring[], mics { id: { EDT, T20, … } }, modelHash }
 *     ifc:        GlobalIds kept from an imported file { roleKey: gid }
 *   }
 */

import { BANDS, BANDS_9 } from '../acoustics/bands.js';
import { lookup } from '../acoustics/materials.js';
import { buildRoom } from '../acoustics/room.js';
import { METRES_PER_UNIT } from '../cad/cadLink.js';
import { elevationFaceOf } from '../acoustics/elevations.js';
import { loopsFromCad, openPlanFromCad } from '../compute/engine.js';
import { sha1 } from '../../vendor/apk-contracts/apk-ifc.js';
import { bearing, metres, mm, round6, sig } from './placement.js';

export const ROOM_FORMAT = 'acoustic.like.audio/room@1';

/** How the room is looked at, not what it is: never in the twin (store.js VIEW_KEYS, the audit's stays-non-IFC list). */
export const VIEW_KEYS = ['freq', 'band', 'view', 'show', 'rangeDb', 'sliceHeight', 'aWeight', 'monitor'];

const FACES = ['floor', 'ceiling', 'front', 'back', 'left', 'right'];

/** A catalogue material as the twin carries it — the acoustic facts, not the catalogue's bookkeeping. */
export function materialFacts(mat) {
  if (!mat) return null;
  return {
    id: mat.id,
    name: mat.name,
    category: mat.category,
    alpha: mat.alpha.map(sig),
    ...(mat.alpha9 ? { alpha9: mat.alpha9.map(sig) } : {}),
    scatter: mat.scatter.map(sig),
    tl: sig(mat.tl),
    ...(mat.color ? { color: mat.color } : {}),
    ...(mat.source ? { source: mat.source } : {}),
  };
}

/** A CAD point (`kM` metres per CAD unit) → [x, y] mm. */
const xy = (kM) => ([x, y]) => [mm(x * kM), mm(y * kM)];

/** Drop what JSON would drop (undefined, functions), so the model compares as the file reads back. */
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** A device as the twin holds it: x/y/z in mm, numbers to 12 figures. */
function device(d) {
  const out = {};
  for (const [k, v] of Object.entries(plain(d))) {
    if ((k === 'x' || k === 'y' || k === 'z') && typeof v === 'number') out[k] = mm(v);
    else if (typeof v === 'number') out[k] = sig(v);
    else out[k] = v;
  }
  // an aim is a bearing in [0, 360) to a millionth of a degree: what the placement's two vectors give back
  if (typeof out.aim === 'number' && typeof out.tilt === 'number') {
    out.aim = round6(bearing(out.aim));
    out.tilt = round6(out.tilt);
  }
  return out;
}

/** The main room as the engine picks it (engine.js currentRoom): the chosen loop, else the open plan, else the virtual box. */
function mainLoop(geometry, settings) {
  const loops = loopsFromCad(geometry);
  const plans = loops.filter((r) => !r.face);
  const picked = plans.find((r) => r.id === settings.roomId) ?? plans[0];
  if (picked) return { kind: 'loop', loop: picked, plans, loops };
  const open = openPlanFromCad(geometry, settings.maxOpening ?? 4);
  if (open) return { kind: 'open', open, plans, loops };
  return { kind: 'virtual', plans, loops };
}

/** Sorted-key JSON: the same text for the same model however its objects were built. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** The model's hash with its results and kept ids left out — a stored result whose hash differs is stale. */
export function modelHash(model) {
  const { results, ifc, ...rest } = model;
  const bytes = new TextEncoder().encode(canonical(rest));
  return Array.from(sha1(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The room model from the app's state. `geometry`/`mirror`: the CAD's last
 * host@1 messages (CAD units); `overlay`: store.exportDoc() (metres);
 * `results`: resultsOf(engine.out) when the user includes them, else null.
 */
export function roomModel({ geometry = null, mirror = null, overlay, results = null }) {
  const doc = plain(overlay ?? {});
  const settings = doc.settings ?? {};
  const g = geometry ?? { units: 'm', rooms: [], walls: [], layers: [], patches: [] };
  const k = METRES_PER_UNIT[g.units] ?? 1; // metres per CAD unit
  const layerName = new Map((g.layers ?? []).map((l) => [l.id, l.name]));
  const main = mainLoop(g, settings);
  const height = (layerId, isMain) => mm(isMain ? settings.roomHeight ?? 3 : settings.roomHeights?.[layerId] ?? settings.roomHeight ?? 3);

  // spaces: every plan loop on the sheet, the room first
  const spaces = [];
  const rawLoop = (id) => (g.rooms ?? []).find((r) => r.id === id);
  if (main.kind === 'virtual') {
    const { w = 5, l = 7 } = settings.virtualRoom ?? {};
    spaces.push({ roomId: null, layerId: null, name: 'Virtual room', points: [[0, 0], [mm(w), 0], [mm(w), mm(l)], [0, mm(l)]], height: height(null, true), main: true, virtual: true });
  } else if (main.kind === 'open') {
    spaces.push({ roomId: null, layerId: main.open.layerId, name: layerName.get(main.open.layerId) ?? String(main.open.layerId), points: main.open.poly.map((p) => [mm(p.x), mm(p.y)]), height: height(main.open.layerId, true), main: true, open: true });
  }
  for (const r of main.plans) {
    const isMain = main.kind === 'loop' && r === main.loop;
    const s = { roomId: r.id, layerId: r.layerId, name: layerName.get(r.layerId) ?? String(r.layerId), points: rawLoop(r.id).points.map(xy(k)), height: height(r.layerId, isMain), main: isMain };
    if (isMain) spaces.unshift(s);
    else spaces.push(s);
  }
  const elevations = main.loops.filter((r) => r.face).map((r) => ({ roomId: r.id, layerId: r.layerId, name: layerName.get(r.layerId) ?? String(r.layerId), points: rawLoop(r.id).points.map(xy(k)) }));

  // the main space's surfaces, as buildRoom sees them
  const room = spaces.length
    ? buildRoom(spaces[0].points.map(([x, y]) => ({ x: x / 1000, y: y / 1000 })), { ...settings, roomHeight: spaces[0].height / 1000, frontDeg: settings.frontDeg ?? 90, faceMaterials: { ...FACE_DEFAULTS, ...settings.faceMaterials }, walls: settings.walls ?? {}, isolation: settings.isolation ?? {} })
    : null;
  const toldWalls = settings.walls ?? {};
  const walls = (room?.walls ?? []).map((w) => ({
    key: w.key,
    a: [mm(w.a.x), mm(w.a.y)],
    b: [mm(w.b.x), mm(w.b.y)],
    face: w.face,
    ...(toldWalls[w.key]?.material ? { material: toldWalls[w.key].material } : {}),
    ...(toldWalls[w.key]?.note ? { note: toldWalls[w.key].note } : {}),
  }));

  const faceMaterials = { ...FACE_DEFAULTS, ...settings.faceMaterials };
  const patches = (g.patches ?? [])
    .filter((p) => p && Array.isArray(p.points) && p.points.length >= 3)
    .map((p) => ({
      id: String(p.id),
      paletteId: p.paletteId,
      layerId: p.layerId,
      points: p.points.map(xy(k)),
      ...(Array.isArray(p.at) ? { at: xy(k)(p.at), rotation: sig(p.rotation ?? 0) } : {}),
      ...(p.host !== undefined ? { host: plain(p.host) } : {}),
    }));

  // every material the room names, as the catalogue has it (a product names its material)
  const used = new Set([...FACES.map((f) => faceMaterials[f]), ...walls.map((w) => w.material).filter(Boolean), ...patches.map((p) => p.paletteId), ...(doc.furniture ?? []).map((f) => f.paletteId)]);
  const materials = {};
  for (const id of [...used].filter(Boolean).sort()) {
    const mat = lookup(id);
    if (mat && !materials[mat.id]) materials[mat.id] = materialFacts(mat);
  }

  // what the twin keeps of the settings as they are: all but the view, and all but what it writes in its own words
  const rest = {};
  for (const [key, v] of Object.entries(settings)) {
    if (VIEW_KEYS.includes(key) || ['roomHeight', 'frontDeg', 'faceMaterials', 'symmetry', 'roomId', 'ifc'].includes(key)) continue;
    rest[key] = v;
  }
  // a wall told something that is no wall of this room any more, and heights of loops not on the sheet, stay as they were
  const wallKeys = new Set(walls.map((w) => w.key));
  const leftWalls = Object.fromEntries(Object.entries(toldWalls).filter(([key]) => !wallKeys.has(key)));
  rest.walls = leftWalls;
  const spaceLayers = new Set(spaces.filter((s) => !s.main).map((s) => s.layerId));
  rest.roomHeights = Object.fromEntries(Object.entries(settings.roomHeights ?? {}).filter(([id]) => !spaceLayers.has(id)));
  if (!Object.keys(rest.walls).length) delete rest.walls;
  if (!Object.keys(rest.roomHeights).length) delete rest.roomHeights;

  const model = {
    format: ROOM_FORMAT,
    fileName: doc.fileName ?? g.fileName ?? null,
    frontDeg: sig(settings.frontDeg ?? 90),
    faceMaterials,
    spaces,
    elevations,
    walls,
    materials,
    patches,
    layers: (g.layers ?? []).map((l) => plain(l)),
    mirror: mirror ? { enabled: Boolean(mirror.enabled), x: mm((mirror.x ?? 0) * k), axes: (mirror.axes ?? []).map((a) => mm(a * k)) } : null,
    symmetry: { sides: 'off', front: 'off', back: 'off', ...settings.symmetry },
    speakers: (doc.speakers ?? []).map(device),
    mics: (doc.mics ?? []).map(device),
    furniture: (doc.furniture ?? []).map(device),
    locked: plain(doc.locked ?? []),
    settings: rest,
    results: null,
    ifc: plain(settings.ifc ?? {}),
  };
  if (results) model.results = cleanResults(results, model);
  return model;
}

const FACE_DEFAULTS = { floor: 'wood-floor', ceiling: 'acoustic-tile', front: 'gypsum', back: 'absorber-100', left: 'gypsum', right: 'gypsum' };

/** Results as the twin keeps them: finite numbers only, 12 figures, and the hash of the model they were computed on. */
function cleanResults(r, model) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? sig(v) : undefined);
  const cell = (v) => num(v) ?? null;
  const present = new Set(model.mics.map((m) => m.id));
  const mics = {};
  for (const [id, m] of Object.entries(r.mics ?? {})) {
    if (!present.has(id)) continue;
    const row = {};
    for (const key of ['EDT', 'T20', 'T30', 'C50', 'C80', 'D50', 'Ts', 'SPL', 'STI']) if (num(m?.[key]) !== undefined) row[key] = num(m[key]);
    if (Object.keys(row).length) mics[id] = row;
  }
  return {
    method: r.method ?? null,
    band: num(r.band) ?? null,
    bands: (r.bands ?? BANDS).map(sig),
    sabine: (r.bands ?? BANDS).map((_, i) => cell(r.sabine?.[i])),
    eyring: (r.bands ?? BANDS).map((_, i) => cell(r.eyring?.[i])),
    mics,
    modelHash: modelHash(model),
  };
}

/**
 * What the engine last computed, as roomModel takes it: RT60 per band from
 * the room, and each mic's ISO 3382 figures (analysis.js iso3382) at the band
 * the meters were read in. Always recomputed on open — never an input.
 */
export function resultsOf(out, settings) {
  if (!out?.room?.perBand) return null;
  const mics = {};
  for (const [id, rep] of Object.entries(out.reports ?? {})) if (rep?.iso) mics[id] = { ...rep.iso };
  return {
    method: settings?.method ?? null,
    band: BANDS[settings?.band ?? 2] ?? null,
    bands: BANDS,
    sabine: out.room.perBand.map((b) => b.sabine),
    eyring: out.room.perBand.map((b) => b.eyring),
    mics,
  };
}

/**
 * The way back: a room model as the app takes it — the overlay
 * (acoustic.like.audio@1, metres) and what to hand the CAD: each space's loop
 * as a `sheet` seed on its layer (CAD units), the elevations likewise, the
 * products as `place` items, and the mirror axis.
 */
export function sessionFromModel(model, units = 'mm') {
  const k = 1000 * (METRES_PER_UNIT[units] ?? 0.001); // mm per CAD unit
  const cadXY = ([x, y]) => [sig(x / k), sig(y / k)];
  const back = (d) => {
    const out = { ...d };
    for (const c of ['x', 'y', 'z']) if (typeof out[c] === 'number') out[c] = metres(out[c]);
    return out;
  };
  const main = model.spaces.find((s) => s.main) ?? null;
  const settings = {
    ...model.settings,
    frontDeg: model.frontDeg,
    faceMaterials: { ...model.faceMaterials },
    symmetry: { ...model.symmetry },
    ...(main ? { roomHeight: metres(main.height) } : {}),
    roomId: main?.roomId ?? null,
  };
  const walls = { ...(model.settings.walls ?? {}) };
  for (const w of model.walls) {
    if (!w.material && !w.note) continue;
    walls[w.key] = { ...(w.material ? { material: w.material } : {}), ...(w.note ? { note: w.note } : {}) };
  }
  if (Object.keys(walls).length) settings.walls = walls;
  const heights = { ...(model.settings.roomHeights ?? {}) };
  for (const s of model.spaces) if (!s.main && s.layerId != null) heights[s.layerId] = metres(s.height);
  if (Object.keys(heights).length) settings.roomHeights = heights;
  if (model.ifc && Object.keys(model.ifc).length) settings.ifc = { ...model.ifc };
  const overlay = {
    format: 'acoustic.like.audio@1',
    fileName: model.fileName,
    settings,
    speakers: model.speakers.map(back),
    mics: model.mics.map(back),
    furniture: model.furniture.map(back),
    locked: [...model.locked],
  };
  const layerName = (id, fallback) => model.layers.find((l) => l.id === id)?.name ?? fallback ?? String(id);
  const cad = {
    sheets: [
      ...model.spaces.filter((s) => !s.virtual && s.points.length >= 3).map((s) => ({ layer: layerName(s.layerId, s.name), seed: s.points.map(cadXY), main: Boolean(s.main) })),
      ...model.elevations.map((e) => ({ layer: layerName(e.layerId, e.name), seed: e.points.map(cadXY), main: false })),
    ],
    place: model.patches.filter((p) => p.at && !lookupIsFinish(p.paletteId)).map((p) => ({ layer: layerName(p.layerId), item: { paletteId: p.paletteId, at: cadXY(p.at), rotation: p.rotation ?? 0 } })),
    fills: model.patches.filter((p) => !p.at || lookupIsFinish(p.paletteId)).length,
    mirror: model.mirror ? { x: sig(model.mirror.x / k), enabled: model.mirror.enabled } : null,
    // an imported room whose walls never closed: its lines, for the CAD to draw and the user to close
    lines: (model.lines ?? []).map((l) => ({ layer: l.layer, a: cadXY(l.a), b: cadXY(l.b) })),
  };
  return { fileName: model.fileName, overlay, cad };
}

/** A palette id that is an area finish (a material), not a product with a size. */
function lookupIsFinish(id) {
  const mat = lookup(id);
  return Boolean(mat && mat.id === id);
}

export { BANDS, BANDS_9, elevationFaceOf };
