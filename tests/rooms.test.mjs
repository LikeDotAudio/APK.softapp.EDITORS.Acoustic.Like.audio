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
