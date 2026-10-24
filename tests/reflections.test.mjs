// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { makeMic, makeSpeaker } from '../js/acoustics/devices.js';
import { firstReflections, heatOf } from '../js/acoustics/reflectionPanels.js';

const settings = { roomHeight: 3, frontDeg: 90, band: 2, faceMaterials: { floor: 'concrete-floor', ceiling: 'concrete-painted', front: 'concrete-painted', back: 'concrete-painted', left: 'concrete-painted', right: 'concrete-painted' } };
const room = buildRoom([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 7 }, { x: 0, y: 7 }], settings);

test('a box and a seat give a bounce off every wall in front of it, the ceiling and the floor', () => {
  const spk = makeSpeaker('monitor', { x: 1.5, y: 5, z: 1.2 });
  spk.aim = -90;
  const mix = makeMic('omni', { x: 2.5, y: 3, z: 1.2 }, { mix: true });
  const r = firstReflections(room, [spk], mix);
  const by = (s) => r.filter((x) => x.surface === s);
  assert.equal(by('ceiling').length, 1);
  assert.equal(by('floor').length, 1);
  assert.equal(by('wall').length, 4);
  // the floor bounce lands on the floor, half way along the plan path when the box and ears are level
  const f = by('floor')[0];
  assert.equal(f.hit.z, 0);
  assert.ok(Math.abs(f.hit.x - 2) < 1e-9 && Math.abs(f.hit.y - 4) < 1e-9);
  // the left wall: x = 0, at ear height, later than the direct sound and quieter than it
  const left = by('wall').find((x) => x.face === 'left');
  assert.ok(Math.abs(left.hit.x) < 1e-9 && Math.abs(left.hit.z - 1.2) < 1e-9);
  for (const x of r) {
    assert.ok(x.delayMs > 0);
    assert.ok(x.db < 0);
    assert.ok(heatOf(x) >= 0 && heatOf(x) <= 1);
    assert.ok(x.zone > 0);
  }
  // the wall behind a cardioid box is cooler than the one beside it
  const front = by('wall').find((x) => x.face === 'front');
  assert.ok(front.db < left.db);
});

test('subs cast no first reflections, and no seat means none at all', () => {
  const sub = makeSpeaker('sub', { x: 2.5, y: 6, z: 0.3 });
  assert.equal(firstReflections(room, [sub], makeMic('omni', { x: 2.5, y: 3 }, { mix: true })).length, 0);
  assert.equal(firstReflections(room, [makeSpeaker('monitor', { x: 1, y: 5 })], null).length, 0);
});
