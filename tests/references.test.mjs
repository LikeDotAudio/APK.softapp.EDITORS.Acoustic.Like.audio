// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  NC_CURVES,
  PLATES,
  R_BANDS,
  acousticGain,
  alcons,
  angularDistribution,
  axialCheck,
  bandDecay,
  bassRatio,
  besselJ1,
  boltMap,
  ceilingSpacing,
  closedBox,
  coincidence,
  electrical,
  gapCv,
  haasCheck,
  helmholtz,
  impedanceStep,
  isPrime,
  massAirMass,
  massLaw,
  membrane,
  modeAngles,
  modeDecay,
  ncRating,
  noteOf,
  perforated,
  phons,
  piston,
  qrd,
  ratingRw,
  schroederDecay,
  sones,
  spacingIndex,
  splFromPower,
  twoTones,
} from '../js/acoustx/references.js';
import { REPORTS, TOPICS } from '../js/acoustx/topics.js';
import { modeList } from '../js/acoustics/modalDistribution.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b} ±${tol}`);
const ROOM = { L: 6, W: 4.2, H: 2.8 };
const even = (a) => ({ floor: a, ceiling: a, front: a, back: a, left: a, right: a });

test('mode decay: an oblique mode in an evenly absorbent room decays at Sabine’s rate; an axial one rings longer', () => {
  const V = ROOM.L * ROOM.W * ROOM.H;
  const S = 2 * (ROOM.L * ROOM.W + ROOM.L * ROOM.H + ROOM.W * ROOM.H);
  const sabine = (0.161 * V) / (0.1 * S);
  near(modeDecay(ROOM, { nx: 1, ny: 1, nz: 1 }, even(0.1)).t60, sabine, 0.01, 'oblique');
  const ax = modeDecay(ROOM, { nx: 1, ny: 0, nz: 0 }, even(0.1));
  assert.ok(ax.t60 > 1.5 * sabine, 'axial');
  // only the walls it runs between matter twice: absorbing the front and back shortens it most
  const fb = modeDecay(ROOM, { nx: 1, ny: 0, nz: 0 }, { ...even(0.05), front: 0.5, back: 0.5 });
  const sides = modeDecay(ROOM, { nx: 1, ny: 0, nz: 0 }, { ...even(0.05), left: 0.5, right: 0.5 });
  assert.ok(fb.t60 < sides.t60 * (ROOM.L * ROOM.H) / (ROOM.W * ROOM.H), 'end walls count double');
  near(ax.bw, ax.delta / Math.PI, 1e-12);
});

test('mode directions: axial along the axes, tangential in their plane, and Sepmeyer’s tally counts them all', () => {
  assert.equal(modeAngles(ROOM, { nx: 1, ny: 0, nz: 0 }).azimuth, 0);
  assert.equal(modeAngles(ROOM, { nx: 0, ny: 1, nz: 0 }).azimuth, 90);
  assert.equal(modeAngles(ROOM, { nx: 0, ny: 0, nz: 1 }).elevation, 90);
  const t = modeAngles(ROOM, { nx: 1, ny: 1, nz: 0 });
  near(t.azimuth, (Math.atan2(1 / 4.2, 1 / 6) * 180) / Math.PI, 1e-9);
  assert.equal(t.elevation, 0);
  const modes = modeList(ROOM, 200);
  const d = angularDistribution(ROOM, modes, 15);
  assert.equal(d.elevation.reduce((s, n) => s + n, 0), modes.length);
});

test('band decay: two modes 2 Hz apart beat with a 0.5 s period', () => {
  const c = bandDecay([{ f: 50, delta: 1 }, { f: 52, delta: 1 }], { tMax: 0.5, n: 100 });
  near(c[0].db, 0, 1e-9);
  assert.ok(c[50].db < -40, 'cancelled at 0.25 s');
  assert.ok(c[100].db > -5, 'back together at 0.5 s, 4.3 dB down');
});

