// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { seedOutline } from '../js/acoustics/elevations.js';
import { MATERIALS, PRODUCTS, lookup, material, paletteItems } from '../js/acoustics/materials.js';
import { patchesFromCad } from '../js/compute/engine.js';

// Patches painted in the CAD → the surfaces they land on, and what that does to A.

const settings = (over = {}) => ({
  roomHeight: 3,
  frontDeg: 90,
  band: 2,
  faceMaterials: { floor: 'concrete-floor', ceiling: 'concrete-painted', front: 'gypsum', back: 'gypsum', left: 'gypsum', right: 'gypsum' },
  ...over,
});
const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const room57 = rect(0, 0, 5, 7);
// The left elevation drawn as a plain 7 × 3 m box, off to the side of the plan: t = fromFront = 7 − (x − 20).
const leftBox = { face: 'left', poly: rect(20, -10, 27, -7) };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('a 1 × 1 m absorber on the left elevation mixes into the left wall, and A rises by area · Δα', () => {
  const plain = buildRoom(room57, settings(), [leftBox]);
  // 2–3 m from the front, 1–2 m up
  const patch = { id: 'fill:1', paletteId: 'mineral-wool-50', layer: 'Elevation Left', poly: rect(24, -9, 25, -8) };
  const room = buildRoom(room57, settings(), [leftBox], [patch]);
  assert.equal(room.patches.length, 1);
  const p = room.patches[0];
  assert.equal(p.surface, 'wall');
  assert.equal(p.face, 'left');
  assert.equal(room.walls[p.wall].face, 'left');
  assert.ok(near(p.area, 1, 1e-9), `area ${p.area}`);
  assert.equal(p.material.id, 'mineral-wool-50');
  assert.ok(p.points3d.every((q) => near(q.x, 0, 1e-9) && q.y >= 4 - 1e-6 && q.y <= 5 + 1e-6 && q.z >= 1 - 1e-6 && q.z <= 2 + 1e-6), JSON.stringify(p.points3d));
  const wall = room.walls[p.wall];
  const wool = material('mineral-wool-50');
  const gyp = material('gypsum');
  assert.equal(wall.material.base, 'gypsum');
  assert.ok(near(wall.material.patched, 1));
  for (let b = 0; b < 6; b++) {
    assert.ok(near(wall.material.alpha[b], (gyp.alpha[b] * (wall.area - 1) + wool.alpha[b]) / wall.area, 1e-12));
    assert.ok(near(room.perBand[b].A - plain.perBand[b].A, wool.alpha[b] - gyp.alpha[b], 1e-9), `band ${b}`);
    assert.ok(near(room.perBand[b].S, plain.perBand[b].S, 1e-9));
  }
  // the other walls are untouched
  assert.ok(room.walls.filter((w) => w !== wall).every((w) => w.material.patched === 0 && w.material.id === 'gypsum'));
  const s = room.surfaces.find((x) => x.key === `wall:${wall.i}`);
  assert.equal(s.material, wall.material);
  assert.equal(room.surfaces.length, 2 + room.walls.length);
});

test('with no elevation drawn, a patch on that layer is read against the seed the CAD would draw', () => {
  const flat = buildRoom(room57, settings());
  const seed = seedOutline(flat, 'left');
  const x0 = Math.min(...seed.map((q) => q.x));
  const y0 = Math.min(...seed.map((q) => q.y));
  // 1–2 m from the front on the left elevation: d = L − t = 5…6
  const room = buildRoom(room57, settings(), [], [{ id: 'fill:2', paletteId: 'absorber-100', layer: 'Elevation Left', poly: rect(x0 + 5, y0 + 1, x0 + 6, y0 + 1.5) }]);
  const p = room.patches[0];
  assert.ok(near(p.area, 0.5, 1e-9));
  const ys = p.points3d.map((q) => q.y);
  assert.ok(near(Math.min(...ys), 5, 1e-5) && near(Math.max(...ys), 6, 1e-5), `y ${ys}`);
});

test('a patch across the kink of a splayed face splits over both walls, each stretched by 1/cos θ', () => {
  // the left side bows out to x = −0.5 at mid-length: two left walls, t = fromFront 0…3.5 and 3.5…7
  const plan = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 7 }, { x: 0, y: 7 }, { x: -0.5, y: 3.5 }];
  const elev = { face: 'left', poly: rect(20, -10, 27, -7) };
  // t 3…4, z 1…2  →  d = 7 − t = 3…4
  const room = buildRoom(plan, settings(), [elev], [{ id: 'block:7', paletteId: 'panel-1200x600x50', layer: 'Elevation Left', poly: rect(23, -9, 24, -8) }]);
  assert.equal(room.patches.length, 2);
  assert.ok(room.patches.every((p) => p.id === 'block:7' && p.face === 'left' && p.material.id === 'mineral-wool-50'));
  assert.notEqual(room.patches[0].wall, room.patches[1].wall);
  const stretch = Math.hypot(0.5, 3.5) / 3.5;
  for (const p of room.patches) assert.ok(near(p.area, 0.5 * stretch, 1e-6), `piece ${p.area} vs ${0.5 * stretch}`);
  // each piece lies on its own wall line
  for (const p of room.patches) {
    const w = room.walls[p.wall];
    for (const q of p.points3d) assert.ok(Math.abs((q.x - w.a.x) * w.nIn.x + (q.y - w.a.y) * w.nIn.y) < 1e-6);
  }
});

