// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * OPEN .IFC (acoustics-5) — a room model (roomModel.js) from an IFC file.
 *
 * Our own file (it carries APK_AcousticSession) reads back exactly what
 * roomToIfc wrote: no geometry kernel is needed, because the extruded loops,
 * the wall lines and the APK_ sets carry everything. ifcToRoom(roomToIfc(m))
 * equals m (tests/ifc.test.mjs).
 *
 * An architect's file (Revit, ArchiCAD, Bonsai, IfcOpenShell — IFC4 or
 * IFC4X3) is read for what a room needs, with the contracts' STEP reader:
 *   each IfcSpace → a loop: its extruded footprint (IfcArbitraryClosedProfileDef
 *     on an IfcPolyline / IfcIndexedPolyCurve, or an IfcRectangleProfileDef), or
 *     else its FootPrint curve, or else the bounding walls' axis lines chained
 *     into a loop; carried through every IfcLocalPlacement to the world, in mm
 *     whatever the file's length unit; its height from Qto_SpaceBaseQuantities
 *     or the extrusion
 *   the walls, slab and ceiling that bound it → their materials: our
 *     APK_AcousticMaterial when it is there, else a catalogue material guessed
 *     by name — and every guess is listed in the report, never silent
 *   IfcAudioVisualAppliance SPEAKER / MICROPHONE → speakers and mics where they
 *     stand and aim, a BIM part named from the type when it looks like one
 * and the architect's GlobalIds are kept (model.ifc) so a re-save keeps them.
 * Walls that never close into a loop come back as `lines`, for the CAD to draw.
 */

import { parseStep, inverseIndex, schemaOf } from '../../vendor/apk-contracts/apk-ifc.js';
import { ALL_SPEAKER_PRESETS, presetForPart } from '../acoustics/devices.js';
import { lookup, MATERIALS } from '../acoustics/materials.js';
import { wallKey } from '../acoustics/wallChains.js';
import { BANDS, BANDS_9 } from '../acoustics/bands.js';
import { aimTilt, mm, sig } from './placement.js';
import { decodeProps, FURNITURE_TABLE, MIC_RESULT_TABLE, MIC_TABLE, SPEAKER_TABLE, SYMMETRY_TABLE } from './props.js';
import { materialFacts, modelHash, ROOM_FORMAT } from './roomModel.js';
import { keyOf } from './roomToIfc.js';

const FACES = ['floor', 'ceiling', 'front', 'back', 'left', 'right'];

// ---------------------------------------------------------------- the file

function open(text) {
  const f = parseStep(text);
  const inv = inverseIndex(f);
  const byType = new Map();
  for (const e of f.entities) {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type).push(e);
  }
  const all = (type) => byType.get(type) ?? [];
  const get = (v) => (v && v.kind === 'ref' ? f.byId.get(v.id) : undefined);
  const refs = (v) => (Array.isArray(v) ? v.map(get).filter(Boolean) : []);
  /** The entities of `type` whose argument `at` is (or lists) `e`. */
  const referrers = (e, type, at) =>
    (inv.get(e.id) ?? []).filter((r) => r.type === type && (Array.isArray(r.args[at]) ? r.args[at].some((x) => x?.id === e.id) : r.args[at]?.id === e.id));
  return { f, all, get, refs, referrers };
}

/** A STEP value as { value, measure }: typed values unwrapped, booleans as booleans, reals as numbers. */
function readValue(v) {
  if (v == null) return { value: null, measure: null };
  if (v.kind === 'typed') {
    const inner = readValue(v.value);
    return { value: inner.value, measure: v.type };
  }
  if (v.kind === 'real') return { value: v.value, measure: null };
  if (v.kind === 'enum') return { value: v.value === 'T' ? true : v.value === 'F' ? false : v.value, measure: null };
  if (Array.isArray(v)) return { value: v.map((x) => readValue(x).value), measure: v.length ? readValue(v[0]).measure : null };
  return { value: v, measure: null };
}

/** One property: { value, measure, unit? } — a list's values, a table's { x, y }. */
function readProperty(F, p) {
  const a = p.args;
  switch (p.type) {
    case 'IFCPROPERTYSINGLEVALUE': {
      const v = readValue(a[2]);
      const unit = F.get(a[3]);
      return { ...v, ...(unit ? { unit: unit.args[2] ?? unit.args[1]?.value } : {}) };
    }
    case 'IFCPROPERTYLISTVALUE':
    case 'IFCPROPERTYENUMERATEDVALUE': {
      const v = readValue(a[2] ?? []);
      return { value: v.value ?? [], measure: v.measure, list: true };
    }
    case 'IFCPROPERTYTABLEVALUE':
      return { value: { x: readValue(a[2] ?? []).value ?? [], y: readValue(a[3] ?? []).value ?? [] }, measure: 'TABLE' };
    default:
      if (p.type.startsWith('IFCQUANTITY')) return readValue(a[3]);
      return readValue(a[2]);
  }
}

