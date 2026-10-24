// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addLevels,
  airDbPerM,
  combNulls,
  convert,
  crossoverCheck,
  equalAreaDirections,
  idealCounts,
  inverseSquare,
  listenerGeometry,
  modeFreq,
  modesBelow,
  modeType,
  optimiseAreas,
  polarEnergy,
  pressureField,
  raysToward,
  roomFigures,
  rtFromMeasured,
  sbirScore,
  specularAbsorbers,
  speedOfSound,
  surroundPositions,
  traceRays,
} from '../js/acoustx/classic.js';
import { modeList, thirdOctaveBands } from '../js/acoustics/modalDistribution.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b} ±${tol}`);

test('air: c from temperature, and ISO 9613-1 absorption in the right place', () => {
  near(speedOfSound(20), 343.2, 0.2);
  near(speedOfSound(0), 331.3, 1e-9);
  // ISO 9613-1 table, 20 °C 50 % RH: about 4.7 dB/km at 1 kHz, 28 dB/km at 4 kHz
  near(airDbPerM(1000, 20, 50), 0.0047, 0.0006, '1 kHz');
  near(airDbPerM(4000, 20, 50), 0.028, 0.004, '4 kHz');
  assert.ok(airDbPerM(4000, 20, 20) > airDbPerM(4000, 20, 70), 'dry air absorbs more at 4 kHz');
});

test('Bolt’s mode count tracks the real count of a box, band by band in sum', () => {
  const dims = { L: 7, W: 5, H: 3 };
  const real = modeList(dims, 200).length;
  near(modesBelow(dims, 200), real, real * 0.15, 'modes below 200 Hz');
  const bands = thirdOctaveBands(16, 200);
  const ideal = idealCounts(dims, bands);
  for (let i = 1; i < ideal.length; i++) assert.ok(ideal[i] > ideal[i - 1], 'the ideal count rises with frequency');
});

test('modes: frequency, type, and the shape of the first length mode', () => {
  const dims = { L: 6, W: 4, H: 3 };
  near(modeFreq(dims, 1, 0, 0), 343 / 12, 1e-9);
  assert.equal(modeType(1, 0, 0), 'axial');
  assert.equal(modeType(1, 1, 0), 'tangential');
  assert.equal(modeType(1, 1, 1), 'oblique');
  const f = pressureField(dims, [{ nx: 1, ny: 0, nz: 0, type: 'axial' }], { plane: 'horizontal', at: 1.2, res: 0.5 });
  const col = f.grid.map((row) => row[0]);
  near(col[0], 1, 1e-9, 'front wall is a pressure maximum');
  near(col[col.length - 1], 1, 1e-9, 'back wall too');
  near(col[Math.floor(col.length / 2)], 0, 1e-9, 'the middle is the null');
  const ph = pressureField(dims, [{ nx: 1, ny: 0, nz: 0, type: 'axial' }], { plane: 'horizontal', param: 'phase', res: 0.5 });
  near(ph.grid[0][0], 1, 1e-9);
  near(ph.grid[ph.grid.length - 1][0], -1, 1e-9, 'the far wall is in opposite phase');
});

test('SBIR scoring: only above the LF cut-off, and negative-only ignores bumps', () => {
  const freqs = [20, 40, 80, 160];
  const dev = [-20, 6, -4, 2];
  near(sbirScore(freqs, dev, { lfCut: 30 }), 4, 1e-9);
  near(sbirScore(freqs, dev, { lfCut: 30, mode: 'negative' }), 4 / 3, 1e-9);
  const x = crossoverCheck(freqs, dev, 56.5685);
  near(x.dev, 1, 1e-3, 'halfway on a log axis');
  assert.equal(x.dips, false);
  assert.equal(crossoverCheck(freqs, dev, 113.137).dips, true);
});

test('the listener: the pair’s angle, the tilt, and surrounds on the same circle', () => {
  const lis = { X: 2.5, Y: 2.5, Z: 1.2 };
  const s1 = { X: 1.25, Y: 2.5 - 1.25 * Math.sqrt(3), Z: 1.2 };
  const s2 = { X: 3.75, Y: s1.Y, Z: 1.2 };
  const g = listenerGeometry(s1, s2, lis);
  near(g.angle, 60, 1e-6, 'an equilateral triangle');
  near(g.d1, 2.5, 1e-9);
  assert.equal(g.warn, '');
  assert.ok(listenerGeometry({ ...s1, Z: 2.4 }, s2, lis).warn.includes('high'));
  const sur = surroundPositions(s1, lis, { rearRise: 0.5 });
  const d = (p) => Math.hypot(p.X - lis.X, p.Y - lis.Y, p.Z - lis.Z);
  for (const p of [sur.centre, sur.rearLeft, sur.rearRight]) near(d(p), 2.5, 1e-9);
  near(sur.centre.X, lis.X, 1e-9);
  near(sur.rearLeft.X + sur.rearRight.X, 2 * lis.X, 1e-9, 'the rears mirror');
});

