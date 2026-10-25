// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gripAt, gripsOf, othersThan, snapPoint } from '../js/views/wallGrips.js';

// a 4000 × 3000 room in mm, one loose wall off to the side
const walls = [
  { edgeId: 1, a: [0, 0], b: [4000, 0], layerId: 'p' },
  { edgeId: 2, a: [4000, 0], b: [4000, 3000], layerId: 'p' },
  { edgeId: 3, a: [4000, 3000], b: [0, 3000], layerId: 'p' },
  { edgeId: 4, a: [0, 3000], b: [0, 0], layerId: 'p' },
  { edgeId: 5, a: [6000, 0], b: [6000, 1000], layerId: 'p' },
  { edgeId: 9, a: [0, 0], b: [1, 1], layerId: 'elsewhere' },
];
const grips = gripsOf({ walls }, 'p');

test('a corner where walls meet holds both ends; a loose end holds one', () => {
  assert.equal(grips.corners.length, 6);
  const origin = grips.corners.find((c) => c.x === 0 && c.y === 0);
  assert.deepEqual(origin.refs.map((r) => `${r.edgeId}${r.end}`).sort(), ['1a', '4b']);
  assert.equal(grips.corners.find((c) => c.x === 6000 && c.y === 1000).refs.length, 1);
  assert.equal(grips.mids.length, 5);
});

test('a corner beats a middle, within reach', () => {
  assert.equal(gripAt(grips, { x: 30, y: 20 }, 50).kind, 'corner');
  assert.equal(gripAt(grips, { x: 2000, y: 10 }, 50).kind, 'mid');
  assert.equal(gripAt(grips, { x: 2000, y: 1500 }, 50), null);
});

test('a dragged corner lands on another to join it, else squares to one, else the grid', () => {
  const loose = grips.corners.find((c) => c.x === 6000 && c.y === 1000);
  const others = othersThan(grips, loose);
  assert.ok(snapPoint({ x: 4030, y: 2980 }, others, { reach: 50, grid: 10 }).onto, 'dropped on the corner');
  const sq = snapPoint({ x: 3990, y: 1234 }, others, { reach: 50, grid: 10 });
  assert.deepEqual([sq.x, sq.y, sq.guides], [4000, 1230, [{ x: 4000 }]]);
  const free = snapPoint({ x: 5123, y: 1777 }, others, { reach: 50, grid: 10 });
  assert.deepEqual([free.x, free.y], [5120, 1780]);
});
