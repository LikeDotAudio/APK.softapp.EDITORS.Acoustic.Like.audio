// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { makeMic, makeSpeaker } from '../js/acoustics/devices.js';
import { F_MAX, F_MIN, RESPONSE_FREQS, responseFreqs, runJob } from '../js/compute/compute.js';

const settings = { roomHeight: 3, frontDeg: 90, band: 2, maxOrder: 1, freq: 100, method: 'wave', layout: { preset: 'none', radius: 1.5 }, show: {}, faceMaterials: {} };
const room = buildRoom([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 6 }, { x: 0, y: 6 }], settings);
const mic = makeMic('mixer', { x: 2, y: 3, z: 1.2 }, { mix: true });
const speakers = [makeSpeaker('monitor', { x: 1, y: 1, z: 1.2 })];
const grids = { plan: { nx: 0, ny: 0 }, floor: { nx: 0, ny: 0 }, ceiling: { nx: 0, ny: 0 }, walls: [] };

test('the response is as fine as the graph is wide, never coarser than 1/24 octave', () => {
  assert.equal(responseFreqs(0), RESPONSE_FREQS);
  assert.equal(responseFreqs(100), RESPONSE_FREQS);
  const fine = responseFreqs(1000);
  assert.equal(fine.length, 1000);
  assert.ok(Math.abs(fine[0] - F_MIN) < 1e-9 && Math.abs(fine.at(-1) - F_MAX) < 1e-6);
});

test('a fine response reads the modal room at 1/48 octave and fills between', () => {
  const job = (responsePoints) => runJob({ room, speakers, mics: [mic], settings, grids: { ...grids }, monitorId: mic.id, responsePoints }).response;
  const coarse = job(0);
  const fine = job(1200);
  assert.equal(fine.freqs.length, 1200);
  assert.equal(fine.wave.length, 1200);
  assert.equal(fine.modal.length, 1200);
  // the low end has a modal value at every point up to where the modal model stops
  const low = fine.freqs.map((f, i) => [f, fine.modal[i]]).filter(([f]) => f < 100);
  assert.ok(low.every(([, v]) => Number.isFinite(v)));
  // and agrees with the coarse curve where they share a frequency
  const i = coarse.freqs.findIndex((f) => f > 40);
  const j = fine.freqs.reduce((b, f, k) => (Math.abs(f - coarse.freqs[i]) < Math.abs(fine.freqs[b] - coarse.freqs[i]) ? k : b), 0);
  assert.ok(Math.abs(fine.wave[j] - coarse.wave[i]) < 3);
});