test('specular absorbers cover the first-reflection point of the listener', () => {
  const dims = { L: 6, W: 4, H: 3 };
  const s = { X: 1, Y: 1, Z: 1.2 };
  const lis = { X: 2, Y: 3, Z: 1.2 };
  const a = specularAbsorbers(dims, [s], lis, 0.6);
  // the left-wall point: mirror the speaker to X = −1, then the line to the listener crosses X = 0 a third of the way
  const y = 1 + (2 / 3) * 0 + ((0 - -1) / (2 - -1)) * (3 - 1);
  assert.ok(a.left.u0 <= y && y <= a.left.u1, `left absorber ${a.left.u0}…${a.left.u1} misses ${y}`);
  assert.ok(a.ceiling && a.ceiling.area > 0);
});

test('rays: equal-area directions, and in a box they find the direct sound and the image-source reflections', () => {
  const dirs = equalAreaDirections({ step: 2 });
  for (const d of dirs.slice(0, 50)) near(Math.hypot(d.f, d.r, d.u), 1, 1e-9);
  near(dirs.length, (4 * Math.PI) / (2 * Math.PI / 180) ** 2, 1500, 'about one ray per step²');
  const dims = { L: 6, W: 4, H: 3 };
  const src = { X: 1, Y: 1, Z: 1.2 };
  const lis = { X: 2, Y: 3.5, Z: 1.2 };
  const alpha = { left: 0.2, right: 0.2, front: 0.2, back: 0.2, floor: 0.2, ceiling: 0.2 };
  const { arrivals } = traceRays(dims, src, lis, { dirs: raysToward(src, lis, dirs), alpha, maxRefl: 2, radius: 0.2 });
  const d0 = Math.hypot(1, 2.5);
  const direct = arrivals.find((a) => a.order === 0);
  near(direct.t, (d0 / 343) * 1000, 0.05, 'direct time');
  near(direct.level, 0, 0.3, 'direct level');
  // the floor bounce: image at Z = −1.2
  const floor = arrivals.find((a) => a.faces.join() === 'floor');
  near(floor.t, (Math.hypot(1, 2.5, 2.4) / 343) * 1000, 0.05, 'floor time');
  near(floor.level, 10 * Math.log10(0.8) + 20 * Math.log10(d0 / Math.hypot(1, 2.5, 2.4)), 0.4, 'floor level');
  const p = polarEnergy(arrivals, 36);
  near(Math.max(...p), 0, 1e-9);
});

test('room figures, comb nulls, measured RT and the area optimiser', () => {
  const f = roomFigures({ V: 100, S: 130, abar: 0.2 });
  near(f.rt60, (0.161 * 100) / 26, 1e-9);
  near(f.mfp, 400 / 130, 1e-9);
  near(f.R, 26 / 0.8, 1e-9);
  near(f.dc, 0.141 * Math.sqrt(2 * 32.5), 1e-9);
  const n = combNulls(0.001);
  near(n.first, 500, 1e-9);
  near(n.spacing, 1000, 1e-9);
  assert.deepEqual(rtFromMeasured(100, [1, 1, 1, 1, 1, 1]), [1, 1, 1, 1, 1, 1]);
  // 16.1 m² of a perfect absorber added to a 1 s, 100 m³ room halves it
  const half = rtFromMeasured(100, [1, 1, 1, 1, 1, 1], [{ alpha: [1, 1, 1, 1, 1, 1], area: 16.1 }]);
  near(half[0], 0.5, 1e-9);
  const best = optimiseAreas([{ begin: 0, end: 40, step: 0.1 }], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], ([a]) => rtFromMeasured(100, [1, 1, 1, 1, 1, 1], [{ alpha: [1, 1, 1, 1, 1, 1], area: a }]));
  near(best.areas[0], 16.1, 1e-6);
});

test('calculator: spreading, level addition, units', () => {
  near(inverseSquare(90, 1, 2), 90 - 6.0206, 1e-3);
  near(inverseSquare(90, 1, 2, 'cylindrical'), 90 - 3.0103, 1e-3);
  near(addLevels([90, 90]), 93.0103, 1e-3);
  near(addLevels([90, 90], 'pressure'), 96.0206, 1e-3);
  near(convert('length', 10), 3.048, 1e-9);
  near(convert('length', 3.048, 'toImperial'), 10, 1e-9);
  near(convert('temperature', 68), 20, 1e-9);
});
