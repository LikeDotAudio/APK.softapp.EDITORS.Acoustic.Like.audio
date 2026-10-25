// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeMic } from '../js/acoustics/devices.js';
import { mtfOfEnergy, mtfOfRt, stiFromMtf, stiFromRt } from '../js/acoustics/intelligibility.js';
import { buildRoom } from '../js/acoustics/room.js';
import { furnish, roomById } from '../js/acoustics/roomLibrary.js';
import { talkers, talkPaths, worstPath } from '../js/acoustics/talk.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';

test("Schroeder's formula on a pure exponential decay gives the diffuse field's transfer, so both STIs agree", () => {
  const dt = 0.0005;
  for (const T of [0.3, 0.8, 1.6]) {
    const k = 13.8155 / T;
    const e = Float64Array.from({ length: Math.ceil((3 * T) / dt) }, (_, i) => Math.exp(-k * i * dt));
    const m = mtfOfEnergy(e, dt);
    mtfOfRt(T).forEach((want, i) => assert.ok(Math.abs(m[i] - want) < 0.01, `T ${T}: m ${m[i]} vs ${want}`));
    assert.ok(Math.abs(stiFromMtf(Array(6).fill(m)) - stiFromRt(Array(6).fill(T))) < 0.01);
  }
});

test('a lone impulse — direct sound and nothing after — passes every modulation: STI 1', () => {
  assert.ok(stiFromMtf(Array(6).fill(mtfOfEnergy([0, 0, 1, 0], 0.001))) > 0.99);
});

const set = roomById('broadcast-set');
const settings = { ...structuredClone(DEFAULT_SETTINGS), roomHeight: set.h };
const room = buildRoom(set.poly.map(([x, y]) => ({ x, y })), settings);
const people = furnish(set).seats.map((s, i) => makeMic(s.kind, s, { ...s, id: `p${i}` }));

test('on the broadcast set all five talk to each other, both ways round', () => {
  assert.equal(talkers(people).length, 5);
  const paths = talkPaths(room, people, { maxOrder: 1 });
  assert.equal(paths.length, 20);
  for (const p of paths) {
    assert.ok(p.sti > 0 && p.sti <= 1, `${p.from}→${p.to} STI ${p.sti}`);
    assert.ok(Math.abs(p.delayMs - (p.r / 343) * 1000) < 1e-9);
  }
  assert.equal(worstPath(paths).sti, Math.min(...paths.map((p) => p.sti)));
});

test('direct sound and the diffuse tail alone: the nearer talker is understood better, and better than the room alone says', () => {
  // no images past the direct sound, so only the direct-to-reverberant ratio moves the STI
  const paths = talkPaths(room, people, { maxOrder: 0 });
  const by = (a, b) => paths.find((p) => p.from === a && p.to === b);
  assert.ok(by('p3', 'p4').r > by('p0', 'p1').r);
  assert.ok(by('p0', 'p1').sti > by('p3', 'p4').sti, 'the anchor and the next seat over beat the two ends');
  const diffuse = stiFromRt(room.perBand.map((b) => b.eyring));
  for (const p of paths) assert.ok(p.sti > diffuse, `${p.from}→${p.to} ${p.sti} vs the room's ${diffuse}`);
});

test('facing counts: seated round the arc they hear each other alike, until one turns away', () => {
  const pair = (ps) => ['p0→p3', 'p3→p0'].map((k) => talkPaths(room, ps, { maxOrder: 1 }).find((p) => `${p.from}→${p.to}` === k));
  // all facing the arc's centre, any two are mirror images of each other (the seats drawn to the millimetre)
  const [ab, ba] = pair(people);
  assert.ok(Math.abs(ab.r - ba.r) < 1e-9);
  assert.ok(Math.abs(ab.db - ba.db) < 0.01);
  // p3 turned to face the back: its voice goes the other way, its ears are omni and still hear the anchor
  const turned = people.map((p) => (p.id === 'p3' ? { ...p, aim: p.aim + 180 } : p));
  const [ab2, ba2] = pair(turned);
  assert.ok(Math.abs(ab2.db - ab.db) < 1e-9, 'the anchor still reaches p3 as before');
  assert.ok(ba2.db < ba.db - 3, `p3 facing away: ${ba2.db.toFixed(1)} vs ${ba.db.toFixed(1)} dB`);
  assert.ok(ba2.sti < ba.sti);
});