test('a patch hanging above a sloped ceiling is clipped to the wall', () => {
  // shed roof: 4 m at the front, 2.5 m at the back; the left elevation, front at its right
  const shedLeft = { face: 'left', poly: [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 4 }, { x: 0, y: 2.5 }] };
  // the last metre at the back (t 6…7 ⇒ d 0…1), drawn from 2 m up to 3.5 m — well above the 2.5–2.71 m ceiling there
  const room = buildRoom(room57, settings(), [shedLeft], [{ id: 'fill:3', paletteId: 'acoustic-tile', layer: 'Elevation Left', poly: rect(0, 2, 1, 3.5) }]);
  const p = room.patches[0];
  const ceilAt = (t) => 4 - (1.5 * t) / 7;
  const want = (ceilAt(6) + ceilAt(7)) / 2 - 2;
  assert.ok(near(p.area, want, 1e-6), `area ${p.area} vs ${want}`);
  assert.ok(Math.max(...p.points3d.map((q) => q.z)) <= ceilAt(6) + 1e-6);
});

test('a fill on the plan lands on the floor, clipped to the room', () => {
  const room = buildRoom(room57, settings(), [], [
    { id: 'fill:4', paletteId: 'carpet-pad', layer: '0', poly: rect(1, 1, 3, 2) },
    { id: 'fill:5', paletteId: 'carpet-pad', layer: 'Plan', poly: rect(4, 6, 6, 8) },
  ]);
  assert.equal(room.patches.length, 2);
  assert.ok(room.patches.every((p) => p.surface === 'floor' && p.face === 'floor' && p.wall === null));
  assert.ok(near(room.patches[0].area, 2));
  assert.ok(near(room.patches[1].area, 1), `clipped ${room.patches[1].area}`);
  assert.ok(room.patches[1].points3d.every((q) => q.x <= 5 + 1e-9 && q.y <= 7 + 1e-9 && q.z === 0));
  const c = material('carpet-pad');
  const f = material('concrete-floor');
  assert.ok(near(room.floor.patched, 3));
  for (let b = 0; b < 6; b++) assert.ok(near(room.floor.alpha[b], (f.alpha[b] * 32 + c.alpha[b] * 3) / 35, 1e-12));
});

test('a fill on the Ceiling layer lands on the ceiling, at the ceiling height', () => {
  const room = buildRoom(room57, settings(), [], [{ id: 'block:9', paletteId: 'cloud-1200', layer: 'ceiling', poly: rect(1, 2, 2.2, 3.2) }]);
  const p = room.patches[0];
  assert.equal(p.surface, 'ceiling');
  assert.equal(p.material.id, 'ceiling-cloud');
  assert.ok(near(p.area, 1.44, 1e-9));
  assert.ok(p.points3d.every((q) => q.z === 3));
  assert.ok(near(room.ceiling.patched, 1.44));
  assert.equal(room.floor.patched, 0);
});

test('a sloped ceiling patch is bigger than its plan', () => {
  const shedLeft = { face: 'left', poly: [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 4 }, { x: 0, y: 2.5 }] };
  const room = buildRoom(room57, settings(), [shedLeft], [{ id: 'fill:6', paletteId: 'absorber-50', layer: 'Ceiling', poly: rect(1, 1, 2, 2) }]);
  assert.ok(near(room.patches[0].area, Math.hypot(1, 1.5 / 7), 1e-3), `${room.patches[0].area}`);
});

test('overlapping patches never cover more than the surface', () => {
  const room = buildRoom(room57, settings(), [], [
    { id: 'fill:a', paletteId: 'carpet-pad', layer: '0', poly: rect(0, 0, 5, 7) },
    { id: 'fill:b', paletteId: 'carpet-pad', layer: '0', poly: rect(0, 0, 5, 7) },
  ]);
  assert.ok(near(room.floor.patched, 35));
  const c = material('carpet-pad');
  for (let b = 0; b < 6; b++) assert.ok(near(room.floor.alpha[b], c.alpha[b], 1e-12));
});