function setProps(F, set) {
  const out = {};
  const list = set.type === 'IFCELEMENTQUANTITY' ? set.args[5] : set.type === 'IFCMATERIALPROPERTIES' ? set.args[2] : set.args[4];
  for (const p of F.refs(list)) if (typeof p.args[0] === 'string') out[p.args[0]] = readProperty(F, p);
  return out;
}

/** Every property and quantity set of an element: its type's first, its own on top. */
function psetsOf(F, e) {
  const out = {};
  const add = (set) => {
    if (set && typeof set.args[2] === 'string') out[set.args[2]] = { ...out[set.args[2]], ...setProps(F, set) };
  };
  for (const r of F.referrers(e, 'IFCRELDEFINESBYTYPE', 4)) for (const s of F.refs(F.get(r.args[5])?.args[5])) add(s);
  for (const r of F.referrers(e, 'IFCRELDEFINESBYPROPERTIES', 4)) {
    const def = r.args[5];
    for (const s of Array.isArray(def) ? F.refs(def) : [F.get(def)]) add(s);
  }
  return out;
}

const val = (props, name) => props?.[name]?.value;

// ---------------------------------------------------------------- placement and geometry

const I = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const norm = (v) => {
  const n = Math.hypot(...v) || 1;
  return v.map((c) => c / n);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const apply = (M, p) => [0, 1, 2].map((i) => M.o[i] + M.x[i] * p[0] + M.y[i] * (p[1] ?? 0) + M.z[i] * (p[2] ?? 0));
const applyDir = (M, d) => [0, 1, 2].map((i) => M.x[i] * d[0] + M.y[i] * d[1] + M.z[i] * d[2]);
const compose = (A, B) => ({ o: apply(A, B.o), x: applyDir(A, B.x), y: applyDir(A, B.y), z: applyDir(A, B.z) });

function coords(F, pt) {
  const c = readValue(pt?.args[0] ?? []).value ?? [];
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
}

/** An IfcAxis2Placement3D / 2D as a frame, lengths scaled to mm. */
function axisFrame(F, ap, k) {
  if (!ap) return I;
  const o = coords(F, F.get(ap.args[0])).map((c) => c * k);
  if (ap.type === 'IFCAXIS2PLACEMENT2D') {
    const rd = F.get(ap.args[1]);
    const x = norm(rd ? [...coords(F, rd).slice(0, 2), 0] : [1, 0, 0]);
    return { o, x, y: cross([0, 0, 1], x), z: [0, 0, 1] };
  }
  const ax = F.get(ap.args[1]);
  const rd = F.get(ap.args[2]);
  const z = norm(ax ? coords(F, ax) : [0, 0, 1]);
  const r0 = rd ? coords(F, rd) : Math.abs(z[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  const dot = r0[0] * z[0] + r0[1] * z[1] + r0[2] * z[2];
  const x = norm(r0.map((c, i) => c - dot * z[i]));
  return { o, x, y: cross(z, x), z };
}

/** The world frame of an IfcObjectPlacement, through every IfcLocalPlacement it is relative to. */
function placementFrame(F, pl, k, warn, depth = 0) {
  if (!pl || depth > 64) return I;
  if (pl.type !== 'IFCLOCALPLACEMENT') {
    warn(`${pl.type} is not read; taken as the origin`);
    return I;
  }
  const parent = placementFrame(F, F.get(pl.args[0]), k, warn, depth + 1);
  return compose(parent, axisFrame(F, F.get(pl.args[1]), k));
}

/** The 2D points of a curve (IfcPolyline, IfcIndexedPolyCurve's point list), in its own frame, unscaled. */
function curvePoints(F, c) {
  if (!c) return null;
  if (c.type === 'IFCPOLYLINE') return F.refs(c.args[0]).map((p) => coords(F, p));
  if (c.type === 'IFCINDEXEDPOLYCURVE') {
    const list = F.get(c.args[0]);
    const xy = readValue(list?.args[0] ?? []).value ?? [];
    return xy.map((p) => [p[0], p[1], p[2] ?? 0]);
  }
  return null;
}

/** A closed ring with its repeated last point dropped. */
const ring = (pts) => (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] ? pts.slice(0, -1) : pts);

/** The length unit of the file, as mm per unit. */
function lengthScale(F) {
  const ua = F.all('IFCUNITASSIGNMENT')[0];
  for (const u of F.refs(ua?.args[0])) {
    if (u.args[1]?.value !== 'LENGTHUNIT') continue;
    if (u.type === 'IFCSIUNIT') return { MILLI: 1, CENTI: 10, DECI: 100, KILO: 1e6 }[u.args[2]?.value] ?? 1000;
    if (u.type === 'IFCCONVERSIONBASEDUNIT') {
      const name = String(u.args[2] ?? '').toUpperCase();
      if (name === 'FOOT') return 304.8;
      if (name === 'INCH') return 25.4;
      const mwu = F.get(u.args[3]);
      const factor = readValue(mwu?.args[0]).value;
      const base = F.get(mwu?.args[1]);
      return typeof factor === 'number' ? factor * ({ MILLI: 1, CENTI: 10 }[base?.args[2]?.value] ?? 1000) : 1000;
    }
  }
  return 1000; // IFC's default is the metre
}

/** The shape representations of a product, by RepresentationIdentifier. */
function representations(F, product) {
  const pds = F.get(product.args[6]);
  return F.refs(pds?.args[2]).map((r) => ({ id: r.args[1], type: r.args[2], items: F.refs(r.args[3]) }));
}

/** A space's footprint (mm, world) and extrusion depth, from its Body or FootPrint, or null. */
function footprint(F, space, k, warn) {
  const M = placementFrame(F, F.get(space.args[5]), k, warn);
  for (const rep of representations(F, space)) {
    for (const item of rep.items) {
      if (item.type === 'IFCEXTRUDEDAREASOLID') {
        const prof = F.get(item.args[0]);
        const P = compose(M, axisFrame(F, F.get(item.args[1]), k));
        let pts = null;
        if (prof?.type === 'IFCARBITRARYCLOSEDPROFILEDEF') pts = curvePoints(F, F.get(prof.args[2]));
        else if (prof?.type === 'IFCRECTANGLEPROFILEDEF') {
          const X = readValue(prof.args[3]).value / 2;
          const Y = readValue(prof.args[4]).value / 2;
          const Q = axisFrame(F, F.get(prof.args[2]), 1);
          pts = [[-X, -Y], [X, -Y], [X, Y], [-X, Y]].map((p) => apply(Q, p));
        }
        if (!pts) continue;
        const loop = ring(pts).map((p) => apply(P, p.map((c) => c * k)));
        const dz = coords(F, F.get(item.args[2]));
        const depth = readValue(item.args[3]).value * k * (Math.abs(dz[2]) || 1);
        return { loop, depth, zFloor: Math.min(...loop.map((p) => p[2])) };
      }
    }
    if (rep.id === 'FootPrint') {
      const pts = curvePoints(F, rep.items[0]);
      if (pts) return { loop: ring(pts).map((p) => apply(M, p.map((c) => c * k))), depth: null, zFloor: M.o[2] };
    }
  }
  return null;
}

/** A wall's plan line (mm, world): its Axis or FootPrint curve, else the long axis of a rectangular extrusion. */
function wallLine(F, wall, k, warn) {
  const M = placementFrame(F, F.get(wall.args[5]), k, warn);
  const reps = representations(F, wall);
  for (const rep of reps) {
    if (rep.id !== 'Axis' && rep.id !== 'FootPrint') continue;
    const pts = curvePoints(F, rep.items[0]);
    if (pts && pts.length >= 2) return [apply(M, pts[0].map((c) => c * k)), apply(M, pts.at(-1).map((c) => c * k))];
  }
  for (const rep of reps) {
    for (const item of rep.items) {
      const prof = item.type === 'IFCEXTRUDEDAREASOLID' ? F.get(item.args[0]) : null;
      if (prof?.type !== 'IFCRECTANGLEPROFILEDEF') continue;
      const P = compose(M, axisFrame(F, F.get(item.args[1]), k));
      const Q = axisFrame(F, F.get(prof.args[2]), 1);
      const X = readValue(prof.args[3]).value / 2;
      return [apply(P, apply(Q, [-X, 0]).map((c) => c * k)), apply(P, apply(Q, [X, 0]).map((c) => c * k))];
    }
  }
  return null;
}

/** Wall lines chained end to end into a closed loop (within 5 mm), or null. */
function chain(lines) {
  if (lines.length < 3) return null;
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 5;
  const left = lines.slice(1);
  const loop = [lines[0][0], lines[0][1]];
  while (left.length) {
    const end = loop.at(-1);
    const i = left.findIndex(([a, b]) => near(a, end) || near(b, end));
    if (i < 0) return null;
    const [a, b] = left.splice(i, 1)[0];
    loop.push(near(a, end) ? b : a);
  }
  return near(loop[0], loop.at(-1)) ? loop.slice(0, -1) : null;
}

/** The plan bearing and tilt of a frame's local x (where it points) and z (its up). */
const frameAim = (M) => aimTilt(M.x, M.z);

// ---------------------------------------------------------------- materials

/** The IfcMaterials an element is made of (a layer set's layers, a constituent set's constituents, a list). */
function materialsOf(F, e) {
  const out = [];
  const visit = (m, depth = 0) => {
    if (!m || depth > 8) return;
    if (m.type === 'IFCMATERIAL') out.push(m);
    else if (m.type === 'IFCMATERIALLAYERSETUSAGE') visit(F.get(m.args[0]), depth + 1);
    else if (m.type === 'IFCMATERIALLAYERSET' || m.type === 'IFCMATERIALCONSTITUENTSET' || m.type === 'IFCMATERIALPROFILESET') for (const x of F.refs(m.args[m.type === 'IFCMATERIALLAYERSET' ? 0 : 2])) visit(x, depth + 1);
    else if (m.type === 'IFCMATERIALLAYER' || m.type === 'IFCMATERIALCONSTITUENT' || m.type === 'IFCMATERIALPROFILE') visit(F.get(m.args[m.type === 'IFCMATERIALLAYER' ? 0 : 2]), depth + 1);
    else if (m.type === 'IFCMATERIALLIST') for (const x of F.refs(m.args[0])) visit(x, depth + 1);
  };
  for (const r of F.referrers(e, 'IFCRELASSOCIATESMATERIAL', 4)) visit(F.get(r.args[5]));
  return out;
}

/** A material's APK_AcousticMaterial, read back to the catalogue's shape, or null. */
function acousticMaterial(F, mat) {
  const mp = F.referrers(mat, 'IFCMATERIALPROPERTIES', 3).find((x) => x.args[0] === 'APK_AcousticMaterial');
  if (!mp) return null;
  const p = setProps(F, mp);
  const table = (name, bands) => {
    const t = val(p, name);
    if (!t) return null;
    return bands.map((b) => {
      const i = t.x.indexOf(b);
      return i < 0 ? 0 : t.y[i];
    });
  };
  const alpha9 = table('SoundAbsorptionExtended', BANDS_9);
  return {
    id: val(p, 'MaterialId'),
    name: mat.args[0],
    category: mat.args[2] ?? null,
    alpha: table('SoundAbsorption', BANDS) ?? BANDS.map(() => 0),
    ...(alpha9 ? { alpha9 } : {}),
    scatter: table('Scattering', BANDS) ?? BANDS.map(() => 0),
    tl: val(p, 'SoundTransmissionLoss') ?? null,
    ...(val(p, 'Colour') ? { color: val(p, 'Colour') } : {}),
    ...(val(p, 'Source') ? { source: val(p, 'Source') } : {}),
  };
}

/** Name words → a catalogue material (the guess an architect's material gets; always reported). */
const GUESS = [
  [/acoustic|absorb|mineral wool|rockwool|fibreglass|fiberglass/, 'absorber-100'],
  [/ceiling tile|acoustic tile|suspended ceiling/, 'acoustic-tile'],
  [/carpet/, 'carpet-felt'],
  [/parquet|timber floor|wood floor|hardwood/, 'wood-floor'],
  [/concrete floor|screed/, 'concrete-floor'],
  [/glass|glazing/, 'glass-heavy'],
  [/door/, 'door-wood'],
  [/gypsum|drywall|plasterboard|gyproc|sheetrock/, 'gypsum'],
  [/plaster/, 'plaster'],
  [/brick/, 'brick'],
  [/block|cmu|masonry/, 'block-painted'],
  [/concrete/, 'concrete-painted'],
  [/plywood|wood|timber|panel/, 'wood-panel'],
];

export function guessMaterial(name) {
  const n = String(name ?? '').toLowerCase();
  for (const [re, id] of GUESS) if (re.test(n) && lookup(id)) return lookup(id).id;
  const exact = MATERIALS.find((m) => m.name.toLowerCase() === n);
  return exact?.id ?? null;
}

// ---------------------------------------------------------------- reading our own file

function readOwn(F, session) {
  const json = (name, fallback) => {
    try {
      return JSON.parse(val(session, name));
    } catch {
      return fallback;
    }
  };
  const model = {
    format: ROOM_FORMAT,
    fileName: val(session, 'DrawingFile') ?? null,
    frontDeg: 90,
    faceMaterials: {},
    spaces: [],
    elevations: json('Elevations', []),
    walls: [],
    materials: {},
    patches: [],
    layers: json('Layers', []),
    mirror: null,
    symmetry: {},
    speakers: [],
    mics: [],
    furniture: [],
    locked: json('Locked', []),
    settings: json('Settings', {}),
    results: null,
    ifc: json('KeptIds', {}),
  };
  const warn = () => {};
  let main = null;
  for (const s of F.all('IFCSPACE')) {
    const p = psetsOf(F, s);
    const fp = footprint(F, s, 1, warn);
    const space = {
      roomId: val(p.APK_Space, 'RoomId') ?? null,
      layerId: val(p.APK_Space, 'LayerId') ?? null,
      name: s.args[2],
      points: (fp?.loop ?? []).map(([x, y]) => [x, y]),
      height: val(p.APK_Space, 'Height') ?? fp?.depth ?? null,
      main: Boolean(val(p.APK_Space, 'IsMain')),
      ...(val(p.APK_Space, 'IsVirtual') ? { virtual: true } : {}),
      ...(val(p.APK_Space, 'IsOpenPlan') ? { open: true } : {}),
    };
    model.spaces.push(space);
    if (space.main && !main) main = { s, p };
  }
  if (main) {
    const ra = main.p.APK_RoomAcoustic ?? {};
    model.frontDeg = val(ra, 'FrontDirection') ?? 90;
    for (const f of FACES) {
      const v = val(ra, `${f[0].toUpperCase()}${f.slice(1)}Material`);
      if (v) model.faceMaterials[f] = v;
    }
    const sym = main.p.APK_Symmetry ?? {};
    if (sym.MirrorAxisX) model.mirror = { enabled: Boolean(val(sym, 'Enabled')), x: val(sym, 'MirrorAxisX'), axes: val(sym, 'MirrorAxes') ?? [] };
    model.symmetry = decodeProps(sym, SYMMETRY_TABLE, ['Enabled', 'MirrorAxisX', 'MirrorAxes']);
  }
  for (const w of F.all('IFCWALL')) {
    const sur = psetsOf(F, w).APK_Surface;
    if (!sur) continue;
    const line = wallLine(F, w, 1, warn) ?? [[0, 0], [0, 0]];
    model.walls.push({
      key: val(sur, 'WallKey'),
      a: [line[0][0], line[0][1]],
      b: [line[1][0], line[1][1]],
      face: val(sur, 'Face'),
      ...(val(sur, 'Material') ? { material: val(sur, 'Material') } : {}),
      ...(val(sur, 'Note') ? { note: val(sur, 'Note') } : {}),
    });
  }
  for (const m of F.all('IFCMATERIAL')) {
    const facts = acousticMaterial(F, m);
    if (facts?.id) model.materials[facts.id] = facts;
  }
  // the elements in the order they were written
  const withSet = new Map();
  for (const r of F.all('IFCRELDEFINESBYPROPERTIES')) {
    const set = F.get(r.args[5]);
    if (!set || typeof set.args[2] !== 'string') continue;
    for (const e of F.refs(r.args[4])) {
      if (!withSet.has(e.id)) withSet.set(e.id, { e, sets: {} });
      withSet.get(e.id).sets[set.args[2]] = setProps(F, set);
    }
  }
  const elements = [...withSet.values()].sort((a, b) => a.e.id - b.e.id);
  const where = (e, d, hasGeneric) => {
    const pl = F.get(e.args[5]);
    const ap = F.get(pl?.args[1]);
    if (!ap) return;
    const at = coords(F, F.get(ap.args[0]));
    if (!('x' in hasGeneric)) [d.x, d.y, d.z] = at;
    if (ap.args[1] && ap.args[2] && !('aim' in hasGeneric)) Object.assign(d, aimTilt(coords(F, F.get(ap.args[2])), coords(F, F.get(ap.args[1]))));
  };
  const named = (e, d) => {
    if (typeof e.args[2] === 'string' && !('name' in d)) d.name = e.args[2];
    if (typeof e.args[7] === 'string' && !('id' in d)) d.id = e.args[7];
  };
  const micOf = new Map();
  for (const { e, sets } of elements) {
    if (sets.APK_Patch) {
      const p = sets.APK_Patch;
      const xs = val(p, 'OutlineX') ?? [];
      const ys = val(p, 'OutlineY') ?? [];
      model.patches.push({
        id: val(p, 'PatchId'),
        paletteId: val(p, 'PaletteId'),
        ...(val(p, 'LayerId') != null ? { layerId: val(p, 'LayerId') } : {}),
        points: xs.map((x, i) => [x, ys[i]]),
        ...(p.AtX ? { at: [val(p, 'AtX'), val(p, 'AtY')], rotation: val(p, 'Rotation') ?? 0 } : {}),
        ...(p.Host ? { host: JSON.parse(val(p, 'Host')) } : {}),
      });
    } else if (sets.APK_SpeakerOccurrence) {
      const d = decodeProps(sets.APK_SpeakerOccurrence, SPEAKER_TABLE, ['MirrorPair']);
      where(e, d, { ...d });
      named(e, d);
      const curve = sets.Pset_SoundGeneration?.SoundCurve?.value;
      if (curve) d.soundCurve = curve.x.map((f, i) => [f, curve.y[i]]);
      model.speakers.push(d);
    } else if (sets.APK_MicOccurrence || sets.APK_Listener) {
      const d = decodeProps(sets.APK_MicOccurrence ?? sets.APK_Listener, MIC_TABLE);
      where(e, d, { ...d });
      named(e, d);
      model.mics.push(d);
      micOf.set(e.id, d.id);
    } else if (sets.APK_Furniture) {
      const d = decodeProps(sets.APK_Furniture, FURNITURE_TABLE);
      const pl = F.get(F.get(e.args[5])?.args[1]);
      if (pl && !('x' in d)) [d.x, d.y] = coords(F, F.get(pl.args[0]));
      if (typeof e.args[7] === 'string' && !('id' in d)) d.id = e.args[7];
      model.furniture.push(d);
    }
  }
  // results, display only (acoustics-6)
  const res = main?.p.APK_AcousticResult;
  if (res) {
    const bands = val(res, 'Bands') ?? BANDS;
    const at = (name) => {
      const t = val(res, name) ?? { x: [], y: [] };
      return bands.map((b) => {
        const i = t.x.indexOf(b);
        return i < 0 ? null : t.y[i];
      });
    };
    const mics = {};
    for (const { e, sets } of elements) if (sets.APK_AcousticResult && micOf.has(e.id)) mics[micOf.get(e.id)] = decodeProps(sets.APK_AcousticResult, MIC_RESULT_TABLE);
    model.results = { method: val(res, 'Method') ?? null, band: val(res, 'Band') ?? null, bands, sabine: at('ReverberationTimeSabine'), eyring: at('ReverberationTimeEyring'), mics, modelHash: val(res, 'ModelHash') ?? null };
  }
  const report = { own: true, guessed: [], warnings: [], resultsStale: Boolean(model.results && model.results.modelHash !== modelHash(model)) };
  return { model, report };
}

// ---------------------------------------------------------------- reading an architect's file

function readForeign(F, name) {
  const warnings = [];
  const warn = (w) => {
    if (!warnings.includes(w)) warnings.push(w);
  };
  const guessed = [];
  const k = lengthScale(F);
  const project = F.all('IFCPROJECT')[0];
  const fileName = name ?? project?.args[2] ?? 'imported.ifc';
  const kept = {};
  if (project) kept[keyOf.project()] = project.args[0];
  for (const [type, key] of [['IFCSITE', 'site'], ['IFCBUILDING', 'building'], ['IFCBUILDINGSTOREY', 'storey']]) {
    const e = F.all(type)[0];
    if (e) kept[key] = e.args[0];
  }
  const model = {
    format: ROOM_FORMAT,
    fileName,
    frontDeg: 90,
    faceMaterials: {},
    spaces: [],
    elevations: [],
    walls: [],
    materials: {},
    patches: [],
    layers: [],
    mirror: null,
    symmetry: { sides: 'off', front: 'off', back: 'off' },
    speakers: [],
    mics: [],
    furniture: [],
    locked: [],
    settings: {},
    results: null,
    ifc: kept,
  };
  const lines = [];
  const take = (mat, why) => {
    const facts = acousticMaterial(F, mat);
    if (facts?.id) {
      model.materials[facts.id] = facts;
      return facts.id;
    }
    const id = guessMaterial(mat.args[0]);
    guessed.push({ material: mat.args[0], as: id, for: why });
    if (id) model.materials[id] = materialFacts(lookup(id));
    return id;
  };
  const spaces = F.all('IFCSPACE');
  if (!spaces.length) warn('the file has no IfcSpace: there is no room to open');
  const walls = {};
  // heights in the app are above the room's floor; the file's are above its origin
  let floorZ = 0;
  spaces.forEach((s, n) => {
    const sp = psetsOf(F, s);
    const qto = sp.Qto_SpaceBaseQuantities ?? sp.BaseQuantities ?? {};
    const label = s.args[7] || s.args[2] || `Space ${n + 1}`;
    const bounding = F.referrers(s, 'IFCRELSPACEBOUNDARY', 4).map((r) => F.get(r.args[5])).filter(Boolean);
    const segs = [];
    for (const el of bounding) {
      if (el.type !== 'IFCWALL' && el.type !== 'IFCWALLSTANDARDCASE') continue;
      const line = wallLine(F, el, k, warn);
      if (line) segs.push({ line, el });
    }
    let fp = footprint(F, s, k, warn);
    if (!fp) {
      const loop = chain(segs.map((x) => x.line));
      if (loop) fp = { loop, depth: null, zFloor: 0 };
      else {
        warn(`${label}: no footprint and its walls do not close — its wall lines are handed to the CAD to finish`);
        for (const { line } of segs) lines.push({ layer: `Room · ${label}`, a: [mm(line[0][0] / 1000), mm(line[0][1] / 1000)], b: [mm(line[1][0] / 1000), mm(line[1][1] / 1000)] });
      }
    }
    const h = val(qto, 'Height');
    const height = typeof h === 'number' ? h * k : fp?.depth ?? null;
    if (height == null) warn(`${label}: no height given (Qto_SpaceBaseQuantities.Height or an extrusion) — 3000 mm assumed`);
    const space = { roomId: null, layerId: null, name: `Room · ${label}`, points: (fp?.loop ?? []).map(([x, y]) => [mm(x / 1000), mm(y / 1000)]), height: mm((height ?? 3000) / 1000), main: n === 0 };
    model.spaces.push(space);
    kept[keyOf.space(space)] = s.args[0];
    if (n !== 0) return;
    floorZ = fp?.zFloor ?? 0;
    // the room's surfaces: walls by their plan line, the floor slab, the ceiling covering
    const poly = space.points;
    for (const { line, el } of segs) {
      const mid = [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2];
      let best = null;
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length];
        const d = Math.hypot((p[0] + q[0]) / 2 - mid[0], (p[1] + q[1]) / 2 - mid[1]);
        if (!best || d < best.d) best = { d, p, q };
      });
      if (!best || best.d > 50) continue;
      const key = wallKey({ a: { x: best.p[0] / 1000, y: best.p[1] / 1000 }, b: { x: best.q[0] / 1000, y: best.q[1] / 1000 } });
      kept[keyOf.wall({ key })] = el.args[0];
      // what sound meets is the finish on the wall, if it has one, else the wall
      const finishes = F.referrers(el, 'IFCRELCOVERSBLDGELEMENTS', 4).flatMap((r) => F.refs(r.args[5]));
      const mat = [...finishes.flatMap((c) => materialsOf(F, c)), ...materialsOf(F, el)][0];
      if (mat) {
        const id = take(mat, `wall ${el.args[2] ?? el.args[0]}`);
        if (id) walls[key] = { material: id };
      }
    }
    for (const el of bounding) {
      const isFloor = el.type === 'IFCSLAB' && ['FLOOR', 'BASESLAB'].includes(el.args[8]?.value);
      const isCeiling = el.type === 'IFCCOVERING' && el.args[8]?.value === 'CEILING';
      if (!isFloor && !isCeiling) continue;
      const finishes = isFloor ? F.referrers(el, 'IFCRELCOVERSBLDGELEMENTS', 4).flatMap((r) => F.refs(r.args[5])) : [];
      const mat = [...finishes.flatMap((c) => materialsOf(F, c)), ...materialsOf(F, el)][0];
      const id = mat ? take(mat, isFloor ? 'floor' : 'ceiling') : null;
      if (id) model.faceMaterials[isFloor ? 'floor' : 'ceiling'] = id;
    }
    for (const r of F.referrers(s, 'IFCRELCOVERSSPACES', 4)) {
      for (const c of F.refs(r.args[5])) {
        if (c.args[8]?.value !== 'CEILING') continue;
        const mat = materialsOf(F, c)[0];
        const id = mat ? take(mat, 'ceiling') : null;
        if (id) model.faceMaterials.ceiling = id;
      }
    }
  });
  if (Object.keys(walls).length) model.settings.walls = walls;
  if (Object.keys(model.faceMaterials).length === 0) delete model.faceMaterials;
  model.faceMaterials = { floor: 'wood-floor', ceiling: 'acoustic-tile', front: 'gypsum', back: 'absorber-100', left: 'gypsum', right: 'gypsum', ...model.faceMaterials };
  if (lines.length) model.lines = lines;
  // every material the room names is in the file it writes back, as the catalogue has it
  for (const id of [...Object.values(model.faceMaterials), ...Object.values(walls).map((w) => w.material)]) {
    const mat = lookup(id);
    if (mat && !model.materials[mat.id]) model.materials[mat.id] = materialFacts(mat);
  }

  // the speakers and mics, where they stand and aim
  for (const e of F.all('IFCAUDIOVISUALAPPLIANCE')) {
    const type = F.referrers(e, 'IFCRELDEFINESBYTYPE', 4).map((r) => F.get(r.args[5]))[0];
    // an occurrence may leave its predefined type to its type
    const own = e.args[8]?.value;
    const kind = own && own !== 'NOTDEFINED' ? own : type?.args[9]?.value;
    if (kind !== 'SPEAKER' && kind !== 'MICROPHONE') continue;
    const M = placementFrame(F, F.get(e.args[5]), k, warn);
    const { aim, tilt } = frameAim(M);
    const info = psetsOf(F, e).Pset_ManufacturerTypeInformation ?? {};
    const typeName = type?.args[2] ?? val(info, 'ModelReference') ?? null;
    const id = `${kind === 'SPEAKER' ? 's' : 'm'}-${e.args[0]}`;
    const at = { x: mm(M.o[0] / 1000), y: mm(M.o[1] / 1000), z: mm((M.o[2] - floorZ) / 1000), aim, tilt };
    if (kind === 'SPEAKER') {
      // a BIM part type names its part (APK_Part.PartId, else its Tag); the box is placed from the preset that part is
      const isPartId = (x) => typeof x === 'string' && /^[a-z0-9-]+\/[a-z0-9._-]+$/i.test(x);
      const stated = [val(psetsOf(F, e).APK_Part, 'PartId'), type?.args[7], typeName].find(isPartId);
      const part = stated ? stated.toLowerCase() : null;
      const byPart = presetForPart(part);
      const preset = byPart ? [byPart, ALL_SPEAKER_PRESETS[byPart]]
        : Object.entries(ALL_SPEAKER_PRESETS).find(([, p]) => p.label === typeName || p.name === typeName || (val(info, 'ModelLabel') && p.label === val(info, 'ModelLabel')));
      if (!preset) warn(`speaker ${e.args[2] ?? id}: its type (${typeName ?? 'none'}) is no preset here — placed as a studio monitor${part ? `, part ${part} kept` : ''}`);
      model.speakers.push({ id, name: e.args[2] ?? id, kind: preset?.[0] ?? 'monitor', ...(part ? { part } : {}), ...at, mount: 'free' });
    } else model.mics.push({ id, name: e.args[2] ?? id, kind: 'omni', pattern: 'omni', mix: false, ...at });
    kept[keyOf.device(kind === 'SPEAKER' ? 'speaker' : 'mic', id)] = e.args[0];
  }
  if (!model.speakers.length && !model.mics.length) warnings.push('no speakers or mics in the file: place them here');
  return { model, report: { own: false, schema: schemaOf(F.f), guessed, warnings, resultsStale: false } };
}

/** { model, report } from IFC text. `name`: the file's name, for a foreign file without a project name. */
export function ifcToRoom(text, { name = null } = {}) {
  const F = open(text);
  const schema = schemaOf(F.f);
  if (!/^IFC(4|4X3|2X3)/.test(schema ?? '')) throw new Error(`Not an IFC file this app reads (schema ${schema ?? 'none'}).`);
  const project = F.all('IFCPROJECT')[0];
  const session = project ? psetsOf(F, project).APK_AcousticSession : null;
  if (session && val(session, 'Format') === ROOM_FORMAT) return readOwn(F, session);
  return readForeign(F, name);
}
