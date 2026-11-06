// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * A BIM PART'S OWN IFC TYPE, EMBEDDED IN THE ROOM (acoustics-3). The library
 * writes each part as one IfcAudioVisualApplianceType SPEAKER in its own file
 * (DATABASE.server.BIM bim/ifc.py, GET /api/bim/parts/<id>.ifc). The room does
 * not write a stub in its place: it copies that type in — its sets, its nested
 * ports and their sets, its body map — keeping every GlobalId the part file has,
 * so the type in the room IS the library's (as EDITORS.PowerChain embeds its loads').
 *
 * What the copy leaves behind: the part file's owner history (optional), its
 * project, library and declaration (the room declares the type itself). What it
 * maps onto the room's own: the geometric contexts, the SI units the room
 * assigns, and the plane-angle unit (the room's degree); the part file's other
 * units are added to the room's IfcUnitAssignment (partUnits) so a measure the
 * type carries without a unit of its own still means what the part file meant.
 */
import { entitiesByType, ifcGuid, isRef, parseStep, ref } from '../../vendor/apk-contracts/apk-ifc.js';

/** {pid: parsed part file, type entity} of the texts whose type is the part's own (GlobalId part/<id>). */
export function partTypes(texts) {
  const out = new Map();
  for (const pid of Object.keys(texts ?? {}).sort()) {
    const text = texts[pid];
    if (typeof text !== 'string' || !text) continue;
    let file;
    try { file = parseStep(text); } catch (_) { continue; }
    const gid = ifcGuid('part', pid);
    const type = entitiesByType(file, 'IFCAUDIOVISUALAPPLIANCETYPE').find((t) => t.args[0] === gid && t.args[9]?.value === 'SPEAKER');
    if (type) out.set(pid, { file, type });
  }
  return out;
}

const convKey = (e) => `${e.args[1]?.value}/${String(e.args[2] ?? '').toLowerCase()}`;
const siKey = (e) => `${e.args[1]?.value}/${e.args[2]?.value ?? ''}/${e.args[3]?.value}`;

/**
 * The SI units the parts' files assign whose UnitType the room does not ({UnitType, prefix, name}),
 * once each, in UnitType order: the room's assignment adds them.
 */
export function partUnits(parsed, roomUnitTypes) {
  const have = new Set(roomUnitTypes);
  const extra = new Map();
  for (const { file } of parsed.values()) {
    for (const ua of entitiesByType(file, 'IFCUNITASSIGNMENT')) {
      for (const r of ua.args[0] ?? []) {
        const u = isRef(r) ? file.byId.get(r.id) : null;
        if (!u || u.type !== 'IFCSIUNIT') continue;
        const t = u.args[1]?.value;
        if (!t || have.has(t) || extra.has(t)) continue;
        extra.set(t, { type: t, prefix: u.args[2]?.value ?? null, name: u.args[3]?.value });
      }
    }
  }
  return [...extra.values()].sort((a, b) => (a.type < b.type ? -1 : 1));
}

/**
 * Copy one part's type out of its own file into W (W.add(type, ...args) → ref, W.entities):
 * the type, its sets, its nested ports and their sets, with their GlobalIds. `siUnits` maps
 * 'UNITTYPE/PREFIX/NAME' → the room's unit ref, `degree` is the room's plane-angle unit;
 * `contextUnits` (dBu ...) and `conversionUnits` (litre ...) are shared across copies, once each.
 * → {ref, name}.
 */
export function copyType(W, { file, type }, { ctx, bodyCtx, siUnits, degree, contextUnits, conversionUnits = new Map() }) {
  const include = new Set([type.id]);
  const portIds = new Set();
  for (const e of file.entities) {
    if (e.type === 'IFCRELNESTS' && isRef(e.args[4]) && e.args[4].id === type.id) {
      include.add(e.id);
      for (const r of e.args[5] ?? []) if (isRef(r)) portIds.add(r.id);
    }
  }
  for (const id of portIds) include.add(id);
  for (const e of file.entities) {
    if (e.type === 'IFCRELDEFINESBYPROPERTIES' && (e.args[4] ?? []).length && e.args[4].every((r) => isRef(r) && portIds.has(r.id))) include.add(e.id);
  }
  const map = new Map(); // part-file id → room ref (null: dropped)
  const mapped = (e) => {
    if (e.type === 'IFCOWNERHISTORY') return null;
    if (e.type === 'IFCGEOMETRICREPRESENTATIONCONTEXT') return ctx;
    if (e.type === 'IFCGEOMETRICREPRESENTATIONSUBCONTEXT') return bodyCtx;
    if (e.type === 'IFCSIUNIT') return siUnits.get(siKey(e));
    if (e.type === 'IFCCONVERSIONBASEDUNIT' && e.args[1]?.value === 'PLANEANGLEUNIT' && /^degree$/i.test(e.args[2] ?? '') && degree) return degree;
    if (e.type === 'IFCCONTEXTDEPENDENTUNIT' && contextUnits.has(e.args[2])) return contextUnits.get(e.args[2]);
    if (e.type === 'IFCCONVERSIONBASEDUNIT' && conversionUnits.has(convKey(e))) return conversionUnits.get(convKey(e));
    return undefined;
  };
  const order = [];
  const visit = (id) => {
    if (map.has(id)) return;
    const e = file.byId.get(id);
    if (!e) { map.set(id, null); return; }
    const m = mapped(e);
    if (m !== undefined) { map.set(id, m); return; }
    map.set(id, 'pending');
    order.push(id);
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (isRef(v)) visit(v.id);
      else if (v && typeof v === 'object' && v.kind === 'typed') walk(v.value);
    };
    e.args.forEach(walk);
  };
  [...include].sort((a, b) => a - b).forEach(visit);
  order.sort((a, b) => a - b);
  const base = W.entities.length;
  order.forEach((id, i) => map.set(id, ref(base + i + 1)));
  const remap = (v) => {
    if (Array.isArray(v)) return v.map(remap);
    if (isRef(v)) return map.get(v.id) ?? null;
    if (v && typeof v === 'object' && v.kind === 'typed') return { ...v, value: remap(v.value) };
    return v;
  };
  for (const id of order) {
    const e = file.byId.get(id);
    const r = W.add(e.type, ...e.args.map(remap));
    if (e.type === 'IFCCONTEXTDEPENDENTUNIT') contextUnits.set(e.args[2], r);
    if (e.type === 'IFCCONVERSIONBASEDUNIT') conversionUnits.set(convKey(e), r);
  }
  return { ref: map.get(type.id), name: type.args[2] };
}
