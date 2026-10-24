// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';
import { CLEAR_M, growthText, roomGrowth } from '../js/acoustics/roomFit.js';

// 4 m wide (x −2…2), 5 m deep, front at +Y, 2.7 m ceiling
const room = buildRoom([{ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 5 }, { x: -2, y: 5 }], { ...DEFAULT_SETTINGS, frontDeg: 90, roomHeight: 2.7 });

test('speakers well inside ask for nothing', () => {
  const g = roomGrowth(room, [{ x: -1, y: 3, z: 1.2 }, { x: 1, y: 3, z: 1.2 }]);
  assert.equal(g.any, false);
  assert.equal(growthText(g), '');
});

test('a pair through the side walls widens the room on both sides, by how far each is past the clearance', () => {
  const g = roomGrowth(room, [{ x: -2.4, y: 3, z: 1.2 }, { x: 2.1, y: 3, z: 1.2 }]);
  assert.equal(g.left, +(0.4 + CLEAR_M).toFixed(2));
  assert.equal(g.right, +(0.1 + CLEAR_M).toFixed(2));
  assert.equal(g.wider, +(g.left + g.right).toFixed(2));
  assert.equal(g.deeper, 0);
  assert.match(growthText(g), /wide$/);
});

test('a box too close to the front wall moves the front out; a top through the ceiling raises it', () => {
  const g = roomGrowth(room, [{ x: 0, y: 4.9, z: 1.2 }, { x: 0, y: 2.5, z: 2.8 }]);
  assert.equal(g.front, +(CLEAR_M - 0.1).toFixed(2));
  assert.equal(g.up, 0.3);
  assert.ok(g.any && g.deeper > 0);
});
