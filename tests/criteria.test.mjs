// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { makeMic, makeSpeaker } from '../js/acoustics/devices.js';
import { advise } from '../js/acoustics/advisor.js';
import { echogram, flutterRisk, lateralFraction, reflectionFreeZone, SPLAY_CURE_DEG } from '../js/acoustics/analysis.js';
import { prepare } from '../js/acoustics/field.js';
import { lowWallTl, wallTl } from '../js/acoustics/isolation.js';
import { depthOfId, isPorousAbsorber, lookup, ratedLow } from '../js/acoustics/materials.js';
import { analyseIR, parseWav } from '../js/acoustics/measure.js';
import { fitCutEq, optimiseSubs, peakingDb } from '../js/acoustics/multiSub.js';
import { elevationOrigin } from '../js/acoustics/patches.js';
import { diffuserBand, panelOptions, panelProduct, reflectionPanels } from '../js/acoustics/reflectionPanels.js';
import { wallTransmission } from '../js/acoustics/wallPlan.js';

const faces = (all, extra = {}) => ({ floor: all, ceiling: all, front: all, back: all, left: all, right: all, ...extra });
const settings = (mats = faces('gypsum'), extra = {}) => ({ roomHeight: 2.7, frontDeg: 90, band: 2, maxOrder: 3, faceMaterials: mats, ...extra });
const box = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 7 }, { x: 0, y: 7 }];
const monitor = (x, role) => Object.assign(makeSpeaker('monitor', { x, y: 5.8, z: 1.2 }), { aim: -90, role });
const pair = () => [monitor(1.6, 'L'), monitor(3.4, 'R')];
const seat = () => makeMic('mixer', { x: 2.5, y: 4.2, z: 1.2 }, { mix: true });
const titles = (out) => out.map((a) => a.title);
const find = (out, title) => out.find((a) => a.title === title);

test('a splay of 1 in 20 cures flutter between two walls; 1 in 40 does not', () => {
  const splayed = (run) => buildRoom([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5 + 7 / run, y: 7 }, { x: 0, y: 7 }], settings());
  const sides = (room) => flutterRisk(room).filter((f) => f.a !== 'floor').map((f) => [room.walls[+f.a.slice(5)].face, room.walls[+f.b.slice(5)].face].sort().join('/'));
  assert.ok(Math.abs(SPLAY_CURE_DEG - 2.862) < 1e-3);
  assert.ok(sides(splayed(40)).includes('left/right'));
  assert.ok(!sides(splayed(20)).includes('left/right'));
  assert.ok(!sides(splayed(10)).includes('left/right'));
});

test('the wall behind each free-standing box gets a panel, and an in-wall box does not', () => {
  const room = buildRoom(box, settings());
  const [L, R] = pair();
  const behind = (spk) => reflectionPanels(room, spk, seat(), { front: true }).filter((p) => p.behind);
  const got = behind([L, R]);
  assert.equal(got.length, 2);
  for (const p of got) {
    assert.equal(p.face, 'front');
    assert.equal(p.treatment, 'absorber');
    assert.ok(Math.abs(p.at.y - 7) < 1e-9);
  }
  assert.ok(Math.abs(got.find((p) => p.speaker === 'L').at.x - 1.6) < 1e-9);
  assert.equal(behind([{ ...L, mount: 'flush' }]).length, 0);
  // off by default in the engine, on by default from the settings
  assert.equal(reflectionPanels(room, [L], seat()).filter((p) => p.behind).length, 0);
  assert.equal(panelOptions({}).front, true);
});

test('side-wall diffusers span 305 mm under the ears to 914 mm over them', () => {
  const room = buildRoom(box, settings());
  const mix = seat();
  const band = diffuserBand(room, mix);
  assert.ok(Math.abs(band.lo - 0.895) < 1e-9 && Math.abs(band.hi - 2.114) < 1e-9);
  const panels = reflectionPanels(room, pair(), mix, { diffuse: true, ceiling: 'diffuser' });
  const sides = panels.filter((p) => p.face === 'left' || p.face === 'right');
  assert.ok(sides.length >= 2);
  for (const p of sides) {
    assert.equal(p.treatment, 'diffuser');
    const ys = p.sheet.map((c) => c.y);
    assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - (band.hi - band.lo)) < 1e-9);
  }
  assert.ok(panels.filter((p) => p.kind === 'ceiling').every((p) => p.treatment === 'diffuser'));
  // a QRD chosen for the ceiling makes the ceiling panels diffusers, and they are drawn as it
  assert.equal(panelOptions({ ceiling: 'qrd-1200x600' }).ceiling, 'diffuser');
  assert.equal(panelProduct({ kind: 'wall', treatment: 'diffuser' }, {}), 'qrd-1200x600');
});

