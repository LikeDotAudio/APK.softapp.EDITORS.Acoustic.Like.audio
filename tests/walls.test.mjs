// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanFromCad } from '../js/compute/engine.js';
import { buildRoom } from '../js/acoustics/room.js';
import { planFromWalls, wallKey } from '../js/acoustics/wallChains.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';

const P = (x, y) => ({ x, y });
// a 5 × 7 m room, its front wall in two pieces with a 900 mm doorway between them
const pieces = [
  { a: P(0, 0), b: P(2, 0) },
  { a: P(2.9, 0), b: P(5, 0) },
  { a: P(5, 0), b: P(5, 7) },
  { a: P(5, 7), b: P(0, 7) },
  { a: P(0, 7), b: P(0, 0) },
];

test('wall pieces with a gap close into a room, the gap an opening as wide as the space', () => {
  const plan = planFromWalls(pieces);
  assert.equal(plan.openings.length, 1);
  assert.ok(Math.abs(plan.openings[0].width - 0.9) < 1e-9);
  const area = Math.abs(plan.poly.reduce((s, p, i) => { const q = plan.poly[(i + 1) % plan.poly.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);
  assert.ok(Math.abs(area - 35) < 1e-9);
});

test('a gap wider than the widest opening is a plan still being drawn', () => {
  assert.equal(planFromWalls(pieces, 0.5), null);
});

test('the opening lands on its wall and lets sound out; a wall told what it is keeps it', () => {
  const settings = structuredClone(DEFAULT_SETTINGS);
  const plan = planFromWalls(pieces);
  const plain = buildRoom(plan.poly, settings);
  const room = buildRoom(plan.poly, settings, [], [], plan.openings);
  const front = room.walls.find((w) => w.openings.length);
  assert.ok(front, 'one wall carries the doorway');
  assert.ok(Math.abs(front.openings[0].width - 0.9) < 1e-9);
  assert.ok(room.perBand[2].A > plain.perBand[2].A);
  const key = wallKey(room.walls[1]);
  const told = buildRoom(plan.poly, { ...settings, walls: { [key]: { material: 'glass-heavy', note: 'the control-room glass' } } });
  const w = told.walls.find((x) => x.key === key);
  assert.equal(w.material.base, 'glass-heavy');
  assert.equal(w.note, 'the control-room glass');
});

test('the CAD sends loose wall pieces: the engine reads the room from them, in drawing units', () => {
  const geometry = { units: 'mm', layers: [{ id: 'L0', name: '0' }, { id: 'E', name: 'Elevation Front' }], walls: [...pieces.map((s) => ({ a: [s.a.x * 1000, s.a.y * 1000], b: [s.b.x * 1000, s.b.y * 1000], layerId: 'L0' })), { a: [0, -9000], b: [9000, -9000], layerId: 'E' }], rooms: [] };
  const open = openPlanFromCad(geometry);
  assert.equal(open.layerId, 'L0');
  assert.equal(open.openings.length, 1);
});
