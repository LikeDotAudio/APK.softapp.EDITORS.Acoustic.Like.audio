// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { makeMic, makeSpeaker } from '../js/acoustics/devices.js';
import { layoutPositions, soundingSpeakers } from '../js/acoustics/layouts.js';
import { widthSweep } from '../js/acoustics/widthFinder.js';
import { powerMean, roomSeats } from '../js/compute/compute.js';

const settings = { roomHeight: 3, frontDeg: 90, band: 2, maxOrder: 1, layout: { preset: '2.0', radius: 1.5 }, show: { arrangement: true }, faceMaterials: {} };
const room = buildRoom([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 7 }, { x: 0, y: 7 }], settings);
const mix = makeMic('mixer', { x: 1.5, y: 3, z: 1.2 }, { mix: true });

test('the room average is a power average, weighted by seat', () => {
  assert.ok(Math.abs(powerMean([100, 80]) - 97.03) < 0.01);
  assert.ok(Math.abs(powerMean([100, 80], [1, 0]) - 100) < 1e-9);
  assert.ok(Number.isNaN(powerMean([NaN])));
});

test('the room is the listeners, or every mic when none listens', () => {
  const omni = makeMic('omni', { x: 1, y: 1 });
  assert.deepEqual(roomSeats([mix, omni]), [mix]);
  assert.deepEqual(roomSeats([omni]), [omni]);
});

test('the field hears the highlighted arrangement and the hand-placed boxes', () => {
  const box = (role) => ({ ...makeSpeaker('monitor', { x: 1, y: 1 }), role });
  const all = [box('L'), box('R'), box('C'), box(undefined)];
  assert.equal(soundingSpeakers(all, settings).length, 3);
  assert.equal(soundingSpeakers(all, { ...settings, show: { arrangement: false } }).length, 4);
});

test('the width sweep stays inside the room and picks its flattest radius', () => {
  const speakers = layoutPositions('2.0', mix, 90, 1.5, 3).map((p, i) => ({ ...makeSpeaker('monitor', p), id: `s${i}`, role: p.role, aim: p.aim }));
  const sweep = widthSweep(room, speakers, [mix], settings, { from: 1, to: 4, step: 0.5 });
  while (sweep.step());
  const { tried, best } = sweep.result;
  // L and R sit r/2 to either side: from 3 m they are through the 3 m-wide room's walls
  assert.ok(tried.length > 2 && tried.every((t) => t.r < 3));
  assert.equal(best.spread, Math.min(...tried.map((t) => t.spread)));
});

test('the mixer turning swings the arrangement round it; rising lifts it', async () => {
  const { createStore } = await import('../js/model/store.js');
  const store = createStore();
  store.state.settings.layout = { preset: '2.0', radius: 2, rotate: 0 };
  store.state.mics = [makeMic('mixer', { x: 2, y: 2, z: 1.2 }, { mix: true, aim: 90, id: 'm' })];
  store.state.mics[0].id = 'm';
  store.state.speakers = layoutPositions('2.0', store.state.mics[0], 90, 2, 3).map((p, i) => ({ ...makeSpeaker('monitor', p), id: `s${i}`, role: p.role, aim: p.aim }));
  const before = store.state.speakers.map((s) => ({ ...s }));
  store.update('mic', 'm', { aim: 180, z: 1.5 });
  assert.equal(store.state.settings.layout.rotate, 90);
  for (const [i, s] of store.state.speakers.entries()) {
    const b = before[i];
    // the same distance from the seat, 90° further round, 0.3 m higher, still aimed at it
    assert.ok(Math.abs(Math.hypot(s.x - 2, s.y - 2) - Math.hypot(b.x - 2, b.y - 2)) < 1e-9);
    assert.ok(Math.abs(Math.atan2(s.y - 2, s.x - 2) - Math.atan2(b.y - 2, b.x - 2) - Math.PI / 2) % (2 * Math.PI) < 1e-9);
    assert.ok(Math.abs(s.z - b.z - 0.3) < 1e-9);
    assert.ok(Math.abs(((s.aim - b.aim + 360) % 360) - 90) < 0.11);
  }
});

test('a nose snaps to the front, square-on to a wall, then to 15° steps', async () => {
  const { noseMarks, snapNose } = await import('../js/acoustics/layouts.js');
  // a 5 × 7 room with its front-right corner cut at 45°
  const splay = buildRoom([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 6 }, { x: 4, y: 7 }, { x: 0, y: 7 }], settings);
  const marks = noseMarks(splay, 90);
  assert.ok(marks.some((m) => Math.abs(m.deg - 45) < 1e-6), 'the splay, square-on');
  assert.equal(marks.filter((m) => Math.abs(m.deg - 90) < 1e-6).length, 1, 'front and front wall are one mark');
  assert.deepEqual(snapNose(93, marks, 90), { aim: 90, mark: 'the front' });
  assert.equal(snapNose(49, marks, 90).aim, 45);
  // nothing near: 15° steps from the front, else the whole degree
  assert.equal(snapNose(117, marks, 90).aim, 120);
  assert.deepEqual(snapNose(112.4, marks, 90), { aim: 112, mark: null });
});
