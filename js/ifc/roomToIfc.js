// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * SAVE .IFC — the room model (roomModel.js) as one IFC4X3_ADD2 file
 * (acoustics-1, -2, -3, -6, -7). Written with the contracts' STEP writer and
 * GlobalId rule (vendor/apk-contracts/apk-ifc.js), no IfcOpenShell in the
 * page, so it runs on the static site too. Byte-deterministic: the same model
 * writes the same file, and every GlobalId is uuid5 of a role (contracts
 * ifcGuid), or the GlobalId an imported file brought (model.ifc).
 *
 *   IfcProject ─ IfcSite ─ IfcBuilding ─ IfcBuildingStorey ─ IfcSpace (one per plan loop)
 *     units mm · m² · m³ · s · Hz · W · degree; 'dB' a context-dependent unit
 *   the room (the main space):
 *     Qto_SpaceBaseQuantities, Pset_SpaceCommon, APK_Space, APK_RoomAcoustic,
 *     APK_Symmetry (the CAD's Virtual Mirror), APK_AcousticResult (RT60 tables)
 *     each wall      IfcWall (Axis line, mm) + IfcCovering CLADDING finish (IfcRelCoversBldgElements)
 *     floor          IfcSlab FLOOR + IfcCovering FLOORING;  ceiling IfcCovering CEILING (IfcRelCoversSpaces)
 *                    all bounding the space (IfcRelSpaceBoundary PHYSICAL INTERNAL)
 *   materials        IfcMaterial + IfcMaterialProperties APK_AcousticMaterial: α and scattering per
 *                    octave band as IfcPropertyTableValue (IfcFrequencyMeasure → IfcNormalisedRatioMeasure)
 *   treatment        IfcDiscreteAccessory SOUNDABSORPTION; a finish patch IfcCovering; glass IfcWindow;
 *                    a door IfcDoor; furniture IfcFurniture — each with APK_Patch (its sheet outline, mm)
 *   speakers         IfcAudioVisualAppliance SPEAKER typed by IfcAudioVisualApplianceType SPEAKER —
 *                    the BIM part's own type, copied whole from its .ifc (opts.types, partType.js),
 *                    else (offline) a type naming the part — aim + tilt in its IfcAxis2Placement3D;
 *                    APK_SpeakerOccurrence; each set an
 *                    IfcDistributionSystem ELECTROACOUSTIC; mirror twins name each other (MirrorPair)
 *   mics             IfcAudioVisualAppliance MICROPHONE; a listener seat IfcVirtualElement 'Listener'
 *                    (APK_Listener); each with its ISO 3382 figures in APK_AcousticResult
 *   the rest of the overlay  APK_AcousticSession on the project (settings, layers, elevations as JSON)
 */

import { encodeString, formatReal, ifcGuid, enumv, real, ref, typed, writeStep } from '../../vendor/apk-contracts/apk-ifc.js';
import { ALL_SPEAKER_PRESETS, isListener, MIC_PRESETS, speakerPart } from '../acoustics/devices.js';
import { SPEAKER_PARTS } from '../acoustics/speakerParts.js';
import { lookup, PRODUCTS } from '../acoustics/materials.js';
import { elevationFaceOf } from '../acoustics/elevations.js';
import { isCeilingLayer } from '../acoustics/patches.js';
import { aimAxes } from './placement.js';
import { copyType, partTypes, partUnits } from './partType.js';
import { bool, encodeProps, FURNITURE_TABLE, ident, label, measure, MIC_RESULT_TABLE, MIC_TABLE, SPEAKER_TABLE, SYMMETRY_TABLE, text } from './props.js';
import { BANDS, BANDS_9 } from '../acoustics/bands.js';

export const IFC_SCHEMA = 'IFC4X3_ADD2';
const FACES = ['floor', 'ceiling', 'front', 'back', 'left', 'right'];
const PRODUCT = new Map(PRODUCTS.map((p) => [p.id, p]));
const TREATMENT = /^(Absorber|Resonator|Diffuser|Ceiling)$/;

/** What a painted patch is in IFC: [entity, predefined type, object type?]. */
export function patchClass(paletteId, layerName) {
  const product = PRODUCT.get(paletteId);
  const mat = lookup(paletteId);
  if (!product) {
    if (!mat) return ['IFCBUILDINGELEMENTPROXY', 'NOTDEFINED'];
    if (elevationFaceOf(layerName)) return ['IFCCOVERING', 'CLADDING'];
    return ['IFCCOVERING', isCeilingLayer(layerName) ? 'CEILING' : 'FLOORING'];
  }
  const id = product.id;
  if (/^(window|sliding-glass)/.test(id)) return /^sliding/.test(id) ? ['IFCDOOR', 'DOOR'] : ['IFCWINDOW', 'WINDOW'];
  if (/^door/.test(id)) return ['IFCDOOR', 'DOOR'];
  if (/^rug/.test(id)) return ['IFCCOVERING', 'FLOORING'];
  if (/^(desk|producer-desk|console)/.test(id)) return ['IFCFURNITURE', 'DESK'];
  if (/^table/.test(id)) return ['IFCFURNITURE', 'TABLE'];
  if (/^couch/.test(id)) return ['IFCFURNITURE', 'SOFA'];
  if (/^armchair/.test(id)) return ['IFCFURNITURE', 'CHAIR'];
  if (/^rack/.test(id)) return ['IFCFURNITURE', 'TECHNICALCABINET'];
  if (TREATMENT.test(mat?.category ?? '') || /panel|trap|cloud|qrd|skyline|slat|massonberg|diffus/.test(id)) return ['IFCDISCRETEACCESSORY', 'SOUNDABSORPTION'];
  return ['IFCFURNITURE', 'USERDEFINED', product.name];
}

/** The semantic keys model.ifc keeps imported GlobalIds under. */
export const keyOf = {
  project: () => 'project',
  site: () => 'site',
  building: () => 'building',
  storey: () => 'storey',
  space: (s) => `space:${s.name}`,
  wall: (w) => `wall:${w.key}`,
  device: (kind, id) => `${kind}:${id}`,
};

class Writer {
  constructor() {
    this.entities = [];
  }
  add(type, ...args) {
    const id = this.entities.length + 1;
    this.entities.push({ id, type, args });
    return ref(id);
  }
}

const pt = (W, c) => W.add('IFCCARTESIANPOINT', c.map((x) => real(x)));
const dir = (W, c) => W.add('IFCDIRECTION', c.map((x) => real(x)));
const LEN = (x) => measure('IFCLENGTHMEASURE', x);

/**
 * The room model as IFC4X3_ADD2 STEP text. `opts.types` {partId: the part's .ifc text}
 * (speakerLibrary.js loadPartTypes): each speaker part named there is typed by the part's
 * own type, copied in; a part not there (offline) by a type that names it.
 */
export function roomToIfc(model, { types: partTexts = {} } = {}) {
  const W = new Writer();
  const kept = model.ifc ?? {};
  const file = model.fileName ?? 'untitled';
  const P = kept.project ?? ifcGuid('acoustic', file);
  const gid = (key, ...roles) => (key && kept[key]) || ifcGuid(...roles);
  const rel = (...roles) => ifcGuid('rel', ...roles);

  // ---- units and contexts
  const dims0 = W.add('IFCDIMENSIONALEXPONENTS', 0, 0, 0, 0, 0, 0, 0);
  const si = (type, prefix, name) => W.add('IFCSIUNIT', { kind: 'derived' }, enumv(type), prefix ? enumv(prefix) : null, enumv(name));
  const radian = si('PLANEANGLEUNIT', null, 'RADIAN');
  const degree = W.add('IFCCONVERSIONBASEDUNIT', dims0, enumv('PLANEANGLEUNIT'), 'DEGREE', W.add('IFCMEASUREWITHUNIT', measure('IFCPLANEANGLEMEASURE', 0.017453292519943295), radian));
  const ROOM_SI = [['LENGTHUNIT', 'MILLI', 'METRE'], ['AREAUNIT', null, 'SQUARE_METRE'], ['VOLUMEUNIT', null, 'CUBIC_METRE'], ['TIMEUNIT', null, 'SECOND'], ['FREQUENCYUNIT', null, 'HERTZ'], ['POWERUNIT', null, 'WATT']];
  // the parts' own types the speakers name, and the units their files assign that the room does not (mass, volt ...)
  const wanted = new Set((model.speakers ?? []).map((d) => d.part ?? speakerPart(d.kind)?.part).filter((p) => p && partTexts[p]));
  const parsedTypes = partTypes(Object.fromEntries([...wanted].map((p) => [p, partTexts[p]])));
  const siUnits = new Map([['PLANEANGLEUNIT//RADIAN', radian]]);
  const roomSi = [...ROOM_SI, ...partUnits(parsedTypes, ['PLANEANGLEUNIT', ...ROOM_SI.map(([u]) => u)]).map((u) => [u.type, u.prefix, u.name])].map(([u, pre, n]) => {
    const r = si(u, pre, n);
    siUnits.set(`${u}/${pre ?? ''}/${n}`, r);
    return r;
  });
  const units = W.add('IFCUNITASSIGNMENT', [...roomSi.slice(0, ROOM_SI.length), degree, ...roomSi.slice(ROOM_SI.length)]);
  const unitRefs = { dB: W.add('IFCCONTEXTDEPENDENTUNIT', dims0, enumv('USERDEFINED'), 'dB') };
  const origin = W.add('IFCAXIS2PLACEMENT3D', pt(W, [0, 0, 0]), null, null);
  const ctx = W.add('IFCGEOMETRICREPRESENTATIONCONTEXT', null, 'Model', 3, real(1e-5), origin, null);
  const bodyCtx = W.add('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', 'Body', 'Model', { kind: 'derived' }, { kind: 'derived' }, { kind: 'derived' }, { kind: 'derived' }, ctx, null, enumv('MODEL_VIEW'), null);
  const axisCtx = W.add('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', 'Axis', 'Model', { kind: 'derived' }, { kind: 'derived' }, { kind: 'derived' }, { kind: 'derived' }, ctx, null, enumv('GRAPH_VIEW'), null);
  const project = W.add('IFCPROJECT', P, null, file, 'Acoustic.Like.audio room', null, null, null, [ctx], units);

  // ---- property helpers
  const props = (list) =>
    list.map(({ name, value, unit, table }) => {
      if (table) return W.add('IFCPROPERTYTABLEVALUE', name, null, table.x, table.y, null, null, null, null);
      if (Array.isArray(value)) return W.add('IFCPROPERTYLISTVALUE', name, null, value.length ? value : null, null);
      if (value && value.enum) return W.add('IFCPROPERTYENUMERATEDVALUE', name, null, [value.enum], null);
      return W.add('IFCPROPERTYSINGLEVALUE', name, null, value, unit ? unitRefs[unit] : null);
    });
  const pset = (owner, ownerGid, name, list) => {
    if (!list.length) return null;
    const ps = W.add('IFCPROPERTYSET', ifcGuid('rel', 'pset', ownerGid, name), null, name, null, props(list));
    W.add('IFCRELDEFINESBYPROPERTIES', ifcGuid('rel', 'props', ownerGid, name), null, null, null, [owner], ps);
    return ps;
  };
  const typePset = (typeGid, name, list) => W.add('IFCPROPERTYSET', ifcGuid('rel', 'pset', typeGid, name), null, name, null, props(list));
  const tableOf = (xs, ys, xType, yType) => {
    const pairs = xs.map((x, i) => [x, ys[i]]).filter(([, y]) => typeof y === 'number' && Number.isFinite(y));
    return { x: pairs.map(([x]) => measure(xType, x)), y: pairs.map(([, y]) => measure(yType, y)) };
  };

  // ---- the spine
  const sitePl = W.add('IFCLOCALPLACEMENT', null, origin);
  const buildingPl = W.add('IFCLOCALPLACEMENT', sitePl, origin);
  const storeyPl = W.add('IFCLOCALPLACEMENT', buildingPl, origin);
  const siteGid = gid('site', 'site', P, 'site');
  const buildingGid = gid('building', 'site', P, 'building');
  const storeyGid = gid('storey', 'site', P, 'storey');
  const site = W.add('IFCSITE', siteGid, null, 'Site', null, null, sitePl, null, null, enumv('ELEMENT'), null, null, null, null, null);
  const building = W.add('IFCBUILDING', buildingGid, null, 'Building', null, null, buildingPl, null, null, enumv('ELEMENT'), null, null, null);
  const storey = W.add('IFCBUILDINGSTOREY', storeyGid, null, 'Level 0', null, null, storeyPl, null, null, enumv('ELEMENT'), real(0));
  W.add('IFCRELAGGREGATES', rel('aggregates', P), null, null, null, project, [site]);
  W.add('IFCRELAGGREGATES', rel('aggregates', siteGid), null, null, null, site, [building]);
  W.add('IFCRELAGGREGATES', rel('aggregates', buildingGid), null, null, null, building, [storey]);

  // the project carries what IFC has no word for: the rest of the overlay
  pset(project, P, 'APK_AcousticSession', [
    { name: 'Format', value: label(model.format) },
    ...(model.fileName != null ? [{ name: 'DrawingFile', value: label(model.fileName) }] : []),
    { name: 'Settings', value: text(JSON.stringify(model.settings ?? {})) },
    { name: 'Layers', value: text(JSON.stringify(model.layers ?? [])) },
    { name: 'Elevations', value: text(JSON.stringify(model.elevations ?? [])) },
    { name: 'Locked', value: text(JSON.stringify(model.locked ?? [])) },
    { name: 'KeptIds', value: text(JSON.stringify(kept)) },
  ]);

  // ---- materials, once each
  const matRef = new Map();
  // α is a fraction, 0…1 (IfcNormalisedRatioMeasure); a datasheet that quotes more — a trap measured as
  // Sabine coefficients above 1 — keeps its figures as they are, as an IfcRatioMeasure series, never clipped
  const ratio = (xs) => (xs.every((v) => typeof v !== 'number' || (v >= 0 && v <= 1)) ? 'IFCNORMALISEDRATIOMEASURE' : 'IFCRATIOMEASURE');
  for (const id of Object.keys(model.materials ?? {}).sort()) {
    const m = model.materials[id];
    const mat = W.add('IFCMATERIAL', m.name ?? id, null, m.category ?? null);
    const list = [
      { name: 'MaterialId', value: ident(m.id) },
      { name: 'SoundAbsorption', table: tableOf(BANDS, m.alpha, 'IFCFREQUENCYMEASURE', ratio(m.alpha)) },
      ...(m.alpha9 ? [{ name: 'SoundAbsorptionExtended', table: tableOf(BANDS_9, m.alpha9, 'IFCFREQUENCYMEASURE', ratio(m.alpha9)) }] : []),
      { name: 'Scattering', table: tableOf(BANDS, m.scatter, 'IFCFREQUENCYMEASURE', ratio(m.scatter)) },
      ...(typeof m.tl === 'number' ? [{ name: 'SoundTransmissionLoss', value: measure('IFCREAL', m.tl), unit: 'dB' }] : []),
      ...(m.color ? [{ name: 'Colour', value: label(m.color) }] : []),
      ...(m.source ? [{ name: 'Source', value: label(m.source) }] : []),
    ];
    W.add('IFCMATERIALPROPERTIES', 'APK_AcousticMaterial', null, props(list), mat);
    matRef.set(id, mat);
  }
  const usesMaterial = new Map(); // material id → [element refs], associated at the end
  const associate = (matId, el) => {
    const id = lookup(matId)?.id ?? matId;
    if (!matRef.has(id)) return;
    if (!usesMaterial.has(id)) usesMaterial.set(id, []);
    usesMaterial.get(id).push(el);
  };

  // ---- spaces
  const contained = new Map(); // structure gid → { ref, items }
  const contain = (structRef, structGid, el) => {
    if (!contained.has(structGid)) contained.set(structGid, { ref: structRef, items: [] });
    contained.get(structGid).items.push(el);
  };
  const spaceRefs = [];
  let main = null;
  for (const s of model.spaces) {
    const sGid = gid(keyOf.space(s), 'space', file, s.layerId ?? (s.virtual ? 'virtual' : 'open'));
    const pl = W.add('IFCLOCALPLACEMENT', storeyPl, origin);
    // a space with no loop yet (an imported room whose walls never closed) has no body
    let shape = null;
    if (s.points.length >= 3) {
      const ring = s.points.map((p) => pt(W, p));
      const profile = W.add('IFCARBITRARYCLOSEDPROFILEDEF', enumv('AREA'), null, W.add('IFCPOLYLINE', [...ring, ring[0]]));
      const solid = W.add('IFCEXTRUDEDAREASOLID', profile, origin, dir(W, [0, 0, 1]), real(s.height));
      shape = W.add('IFCPRODUCTDEFINITIONSHAPE', null, null, [W.add('IFCSHAPEREPRESENTATION', bodyCtx, 'Body', 'SweptSolid', [solid])]);
    }
    const space = W.add('IFCSPACE', sGid, null, s.name, null, null, pl, shape, s.name, enumv('ELEMENT'), enumv('INTERNAL'), null);
    spaceRefs.push(space);
    const area = Math.abs(s.points.reduce((acc, p, i) => { const q = s.points[(i + 1) % s.points.length]; return acc + p[0] * q[1] - q[0] * p[1]; }, 0) / 2) / 1e6;
    const perimeter = s.points.reduce((acc, p, i) => { const q = s.points[(i + 1) % s.points.length]; return acc + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
    const q = [
      W.add('IFCQUANTITYLENGTH', 'Height', null, null, real(s.height), null),
    ];
    if (shape) q.push(
      W.add('IFCQUANTITYLENGTH', 'NetPerimeter', null, null, real(+perimeter.toFixed(1)), null),
      W.add('IFCQUANTITYAREA', 'NetFloorArea', null, null, real(+area.toFixed(6)), null),
      W.add('IFCQUANTITYAREA', 'NetCeilingArea', null, null, real(+area.toFixed(6)), null),
      W.add('IFCQUANTITYAREA', 'NetWallArea', null, null, real(+((perimeter * s.height) / 1e6).toFixed(6)), null),
      W.add('IFCQUANTITYVOLUME', 'NetVolume', null, null, real(+((area * s.height) / 1000).toFixed(6)), null),
    );
    const qto = W.add('IFCELEMENTQUANTITY', ifcGuid('rel', 'pset', sGid, 'Qto_SpaceBaseQuantities'), null, 'Qto_SpaceBaseQuantities', null, null, q);
    W.add('IFCRELDEFINESBYPROPERTIES', ifcGuid('rel', 'props', sGid, 'Qto_SpaceBaseQuantities'), null, null, null, [space], qto);
    if (s.layerId != null) pset(space, sGid, 'Pset_SpaceCommon', [{ name: 'Reference', value: ident(s.layerId) }, { name: 'IsExternal', value: bool(false) }]);
    pset(space, sGid, 'APK_Space', [
      ...(s.roomId != null ? [{ name: 'RoomId', value: measure('IFCREAL', s.roomId) }] : []),
      ...(s.layerId != null ? [{ name: 'LayerId', value: ident(s.layerId) }] : []),
      { name: 'Height', value: measure('IFCPOSITIVELENGTHMEASURE', s.height) },
      { name: 'IsMain', value: bool(Boolean(s.main)) },
      ...(s.virtual ? [{ name: 'IsVirtual', value: bool(true) }] : []),
      ...(s.open ? [{ name: 'IsOpenPlan', value: bool(true) }] : []),
    ]);
    if (s.main && !main) main = { s, ref: space, gid: sGid, pl };
  }
  W.add('IFCRELAGGREGATES', rel('aggregates', storeyGid), null, null, null, storey, spaceRefs);

  // ---- the room: its surfaces, finishes and the acoustic design
  const wallRefs = new Map();
  if (main) {
    const { s, ref: space, gid: sGid } = main;
    const fm = model.faceMaterials ?? {};
    pset(space, sGid, 'APK_RoomAcoustic', [
      { name: 'FrontDirection', value: measure('IFCPLANEANGLEMEASURE', model.frontDeg ?? 90) },
      ...FACES.filter((f) => fm[f]).map((f) => ({ name: `${f[0].toUpperCase()}${f.slice(1)}Material`, value: ident(fm[f]) })),
    ]);
    const sym = encodeProps(model.symmetry ?? {}, SYMMETRY_TABLE);
    if (model.mirror) {
      sym.unshift(
        { name: 'Enabled', value: bool(model.mirror.enabled) },
        { name: 'MirrorAxisX', value: LEN(model.mirror.x) },
        { name: 'MirrorAxes', value: (model.mirror.axes ?? []).map(LEN) },
      );
    }
    pset(space, sGid, 'APK_Symmetry', sym);
    const boundary = (el, elGid) => W.add('IFCRELSPACEBOUNDARY', rel('bounds', sGid, elGid), null, null, null, space, el, null, enumv('PHYSICAL'), enumv('INTERNAL'));
    const finish = (onRef, onGid, kind, name, matId) => {
      const fGid = ifcGuid('space', file, s.layerId ?? 'room', 'finish', onGid);
      const cov = W.add('IFCCOVERING', fGid, null, name, null, null, W.add('IFCLOCALPLACEMENT', storeyPl, origin), null, null, enumv(kind));
      W.add('IFCRELCOVERSBLDGELEMENTS', rel('covers', onGid), null, null, null, onRef, [cov]);
      contain(storey, storeyGid, cov);
      associate(matId, cov);
      return cov;
    };
    for (const [i, w] of (model.walls ?? []).entries()) {
      const wGid = gid(keyOf.wall(w), 'space', file, s.layerId ?? 'room', 'wall', w.key);
      const line = W.add('IFCPOLYLINE', [pt(W, w.a), pt(W, w.b)]);
      const shape = W.add('IFCPRODUCTDEFINITIONSHAPE', null, null, [W.add('IFCSHAPEREPRESENTATION', axisCtx, 'Axis', 'Curve2D', [line])]);
      const wall = W.add('IFCWALL', wGid, null, `${w.face} wall ${i + 1}`, null, null, W.add('IFCLOCALPLACEMENT', storeyPl, origin), shape, w.key, enumv('NOTDEFINED'));
      wallRefs.set(w.key, { ref: wall, a: w.a, b: w.b });
      pset(wall, wGid, 'APK_Surface', [
        { name: 'WallKey', value: ident(w.key) },
        { name: 'Face', value: label(w.face) },
        ...(w.material ? [{ name: 'Material', value: ident(w.material) }] : []),
        ...(w.note ? [{ name: 'Note', value: label(w.note) }] : []),
      ]);
      contain(storey, storeyGid, wall);
      boundary(wall, wGid);
      const matId = w.material ?? fm[w.face];
      finish(wall, wGid, 'CLADDING', `${w.face} wall ${i + 1} finish`, matId);
    }
    const slabGid = ifcGuid('space', file, s.layerId ?? 'room', 'floor');
    const slab = W.add('IFCSLAB', slabGid, null, 'Floor', null, null, W.add('IFCLOCALPLACEMENT', storeyPl, origin), null, null, enumv('FLOOR'));
    contain(storey, storeyGid, slab);
    boundary(slab, slabGid);
    finish(slab, slabGid, 'FLOORING', 'Floor finish', fm.floor);
    const ceilGid = ifcGuid('space', file, s.layerId ?? 'room', 'ceiling');
    const ceiling = W.add('IFCCOVERING', ceilGid, null, 'Ceiling', null, null, W.add('IFCLOCALPLACEMENT', storeyPl, origin), null, null, enumv('CEILING'));
    W.add('IFCRELCOVERSSPACES', rel('covers', sGid), null, null, null, space, [ceiling]);
    contain(storey, storeyGid, ceiling);
    boundary(ceiling, ceilGid);
    associate(fm.ceiling, ceiling);
  }
  const roomPl = main?.pl ?? storeyPl;
  const roomRef = main?.ref ?? storey;
  const roomGid = main?.gid ?? storeyGid;
  const placeAt = (x, y, z, axes) => W.add('IFCLOCALPLACEMENT', roomPl, W.add('IFCAXIS2PLACEMENT3D', pt(W, [x, y, z]), axes ? dir(W, axes.axis) : null, axes ? dir(W, axes.ref) : null));

  // ---- what is painted on the room: treatment, finishes, glass, doors, furniture
  const layerName = new Map((model.layers ?? []).map((l) => [l.id, l.name]));
  const planLayer = main?.s.layerId;
  for (const p of model.patches ?? []) {
    const lname = layerName.get(p.layerId) ?? p.layerId;
    const [entity, predefined, objectType] = patchClass(p.paletteId, lname);
    const pGid = gid(keyOf.device('patch', p.id), 'decl', P, 'patch', p.id);
    const product = PRODUCT.get(p.paletteId);
    const name = product?.name ?? lookup(p.paletteId)?.name ?? p.paletteId;
    // on the plan, a placed product sits where it is; on an elevation the sheet is not the room, so APK_Patch says where
    const onPlan = p.layerId === planLayer && p.at;
    const pl = onPlan ? placeAt(p.at[0], p.at[1], 0, aimAxes(p.rotation ?? 0, 0)) : null;
    const head = [pGid, null, name, null, objectType ?? null, pl, null, p.id];
    let el;
    if (entity === 'IFCDOOR' || entity === 'IFCWINDOW') {
      const [w, h] = product?.size ?? [null, null];
      el = W.add(entity, ...head, w ? real(+(w * 1000).toFixed(1)) : null, h ? real(+(h * 1000).toFixed(1)) : null, enumv(predefined), null, null);
    } else el = W.add(entity, ...head, enumv(predefined));
    const outline = [
      { name: 'PatchId', value: ident(p.id) },
      { name: 'PaletteId', value: ident(p.paletteId) },
      ...(p.layerId != null ? [{ name: 'LayerId', value: ident(p.layerId) }] : []),
      { name: 'OutlineX', value: p.points.map(([x]) => LEN(x)) },
      { name: 'OutlineY', value: p.points.map(([, y]) => LEN(y)) },
      ...(p.at ? [{ name: 'AtX', value: LEN(p.at[0]) }, { name: 'AtY', value: LEN(p.at[1]) }, { name: 'Rotation', value: measure('IFCPLANEANGLEMEASURE', p.rotation ?? 0) }] : []),
      ...(p.host !== undefined ? [{ name: 'Host', value: text(JSON.stringify(p.host)) }] : []),
    ];
    pset(el, pGid, 'APK_Patch', outline);
    contain(roomRef, roomGid, el);
    associate(p.paletteId, el);
  }

  // ---- speakers: one type per BIM part (a preset box IS a library part: speakerParts.js), else per kind;
  // each box an occurrence aimed in its placement. A part's type carries the part's own GlobalId
  // (part/<id>) and the identity DATABASE.server.BIM writes for it (bim/ifc.py), so the two files agree.
  const typeRefs = new Map();
  const partById = new Map(Object.values(SPEAKER_PARTS).map((p) => [p.part, p]));
  const contextUnits = new Map(); // a part file's dBu / Vpp ..., once each in the room
  const conversionUnits = new Map(); // and its litre ..., once each
  const typeOf = (kind, avKind, d) => {
    const partId = d.part ?? (avKind === 'SPEAKER' ? speakerPart(kind)?.part : null) ?? null;
    const key = partId ? `part:${partId}` : `${avKind}:${kind}`;
    if (typeRefs.has(key)) return typeRefs.get(key);
    // the library's own type for the part, whole, with its GlobalIds (part/<id> is the type's)
    const own = avKind === 'SPEAKER' && partId ? parsedTypes.get(partId) : null;
    if (own) {
      const { ref: t } = copyType(W, own, { ctx, bodyCtx, siUnits, degree, contextUnits, conversionUnits });
      typeRefs.set(key, { ref: t, gid: ifcGuid('part', partId), occ: [], embedded: true });
      return typeRefs.get(key);
    }
    const preset = avKind === 'SPEAKER' ? ALL_SPEAKER_PRESETS[kind] : MIC_PRESETS[kind];
    const known = partId ? partById.get(partId) : null;
    const tGid = partId ? ifcGuid('part', partId) : ifcGuid('decl', P, 'type', avKind.toLowerCase(), String(kind));
    const psets = [];
    const maker = known?.manufacturer ?? preset?.maker;
    const modelLabel = known?.name ?? preset?.label;
    const info = [
      ...(maker ? [{ name: 'Manufacturer', value: label(maker) }] : []),
      ...(modelLabel ? [{ name: 'ModelLabel', value: label(modelLabel) }] : []),
      ...(partId ? [{ name: 'ModelReference', value: label(known?.model ?? partId) }] : []),
    ];
    if (info.length) psets.push(typePset(tGid, 'Pset_ManufacturerTypeInformation', info));
    if (partId) psets.push(typePset(tGid, 'APK_Part', [{ name: 'PartId', value: ident(partId) }]));
    if (avKind === 'SPEAKER') {
      const st = /coax/i.test(preset?.driver ?? '') ? 'COAXIAL' : kind === 'sub' || preset?.lowpass > 0 ? 'WOOFER' : 'FULLRANGE';
      psets.push(typePset(tGid, 'Pset_AudioVisualApplianceTypeSpeaker', [{ name: 'SpeakerType', value: { enum: label(st) } }]));
    }
    const t = W.add('IFCAUDIOVISUALAPPLIANCETYPE', tGid, null, known?.name ?? preset?.label ?? partId ?? String(kind), null, null, psets.length ? psets : null, null, String(partId ?? kind), null, enumv(avKind));
    typeRefs.set(key, { ref: t, gid: tGid, occ: [] });
    return typeRefs.get(key);
  };
  const deviceGid = (kind, d) => gid(keyOf.device(kind, d.id), 'decl', P, kind, String(d.id));
  const placed = (d) => {
    const hasXYZ = ['x', 'y', 'z'].every((c) => typeof d[c] === 'number');
    const hasAim = typeof d.aim === 'number' && typeof d.tilt === 'number';
    return { hasXYZ, hasAim, pl: placeAt(hasXYZ ? d.x : 0, hasXYZ ? d.y : 0, hasXYZ ? d.z : 0, hasAim ? aimAxes(d.aim, d.tilt) : null) };
  };
  const skipOf = (d, hasXYZ, hasAim) => [...(hasXYZ ? ['x', 'y', 'z'] : []), ...(hasAim ? ['aim', 'tilt'] : []), ...(typeof d.name === 'string' ? ['name'] : []), ...(typeof d.id === 'string' ? ['id'] : [])];
  const pairs = new Map();
  for (const d of model.speakers ?? []) if (d.pairId != null) pairs.set(d.pairId, [...(pairs.get(d.pairId) ?? []), d]);
  const speakerGids = new Map((model.speakers ?? []).map((d) => [d.id, deviceGid('speaker', d)]));
  const sets = new Map();
  const occByMic = new Map();
  for (const d of model.speakers ?? []) {
    const sp = speakerGids.get(d.id);
    const { hasXYZ, hasAim, pl } = placed(d);
    const el = W.add('IFCAUDIOVISUALAPPLIANCE', sp, null, typeof d.name === 'string' ? d.name : null, null, null, pl, null, typeof d.id === 'string' ? d.id : null, enumv('SPEAKER'));
    typeOf(d.kind, 'SPEAKER', d).occ.push(el);
    const { soundCurve, ...rest } = d;
    const list = encodeProps(rest, SPEAKER_TABLE, skipOf(d, hasXYZ, hasAim));
    const twin = (pairs.get(d.pairId) ?? []).filter((x) => x !== d);
    if (twin.length === 1) list.push({ name: 'MirrorPair', value: ident(speakerGids.get(twin[0].id)) });
    pset(el, sp, 'APK_SpeakerOccurrence', list);
    pset(el, sp, 'Pset_AudioVisualApplianceTypeSpeaker', [{ name: 'SpeakerMounting', value: { enum: label(!d.mount || d.mount === 'free' ? 'FREESTANDING' : 'WALL') } }]);
    if (Array.isArray(soundCurve) && soundCurve.length) {
      const curve = soundCurve.filter((r) => Array.isArray(r) && r.every((v) => typeof v === 'number' && Number.isFinite(v)));
      pset(el, sp, 'Pset_SoundGeneration', [{ name: 'SoundCurve', table: { x: curve.map(([f]) => measure('IFCFREQUENCYMEASURE', f)), y: curve.map(([, w]) => measure('IFCSOUNDPOWERMEASURE', w)) } }]);
    }
    contain(roomRef, roomGid, el);
    // a box in a wall (flush, a corner) is on the nearest wall
    if (d.mount && d.mount !== 'free' && hasXYZ && wallRefs.size) {
      let best = null;
      for (const w of wallRefs.values()) {
        const dist = segDist([d.x, d.y], w.a, w.b);
        if (!best || dist < best.dist) best = { dist, w };
      }
      W.add('IFCRELCONNECTSELEMENTS', rel('mounted', sp), null, 'mounted on', null, null, best.w.ref, el);
    }
    const set = d.set ?? 'A';
    if (!sets.has(set)) sets.set(set, []);
    sets.get(set).push(el);
  }
  for (const d of model.mics ?? []) {
    const listener = isListener(d);
    const kind = listener ? 'listener' : 'mic';
    const mg = deviceGid(kind, d);
    const { hasXYZ, hasAim, pl } = placed(d);
    const name = typeof d.name === 'string' ? d.name : null;
    const tag = typeof d.id === 'string' ? d.id : null;
    const el = listener
      ? W.add('IFCVIRTUALELEMENT', mg, null, name, null, 'Listener', pl, null, tag, enumv('USERDEFINED'))
      : W.add('IFCAUDIOVISUALAPPLIANCE', mg, null, name, null, null, pl, null, tag, enumv('MICROPHONE'));
    if (!listener) typeOf(d.kind, 'MICROPHONE', d).occ.push(el);
    pset(el, mg, listener ? 'APK_Listener' : 'APK_MicOccurrence', encodeProps(d, MIC_TABLE, skipOf(d, hasXYZ, hasAim)));
    contain(roomRef, roomGid, el);
    occByMic.set(d.id, { el, gid: mg });
  }
  for (const d of model.furniture ?? []) {
    const fg = deviceGid('furniture', d);
    const [entity, predefined, objectType] = patchClass(d.paletteId, null);
    const cls = entity === 'IFCFURNITURE' ? [predefined, objectType] : ['USERDEFINED', PRODUCT.get(d.paletteId)?.name ?? String(d.paletteId)];
    const hasXY = typeof d.x === 'number' && typeof d.y === 'number';
    const pl = placeAt(hasXY ? d.x : 0, hasXY ? d.y : 0, 0, typeof d.rotation === 'number' ? aimAxes(d.rotation, 0) : null);
    const el = W.add('IFCFURNITURE', fg, null, PRODUCT.get(d.paletteId)?.name ?? null, null, cls[1] ?? null, pl, null, typeof d.id === 'string' ? d.id : null, enumv(cls[0]));
    pset(el, fg, 'APK_Furniture', encodeProps(d, FURNITURE_TABLE, [...(hasXY ? ['x', 'y'] : []), ...(typeof d.id === 'string' ? ['id'] : [])]));
    contain(roomRef, roomGid, el);
    associate(d.paletteId, el);
  }

  // ---- results (acoustics-6): the last finished compute, display only, with the hash of the model it was computed on
  const r = model.results;
  if (r && main) {
    pset(main.ref, main.gid, 'APK_AcousticResult', [
      ...(r.method ? [{ name: 'Method', value: label(r.method) }] : []),
      ...(typeof r.band === 'number' ? [{ name: 'Band', value: measure('IFCFREQUENCYMEASURE', r.band) }] : []),
      { name: 'Bands', value: r.bands.map((b) => measure('IFCFREQUENCYMEASURE', b)) },
      { name: 'ReverberationTimeSabine', table: tableOf(r.bands, r.sabine, 'IFCFREQUENCYMEASURE', 'IFCTIMEMEASURE') },
      { name: 'ReverberationTimeEyring', table: tableOf(r.bands, r.eyring, 'IFCFREQUENCYMEASURE', 'IFCTIMEMEASURE') },
      { name: 'ModelHash', value: ident(r.modelHash) },
    ]);
    for (const [id, row] of Object.entries(r.mics ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const at = occByMic.get(id);
      if (at) pset(at.el, at.gid, 'APK_AcousticResult', encodeProps(row, MIC_RESULT_TABLE));
    }
  }

  // ---- types, sets, containment, materials
  const types = [...typeRefs.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (types.length) W.add('IFCRELDECLARES', rel('declares', P), null, null, null, project, types.map(([, t]) => t.ref));
  for (const [, t] of types) if (t.occ.length) W.add('IFCRELDEFINESBYTYPE', rel('type', t.gid), null, null, null, t.occ, t.ref);
  for (const [set, members] of [...sets.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const sysGid = ifcGuid('decl', P, 'set', set);
    const layout = set === (model.settings?.speakerSet ?? 'A') ? model.settings?.layout?.preset : model.settings?.layoutSets?.[set]?.preset;
    const sys = W.add('IFCDISTRIBUTIONSYSTEM', sysGid, null, `Set ${set}`, null, layout ?? null, null, enumv('ELECTROACOUSTIC'));
    W.add('IFCRELASSIGNSTOGROUP', rel('group', sysGid), null, null, null, members, null, sys);
  }
  for (const [g, { ref: struct, items }] of contained) W.add('IFCRELCONTAINEDINSPATIALSTRUCTURE', rel('contains', g), null, null, null, items, struct);
  for (const [id, els] of [...usesMaterial.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) W.add('IFCRELASSOCIATESMATERIAL', rel('material', P, id), null, null, null, els, matRef.get(id));

  const header = [
    { type: 'FILE_DESCRIPTION', args: [['ViewDefinition [ReferenceView]'], '2;1'] },
    { type: 'FILE_NAME', args: [`${file.replace(/\.[^.]+$/, '')}.ifc`, '2026-01-01T00:00:00', ['APK.audio'], ['APK.audio'], 'Acoustic.Like.audio', 'Acoustic.Like.audio room export', ''] },
    { type: 'FILE_SCHEMA', args: [[IFC_SCHEMA]] },
  ];
  return writeStep({ header, entities: W.entities });
}

function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export { encodeString, formatReal, typed };
