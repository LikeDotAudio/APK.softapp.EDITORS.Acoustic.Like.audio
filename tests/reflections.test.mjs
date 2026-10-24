// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { makeMic, makeSpeaker } from '../js/acoustics/devices.js';
import { firstReflections, heatOf } from '../js/acoustics/reflectionPanels.js';
import { arrangedSpeakers, carryArray, layoutCentre, layoutPositions } from '../js/acoustics/layouts.js';

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

test('the highlighted arrangement soloes its own speakers', () => {
  const box = (role) => ({ ...makeSpeaker('monitor', { x: 1, y: 1 }), role });
  const all = [box('L'), box('R'), box('C'), box('Ls'), box(undefined)];
  const settings = (preset, arrangement = true) => ({ layout: { preset }, show: { arrangement } });
  assert.deepEqual(arrangedSpeakers(all, settings('2.0')).map((s) => s.role), ['L', 'R']);
  assert.deepEqual(arrangedSpeakers(all, settings('5.1')).map((s) => s.role), ['L', 'R', 'C', 'Ls']);
  // hidden, or nothing in it placed: every speaker
  assert.equal(arrangedSpeakers(all, settings('2.0', false)).length, 5);
  assert.equal(arrangedSpeakers([box(undefined)], settings('2.0')).length, 1);
});

test('the array centre moves off the seat in mm, as the listener faces', () => {
  const seat = { x: 2, y: 3, z: 1.2 };
  // facing +y: right is +x
  const c = layoutCentre(seat, 90, { right: 500, front: -250, up: 100 });
  assert.ok(Math.abs(c.x - 2.5) < 1e-9 && Math.abs(c.y - 2.75) < 1e-9 && Math.abs(c.z - 1.3) < 1e-9);
  assert.deepEqual(layoutCentre(seat, 90), seat);
});

test('2.2, 5.2, 5.2.4 and 7.2.4 put a floor sub right under each main', () => {
  const seat = { x: 0, y: 0, z: 1.2 };
  for (const name of ['2.2', '5.2', '5.2.4', '7.2.4']) {
    const placed = layoutPositions(name, seat, 90, 2, 3);
    const subs = placed.filter((p) => p.sub);
    assert.equal(subs.length, 2, name);
    for (const side of ['L', 'R']) {
      const main = placed.find((p) => p.role === side);
      assert.ok(subs.some((s) => Math.hypot(s.x - main.x, s.y - main.y) < 1e-9 && s.z < main.z), `${name} ${side}`);
    }
  }
  assert.equal(layoutPositions('2.1', seat, 90, 2, 3).filter((p) => p.sub).length, 1);
});

test('widening the array carries its speakers out along their bearings from the seat', () => {
  const seat = { x: 2, y: 3, z: 1.2 };
  const s = { layout: { preset: '2.0', radius: 2 }, frontDeg: 90, show: {} };
  const placed = layoutPositions('2.0', seat, 90, 2, 3).map((p, i) => ({ ...makeSpeaker('monitor', p), id: `s${i}`, role: p.role }));
  const loose = { ...makeSpeaker('monitor', { x: 0, y: 0 }), id: 'x' };
  const moved = carryArray([...placed, loose], s, seat, { ...s.layout, radius: 3 }, 3);
  assert.deepEqual(moved.map((m) => m.id), ['s0', 's1']);
  for (const m of moved) {
    const from = placed.find((p) => p.id === m.id);
    assert.ok(Math.abs(Math.hypot(m.x - seat.x, m.y - seat.y) - 3) < 1e-9);
    assert.ok(Math.abs(Math.atan2(m.y - seat.y, m.x - seat.x) - Math.atan2(from.y - seat.y, from.x - seat.x)) < 1e-9);
  }
  assert.equal(carryArray(placed, s, null, { ...s.layout, radius: 3 }).length, 0);
});

test('rotating the array turns the placed speakers round the listener, still aimed at them', () => {
  const seat = { x: 0, y: 0, z: 1.2 };
  const s = { frontDeg: 90, layout: { preset: '5.1', radius: 2, rotate: 0 } };
  const placed = layoutPositions('5.1', seat, 90, 2, 3).map((p, i) => ({ ...makeSpeaker('monitor', p), id: `s${i}`, role: p.role, aim: p.aim }));
  const moved = new Map(carryArray(placed, s, seat, { ...s.layout, rotate: 30 }, 3).map((m) => [m.id, m]));
  const turned = layoutPositions('5.1', seat, 120, 2, 3);
  for (const [i, p] of placed.entries()) {
    const m = moved.get(p.id);
    assert.ok(Math.hypot(m.x - turned[i].x, m.y - turned[i].y) < 1e-9, p.role);
    assert.equal(m.aim, +((((turned[i].aim % 360) + 360) % 360).toFixed(1)));
  }
});
