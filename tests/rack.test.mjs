// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { furnitureHeight, PRODUCTS } from '../js/acoustics/materials.js';
import { floorSolids, partsOf, pieceFootprint } from '../js/acoustics/pieces.js';
import { firstFree, isRack, itemFromPart, rackHeight, rackOf, rackPieces, rackPlan, U_MM } from '../js/acoustics/rack.js';

const ID = 'rack-600x800';

test('an empty rack is 24 U, all of it free, and stands the 1200 mm the rack always stood', () => {
  const rack = rackOf({}, 'r1', ID);
  const plan = rackPlan(rack);
  assert.equal(plan.units, 24);
  assert.equal(plan.free, 24);
  assert.deepEqual(plan.runs.map((r) => [r.from, r.to, r.n]), [[1, 24, 24]]);
  assert.ok(Math.abs(rackHeight(rack) - furnitureHeight(ID)) < 0.01);
  assert.equal(rack.railDepth, 650, 'the rails take the cabinet less its door and its back');
});

test('used and free spaces, U by U, and the empty runs between the gear', () => {
  const rack = rackOf({ r1: { units: 12, items: [{ name: 'Amp', at: 1, units: 2, depth: 400 }, { name: 'DSP', at: 6, units: 1, depth: 250 }] } }, 'r1', ID);
  const plan = rackPlan(rack);
  assert.equal(plan.used, 3);
  assert.equal(plan.free, 9);
  assert.deepEqual(plan.runs.map((r) => [r.from, r.to]), [[3, 5], [7, 12]]);
  assert.equal(plan.slots[1].item.name, 'Amp');
  assert.equal(firstFree(plan, 3), 3);
  assert.equal(firstFree(plan, 4), 7);
  assert.equal(firstFree(plan, 7), null);
});

test('how deep a piece really is: its chassis and its cables, against the rails', () => {
  const rack = rackOf({ r1: { railDepth: 500, cable: 120, items: [{ name: 'Server', at: 1, units: 1, depth: 420 }, { name: 'Patch', at: 2, units: 1, depth: 60, cable: 40 }] } }, 'r1', ID);
  const plan = rackPlan(rack);
  assert.equal(plan.items[0].reach, 540);
  assert.equal(plan.items[0].fits, false);
  assert.equal(plan.items[1].reach, 100, 'an item can say its own cable room');
  assert.equal(plan.deepest.name, 'Server');
  assert.ok(plan.problems.some((p) => /Server is 540 mm deep/.test(p)));
});

test('a clash, a unit off the top and a depth nobody gave are each said', () => {
  const rack = rackOf({ r1: { units: 4, items: [{ name: 'A', at: 1, units: 2, depth: 100 }, { name: 'B', at: 2, units: 1, depth: 100 }, { name: 'C', at: 4, units: 2 }] } }, 'r1', ID);
  const { problems } = rackPlan(rack);
  assert.ok(problems.some((p) => /U2: B and A/.test(p)));
  assert.ok(problems.some((p) => /C .*runs off/.test(p)));
  assert.ok(problems.some((p) => /C: depth not known/.test(p)));
});

test('the rack is drawn from what it holds: an item a panel wide, its U tall and as deep as it goes; an empty U is air', () => {
  const rack = rackOf({ r1: { items: [{ name: 'Amp', at: 3, units: 2, depth: 400 }] } }, 'r1', ID);
  const parts = rackPieces(rack, ID);
  const amp = parts.find((pc) => Math.abs(pc.d - 0.4) < 1e-9);
  assert.ok(amp, 'the amp, 400 mm deep');
  assert.ok(Math.abs(amp.h - (2 * U_MM) / 1000) < 0.003);
  for (const pc of parts) for (const [x, y] of pieceFootprint(pc)) assert.ok(Math.abs(x) <= 0.3 + 1e-9 && Math.abs(y) <= 0.4 + 0.2, `inside the cabinet (or its cables just behind): ${x}, ${y}`);
  const piece = { paletteId: ID, at: { x: 0, y: 0 }, rotation: 0, rack, points3d: [{ x: -0.3, y: -0.4, z: 0 }, { x: 0.3, y: -0.4, z: 0 }, { x: 0.3, y: 0.4, z: 0 }, { x: -0.3, y: 0.4, z: 0 }] };
  assert.equal(partsOf(piece).length, parts.length);
  assert.equal(floorSolids(piece, rackHeight(rack)).length, parts.length);
});

test('every rack in the palette is a rack, and a catalogued part comes in with its U and its depth', () => {
  const racks = PRODUCTS.filter((p) => isRack(p.id));
  assert.ok(racks.length >= 3);
  const parts = JSON.parse(readFileSync(new URL('../../../../OS/BIM/parts.json', import.meta.url))).parts;
  const dmm = parts.find((p) => p.id === 'agilent-34401a');
  const it = itemFromPart(dmm, 5);
  assert.equal(it.units, 2);
  assert.equal(it.depth, 348);
  assert.equal(it.at, 5);
  for (const p of parts) if ('depth_mm' in p) assert.ok(p.depth_mm > 0 && p.depth_mm < 1200, p.id);
});
