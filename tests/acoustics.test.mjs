// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom, nullFractions } from '../js/acoustics/room.js';
import { roomImages } from '../js/acoustics/images.js';
import { prepare, prepareModal, modalDb, waveDb } from '../js/acoustics/field.js';
import { echogram, iso3382 } from '../js/acoustics/analysis.js';
import { makeMic, makeSpeaker } from '../js/acoustics/devices.js';
import { layoutCheck, layoutPositions } from '../js/acoustics/layouts.js';
import { mirrorBearing, mirrorDevice, mirrorName, syncTwin } from '../js/acoustics/symmetry.js';
import { advise } from '../js/acoustics/advisor.js';

const settings = (over = {}) => ({
  roomHeight: 3,
  frontDeg: 90,
  band: 2,
  faceMaterials: { floor: 'concrete-floor', ceiling: 'concrete-painted', front: 'concrete-painted', back: 'concrete-painted', left: 'concrete-painted', right: 'concrete-painted' },
  ...over,
});
const rect = (w, l) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: l }, { x: 0, y: l }];
const omni = (at) => makeSpeaker('sub', at, { lowpass: 0, level: 94 });

test('a plan facing +y has its front wall at the top and its left wall at −x', () => {
  const room = buildRoom(rect(5, 7), settings());
  const face = (y0, y1) => room.walls.find((w) => Math.abs(w.a.y - y0) < 1e-9 && Math.abs(w.b.y - y1) < 1e-9)?.face;
  assert.equal(face(7, 7), 'front');
  assert.equal(face(0, 0), 'back');
  assert.equal(room.walls.find((w) => w.a.x === 0 && w.b.x === 0).face, 'left');
  assert.equal(room.L.toFixed(3), '7.000');
  assert.equal(room.W.toFixed(3), '5.000');
  assert.ok(room.rect);
});

test('first order in a box: the source, four walls, floor and ceiling', () => {
  const room = buildRoom(rect(5, 7), settings());
  assert.equal(roomImages(room, { x: 1, y: 2, z: 1 }, 1).length, 7);
});

test('a source flush in a rigid wall gains +6 dB: its image sits on top of it', () => {
  const huge = buildRoom(rect(1000, 1000), settings({ roomHeight: 1000 }));
  const src = omni({ x: 500, y: 0.001, z: 500 });
  const at = { x: 500, y: 2, z: 500 };
  const free = waveDb(prepare(huge, [src], { maxOrder: 0 }), at, 50);
  const flush = waveDb(prepare(huge, [src], { maxOrder: 1 }), at, 50);
  assert.ok(Math.abs(flush - free - 6) < 0.3, `gain ${flush - free}`);
});

test('a free-standing box d from the wall notches at c / 4d (SBIR)', () => {
  const huge = buildRoom(rect(1000, 1000), settings({ roomHeight: 1000 }));
  const src = omni({ x: 500, y: 0.5, z: 500 });
  const prep = prepare(huge, [src], { maxOrder: 1 });
  const at = { x: 500, y: 2.5, z: 500 };
  assert.ok(waveDb(prep, at, 343 / 2) < waveDb(prep, at, 343) - 10);
});

test('the echogram tail decays at the room RT, and T30 reads it back', () => {
  const room = buildRoom(rect(5, 7), settings({ faceMaterials: { floor: 'carpet-pad', ceiling: 'acoustic-tile', front: 'gypsum', back: 'gypsum', left: 'gypsum', right: 'gypsum' } }));
  const prep = prepare(room, [omni({ x: 2.5, y: 2, z: 1.2 })], { maxOrder: 0 });
  const mic = makeMic('omni', { x: 2.5, y: 5, z: 1.2 });
  const eg = echogram(room, prep, mic, 2);
  const iso = iso3382(eg);
  assert.ok(Math.abs(iso.T30 / room.perBand[2].eyring - 1) < 0.08, `T30 ${iso.T30} vs ${room.perBand[2].eyring}`);
  assert.ok(iso.D50 > 0 && iso.D50 < 1);
});

