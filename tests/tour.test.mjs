import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, RAYS, VIEWS, songPlan, tourAt, tourLength, tourPlan } from '../js/ui/tour.js';

test('the full tour: each drawing revealed top to bottom, summarised, swept up and down, then its group together', () => {
  const plan = tourPlan();
  const back = plan.filter((c) => c.views.length === 1 && c.views[0] === 'back');
  assert.deepEqual(back.map((c) => [c.seconds, c.from, c.to]), [[10, 1, 0], [5, 0, 1], [20, 0, 1], [20, 1, 0]]);
  assert.ok(back[0].reveal);
  // the walls together straight after the last wall
  const i = plan.findIndex((c) => c.views.length === 4);
  assert.deepEqual(plan[i].views, GROUPS[1].views);
  assert.equal(plan[i - 1].views[0], 'front');
  assert.deepEqual([plan[i].from, plan[i + 1].from], [0, 1]);
});

test('then the 3-D builds up from several angles, sweeps from each, 30 s of ray tracing, every view, and the summary of the summary', () => {
  const plan = tourPlan();
  const builds = plan.filter((c) => c.build);
  assert.ok(builds.length >= 3 && builds.every((c) => c.views[0] === '3d' && c.from == null));
  assert.ok(plan.filter((c) => c.views[0] === '3d' && !c.build && !c.trace).length >= 3);
  const rays = plan.find((c) => c.trace);
  assert.equal(rays.seconds, 30);
  assert.equal(rays.orbit, 360);
  assert.deepEqual(plan.at(-1).views, Object.keys(VIEWS));
  assert.equal(plan.at(-1).title, 'Summary of the summary');
  assert.ok(plan.indexOf(rays) < plan.length - 2);
});

test('the summaries: 10 s or 5 s a view, and only the views chosen', () => {
  const ten = tourPlan({ length: 'summary10' });
  assert.ok(ten.filter((c) => c.views.length === 1 && c.views[0] !== '3d').every((c) => c.seconds === 10 && c.reveal));
  const five = tourPlan({ length: 'summary5', views: ['plan', 'back'] });
  assert.deepEqual(five.map((c) => c.views.join()), ['plan', 'back', 'plan,back']);
  assert.ok(tourLength(five) === 15);
  assert.deepEqual(tourPlan({ views: [] }), []);
  assert.ok(!tourPlan({ views: ['3d'] }).some((c) => c.trace));
  assert.ok(tourPlan({ views: [RAYS] }).every((c) => c.trace));
  assert.ok(tourLength(tourPlan()) > 8 * 60);
});

test('where the tour is: the chapter, how far through, and how far up the range', () => {
  const plan = tourPlan({ length: 'summary5', views: ['plan', 'back'] });
  assert.deepEqual(tourAt(0, plan), { chapter: 0, k: 0, u: 0 });
  assert.deepEqual(tourAt(7.5, plan), { chapter: 1, k: 0.5, u: 0.5 });
  assert.equal(tourAt(99, plan).chapter, 2);
  const reveal = tourPlan({ length: 'summary10', views: ['plan'] });
  assert.equal(tourAt(2.5, reveal).u, 0.75);
});

test('with a song the chapters share its length and nothing sweeps', () => {
  const plan = songPlan(tourPlan(), 180);
  assert.ok(Math.abs(tourLength(plan) - 180) < 1e-9);
  assert.ok(plan.every((c) => c.from == null));
  assert.equal(tourAt(90, plan).u, null);
});

test("the tour's sweep frames: a twelfth of an octave apart, bottom to top, each one the ladder's", async () => {
  const { frameLadder, sweepFrames } = await import('../js/compute/engine.js');
  const ladder = new Set(frameLadder());
  const frames = sweepFrames(1 / 12);
  assert.equal(frames[0], 20);
  assert.equal(frames.at(-1), Math.max(...ladder));
  assert.ok(frames.every((f, i) => ladder.has(f) && (i === 0 || f > frames[i - 1])));
  assert.ok(frames.length > 90 && frames.length < 120, `${frames.length} frames`);
});

test('keeping everything inside a room it is already in leaves the lists as they were — a new list is a new scene, and drops the frames', async () => {
  const { createStore } = await import('../js/model/store.js');
  const { buildRoom } = await import('../js/acoustics/room.js');
  const { makeMic } = await import('../js/acoustics/devices.js');
  const store = createStore();
  const room = buildRoom([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 5 }, { x: 0, y: 5 }], { ...store.state.settings, roomHeight: 3 });
  store.seat([makeMic('mixer', { x: 2, y: 2, z: 1.2 }, { mix: true })]);
  store.addSpeaker('monitor', { x: 1, y: 4, z: 1.2 });
  const { speakers, mics, furniture } = store.state;
  assert.equal(store.keepInside(room), false);
  assert.equal(store.state.speakers, speakers);
  assert.equal(store.state.mics, mics);
  assert.equal(store.state.furniture, furniture);
});
