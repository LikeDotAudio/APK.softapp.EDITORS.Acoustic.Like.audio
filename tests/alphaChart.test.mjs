// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATERIALS } from '../js/acoustics/materials.js';
import { INTENTS, intentOf, nrc, spread } from '../js/ui/alphaChart.js';

test('every material lands in one step of the dial, reflect → absorb by its NRC', () => {
  for (const m of MATERIALS) assert.ok(intentOf(m), m.id);
  const order = INTENTS.map((s) => s.id);
  // the steps run in order: a higher NRC never lands further toward reflect
  const sorted = [...MATERIALS].sort((a, b) => nrc(a) - nrc(b));
  for (let i = 1; i < sorted.length; i++) assert.ok(order.indexOf(intentOf(sorted[i]).id) >= order.indexOf(intentOf(sorted[i - 1]).id));
  // both ends hold something
  assert.ok(MATERIALS.some((m) => intentOf(m).id === 'reflect'));
  assert.ok(MATERIALS.some((m) => intentOf(m).id === 'absorb'));
});

test('the spread is the lowest and highest α in each band', () => {
  const ms = MATERIALS.slice(0, 5);
  const s = spread(ms);
  assert.equal(s.lo.length, 6);
  for (let i = 0; i < 6; i++) {
    assert.equal(s.lo[i], Math.min(...ms.map((m) => m.alpha[i])));
    assert.equal(s.hi[i], Math.max(...ms.map((m) => m.alpha[i])));
  }
});