test('the advisor asks for the wall behind the boxes to absorb, and is satisfied when it does', () => {
  const hard = advise(buildRoom(box, settings()), pair(), [seat()], settings(), null);
  assert.equal(find(hard, 'L: wall behind').level, 'warn');
  const soft = settings(faces('gypsum', { front: 'absorber-100' }));
  assert.equal(find(advise(buildRoom(box, soft), pair(), [seat()], soft, null), 'L: wall behind').level, 'ok');
});

test('a thin panel warns, and a thin panel in a corner is called out as no bass trap', () => {
  const plain = buildRoom(box, settings());
  const o = elevationOrigin(plain, 'left');
  const rect = (x0, x1) => [{ x: o.x + x0, y: o.y + 0.5 }, { x: o.x + x1, y: o.y + 0.5 }, { x: o.x + x1, y: o.y + 1.7 }, { x: o.x + x0, y: o.y + 1.7 }];
  const room = buildRoom(box, settings(), [], [{ id: 'block:1', paletteId: 'panel-1200x600x50', layer: 'Elevation Left', poly: rect(0, 0.6) }]);
  const out = advise(room, pair(), [seat()], settings(), null);
  assert.equal(find(out, 'Thin absorber: panel-1200x600x50').level, 'warn');
  assert.ok(titles(out).includes('Corner foam is not a bass trap'));
  const deep = buildRoom(box, settings(), [], [{ id: 'block:2', paletteId: 'panel-1200x600x100', layer: 'Elevation Left', poly: rect(3, 3.6) }]);
  assert.ok(!titles(advise(deep, pair(), [seat()], settings(), null)).some((t) => t.startsWith('Thin absorber')));
});

test('bass traps carry their own low octaves; nothing rated below 125 Hz is said out loud', () => {
  assert.ok(ratedLow(lookup('bass-trap')) && ratedLow(lookup('membrane-trap')));
  assert.ok(!ratedLow(lookup('mineral-wool-50')));
  assert.equal(depthOfId('panel-1200x600x50'), 0.05);
  assert.ok(isPorousAbsorber(lookup('absorber-100')) && !isPorousAbsorber(lookup('diffuser')) && !isPorousAbsorber(lookup('membrane-trap')));
  assert.ok(titles(advise(buildRoom(box, settings()), pair(), [seat()], settings(), null)).includes('Nothing rated below 125 Hz'));
  const trapped = settings(faces('gypsum', { back: 'bass-trap' }));
  assert.ok(!titles(advise(buildRoom(box, trapped), pair(), [seat()], trapped, null)).includes('Nothing rated below 125 Hz'));
});

test('a hard floor asks for the carpet; the carpet on felt answers it', () => {
  const hard = settings(faces('gypsum', { floor: 'wood-floor' }));
  assert.ok(titles(advise(buildRoom(box, hard), pair(), [seat()], hard, null)).includes('Hard floor'));
  const carpet = settings(faces('gypsum', { floor: 'carpet-felt' }));
  assert.ok(!titles(advise(buildRoom(box, carpet), pair(), [seat()], carpet, null)).includes('Hard floor'));
  assert.match(lookup('carpet-felt').name, /1\.36 kg\/m²/);
});

test('absorbing the side walls lowers the lateral fraction and clears the reflection-free zone', () => {
  const at = (mats) => {
    const room = buildRoom(box, settings(mats));
    const eg = echogram(room, prepare(room, pair(), { maxOrder: 2 }), seat(), 3);
    return { lf: lateralFraction(eg, seat()), rfz: reflectionFreeZone(eg) };
  };
  const hard = at(faces('gypsum'));
  const soft = at(faces('gypsum', { left: 'opening', right: 'opening' }));
  assert.ok(hard.lf > soft.lf);
  assert.ok(hard.lf > 0 && hard.lf < 1);
  assert.equal(hard.rfz.ok, false);
  assert.equal(at(faces('opening')).rfz.ok, true);
});

test('isolation carries 31 and 63 Hz, the 125 Hz figure down the mass law', () => {
  const iso = { walls: 'double-stud', floor: 'slab', setting: 'inside' };
  assert.deepEqual(lowWallTl(iso), [wallTl(iso)[0] - 12, wallTl(iso)[0] - 6]);
  const room = buildRoom(box, settings());
  const t = wallTransmission(room, 'left', iso, [], 100, [100, 100]);
  assert.deepEqual(t.low.freqs, [31, 63]);
  assert.ok(Math.abs(t.low.tl[1] - (wallTl(iso)[0] - 6)) < 1e-9);
  assert.ok(t.low.leak[0] > t.low.leak[1]);
});

