// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { roomImages } from '../js/acoustics/images.js';
import { prepare, waveDb } from '../js/acoustics/field.js';
import { echogram, flutterRisk, iso3382 } from '../js/acoustics/analysis.js';
import { advise } from '../js/acoustics/advisor.js';
import { makeMic, makeSpeaker } from '../js/acoustics/devices.js';

// Scattering: image sources keep (1 − α)(1 − s), the scattered (1 − α)·s comes
// back as diffuse rain in the echogram, and the totals do not move.

const settings = (over = {}) => ({
  roomHeight: 3,
  frontDeg: 90,
  band: 2,
  faceMaterials: { floor: 'carpet-pad', ceiling: 'acoustic-tile', front: 'gypsum', back: 'gypsum', left: 'gypsum', right: 'gypsum' },
  ...over,
});
const rect = (w, l) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: l }, { x: 0, y: l }];
const spk = makeSpeaker('sub', { x: 2.5, y: 2, z: 1.2 }, { lowpass: 0, level: 94 });
const mic = makeMic('omni', { x: 2.5, y: 5, z: 1.2 });
const BANDS6 = [0, 1, 2, 3, 4, 5];

/** A built room with every surface's s set by `sOf(surfaceKey)` — the materials are the room's own copies. */
function roomWith(sOf, over) {
  const room = buildRoom(rect(5, 7), settings(over));
  for (const s of room.surfaces) s.material.scatter = BANDS6.map(() => sOf(s.key, s.face));
  return room;
}
const backKey = (room) => `wall:${room.walls.find((w) => w.face === 'back').i}`;
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('s = 0 everywhere: image energies are the old Π(1 − α) to the bit, and the echogram has no diffuse rain', () => {
  const room = roomWith(() => 0);
  const images = roomImages(room, spk, 3);
  for (const img of images) {
    // the formula as it was before scattering existed
    const old = BANDS6.map(
      (b) => img.walls.reduce((e, i) => e * (1 - room.walls[i].material.alpha[b]), 1) * (1 - room.floor.alpha[b]) ** img.floor * (1 - room.ceiling.alpha[b]) ** img.ceiling,
    );
    assert.deepEqual(img.refl, old);
    assert.deepEqual(img.amp, old.map(Math.sqrt));
    assert.deepEqual(img.scatterLoss, [0, 0, 0, 0, 0, 0]);
  }
  const prep = prepare(room, [spk], { maxOrder: 3 });
  // the wave sum over the old amplitudes, by hand, is the same number
  const oldPrep = prep.map((p) => ({ ...p, images: p.images.map((i) => ({ ...i, amp: i.reflAbs.map(Math.sqrt) })) }));
  assert.equal(waveDb(prep, mic, 120), waveDb(oldPrep, mic, 120));
  const eg = echogram(room, prep, mic, 2);
  assert.equal(eg.eScattered, 0);
  assert.ok(eg.diffuse.every((e) => e === 0));
  assert.deepEqual(Array.from(eg.tail), Array.from(eg.late));
  // bins are exactly spikes + the old late tail
  const spikes = new Float64Array(eg.bins.length);
  for (const a of eg.arrivals) spikes[Math.floor(a.t / eg.dt)] += a.energy;
  eg.bins.forEach((e, i) => assert.equal(e, spikes[i] + eg.late[i]));
});

test('a back wall at s = 0.9: its first-order image drops by √(1 − s) in every band', () => {
  const plain = roomWith(() => 0);
  const qrd = roomWith((key) => (key === backKey(plain) ? 0.9 : 0));
  const back = +backKey(plain).slice(5);
  const first = (room) => roomImages(room, spk, 1).find((i) => i.walls.length === 1 && i.walls[0] === back && !i.floor && !i.ceiling);
  const a = first(plain);
  const b = first(qrd);
  for (const band of BANDS6) {
    assert.ok(Math.abs(b.amp[band] / a.amp[band] - Math.sqrt(0.1)) < 1e-12, `band ${band}`);
    assert.ok(Math.abs(b.scatterLoss[band] - 0.9) < 1e-12);
    assert.equal(b.reflAbs[band], a.refl[band]);
  }
  // the other walls' first-order images are untouched
  const other = (room) => roomImages(room, spk, 1).filter((i) => i.order === 1 && i.walls[0] !== back);
  assert.deepEqual(other(qrd).map((i) => i.amp), other(plain).map((i) => i.amp));
});