test('spacing: CV of the gaps, scale-free index, Everest’s axial check, Bolt’s map', () => {
  near(gapCv([33.4, 45.4, 63.5, 66.9, 90.7]), 0.53, 0.01, 'Louden challenge');
  near(spacingIndex(ROOM), spacingIndex({ L: 12, W: 8.4, H: 5.6 }), 1e-9, 'scale-free');
  assert.ok(spacingIndex({ L: 3, W: 3, H: 3 }) > spacingIndex({ L: 5.13, W: 3.78, H: 2.7 }), 'a cube is worse than Louden');
  const cube = axialCheck({ L: 3, W: 3, H: 3 });
  assert.ok(!cube.ok && cube.close.length >= 6, 'a cube’s axial modes stack');
  const m = boltMap(2.8, { n: 6 });
  assert.equal(m.score.length, 6);
  assert.ok(Number.isNaN(m.score[0][5]), 'L < W is left out');
  assert.ok(Number.isFinite(m.score[5][0]));
});

test('Haas: the direct sound, the image puller, the fused, the echo; ITDG', () => {
  const arr = [
    { t: 5, level: 0, order: 0 },
    { t: 5.4, level: -1, order: 1, faces: ['floor'] },
    { t: 9, level: -3, order: 1, faces: ['left'] },
    { t: 7, level: -2, order: 0 },
    { t: 70, level: -6, order: 2, faces: ['back', 'front'] },
    { t: 80, level: -14, order: 3, faces: ['a', 'b', 'c'] },
  ];
  const h = haasCheck(arr);
  assert.equal(h.pulls.length, 1);
  assert.equal(h.fused.length, 1, 'a second speaker’s direct sound is not a reflection');
  assert.equal(h.echoes.length, 1);
  near(h.itdg, 0.4, 1e-9);
  assert.equal(haasCheck(arr, { echoMs: 80 }).echoes.length, 0);
});

test('Schroeder: a straight 60 dB per 0.5 s decay gives 0.5 s for EDT, T20 and T30', () => {
  const arr = Array.from({ length: 700 }, (_, t) => ({ t, level: (-60 * t) / 500 }));
  const d = schroederDecay(arr);
  near(d.edt, 0.5, 0.01);
  near(d.t20, 0.5, 0.01);
  near(d.t30, 0.5, 0.01);
  assert.equal(schroederDecay(arr.slice(0, 100)).t30, null, 'too short for T30');
});

test('Beranek: the bass ratio', () => {
  near(bassRatio([2.4, 2.2, 2, 2, 1.8, 1.6]), 1.15, 1e-12);
});

test('walls: mass law, coincidence, mass–air–mass, Rw', () => {
  near(massLaw(10, 500), 26.98, 0.01);
  near(massLaw(20, 500) - massLaw(10, 500), 6.02, 0.01, '6 dB per doubling');
  const gyp = PLATES.find((p) => p.id === 'gypsum');
  near(coincidence(gyp, 0.0125), 2800, 50, '12.5 mm gypsum near 2.8 kHz');
  near(massAirMass(10, 10, 0.1), 84.85, 0.01);
  assert.equal(R_BANDS.length, 16);
  const rw20 = ratingRw(R_BANDS.map((f) => massLaw(20, f))).rw;
  const rw40 = ratingRw(R_BANDS.map((f) => massLaw(40, f))).rw;
  assert.ok(rw40 - rw20 >= 5 && rw40 - rw20 <= 7, 'Rw follows the mass');
  // a curve exactly on the reference: the reference may rise 2 dB (16 bands × 2 dB = the 32 dB allowed), so 54
  assert.equal(ratingRw([33, 36, 39, 42, 45, 48, 51, 52, 53, 54, 55, 56, 56, 56, 56, 56]).rw, 54);
});

test('resonators: Helmholtz, perforated panel, membrane (Everest’s 170/√(md) in imperial)', () => {
  near(helmholtz({ a: 0.025, l: 0.05, V: 0.01 }), 79.5, 0.5);
  near(perforated({ P: 0.1, D: 0.1, t: 0.006, d: 0.006 }), 525, 1);
  near(membrane(5, 0.1), 84.85, 0.01);
});

test('QRD: residues n² mod N, depths in λ0 / 2N, the band it works in', () => {
  assert.ok(isPrime(7) && !isPrime(9) && !isPrime(1));
  const q = qrd({ N: 7, f0: 500, w: 0.05 }, 343);
  assert.deepEqual(q.residues, [0, 1, 4, 2, 2, 4, 1]);
  near(q.depths[2], (4 * 343) / 500 / 14, 1e-12);
  near(q.fHigh, 3430, 1e-9);
});

