// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { makeMic, makeSpeaker } from '../js/acoustics/devices.js';
import { layoutPositions } from '../js/acoustics/layouts.js';
import { crossings, radiusLanes } from '../js/acoustics/radiusScale.js';

const settings = { roomHeight: 3, frontDeg: 90, band: 2, maxOrder: 1, layout: { preset: '2.0', radius: 1.5 }, show: { arrangement: true }, faceMaterials: {} };
const room = buildRoom([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 7 }, { x: 0, y: 7 }], settings);
const mix = makeMic('mixer', { x: 1.5, y: 3, z: 1.2 }, { mix: true });
const speakers = layoutPositions('2.0', mix, 90, 1.5, 3).map((p, i) => ({ ...makeSpeaker('monitor', p), id: `s${i}`, role: p.role, aim: p.aim }));

test('along the width slider: the footprint, the direct sound and the first reflection', () => {
  const lanes = radiusLanes(room, speakers, [mix], settings, { from: 1, to: 4, step: 0.25 });
  assert.equal(lanes.length, 13);
  // L and R sit r/2 either side of a 3 m-wide room: wide enough and they are through the walls
  assert.ok(lanes[0].fits && !lanes.at(-1).fits);
  // the direct sound takes r / c
  const two = lanes.find((l) => l.r === 2);
  assert.ok(Math.abs(two.direct - (2 / 343) * 1000) < 0.3, `${two.direct}`);
  // and a wider array walks the boxes to the side walls: the gap to the first reflection shrinks
  assert.ok(lanes[0].gap > lanes[6].gap);
  for (const c of crossings(lanes, 'direct', [5, 10])) assert.ok(Math.abs((c.r / 343) * 1000 - c.ms) < 0.5);
});

test('no mix seat, no scale', () => {
  assert.deepEqual(radiusLanes(room, speakers, [], settings), []);
});