test('scattering moves energy from early to late and conserves it: total equal, C80 and D50 down, Ts and EDT up', () => {
  const plain = roomWith(() => 0);
  const qrd = roomWith((key) => (key === backKey(plain) ? 0.9 : 0));
  const egA = echogram(plain, prepare(plain, [spk], { maxOrder: 3 }), mic, 2);
  const egB = echogram(qrd, prepare(qrd, [spk], { maxOrder: 3 }), mic, 2);
  assert.ok(egB.eScattered > 0);
  assert.ok(Math.abs(egB.eSpecular + egB.eScattered - egA.eSpecular) / egA.eSpecular < 1e-9, 'specular + scattered = mirror-hard specular');
  assert.ok(Math.abs(sum(egB.bins) / sum(egA.bins) - 1) < 1e-6, `total ${sum(egB.bins)} vs ${sum(egA.bins)}`);
  const A = iso3382(egA);
  const B = iso3382(egB);
  assert.ok(B.C80 < A.C80 - 1, `C80 ${A.C80} → ${B.C80}`);
  assert.ok(B.C50 < A.C50 - 1, `C50 ${A.C50} → ${B.C50}`);
  assert.ok(B.D50 < A.D50, `D50 ${A.D50} → ${B.D50}`);
  assert.ok(B.Ts > A.Ts + 1, `Ts ${A.Ts} → ${B.Ts}`);
  assert.ok(B.EDT > A.EDT, `EDT ${A.EDT} → ${B.EDT}`);
  // and the early-arrival list shows the back wall quieter by 10·log10(1 − s)
  const back = +backKey(plain).slice(5);
  const firstBack = (eg) => eg.arrivals.find((a) => a.order === 1 && a.img.walls[0] === back);
  assert.ok(Math.abs(firstBack(egB).level - firstBack(egA).level - 10 * Math.log10(0.1)) < 1e-9);
});

test('T30 still reads back the Eyring RT when every wall scatters', () => {
  const room = roomWith((key) => (key.startsWith('wall:') ? 0.9 : 0.3));
  const iso = iso3382(echogram(room, prepare(room, [spk], { maxOrder: 3 }), mic, 2));
  assert.ok(Math.abs(iso.T30 / room.perBand[2].eyring - 1) < 0.08, `T30 ${iso.T30} vs ${room.perBand[2].eyring}`);
});

test('the catalogue scattering is used as built: a QRD back wall quietens its reflection in the wave field', () => {
  const plain = buildRoom(rect(5, 7), settings());
  const qrd = buildRoom(rect(5, 7), settings({ faceMaterials: { ...settings().faceMaterials, back: 'diffuser' } }));
  const back = +backKey(plain).slice(5);
  const first = (room) => roomImages(room, spk, 1).find((i) => i.walls.length === 1 && i.walls[0] === back && !i.floor && !i.ceiling);
  const s = qrd.walls[back].material.scatter[3];
  const a = qrd.walls[back].material.alpha[3];
  assert.ok(Math.abs(first(qrd).refl[3] - (1 - a) * (1 - s)) < 1e-12);
  assert.ok(first(qrd).amp[3] < first(plain).amp[3] / 2);
});

test('flutter: two bare parallel gypsum walls flag; a diffuser or an absorber on one side clears the pair', () => {
  const bare = buildRoom(rect(5, 7), settings());
  const risks = flutterRisk(bare);
  const isPair = (r, f1, f2) => {
    const face = (k) => bare.walls[+k.slice(5)]?.face;
    return [face(r.a), face(r.b)].sort().join() === [f1, f2].sort().join();
  };
  assert.ok(risks.some((r) => isPair(r, 'left', 'right')));
  assert.ok(risks.some((r) => isPair(r, 'front', 'back')));
  const lr = risks.find((r) => isPair(r, 'left', 'right'));
  assert.ok(Math.abs(lr.distance - 5) < 1e-9 && Math.abs(lr.rateHz - 343 / 10) < 1e-9 && [2, 3].includes(lr.band));
  assert.ok(!risks.some((r) => r.a === 'floor'), 'carpet under acoustic tile is no flutter pair');
  for (const cure of ['diffuser', 'absorber-100']) {
    const room = buildRoom(rect(5, 7), settings({ faceMaterials: { ...settings().faceMaterials, left: cure } }));
    const r = flutterRisk(room);
    assert.ok(!r.some((x) => isPair(x, 'left', 'right')), `${cure} on the left wall`);
    assert.ok(r.some((x) => isPair(x, 'front', 'back')), 'the other pair still rings');
  }
  // a hard floor under a hard ceiling is a vertical pair; the advisor says so
  const hard = buildRoom(rect(5, 7), settings({ faceMaterials: { ...settings().faceMaterials, floor: 'concrete-floor', ceiling: 'concrete-painted' } }));
  assert.ok(flutterRisk(hard).some((r) => r.a === 'floor' && r.b === 'ceiling' && Math.abs(r.distance - 3) < 1e-9));
  assert.ok(advise(bare, [], [], settings(), null).some((n) => n.title.startsWith('Flutter') && n.level === 'warn'));
});
