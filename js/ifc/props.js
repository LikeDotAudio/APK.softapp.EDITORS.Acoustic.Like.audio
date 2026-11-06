// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * APK_ PROPERTIES, BOTH WAYS — how an overlay object's fields become IFC
 * properties and come back unchanged (roomToIfc / ifcToRoom).
 *
 * A TABLE names the fields IFC has a word for: the property's name, its
 * measure and the scale from the app's unit to the file's (delayMs → DelayTime
 * in s, litres → EnclosureVolume in m³, w/h/d in mm, coverage in degrees, a
 * dB figure as IfcReal with the 'dB' unit). Every other field is kept under
 * its own name, typed by what it is: a number IfcReal, a string IfcLabel, a
 * boolean IfcBoolean, anything else IfcText holding its JSON — so no field of
 * the overlay is lost on the way through, and the reader needs no list of them.
 * Generic fields are written in sorted order, so a file is the same however
 * the object's keys were ordered.
 */

import { enumv, real, typed } from '../../vendor/apk-contracts/apk-ifc.js';
import { sig } from './placement.js';

export const label = (s) => typed('IFCLABEL', String(s));
export const ident = (s) => typed('IFCIDENTIFIER', String(s));
export const text = (s) => typed('IFCTEXT', String(s));
export const bool = (b) => typed('IFCBOOLEAN', enumv(b ? 'T' : 'F'));
export const measure = (type, x) => typed(type, real(x));

/** One field as the file holds it: [IFC value, unit key | null], or null when it cannot be held under this rule. */
function encode(rule, v) {
  if (rule === 'label') return typeof v === 'string' ? [label(v), null] : null;
  if (rule === 'id') return typeof v === 'string' ? [ident(v), null] : null;
  if (rule === 'bool') return typeof v === 'boolean' ? [bool(v), null] : null;
  if (Array.isArray(rule)) {
    const [type, scale = 1, unit = null] = rule;
    return typeof v === 'number' && Number.isFinite(v) ? [measure(type, sig(v * scale)), unit] : null;
  }
  return null;
}

/** Any field, by what it is. */
function generic(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return measure('IFCREAL', v);
  if (typeof v === 'string') return label(v);
  if (typeof v === 'boolean') return bool(v);
  return text(JSON.stringify(v));
}

/**
 * The properties of `obj` as [{ name, value, unit }] — `table` first, in its
 * order, then the rest sorted — leaving out `skip` (the fields the entity
 * itself carries: its placement, name, tag).
 */
export function encodeProps(obj, table = {}, skip = []) {
  const out = [];
  const done = new Set(skip);
  for (const [key, [name, rule]] of Object.entries(table)) {
    if (!(key in obj) || done.has(key)) continue;
    const got = encode(rule, obj[key]);
    if (!got) continue;
    out.push({ name, value: got[0], unit: got[1] });
    done.add(key);
  }
  for (const key of Object.keys(obj).sort()) {
    if (done.has(key) || obj[key] === undefined) continue;
    out.push({ name: key, value: generic(obj[key]), unit: null });
  }
  return out;
}

/** A read property value (ifcToRoom readValue) back to the field it was written from. */
function decode(rule, v) {
  if (Array.isArray(rule)) return sig(v.value / (rule[1] ?? 1));
  return v.value;
}

/** Read properties { name: { value, measure } } back to the object they were written from. */
export function decodeProps(props, table = {}, ignore = []) {
  const byName = new Map(Object.entries(table).map(([key, [name, rule]]) => [name, [key, rule]]));
  const out = {};
  for (const [name, v] of Object.entries(props)) {
    if (ignore.includes(name)) continue;
    const t = byName.get(name);
    if (t) {
      out[t[0]] = decode(t[1], v);
      continue;
    }
    if (v.measure === 'IFCTEXT') {
      try {
        out[name] = JSON.parse(v.value);
      } catch {
        out[name] = v.value;
      }
    } else out[name] = v.value;
  }
  return out;
}

