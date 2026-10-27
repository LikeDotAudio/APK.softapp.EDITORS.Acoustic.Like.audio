// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxSize, makeSpeaker } from '../js/acoustics/devices.js';
import { buildRoom } from '../js/acoustics/room.js';
import { buildMarks, spacesOf } from '../js/cad/marks.js';
import { boxFront, schematicDrawing, setChannels } from '../js/cad/schematic.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';

const poly = [{ x: -2.5, y: 0 }, { x: 2.5, y: 0 }, { x: 2.5, y: 6 }, { x: -2.5, y: 6 }];
const spk = (set, role, kind = 'dmt12', extra = {}) => makeSpeaker(kind, { x: 0, y: 5 }, { name: `${set} ${role}`, role, set, ...extra });
const speakers = [spk('A', 'L'), spk('A', 'R'), spk('A', 'C'), spk('A', 'LFE', 'sub', { lowpass: 80 }), spk('B', 'L', 'monitor', { trimDb: -2, invert: true }), spk('B', 'R', 'monitor'), spk('C', 'L', 'cube'), spk('C', 'R', 'cube')];
const settings = { ...DEFAULT_SETTINGS, racks: { 'block:9': { units: 12, items: [{ name: 'Power amp', at: 1, units: 2, depth: 480 }] } } };
const rackPatch = { id: 'block:9', paletteId: 'rack-600x800', layer: 'Plan', poly: [{ x: 1.5, y: 1 }, { x: 2.1, y: 1 }, { x: 2.1, y: 1.8 }, { x: 1.5, y: 1.8 }], at: { x: 1.8, y: 1.4 }, rotation: 0 };
const room = buildRoom(poly, settings, [], [rackPatch]);
const state = { settings, speakers, mics: [{ id: 'm1', name: 'Mixer', kind: 'mixer', mix: true, x: 0, y: 3, z: 1.2 }, { id: 'm2', name: 'E1', kind: 'omni', pattern: 'omni', x: 1, y: 3, z: 1.2 }] };
const words = (d) => d.texts.map((t) => t.text).join('\n');

test('every set is wired: a bus each, a channel strip and a box per speaker', () => {
  const sets = setChannels(speakers, settings);
  assert.deepEqual(sets.map((g) => [g.set, g.speakers.length]), [['A', 4], ['B', 2], ['C', 2]]);
  assert.equal(sets.find((g) => g.live).set, 'A');
  const d = schematicDrawing(state, room.patches);
  const w = words(d);
  for (const s of speakers) assert.ok(w.includes(s.name), s.name);
  assert.match(w, /MONITOR CTRL/);
  assert.match(w, /A SET · .* · LIVE/);
  assert.match(w, /PLAYBACK \/ DAW/);
});

test('a channel says what the controller does to it: trim, polarity, and a sub its low-pass', () => {
  const w = words(schematicDrawing(state, room.patches));
  assert.match(w, /B·L {2}trim -2\.0 dB {2}Ø/);
  assert.match(w, /LPF 80 Hz/);
});

test('the measurement mics come in, the people do not', () => {
  const w = words(schematicDrawing(state, room.patches));
  assert.match(w, /MIC INPUTS/);
  assert.match(w, /\bE1\b/);
  assert.ok(!/^Mixer$/m.test(w));
});

test('the racks are in it, U by U, what is used and what is free', () => {
  const w = words(schematicDrawing(state, room.patches));
  assert.match(w, /RACK #9 · 12 U/);
  assert.match(w, /2 U used · 10 U free/);
  assert.match(w, /Power amp · 2 U · 580 mm/);
  assert.ok((w.match(/· free/g) ?? []).length === 10);
});

test('drawn into the CAD clear of the room, on its own layer, with a tab of its own', () => {
  const out = buildMarks({ room, state, planLayer: 'Plan', sheetBounds: null, k: 1, layers: new Set(), rooms: [{ room, name: 'Room' }], wallPatches: [] });
  const [d] = out.schematic;
  assert.equal(d.layer, 'Schematic');
  assert.ok(d.at[0] > 2.5, 'right of the plan');
  for (const [x1, y1, x2, y2] of d.lines) assert.ok([x1, y1, x2, y2].every(Number.isFinite));
  const tab = spacesOf(room, out, 1).find((s) => s.id === 'host:schematic');
  assert.ok(tab && tab.bounds[0] > 2.5);
  const off = buildMarks({ room, state: { ...state, settings: { ...settings, cadMarks: { ...settings.cadMarks, schematic: false } } }, planLayer: 'Plan', sheetBounds: null, k: 1, layers: new Set(), rooms: [], wallPatches: [] });
  assert.equal(off.schematic.length, 0);
});

test('each box is drawn beside its channel: its front at 1:2, its drivers in it, its size in mm', () => {
  const lines = [];
  const big = boxFront(speakers[0], 0, 0, lines);
  assert.ok(lines.length > 40, 'a cabinet and its rings');
  const small = boxFront(speakers[6], 0, 0, []);
  assert.ok(big.h > small.h && big.w > small.w, 'one scale for all: the DMT 12 outsizes the cube');
  assert.ok(Math.abs(big.h - big.size.h / 2) < 1e-9);
  // every ring lies inside its cabinet
  for (const [x1, y1, x2, y2] of lines) for (const [x, y] of [[x1, y1], [x2, y2]]) assert.ok(Math.abs(x) <= big.w / 2 + 1e-9 && Math.abs(y) <= big.h / 2 + 1e-9, `${x}, ${y}`);
  const w = words(schematicDrawing(state, room.patches));
  assert.match(w, /THE BOXES · 1:2/);
  const { w: bw, h: bh } = boxSize(speakers[0]);
  assert.ok(w.includes(`${Math.round(bw * 1000)} × ${Math.round(bh * 1000)} mm`));
});
