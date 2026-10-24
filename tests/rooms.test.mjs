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
