// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { energyAt, prepare } from '../js/acoustics/field.js';
import { SPEAKER_PRESETS, makeSpeaker, responseGain, sourceDb, speakerLevel, wattsFor } from '../js/acoustics/devices.js';
import { advise } from '../js/acoustics/advisor.js';

const settings = { roomHeight: 3, frontDeg: 90, band: 2, faceMaterials: {} };
const rect = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 10 }, { x: 0, y: 10 }];
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);

test('power drive: sensitivity + 10·log10 W, doubling the watts is +3 dB', () => {
  const s = makeSpeaker('horn-90x50', { x: 4, y: 1 });
  near(speakerLevel(s).level, 104 + 10 * Math.log10(25));
  near(speakerLevel({ ...s, watts: 50 }).level - speakerLevel(s).level, 10 * Math.log10(2));
  near(speakerLevel({ ...s, watts: wattsFor(s, 125) }).level, 125);
});

test('the presets start at the levels they always had', () => {
  const want = { monitor: 94, 'horn-90x50': 118, 'horn-60x40': 120, sub: 100 };
  for (const k of Object.keys(SPEAKER_PRESETS)) near(speakerLevel(makeSpeaker(k, { x: 0, y: 0 })).level, want[k], 0.1);
});

test('max SPL holds the level and says by how much it limits', () => {
  const s = makeSpeaker('monitor', { x: 0, y: 0 }, { watts: 1000 });
  const lv = speakerLevel(s);
  assert.equal(lv.limited, true);
  assert.equal(lv.level, 112);
  near(lv.headroom, 112 - 117);
});

test('SPL drive, and every speaker saved before power existed, is read at its level', () => {
  near(speakerLevel(makeSpeaker('monitor', { x: 0, y: 0 }, { level: 90 })).level, 90);
  near(speakerLevel({ level: 97, pattern: 'omni' }).level, 97);
  assert.equal(responseGain(63, { pattern: 'omni' }), 1);
});

test('the range is −10 dB exactly at each quoted end, flat in between', () => {
  const s = { fLow: 50, fHigh: 16000, lowpass: 0 };
  near(20 * Math.log10(responseGain(50, s)), -10, 1e-6);
  near(20 * Math.log10(responseGain(16000, s)), -10, 1e-6);
  assert.ok(Math.abs(20 * Math.log10(responseGain(1000, s))) < 0.1);
});

test('the field hears it: watts raise every band, the range cuts the low ones', () => {
  const room = buildRoom(rect, settings);
  const pt = { x: 4, y: 6, z: 1.2 };
  const at = (spk, band) => energyAt(room, prepare(room, [spk], { maxOrder: 1 }), pt, band).total;
  const a = makeSpeaker('horn-90x50', { x: 4, y: 1, z: 2 });
  near(at({ ...a, watts: 50 }, 3) - at(a, 3), 10 * Math.log10(2), 1e-9);
  near(sourceDb(a, 1000) - sourceDb(a, 125), 20 * Math.log10(responseGain(1000, a) / responseGain(125, a)), 1e-9);
  assert.ok(at({ ...a, fLow: 150 }, 0) < at({ ...a, fLow: 0 }, 0) - 3);
});

test('the advisor flags a box driven past its max SPL', () => {
  const room = buildRoom(rect, settings);
  const loud = makeSpeaker('monitor', { x: 4, y: 1 }, { watts: 400 });
  assert.ok(advise(room, [loud], [], settings, null).some((n) => n.title.endsWith('past max SPL') && n.level === 'warn'));
  assert.ok(!advise(room, [makeSpeaker('monitor', { x: 4, y: 1 })], [], settings, null).some((n) => n.title.endsWith('past max SPL')));
});
