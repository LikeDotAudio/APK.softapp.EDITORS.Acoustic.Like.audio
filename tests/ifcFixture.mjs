// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * A designed room to export: a 5 × 7 m control room drawn in mm on layer L1,
 * a left-wall elevation, a panel on it, a cloud on the ceiling, carpet and a
 * desk on the plan, a symmetric L/R pair across the Virtual Mirror at
 * x = 2500 mm, a sub, the mix seat and a measurement mic — and the results
 * the engine would have shown. Shared by tests/ifc.test.mjs and
 * scripts/export-sample-ifc.mjs (which writes it for the IfcOpenShell check).
 */
import { makeMic, makeSpeaker } from '../js/acoustics/devices.js';
import { mirrorDevice } from '../js/acoustics/symmetry.js';

export function sampleGeometry() {
  return {
    protocol: 'cad.like.audio/host@1',
    type: 'geometry',
    fileName: 'Studio A.cad',
    units: 'mm',
    walls: [
      { edgeId: 1, a: [0, 0], b: [5000, 0], layerId: 'L1' },
      { edgeId: 2, a: [5000, 0], b: [5000, 7000], layerId: 'L1' },
      { edgeId: 3, a: [5000, 7000], b: [0, 7000], layerId: 'L1' },
      { edgeId: 4, a: [0, 7000], b: [0, 0], layerId: 'L1' },
    ],
    rooms: [
      { id: 1, layerId: 'L1', points: [[0, 0], [5000, 0], [5000, 7000], [0, 7000]], kind: 'loop' },
      { id: 2, layerId: 'L2', points: [[12000, 0], [16000, 0], [16000, 3000], [12000, 3000]], kind: 'loop' },
      { id: 3, layerId: 'EL', points: [[0, 10000], [7000, 10000], [7000, 13000], [0, 13000]], kind: 'loop' },
    ],
    layers: [
      { id: 'L1', name: 'Control room', color: '#e5e7eb' },
      { id: 'L2', name: 'Room · Booth', color: '#e5e7eb', finish: 'gypsum' },
      { id: 'EL', name: 'Elevation Left', color: '#ffcc00' },
      { id: 'CL', name: 'Ceiling', color: '#88ccff' },
    ],
    patches: [
      { id: 'fill:1', paletteId: 'carpet-felt', layerId: 'L1', points: [[1000, 1000], [4000, 1000], [4000, 4000], [1000, 4000]] },
      { id: 'block:2', paletteId: 'panel-1200x600x100', layerId: 'EL', points: [[2000, 11000], [3200, 11000], [3200, 11600], [2000, 11600]], at: [2600, 11300], rotation: 0 },
      { id: 'block:3', paletteId: 'cloud-1200', layerId: 'CL', points: [[1900, 2900], [3100, 2900], [3100, 4100], [1900, 4100]], at: [2500, 3500], rotation: 0 },
      { id: 'block:4', paletteId: 'desk-1800x900', layerId: 'L1', points: [[1600, 3000], [3400, 3000], [3400, 3900], [1600, 3900]], at: [2500, 3450], rotation: 90, host: 'console' },
      { id: 'block:5', paletteId: 'window-1800x1200', layerId: 'EL', points: [[4000, 11000], [5800, 11000], [5800, 12200], [4000, 12200]], at: [4900, 11600], rotation: 0 },
    ],
    marks: {},
  };
}

export const sampleMirror = () => ({ protocol: 'cad.like.audio/host@1', type: 'mirror', enabled: true, x: 2500, axes: [2500] });

export function sampleOverlay() {
  const l = { ...makeSpeaker('dmt12', { x: 1.3, y: 5.6, z: 1.25 }, { role: 'L', side: 'L', pairId: 'p1' }), id: 'sL', aim: 300, tilt: -7.5, delayMs: 1.7, gainDb: -1.5 };
  const r = { ...mirrorDevice(l, 2.5), id: 'sR' };
  const sub = { ...makeSpeaker('sub', { x: 2.5, y: 6.6, z: 0.3 }), id: 'sSub', mount: 'flush', set: 'A' };
  const nf = { ...makeSpeaker('genelec-1032a', { x: 2.5, y: 4.2, z: 1.1 }), id: 'sB1', set: 'B', aim: 270, tilt: 90 };
  const mix = { ...makeMic('mixer', { x: 2.5, y: 3.0, z: 1.2 }, { mix: true }), id: 'mMix', aim: 90 };
  const meas = { ...makeMic('omni', { x: 2.0, y: 2.0, z: 1.2 }), id: 'mOmni', name: 'Measurement · ünïcode ✓ 🎧' };
  return {
    format: 'acoustic.like.audio@1',
    fileName: 'Studio A.cad',
    settings: {
      roomHeight: 3.0,
      frontDeg: 90,
      roomId: 1,
      faceMaterials: { floor: 'wood-floor', ceiling: 'acoustic-tile', front: 'gypsum', back: 'absorber-100', left: 'gypsum', right: 'brick' },
      walls: { '250,0': { material: 'concrete-painted', note: "the old 'party' wall" }, '999,999': { note: 'gone' } },
      roomHeights: { L2: 2.4, Lgone: 2.2 },
      symmetry: { sides: 'mirror', front: 'off', back: 'off' },
      method: 'modal',
      maxOrder: 3,
      freq: 80,
      band: 2,
      view: '3d',
      show: { field: true },
      speakerSet: 'A',
      layout: { preset: '2.0', radius: 2, rotate: 0, mains: 'dmt12', surround: 'dmt8' },
      layoutSets: { B: { preset: '5.1', radius: 1.6, rotate: 0, mains: 'genelec-1032a', surround: 'genelec-1031a' } },
      racks: { 'block:9': { units: 24, items: [{ name: 'Patchbay', at: 1, units: 2 }] } },
      isolation: { walls: 'stud' },
    },
    speakers: [l, r, sub, nf],
    mics: [mix, meas],
    furniture: [{ id: 'f1', paletteId: 'couch-2000x900', x: 2.5, y: 0.9, rotation: 0 }],
    locked: ['sSub'],
  };
}

export const sampleResults = () => ({
  method: 'modal',
  band: 500,
  sabine: [0.41, 0.36, 0.31, 0.29, 0.28, 0.27],
  eyring: [0.38, 0.33, 0.28, 0.26, 0.25, NaN],
  mics: { mMix: { EDT: 0.22, T20: 0.3, T30: 0.31, C50: 9.4, C80: 14.2, D50: 0.89, Ts: 18.5, SPL: 92.1, STI: 0.81 }, mOmni: { EDT: 0.25, T20: Infinity }, gone: { EDT: 1 } },
});
