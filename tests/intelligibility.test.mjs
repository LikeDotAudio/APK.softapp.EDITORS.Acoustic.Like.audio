import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimCurve, miss, rtWith, stiFromRt, stiRating, suggestCoverings } from '../js/acoustics/intelligibility.js';
import { material } from '../js/acoustics/materials.js';

// a 5 × 6 × 3 m box: every face a surface
const box = (mats) => {
  const [W, L, H] = [5, 6, 3];
  const area = { floor: W * L, ceiling: W * L, front: W * H, back: W * H, left: L * H, right: L * H };
  return { V: W * L * H, surfaces: Object.entries(area).map(([face, a]) => ({ face, area: a, material: material(mats[face] ?? mats.all) })) };
};

test('STI falls as the room rings longer, 1 with no reverberation', () => {
  assert.ok(stiFromRt(Array(6).fill(0)) > 0.99);
  const s = [0.3, 0.6, 1, 2, 4].map((t) => stiFromRt(Array(6).fill(t)));
  for (let i = 1; i < s.length; i++) assert.ok(s[i] < s[i - 1]);
  // the textbook figures for a diffuse field: about 0.75 at 0.5 s, 0.5 near 1.6 s
  assert.ok(Math.abs(stiFromRt(Array(6).fill(0.5)) - 0.75) < 0.05);
  assert.ok(Math.abs(stiFromRt(Array(6).fill(1.6)) - 0.5) < 0.06);
});

test('the ratings run bad … excellent', () => {
  assert.equal(stiRating(0.2), 'bad');
  assert.equal(stiRating(0.5), 'fair');
  assert.equal(stiRating(0.8), 'excellent');
});

test('rtWith is Sabine, and a covering swapped in is counted', () => {
  const room = box({ all: 'concrete-painted' });
  const hard = rtWith(room);
  const soft = rtWith(room, { ceiling: 'acoustic-tile' });
  assert.ok(Math.abs(hard[2] - (0.161 * 90) / (126 * 0.02)) < 1e-9);
  assert.ok(soft[2] < hard[2] / 3);
});

test('the suggestion brings a hard room into its speech aim', () => {
  const room = box({ all: 'gypsum', floor: 'wood-floor' });
  const curve = aimCurve('speech', room.V);
  const options = { ceiling: ['gypsum', 'acoustic-tile', 'ceiling-cloud'], back: ['gypsum', 'absorber-50', 'absorber-100'], floor: ['wood-floor', 'carpet-pad'] };
  const before = miss(rtWith(room), curve);
  const pick = suggestCoverings(room, curve, options, { ceiling: 'gypsum', back: 'gypsum', floor: 'wood-floor' });
  const rt = rtWith(room, pick);
  assert.ok(miss(rt, curve) < before);
  for (let b = 2; b < 6; b++) assert.ok(rt[b] <= curve.hi[b] + 0.05, `band ${b}: ${rt[b]}`);
});

test('the speech aim is S12.60: 0.6 s small, 0.7 s large', () => {
  assert.equal(aimCurve('speech', 200).hi[2], 0.6);
  assert.equal(aimCurve('speech', 400).hi[2], 0.7);
});
