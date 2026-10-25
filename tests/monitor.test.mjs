// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoom } from '../js/acoustics/room.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';
import { makeSpeaker, speakerLevel } from '../js/acoustics/devices.js';
import { waveAt, prepare } from '../js/acoustics/field.js';
import { syncTwin } from '../js/acoustics/symmetry.js';
import { calibrate, channelLevels, monitoredSpeakers, noiseShares, noiseSpl } from '../js/acoustics/monitor.js';

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const settings = { ...structuredClone(DEFAULT_SETTINGS), roomHeight: 3, frontDeg: 90, layout: { preset: '2.0', radius: 1.5 } };
const room = buildRoom(rect(0, 0, 5, 7), settings);
const mix = { id: 'mix', mix: true, x: 2.5, y: 3, z: 1.2 };
const L = { ...makeSpeaker('monitor', { x: 1.5, y: 4.5, z: 1.2 }), role: 'L', aim: -90 };
const R = { ...makeSpeaker('monitor', { x: 3.5, y: 4.5, z: 1.2 }), role: 'R', aim: -90 };

test('mute, solo and the master mute decide who sounds', () => {
  const ids = (spk, s = settings) => monitoredSpeakers(spk, s).map((x) => x.role);
  assert.deepEqual(ids([L, R]), ['L', 'R']);
  assert.deepEqual(ids([{ ...L, mute: true }, R]), ['R']);
  assert.deepEqual(ids([{ ...L, solo: true }, R]), ['L']);
  // a muted solo stays muted
  assert.deepEqual(ids([{ ...L, solo: true, mute: true }, R]), []);
  assert.deepEqual(ids([L, R], { ...settings, monitor: { mute: true } }), []);
});

test('volume, dim and trim ride on the speaker’s level', () => {
  const lv = (s, st = settings) => speakerLevel(monitoredSpeakers([s], st)[0]).level;
  const base = speakerLevel(L).level;
  assert.equal(lv({ ...L, trimDb: -3 }), base - 3);
  assert.equal(lv(L, { ...settings, monitor: { volumeDb: -10, dim: true, dimDb: -20 } }), base - 30);
});

test('polarity flips the pressure, not its size', () => {
  const pt = { x: 2.5, y: 3, z: 1.2 };
  const a = waveAt(prepare(room, [L], { maxOrder: 1 }), pt, 200);
  const b = waveAt(prepare(room, [{ ...L, invert: true }], { maxOrder: 1 }), pt, 200);
  assert.ok(Math.abs(a.re + b.re) < 1e-9 && Math.abs(a.im + b.im) < 1e-9);
});

test('white rises, pink is flat, brown falls — and each sums to the box’s level', () => {
  const [w, p, b] = ['white', 'pink', 'brown'].map(noiseShares);
  for (const s of [w, p, b]) assert.ok(Math.abs(s.reduce((a, v) => a + v, 0) - 1) < 1e-12);
  assert.ok(w[5] > w[0] && b[5] < b[0]);
  assert.ok(Math.abs(p[0] - p[5]) < 1e-12);
});

test('Cal trims every channel to read the target at the seat', () => {
  const far = { ...R, x: 4.6, y: 6.5 };
  const levels = channelLevels(room, [L, far], settings, mix, 'pink');
  assert.ok(levels[0].db > levels[1].db, 'the far box reads lower');
  const trims = new Map(calibrate(levels, [L, far], 79).map((t) => [t.id, t.trimDb]));
  const after = [L, far].map((s) => ({ ...s, trimDb: trims.get(s.id) }));
  for (const l of channelLevels(room, after, settings, mix, 'pink')) assert.ok(Math.abs(l.db - 79) < 0.1, `${l.db}`);
  assert.ok(noiseSpl(room, monitoredSpeakers(after, settings), mix, 'pink') > 79 + 2.5, 'both together: +3 dB');
});

test('a mirrored twin keeps its own channel', () => {
  const a = { ...L, pairId: 'p1', mute: true, trimDb: -2 };
  const b = { ...R, pairId: 'p1', solo: true };
  const [, twin] = syncTwin([a, b], a, 2.5);
  assert.equal(twin.mute, undefined);
  assert.equal(twin.solo, true);
  assert.equal(twin.trimDb, undefined);
});