test('several subs are tuned in delay, gain and polarity, never moved, then share a cut-only EQ', () => {
  const room = buildRoom(box, settings(faces('gypsum', { floor: 'concrete-floor' })));
  const corners = [{ x: 0.3, y: 6.7 }, { x: 4.7, y: 6.7 }, { x: 0.3, y: 0.3 }, { x: 4.7, y: 0.3 }];
  const subs = corners.map((p, i) => ({ ...makeSpeaker('sub', { ...p, z: 0.3 }, { lowpass: 0 }), id: `s${i}` }));
  const seats = [seat(), makeMic('client', { x: 1.5, y: 2.5, z: 1.1 }), makeMic('client', { x: 3.5, y: 2.5, z: 1.1 })];
  const r = optimiseSubs(room, subs, seats);
  assert.ok(r.after.score <= r.before.score);
  assert.ok(r.eqd.flat <= r.after.flat);
  assert.ok(Math.abs(r.eqd.even - r.after.even) < 1e-9);
  assert.deepEqual(r.subs[0], { id: 's0', name: subs[0].name, delayMs: 0, gainDb: 0, invert: false });
  for (const s of r.subs) assert.ok(s.gainDb <= 0 && s.delayMs >= 0 && s.delayMs <= 20);
  assert.ok(r.eq.every((e) => e.gainDb < 0));
  assert.deepEqual(subs.map((s) => [s.x, s.y]), corners.map((p) => [p.x, p.y]));
  // the filter: its gain at its own frequency, nothing far from it
  assert.ok(Math.abs(peakingDb(60, { f: 60, gainDb: -6, q: 4 }) + 6) < 1e-6);
  assert.ok(Math.abs(peakingDb(2000, { f: 60, gainDb: -6, q: 4 })) < 0.01);
  // a flat curve needs nothing; a peak is cut at its own frequency, a dip is left alone
  assert.deepEqual(fitCutEq([40, 50, 60], [-10, -10, -10]), []);
  const cut = fitCutEq([40, 50, 60], [-10, 0, -10], { bands: 1 });
  assert.equal(cut.length, 1);
  assert.equal(cut[0].f, 50);
  assert.ok(cut[0].gainDb < 0);
});

/** A 16-bit mono WAV of `x` at `fs`. */
function wav16(x, fs) {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + x.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, fs, true);
  v.setUint32(28, fs * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, x.length * 2, true);
  x.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(s * 32767))), true));
  return buf;
}

test('a measured impulse response reads back its decay, its gate and its mode', () => {
  const fs = 48000;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const decay = (T) => 6.9078 / T;
  const ir = new Float64Array(fs);
  ir[480] = 1;
  for (let i = 481; i < fs; i++) ir[i] = 0.05 * rnd() * Math.exp(-decay(0.5) * ((i - 480) / fs));
  const read = analyseIR(parseWav(wav16(ir, fs)).channels[0], fs);
  assert.ok(Math.abs(read.params.T30 - 0.5) < 0.03, `T30 ${read.params.T30}`);
  assert.ok(Math.abs(read.peakS - 0.01) < 1e-9);
  // white noise decays alike in every octave
  assert.deepEqual(read.bands.map((b) => b.f), [125, 250, 500, 1000, 2000, 4000]);
  for (const b of read.bands) assert.ok(Math.abs(b.T30 - 0.5) < 0.05, `T30 ${b.T30} at ${b.f} Hz`);
  // nothing below 1 / gate is claimed
  assert.equal(read.fGate, 200);
  assert.ok(read.freqs.every((f, i) => (f < 200 ? read.gated[i] === null : Number.isFinite(read.gated[i]))));
  assert.equal(read.perOctave, 24);
  // a ringing mode at 50 Hz, Q 25, stands out of the response
  const mode = Float64Array.from(ir, (v, i) => (i <= 480 ? v : v + 0.05 * Math.sin(2 * Math.PI * 50 * ((i - 480) / fs)) * Math.exp(((-Math.PI * 50) / 25) * ((i - 480) / fs))));
  const top = analyseIR(mode, fs).resonances.sort((a, b) => b.height - a.height)[0];
  assert.ok(Math.abs(Math.log2(top.f / 50)) < 1 / 24, `mode at ${top.f}`);
  assert.ok(top.q > 8);
});
