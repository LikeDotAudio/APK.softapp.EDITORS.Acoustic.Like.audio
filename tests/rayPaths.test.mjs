// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { makeMic, makeSpeaker } from '../js/acoustics/devices.js';
import { rayPaths } from '../js/acoustics/rayPaths.js';

const settings = {
  roomHeight: 3,
  frontDeg: 90,
  band: 2,
  faceMaterials: { floor: 'concrete-floor', ceiling: 'concrete-painted', front: 'concrete-painted', back: 'concrete-painted', left: 'concrete-painted', right: 'concrete-painted' },
};
const rect = (w, l) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: l }, { x: 0, y: l }];
const room = buildRoom(rect(5, 7), settings);
const box = makeSpeaker('sub', { x: 1.3, y: 5.2, z: 1.1 }, { lowpass: 0, level: 94 });
const mix = makeMic('omni', { x: 2.9, y: 2.4, z: 1.4 }, { mix: true });
const len = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y, p.z - pts[i].z), 0);

test('every traced path is as long as its image is far, and stays in the room', () => {
  const paths = rayPaths(room, [box], mix, 500, 3);
  assert.ok(paths.length > 20);
  for (const p of paths) {
    assert.ok(Math.abs(len(p.pts) - p.path) < 1e-6, `order ${p.order}: ${len(p.pts)} vs ${p.path}`);
    assert.equal(p.pts.length, p.order + 2);
    for (const q of p.pts) assert.ok(q.x > -1e-6 && q.x < 5 + 1e-6 && q.y > -1e-6 && q.y < 7 + 1e-6 && q.z > -1e-6 && q.z < 3 + 1e-6);
    assert.deepEqual([p.pts[0].x, p.pts[p.pts.length - 1].x], [box.x, mix.x]);
  }
});

test('a box room has the direct sound at 0 dB and six first reflections', () => {
  const paths = rayPaths(room, [box], mix, 500, 1);
  assert.equal(paths.filter((p) => p.order === 1).length, 6);
  assert.equal(paths.find((p) => p.order === 0).db, 0);
});

test('a reflection off an absorber is quieter at the top than at the bottom', () => {
  const soft = buildRoom(rect(5, 7), { ...settings, faceMaterials: { ...settings.faceMaterials, ceiling: 'absorber-100' } });
  const up = (f) => rayPaths(soft, [box], mix, f, 1).find((p) => p.order === 1 && Math.abs(p.pts[1].z - 3) < 1e-9).db;
  assert.ok(up(4000) < up(125) - 3, `${up(4000)} vs ${up(125)}`);
});
