// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import test from 'node:test';
import { grabBag, planArea, ROOM_LIBRARY } from '../js/acoustics/roomLibrary.js';

test('at least forty rooms, unique ids, every plan a counter-clockwise loop of real size', () => {
  assert.ok(ROOM_LIBRARY.length >= 40);
  assert.equal(new Set(ROOM_LIBRARY.map((r) => r.id)).size, ROOM_LIBRARY.length);
  for (const r of ROOM_LIBRARY) {
    const a = planArea(r.poly);
    assert.ok(a > 2 && a < 600, `${r.id}: ${a} m²`);
    assert.ok(r.h >= 2.2 && r.h <= 12, `${r.id}: h ${r.h}`);
    assert.ok(r.poly.length >= 4);
  }
});

test('the 400 sq ft hexagon is about 400 sq ft', () => {
  const r = ROOM_LIBRARY.find((x) => x.id === 'hexagon-400');
  const sqft = planArea(r.poly) / 0.3048 ** 2;
  assert.ok(sqft > 360 && sqft < 440, `${sqft}`);
});

test('the grab bag never hands back the room already drawn', () => {
  for (let i = 0; i < 30; i++) assert.notEqual(grabBag('bedroom', () => i / 30).id, 'bedroom');
});

test('every library room comes furnished, its people inside it, one mixer at the mix seat', async () => {
  const { furnish } = await import('../js/acoustics/roomLibrary.js');
  const { pointInPolygon } = await import('../js/acoustics/geometry.js');
  for (const r of ROOM_LIBRARY) {
    const { furniture, seats } = furnish(r);
    const poly = r.poly.map(([x, y]) => ({ x, y }));
    assert.equal(seats.filter((s) => s.mix).length, 1, r.id);
    for (const s of seats) assert.ok(pointInPolygon(s.x, s.y, poly), `${r.id}: ${s.kind} outside`);
    for (const f of furniture) assert.ok(pointInPolygon(f.x, f.y, poly), `${r.id}: ${f.paletteId} outside`);
  }
  const big = furnish(ROOM_LIBRARY.find((r) => r.id === 'client-cr'));
  assert.ok(big.furniture.some((f) => f.paletteId.startsWith('console')) && big.furniture.some((f) => f.paletteId.startsWith('couch')));
  assert.deepEqual([...new Set(big.seats.map((s) => s.kind))].sort(), ['client', 'entourage', 'mixer', 'producer']);
});

test('every library room has a door in its back wall, clear of the couch', async () => {
  const { furnish } = await import('../js/acoustics/roomLibrary.js');
  for (const r of ROOM_LIBRARY) {
    const { door, furniture } = furnish(r);
    assert.ok(door, `${r.id}: no door`);
    assert.ok(door.h < r.h, `${r.id}: door taller than the room`);
    // on one of the plan's edges, and that edge faces back
    const on = r.poly.some((a, i) => {
      const b = r.poly[(i + 1) % r.poly.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const cross = ((b[0] - a[0]) * (door.y - a[1]) - (b[1] - a[1]) * (door.x - a[0])) / len;
      return Math.abs(cross) < 1e-9 && (b[0] - a[0]) / len > Math.SQRT1_2;
    });
    assert.ok(on, `${r.id}: door not on a back wall`);
    for (const f of furniture.filter((x) => x.paletteId.startsWith('couch'))) {
      const half = f.paletteId === 'couch-2000x900' ? 1.0 : 1.2;
      assert.ok(Math.abs(door.x - f.x) >= half + door.w / 2, `${r.id}: door behind the couch`);
    }
  }
  assert.equal(furnish(ROOM_LIBRARY.find((r) => r.id === 'bedroom')).door.paletteId, 'door-900x2100');
  assert.equal(furnish(ROOM_LIBRARY.find((r) => r.id === 'vocal-booth')).door.paletteId, 'door-acoustic-1000x2100');
});
