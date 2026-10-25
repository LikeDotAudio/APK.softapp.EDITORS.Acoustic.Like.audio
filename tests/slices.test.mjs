// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { elevationOrigin } from '../js/acoustics/patches.js';
import { brassMarker, buildMarks, furnitureLayer } from '../js/cad/marks.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';

const settings = { ...DEFAULT_SETTINGS, roomHeight: 3, frontDeg: 90, cadMarks: { slices: true } };
const poly = [{ x: -2.1, y: 0 }, { x: 2.1, y: 0 }, { x: 2.1, y: 5 }, { x: -2.1, y: 5 }];
const desk = { id: 'block:3', paletteId: 'producer-desk-1800x600', layer: furnitureLayer('producer-desk-1800x600'), poly: [{ x: -0.9, y: 2.2 }, { x: 0.9, y: 2.2 }, { x: 0.9, y: 2.8 }, { x: -0.9, y: 2.8 }] };
const room0 = buildRoom(poly, settings);
const o = elevationOrigin(room0, 'front');
const panel = { id: 'fill:1', paletteId: 'absorber-100', layer: 'Elevation Front', poly: [{ x: o.x + 0.6, y: o.y + 0.9 }, { x: o.x + 1.5, y: o.y + 0.9 }, { x: o.x + 1.5, y: o.y + 2.1 }, { x: o.x + 0.6, y: o.y + 2.1 }] };
const room = buildRoom(poly, settings, [], [desk, panel]);
const state = { settings, speakers: [{ id: 's1', role: 'L', x: -1, y: 1, z: 1.2, aim: 60 }], mics: [{ id: 'm1', name: 'Mixer', mix: true, x: 0, y: 3.2, z: 1.2, aim: 270 }] };
const slices = buildMarks({ room, state, planLayer: 'Room', sheetBounds: null, k: 1, layers: new Set(), rooms: [], patches: [desk, panel] }).slices;
const on = (layer) => slices.filter((s) => s.layer === layer);
const words = (layer) => on(layer).flatMap((s) => s.texts.map((t) => t.text));

test('the brass marker is the middle of the plan, on its own layer', () => {
  assert.deepEqual(brassMarker(room), { x: 0, y: 2.5 });
  assert.match(words('Brass marker')[0], /^BRASS MARKER · 0, 0/);
});

test('one layer per thing: ceiling, floor heights, speakers, placement, each kind of furniture, each wall, each absorber', () => {
  const layers = new Set(slices.map((s) => s.layer));
  for (const l of ['Brass marker', 'Plan · Ceiling', 'Plan · Floor heights', 'Plan · Speakers', 'Plan · Placement', 'Plan · Producer desk 1800×600', 'Absorption · Porous absorber, 100 mm']) assert.ok(layers.has(l), `no ${l} in ${[...layers].join(' | ')}`);
  assert.equal([...layers].filter((l) => /^Wall \d · /.test(l)).length, 4);
});

test('everything is measured in mm from the brass marker', () => {
  assert.match(words('Plan · Speakers')[0], /^L · x -1000 · y -1500 · z 1200$/);
  assert.match(words('Plan · Placement')[0], /^MIX · Mixer · x 0 · y \+700 · z 1200$/);
  assert.match(words('Plan · Producer desk 1800×600')[0], /centre x 0 · y 0$/);
  assert.ok(words('Plan · Ceiling').includes('3000'), 'the ceiling spot heights');
  assert.ok(words('Plan · Floor heights').includes('0'), 'the floor spot heights');
  assert.match(words('Absorption · Porous absorber, 100 mm').at(-1), /1 patch · 1\.08 m²/);
});