test('NC: a spectrum on a curve rates that curve; the worst band sets it', () => {
  for (const [nc, row] of NC_CURVES) near(ncRating(row).nc, nc, 1e-9);
  const r = ncRating([40, 30, 20, 15, 10, 8, 6, 30]);
  assert.equal(r.band, 8000);
});

test('systems: %ALcons, PAG/NAG, ceiling spacing', () => {
  near(alcons({ r: 10, T: 1.5, V: 2000, Q: 10 }), 2.25, 1e-9);
  near(alcons({ r: 50, T: 2, V: 500, Q: 2, dc: 2 }), 18, 1e-9, 'levels at 9·T past 3.16 Dc');
  const g = acousticGain({ D0: 20, Ds: 0.5, D1: 6, D2: 15, EAD: 3, NOM: 2 });
  near(g.pag, 20 * Math.log10((6 * 20) / (0.5 * 15)) - 10 * Math.log10(2) - 6, 1e-9);
  near(g.nag, 20 * Math.log10(20 / 3), 1e-9);
  const c = ceilingSpacing({ ceiling: 3, ear: 1.2, angle: 90 });
  near(c.r, 1.8, 1e-9);
  near(c.overlap, 1.8 * Math.SQRT2, 1e-9);
});

test('transducer: J1, the piston, the closed box, levels', () => {
  near(besselJ1(1), 0.44005, 1e-5);
  near(besselJ1(10), 0.043473, 1e-5);
  near(piston(0.1, 20).di, 3.01, 0.05, 'a small piston in a baffle: half space, 3 dB');
  const p = piston(0.1, 2000);
  near(p.ka, 3.664, 0.002);
  near(p.at(p.half6), 0.5, 1e-3, '−6 dB at the half-angle');
  near(closedBox({ fs: 40, qts: 0.4, vas: 50, vb: 25 }).fc, 40 * Math.sqrt(3), 1e-9);
  near(electrical(0.7746).dBu, 0, 1e-4);
  near(splFromPower(88, 100, 4), 88 + 20 - 12.04, 0.01);
});

test('waves: air against concrete reflects almost everything', () => {
  const z = impedanceStep(413, 8e6);
  assert.ok(z.reflected > 0.999);
  near(z.reflected + z.transmitted, 1, 1e-12);
});

test('hearing: a just fifth, notes, roughness, phons and sones', () => {
  const t = twoTones(440, 660);
  assert.equal(t.just.name, 'fifth');
  near(t.just.etOff, -1.955, 0.001);
  near(t.cubic, 220, 1e-9);
  assert.equal(noteOf(440).name, 'A4');
  assert.equal(noteOf(261.63).name, 'C4');
  assert.ok(twoTones(440, 460).roughness > 0.8, 'a 20 Hz spacing at 440 is near the roughest');
  assert.ok(twoTones(440, 880).roughness < 0.01, 'an octave is smooth');
  near(sones(60), 4, 1e-12);
  near(phons(sones(30)), 30, 1e-9);
});

test('topics: every source is a report on disk, and every topic names a group the windows draw', () => {
  const src = readFileSync(new URL('../js/acoustx/acoustx.js', import.meta.url), 'utf8');
  for (const [n, [file]] of Object.entries(REPORTS)) assert.ok(existsSync(new URL(`../Documentation/acoustic-x/references/${file}`, import.meta.url)), `report ${n}`);
  for (const [legend, t] of Object.entries(TOPICS)) {
    assert.ok(src.includes(`group('${legend}'`) || src.includes(`group("${legend}"`), `no group draws “${legend}”`);
    assert.ok(t.history.length > 40 && t.refs.length, legend);
    for (const n of t.refs) assert.ok(REPORTS[n], `${legend}: report ${n}`);
  }
});

test('two tones: an exact octave is an octave, not a unison', () => {
  const t = twoTones(220, 440);
  assert.equal(t.just.name, 'octave');
  assert.equal(t.just.off, 0);
});
