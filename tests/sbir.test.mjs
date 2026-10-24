// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { C } from '../js/acoustics/bands.js';
import { buildRoom } from '../js/acoustics/room.js';
import { firstOrderPaths, reflectionsBySurface, sbirDeviation, sbirFreqs, searchPositions } from '../js/acoustics/sbir.js';

const hard = { floor: 'concrete-floor', ceiling: 'concrete-painted', front: 'concrete-painted', back: 'concrete-painted', left: 'concrete-painted', right: 'concrete-painted' };
const settings = (over = {}) => ({ roomHeight: 3, frontDeg: 90, faceMaterials: hard, ...over });
const rect = (w, l) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: l }, { x: 0, y: l }];

test('sbirFreqs: 1/12 octave from 16 Hz to 1 kHz', () => {
  const f = sbirFreqs(16, 1000, 12);
  assert.equal(f[0], 16);
  assert.ok(Math.abs(f[12] - 32) < 1e-9);
  assert.ok(f[f.length - 1] <= 1000 && f[f.length - 1] * 2 ** (1 / 12) > 1000);
});

test('a speaker 0.5 m from a hard wall notches first near c / (4 · 0.5) ≈ 172 Hz', () => {
  const huge = buildRoom(rect(1000, 1000), settings({ roomHeight: 1000 }));
  const spk = { x: 500, y: 0.5, z: 500 };
  const mic = { x: 500, y: 2.5, z: 500 };
  const freqs = Array.from({ length: 400 }, (_, i) => 20 + i);
  const { dev } = sbirDeviation(huge, spk, mic, freqs);
  // the first frequency deep in a notch, then down to its bottom (the far walls only ripple it)
  let i = dev.findIndex((d) => d < -6);
  while (dev[i + 1] < dev[i]) i++;
  assert.ok(Math.abs(freqs[i] - C / 2) < 3, `first notch at ${freqs[i]} Hz`);
  assert.ok(dev[i] < -8, `depth ${dev[i]}`);
});

test('first order in a box: direct plus six surfaces', () => {
  const room = buildRoom(rect(5, 7), settings());
  assert.equal(firstOrderPaths(room, { x: 1, y: 2, z: 1 }, { x: 3, y: 4, z: 1.2 }).length, 7);
});

test('reflection delays are the image-path lengths over c', () => {
  const room = buildRoom(rect(5, 7), settings());
  const spk = { x: 1, y: 6, z: 1.2 };
  const mic = { x: 2.5, y: 3, z: 1.1 };
  const refl = reflectionsBySurface(room, [spk], mic);
  assert.equal(refl.length, 6);
  for (let i = 1; i < refl.length; i++) assert.ok(refl[i].delayMs >= refl[i - 1].delayMs);
  const at = (s) => refl.find((r) => r.surface === s);
  const len = (img) => Math.hypot(img.x - mic.x, img.y - mic.y, img.z - mic.z);
  const expect = {
    left: len({ x: -1, y: 6, z: 1.2 }),
    right: len({ x: 9, y: 6, z: 1.2 }),
    front: len({ x: 1, y: 8, z: 1.2 }),
    back: len({ x: 1, y: -6, z: 1.2 }),
    floor: len({ x: 1, y: 6, z: -1.2 }),
    ceiling: len({ x: 1, y: 6, z: 4.8 }),
  };
  const r0 = len(spk);
  for (const [s, r] of Object.entries(expect)) {
    assert.ok(Math.abs(at(s).delayMs - (r / C) * 1000) < 1e-9, s);
    assert.ok(Math.abs(at(s).lagMs - ((r - r0) / C) * 1000) < 1e-9, s);
    assert.ok(at(s).levelDb < 0, s);
  }
  // the reflection point is on the surface: the floor's at z = 0, the left wall's at x = 0
  assert.ok(Math.abs(at('floor').point.z) < 1e-9);
  assert.ok(Math.abs(at('left').point.x) < 1e-9);
});

test('the position search returns its best first, inside the ranges', () => {
  const room = buildRoom(rect(5, 7), settings());
  const mic = { x: 2.5, y: 3, z: 1.2 };
  const best = searchPositions(room, { x: 1.5, y: 6, z: 1.2 }, mic, { x: [1, 2], y: [5.5, 6.5], z: [1.2, 1.2] }, { step: 0.25, top: 4 });
  assert.equal(best.length, 4);
  for (let i = 1; i < best.length; i++) assert.ok(best[i].absDev >= best[i - 1].absDev);
  for (const p of best) assert.ok(p.x >= 1 && p.x <= 2 && p.y >= 5.5 && p.y <= 6.5 && p.z === 1.2);
  const worst = sbirDeviation(room, { x: 1, y: 6.5, z: 1.2 }, mic).absDev;
  assert.ok(best[0].absDev <= worst);
});
