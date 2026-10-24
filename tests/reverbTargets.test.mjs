// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { material } from '../js/acoustics/materials.js';
import { RT_TARGETS, absorberAreaFor, applyAbsorber, rtFormulas, rtTarget } from '../js/acoustics/reverbTargets.js';

const box = (L, W, H, mats) => ({
  V: L * W * H,
  surfaces: [
    { face: 'floor', area: L * W, material: material(mats.floor) },
    { face: 'ceiling', area: L * W, material: material(mats.ceiling) },
    { face: 'front', area: W * H, material: material(mats.front) },
    { face: 'back', area: W * H, material: material(mats.back) },
    { face: 'left', area: L * H, material: material(mats.left) },
    { face: 'right', area: L * H, material: material(mats.right) },
  ],
});
const all = (id) => ({ floor: id, ceiling: id, front: id, back: id, left: id, right: id });

test('uniform α: Fitzroy equals Eyring (and its Sabine form equals Sabine)', () => {
  const r = rtFormulas(box(7, 5, 3, all('gypsum')), 2);
  assert.ok(Math.abs(r.fitzroyEyring - r.eyring) < 1e-9);
  assert.ok(Math.abs(r.fitzroySabine - r.sabine) < 1e-9);
  assert.ok(r.eyring < r.sabine);
});

test('Sabine is 0.161 V / A', () => {
  const room = box(6, 4, 3, all('plaster'));
  const A = room.surfaces.reduce((s, x) => s + x.area * x.material.alpha[3], 0);
  assert.ok(Math.abs(rtFormulas(room, 3).sabine - (0.161 * 72) / A) < 1e-9);
});

test('hard floor and ceiling under absorbent walls: Fitzroy reads longer than Eyring', () => {
  const r = rtFormulas(box(7, 5, 3, { floor: 'concrete-floor', ceiling: 'concrete-painted', front: 'absorber-100', back: 'absorber-100', left: 'absorber-100', right: 'absorber-100' }), 2);
  assert.ok(r.fitzroyEyring > r.eyring * 1.5);
});

test('absorberAreaFor hits its target when applied', () => {
  const room = box(7, 5, 3, all('gypsum'));
  const target = 0.35;
  const sol = absorberAreaFor(room, 'absorber-100', target, 2);
  assert.ok(sol.feasible);
  assert.ok(sol.area > 0 && sol.area < sol.maxArea);
  const after = applyAbsorber(room, 'absorber-100', sol.area);
  assert.ok(Math.abs(rtFormulas(after, 2).sabine - target) < 1e-6);
  const onBack = absorberAreaFor(room, 'absorber-100', 0.8, 2, { face: 'back' });
  assert.ok(onBack.feasible, JSON.stringify(onBack));
  assert.ok(Math.abs(rtFormulas(applyAbsorber(room, 'absorber-100', onBack.area, { face: 'back' }), 2).sabine - 0.8) < 1e-6);
});

test('absorberAreaFor says so when the room is already deader than the target', () => {
  const sol = absorberAreaFor(box(7, 5, 3, all('absorber-100')), 'absorber-50', 2, 2);
  assert.equal(sol.feasible, false);
});

test('EBU Tech 3276: Tm = 0.25 · (V / 100)^(1/3) — 0.25 s at 100 m³', () => {
  assert.ok(Math.abs(rtTarget('control', 100).rt[2] - 0.25) < 1e-12);
  assert.ok(Math.abs(rtTarget('control', 800).rt[3] - 0.5) < 1e-12);
  for (const t of RT_TARGETS) {
    const c = t.curve(200, 0.4);
    assert.equal(c.rt.length, 6);
    c.rt.forEach((v, b) => assert.ok(c.lo[b] <= v && v <= c.hi[b], t.id));
  }
});