test('modal sum: the first length mode is null at L/2 and loud at the wall', () => {
  const room = buildRoom(rect(4, 6), settings());
  const f = 343 / (2 * 6);
  const mp = prepareModal(room, [omni({ x: 2, y: 0.05, z: 0.05 })], f);
  const mid = modalDb(room, mp, { x: 1.0, y: 3, z: 1.5 });
  const wall = modalDb(room, mp, { x: 1.0, y: 5.95, z: 1.5 });
  assert.ok(wall - mid > 10, `wall ${wall} mid ${mid}`);
  assert.deepEqual(nullFractions(3), [1 / 6, 3 / 6, 5 / 6]);
});

test('a 7.1.4 placed by the preset checks out against its own references', () => {
  const mix = { x: 2.5, y: 3, z: 1.2 };
  const placed = layoutPositions('7.1.4', mix, 90, 2, 10).map((p, i) => ({ ...p, id: `s${i}` }));
  const rows = layoutCheck(placed, mix, 90, '7.1.4');
  assert.equal(rows.length, 11);
  assert.ok(rows.every((r) => r.ok), JSON.stringify(rows.filter((r) => !r.ok)));
  const L = placed.find((p) => p.role === 'L');
  assert.ok(L.x < mix.x, 'L is on the listener’s left when facing +y');
});

test('the mirror is its own inverse, and swaps L for R', () => {
  const d = { id: 'a', x: 1, y: 2, z: 1, aim: 30, side: 'L', role: 'Ltf', name: 'Ltf' };
  const m = mirrorDevice(d, 2.5);
  assert.equal(m.x, 4);
  assert.equal(m.role, 'Rtf');
  assert.equal(mirrorBearing(90), 90);
  assert.equal(mirrorBearing(0), 180);
  assert.equal(mirrorName('Monitor L'), 'Monitor R');
  assert.equal(mirrorName('Left'), 'Left');
  const back = mirrorDevice(m, 2.5);
  assert.equal(back.x, 1);
  assert.equal(back.aim, 30);
  const synced = syncTwin([{ ...d, pairId: 'p' }, { ...m, id: 'b', pairId: 'p' }], { ...d, x: 0, pairId: 'p' }, 2.5);
  assert.equal(synced[1].x, 5);
  assert.equal(synced[1].id, 'b');
});

test('the advisor flags a mix position at half the length', () => {
  const room = buildRoom(rect(5, 7), settings());
  const mic = makeMic('omni', { x: 2.5, y: 3.5, z: 1.5 }, { mix: true });
  const notes = advise(room, [], [mic], settings(), null);
  const rule = notes.find((n) => n.title.startsWith('38'));
  assert.equal(rule.level, 'warn');
  assert.match(rule.detail, /n=1 at 50/);
  const height = notes.find((n) => n.title === 'Ear height');
  assert.match(height.detail, /n=1 at 50/);
});

test('modal response peaks at the analytic eigenfrequencies of a rigid box', async () => {
  const { allModes } = await import('../js/acoustics/room.js');
  const room = buildRoom(rect(4, 6), settings({ faceMaterials: Object.fromEntries(['floor', 'ceiling', 'front', 'back', 'left', 'right'].map((f) => [f, 'concrete-painted'])) }));
  const modes = allModes(room, 80);
  assert.deepEqual(modes.slice(0, 3).map((m) => [m.nx, m.ny, m.nz, m.type]), [[1, 0, 0, 'axial'], [0, 1, 0, 'axial'], [1, 1, 0, 'tangential']]);
  const src = [omni({ x: 0.05, y: 0.05, z: 0.05 })];
  const at = { x: 3.95, y: 5.95, z: 2.95 };
  const level = (f) => modalDb(room, prepareModal(room, src, f), at);
  for (const m of modes.slice(0, 3)) {
    assert.ok(level(m.f) > level(m.f * 0.93) && level(m.f) > level(m.f * 1.07), `no peak at ${m.f.toFixed(1)} Hz`);
  }
});

test('SBIR is measured to the wall behind the box, not the one it faces', () => {
  const room = buildRoom(rect(5, 7), settings());
  const spk = makeSpeaker('monitor', { x: 2.5, y: 6.4, z: 1.2 }, { aim: 270 });
  const note = advise(room, [spk], [], settings(), null).find((n) => n.title.endsWith('SBIR'));
  assert.match(note.detail, /^0\.60 m/);
  assert.match(note.detail, /143 Hz/);
});
