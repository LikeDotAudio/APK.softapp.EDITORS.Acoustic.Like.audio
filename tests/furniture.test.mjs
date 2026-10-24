// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { lookup } from '../js/acoustics/materials.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';

const box = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 7 }, { x: 0, y: 7 }];
// a bare, hard room — the boomy empty room the furniture is meant to tame
const hard = 'concrete-painted';
const settings = { ...DEFAULT_SETTINGS, roomHeight: 3, frontDeg: 90, faceMaterials: { floor: 'concrete-floor', ceiling: hard, front: hard, back: hard, left: hard, right: hard } };
const rectAt = (x, y, w, d) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + d }, { x, y: y + d }];
const on = (paletteId, poly) => ({ id: paletteId, paletteId, layer: 'Furniture', poly });

test('a couch is a bass trap: its sides absorb as well as its footprint, and the low end decays sooner', () => {
  const bare = buildRoom(box, settings);
  const couch = buildRoom(box, settings, [], [on('couch-2400x1000', rectAt(1.3, 0.3, 2.4, 1.0))]);
  assert.equal(couch.objects.count, 1);
  // 2.4 × 1.0 at 0.8 m tall: 6.8 m of perimeter, 5.44 m² of sides
  assert.ok(Math.abs(couch.objects.area - 6.8 * 0.8) < 1e-6);
  assert.ok(Math.abs(couch.perBand[0].Aobj - 5.44 * 0.35) < 1e-6);
  assert.ok(couch.perBand[0].eyring < bare.perBand[0].eyring * 0.8, `${couch.perBand[0].eyring} vs ${bare.perBand[0].eyring}`);
  // below 125 Hz it keeps working, less than at 125 — a deep porous absorber, not a copy of its 125 Hz figure
  const at63 = couch.perBand9[1].Aobj;
  assert.ok(at63 > 0 && at63 < couch.perBand9[2].Aobj);
  assert.equal(lookup('upholstered').alpha9[1], 0.22);
});

test('a heavy table is a panel: its underside counts, and it absorbs most in the bottom octaves', () => {
  const table = buildRoom(box, settings, [], [on('table-heavy-2400x1000', rectAt(1.3, 3, 2.4, 1.0))]);
  assert.ok(Math.abs(table.objects.area - 2.4) < 1e-6, 'the underside: its footprint again');
  const a9 = table.perBand9.map((p) => p.Aobj);
  assert.equal(a9.indexOf(Math.max(...a9)), 1, 'its hump at 63 Hz');
});

test('an empty room is computed exactly as before', () => {
  const r = buildRoom(box, settings);
  assert.equal(r.objects.count, 0);
  for (const p of r.perBand) assert.equal(p.Aobj, 0);
});
