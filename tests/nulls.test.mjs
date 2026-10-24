// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import test from 'node:test';
import { findNulls } from '../js/acoustics/nulls.js';

const freqs = Array.from({ length: 200 }, (_, i) => 20 * 2 ** (i / 24)).filter((f) => f <= 17000);

test('a flat line has no nulls', () => {
  assert.deepEqual(findNulls(freqs, freqs.map(() => 90)), []);
});

test('notches are found where they are, deepest kept, in frequency order', () => {
  const notch = (f0, d) => (f) => -d * Math.exp(-((Math.log2(f / f0) / 0.08) ** 2));
  const shape = [notch(63, 18), notch(140, 14), notch(2000, 12), notch(2100, 4)];
  const db = freqs.map((f) => 90 + shape.reduce((s, g) => s + g(f), 0));
  const nulls = findNulls(freqs, db);
  assert.equal(nulls.length, 3);
  const near = (x, f) => Math.abs(Math.log2(x.f / f)) < 1 / 24 + 1e-9;
  assert.ok(near(nulls[0], 63) && near(nulls[1], 140) && near(nulls[2], 2000), JSON.stringify(nulls));
  assert.ok(nulls[0].depth > 10 && nulls[0].lo < nulls[0].f && nulls[0].hi > nulls[0].f);
});

test('gaps in the curve (NaN) are skipped, not read as dips', () => {
  const db = freqs.map((f, i) => (i % 10 === 5 ? NaN : 90));
  assert.deepEqual(findNulls(freqs, db), []);
});