test('an unknown palette id is ignored and noted', () => {
  const plain = buildRoom(room57, settings());
  const room = buildRoom(room57, settings(), [], [{ id: 'fill:x', paletteId: 'unobtainium', layer: '0', poly: rect(1, 1, 2, 2) }]);
  assert.equal(room.patches.length, 0);
  assert.equal(room.patchWarnings.length, 1);
  assert.match(room.patchWarnings[0], /unobtainium/);
  assert.deepEqual(room.perBand, plain.perBand);
});

test('no patches: perBand exactly as summed from the base materials', () => {
  const s = settings();
  const room = buildRoom(room57, s, [], []);
  assert.deepEqual(room.perBand, buildRoom(room57, s).perBand);
  for (let b = 0; b < 6; b++) {
    let A = 35 * material(s.faceMaterials.floor).alpha[b] + 35 * material(s.faceMaterials.ceiling).alpha[b];
    for (const w of room.walls) A += w.len * 3 * material(s.faceMaterials[w.face]).alpha[b];
    assert.ok(near(room.perBand[b].A, A, 1e-12));
  }
  assert.deepEqual(room.patches, []);
  assert.ok([room.floor, room.ceiling, ...room.walls.map((w) => w.material)].every((x) => x.patched === 0 && x.base === x.id && x.scatter.length === 6));
});

test('the room is plain data: it survives a structured clone', () => {
  const room = buildRoom(room57, settings(), [leftBox], [{ id: 'fill:1', paletteId: 'diffuser', layer: 'Elevation Left', poly: rect(24, -9, 25, -8) }]);
  assert.deepEqual(structuredClone(room), room);
});

test('every material has six α and six s in [0, 1); every product points at one', () => {
  const ids = new Set();
  for (const m of MATERIALS) {
    assert.ok(!ids.has(m.id), `duplicate ${m.id}`);
    ids.add(m.id);
    assert.equal(m.alpha.length, 6, m.id);
    assert.equal(m.scatter.length, 6, m.id);
    assert.ok([...m.alpha, ...m.scatter].every((x) => Number.isFinite(x) && x >= 0 && x < 1), m.id);
    assert.ok(Number.isFinite(m.tl), m.id);
    assert.match(m.color, /^#[0-9a-f]{6}$/i, m.id);
  }
  for (const p of PRODUCTS) {
    assert.ok(!ids.has(p.id), `product id ${p.id} collides`);
    assert.ok(lookup(p.material) && material(p.id) === lookup(p.material), p.id);
    assert.ok(p.size.length === 2 && p.size.every((x) => x > 0), p.id);
  }
  assert.equal(lookup('nope'), null);
  assert.equal(material('nope').id, 'gypsum');
  // the user's table, verbatim
  assert.deepEqual(material('mineral-wool-50').alpha, [0.2, 0.6, 0.95, 0.95, 0.95, 0.9]);
  assert.deepEqual(material('audience').alpha, [0.6, 0.74, 0.88, 0.96, 0.93, 0.85]);
  assert.equal(material('diffuser').scatter[3], 0.9);
  assert.ok(material('diffuser').scatter[0] < 0.2, 'a QRD barely scatters well below its design frequency');
  assert.deepEqual(new Set(material('glass-heavy').scatter), new Set([0.05]), 'flat glass stays flat');
});

test('palette items are what the CAD contract asks for', () => {
  const items = paletteItems();
  assert.equal(items.length, MATERIALS.length + PRODUCTS.length);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  for (const i of items) {
    assert.ok(typeof i.id === 'string' && i.id && typeof i.name === 'string' && typeof i.category === 'string', JSON.stringify(i));
    assert.match(i.color, /^#[0-9a-f]{6}$/i);
    assert.ok(i.hatch === undefined || ['SOLID', 'ANSI31', 'GRID'].includes(i.hatch));
    if (i.size !== undefined) assert.ok(Array.isArray(i.size) && i.size.length === 2 && i.size.every((x) => x > 0));
    assert.ok(i.note === undefined || typeof i.note === 'string');
    assert.ok(lookup(i.id), `${i.id} resolves back to a material`);
  }
  assert.ok(items.some((i) => i.size) && items.some((i) => !i.size));
  assert.deepEqual(structuredClone(items), items);
});

test('the CAD geometry message → patches in metres with their layer names', () => {
  const got = patchesFromCad({
    units: 'mm',
    layers: [{ id: 'L1', name: 'Elevation Left' }],
    rooms: [],
    patches: [
      { id: 'fill:1', paletteId: 'gypsum', layerId: 'L1', points: [[0, 0], [1000, 0], [1000, 500]] },
      { id: 'fill:2', paletteId: 'gypsum', layerId: 'Ceiling', points: [[0, 0], [1, 0]] },
    ],
  });
  assert.equal(got.length, 1);
  assert.equal(got[0].layer, 'Elevation Left');
  assert.deepEqual(got[0].poly[1], { x: 1, y: 0 });
  assert.deepEqual(patchesFromCad({ units: 'm', rooms: [] }), []);
});
