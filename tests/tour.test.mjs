import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLIDES, tourAt, tourLength } from '../js/ui/tour.js';

test('the tour is a minute: every view held still, then the sweep', () => {
  assert.equal(tourLength(), 60);
  assert.deepEqual(tourAt(0), { slide: 0, u: null });
  assert.deepEqual(tourAt(4.5), { slide: 1, u: null });
  assert.equal(tourAt(27.9).slide, SLIDES.length - 1);
  assert.equal(tourAt(27.9).u, null);
});

test('the sweep goes bottom to top and back, twice', () => {
  const u = (t) => tourAt(t).u;
  assert.equal(u(28), 0);
  assert.equal(u(36), 1);
  assert.equal(u(44), 0);
  assert.equal(u(52), 1);
  assert.equal(u(60), 0);
  assert.equal(u(32), 0.5);
  assert.equal(u(40), 0.5);
  assert.equal(tourAt(40).slide, SLIDES.length - 1);
});

test('with a song the slides share its length and nothing sweeps', () => {
  const timing = { still: 10, sweep: 0 };
  assert.equal(tourLength(timing), 70);
  assert.deepEqual(tourAt(65, timing), { slide: SLIDES.length - 1, u: null });
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
