// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { C } from '../js/acoustics/bands.js';
import { FAVOURABLE_RATIOS, bonello, ituBs1116, modeList, optimiseDimensions, scoreDimensions, thirdOctaveBands, thirdOctaveCounts } from '../js/acoustics/modalDistribution.js';

test('third-octave bands from 16 to 200 Hz: twelve, contiguous, nominal centres', () => {
  const b = thirdOctaveBands(16, 200);
  assert.deepEqual(b.map((x) => x.fc), [16, 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200]);
  for (let i = 1; i < b.length; i++) assert.ok(Math.abs(b[i].lo - b[i - 1].hi) < 1e-9);
  assert.ok(Math.abs(b[b.length - 1].hi / b[b.length - 1].lo - 2 ** (1 / 3)) < 1e-12);
});

test('axial modes along L sit at n·c/2L', () => {
  const dims = { L: 7, W: 5.3, H: 3.1 };
  const along = modeList(dims, 200).filter((m) => m.type === 'axial' && m.nx > 0);
  assert.equal(along.length, Math.floor((200 * 2 * 7) / C));
  along.forEach((m, i) => assert.ok(Math.abs(m.f - ((i + 1) * C) / 14) < 1e-9));
});

test('counts add up to the modes inside the bands', () => {
  const dims = { L: 6, W: 4.2, H: 2.8 };
  const counts = thirdOctaveCounts(dims, 200);
  const lo = counts[0].lo;
  const hi = counts[counts.length - 1].hi;
  const n = modeList(dims, hi).filter((m) => m.f >= lo && m.f < hi).length;
  assert.equal(counts.reduce((s, b) => s + b.count, 0), n);
});

test('a cube fails Bonello: its three axial modes coincide', () => {
  const r = bonello({ L: 4, W: 4, H: 4 });
  assert.equal(r.ok, false);
  assert.ok(r.coincident.length > 0);
  const first = r.coincident[0];
  assert.ok(Math.abs(first.f - C / 8) < 1e-6);
  assert.equal(first.modes.length, 3);
});

test('a 1 : 1.4 : 1.9 room (Louden) scores better than a cube', () => {
  const louden = scoreDimensions({ L: 1.9 * 3, W: 1.4 * 3, H: 3 });
  const cube = scoreDimensions({ L: 4, W: 4, H: 4 });
  assert.ok(louden.score < cube.score, `${louden.score} vs ${cube.score}`);
  assert.ok(bonello({ L: 5.7, W: 4.2, H: 3 }).coincident.length < bonello({ L: 4, W: 4, H: 4 }).coincident.length);
});

test('the optimiser returns the best first and avoids the cube', () => {
  const best = optimiseDimensions({ L: [4, 6], W: [4, 5], H: [4, 4] }, { step: 0.25, top: 5 });
  assert.equal(best.length, 5);
  for (let i = 1; i < best.length; i++) assert.ok(best[i].score >= best[i - 1].score);
  assert.ok(!(best[0].L === 4 && best[0].W === 4));
  assert.ok(best[0].score < scoreDimensions({ L: 4, W: 4, H: 4 }).score);
});

test('favourable ratios are ascending and ITU BS.1116 rejects a cube', () => {
  for (const r of FAVOURABLE_RATIOS.filter((x) => x.ratio)) assert.ok(r.ratio[0] === 1 && r.ratio[1] < r.ratio[2]);
  assert.equal(ituBs1116({ L: 4, W: 4, H: 4 }).ok, false);
  assert.equal(ituBs1116({ L: 7, W: 5.5, H: 2.9 }).ok, true);
});
