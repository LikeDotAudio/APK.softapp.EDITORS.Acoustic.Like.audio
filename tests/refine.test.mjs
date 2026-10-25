// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEngine, gridCount, refinedRes, REFINE_MAX } from '../js/compute/engine.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';
import { makeSpeaker } from '../js/acoustics/devices.js';

test('each refinement halves the cell, and stops at the cap', () => {
  assert.deepEqual([0, 1, 2, 3].map((l) => refinedRes(64, l)), [64, 128, 256, 512]);
  assert.equal(refinedRes(200, 3), REFINE_MAX);
});

test('the field is computed again with cells ½, ¼, ⅛ the size — every point sampled — and the meters kept', async () => {
  const settings = { ...structuredClone(DEFAULT_SETTINGS), resolution: 16, refine: 3, maxOrder: 1, virtualRoom: { w: 4, l: 5 } };
  const state = { speakers: [makeSpeaker('monitor', { x: 2, y: 1, z: 1.2 }, { aim: 90 })], mics: [{ id: 'm1', x: 2, y: 3, z: 1.2, mix: true, kind: 'mixer' }], furniture: [], settings, cad: { geometry: null, mirror: null }, selected: null };
  const seen = [];
  await new Promise((resolve, reject) => {
    const engine = createEngine({ state }, (out, phase) => {
      if (phase) return;
      if (out.error) return reject(new Error(out.error));
      seen.push({ level: out.level, points: gridCount(out.fieldGrids), cell: out.fieldGrids.cell, values: out.values.floor.length, reports: out.reports });
      if (out.level === 3) resolve();
    });
    engine.update();
  });
  assert.deepEqual(seen.map((s) => s.level), [0, 1, 2, 3]);
  for (let i = 1; i < seen.length; i++) {
    assert.ok(Math.abs(seen[i].cell - seen[i - 1].cell / 2) < 1e-9, 'the cell halves');
    assert.ok(seen[i].values > seen[i - 1].values * 3, 'the floor has about four times the points, each computed');
    assert.equal(seen[i].reports, seen[0].reports, 'the meters are the base job’s');
  }
});