// ---------------------------------------------------------------- the tables: what IFC has a word for

const dB = ['IFCREAL', 1, 'dB'];
const FREQ = ['IFCFREQUENCYMEASURE'];
const SPL = ['IFCSOUNDPRESSURELEVELMEASURE'];
const ANGLE = ['IFCPLANEANGLEMEASURE'];
const MM = ['IFCPOSITIVELENGTHMEASURE', 1000];

/** A speaker occurrence (devices.js makeSpeaker + SPEAKER_SPEC) → APK_SpeakerOccurrence. */
export const SPEAKER_TABLE = {
  kind: ['Kind', 'id'],
  part: ['Part', 'id'],
  set: ['SpeakerSet', 'label'],
  role: ['Role', 'label'],
  side: ['Side', 'label'],
  pairId: ['PairId', 'id'],
  mount: ['Mount', 'label'],
  delayMs: ['DelayTime', ['IFCTIMEMEASURE', 0.001]],
  gainDb: ['Gain', dB],
  trimDb: ['Trim', dB],
  drive: ['Drive', 'label'],
  level: ['Level', SPL],
  watts: ['DrivePower', ['IFCPOWERMEASURE']],
  sensitivity: ['Sensitivity', SPL],
  maxSpl: ['MaxSpl', SPL],
  fLow: ['FrequencyLow', FREQ],
  fHigh: ['FrequencyHigh', FREQ],
  fCross: ['CrossoverFrequency', FREQ],
  lowpass: ['LowPass', FREQ],
  omniBelow: ['OmniBelow', FREQ],
  hCov: ['CoverageHorizontal', ANGLE],
  vCov: ['CoverageVertical', ANGLE],
  pattern: ['Pattern', 'label'],
  driver: ['Driver', 'label'],
  litres: ['EnclosureVolume', ['IFCVOLUMEMEASURE', 0.001]],
  w: ['Width', MM],
  h: ['Height', MM],
  d: ['Depth', MM],
  centerHeight: ['CentreHeight', ['IFCLENGTHMEASURE', 1000]],
  wooferHeight: ['WooferHeight', ['IFCLENGTHMEASURE', 1000]],
  maker: ['Maker', 'label'],
  color: ['Colour', 'label'],
  mute: ['Mute', 'bool'],
  solo: ['Solo', 'bool'],
  invert: ['PolarityInverted', 'bool'],
};

/** A mic or listener (devices.js makeMic) → APK_MicOccurrence / APK_Listener. */
export const MIC_TABLE = {
  kind: ['Kind', 'id'],
  pattern: ['Pattern', 'label'],
  mix: ['IsMixPosition', 'bool'],
  tier: ['Tier', ['IFCREAL']],
  weight: ['Weight', ['IFCREAL']],
  pairId: ['PairId', 'id'],
  side: ['Side', 'label'],
};

/** Furniture the overlay keeps (store.js addFurniture) → APK_Furniture. */
export const FURNITURE_TABLE = { paletteId: ['PaletteId', 'id'], rotation: ['Rotation', ANGLE] };

/** settings.symmetry → APK_Symmetry (beside the mirror axis). */
export const SYMMETRY_TABLE = { sides: ['Sides', 'label'], front: ['Front', 'label'], back: ['Back', 'label'] };

/** One listener's ISO 3382 figures → APK_AcousticResult on its occurrence. */
export const MIC_RESULT_TABLE = {
  EDT: ['EarlyDecayTime', ['IFCTIMEMEASURE']],
  T20: ['T20', ['IFCTIMEMEASURE']],
  T30: ['T30', ['IFCTIMEMEASURE']],
  C50: ['C50', dB],
  C80: ['C80', dB],
  D50: ['D50', ['IFCREAL']],
  Ts: ['CentreTime', ['IFCTIMEMEASURE', 0.001]],
  SPL: ['SoundPressureLevel', SPL],
  STI: ['STI', ['IFCNORMALISEDRATIOMEASURE']],
};
