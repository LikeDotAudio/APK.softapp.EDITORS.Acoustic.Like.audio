// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { elevationOrigin } from '../js/acoustics/patches.js';
import { DEFAULT_ISOLATION, WALL_BUILDS } from '../js/acoustics/isolation.js';
import { contourTl, stcRating, wallAbsorption, wallDetails, wallDivisions, wallRegions, wallTransmission, wallWindows } from '../js/acoustics/wallPlan.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';

// the mockup's front wall: 4200 wide, 3000 high, split at ±1500 and ±600, at 900 and 2100
const settings = { ...DEFAULT_SETTINGS, roomHeight: 3, frontDeg: 90 };
const room = buildRoom([{ x: -2.1, y: 0 }, { x: 2.1, y: 0 }, { x: 2.1, y: 5 }, { x: -2.1, y: 5 }], settings);
const o = elevationOrigin(room, 'front');
const bay = (id, paletteId, x0, y0, x1, y1) => ({ id, paletteId, layer: 'Elevation Front', poly: [{ x: o.x + x0, y: o.y + y0 }, { x: o.x + x1, y: o.y + y0 }, { x: o.x + x1, y: o.y + y1 }, { x: o.x + x0, y: o.y + y1 }] });
const line = (x0, y0, x1, y1, layer = 'Elevation Front') => ({ layer, a: { x: o.x + x0, y: o.y + y0 }, b: { x: o.x + x1, y: o.y + y1 } });

test('the regions are tagged left to right, top down, each with how it was laid', () => {
  const regions = wallRegions(room, 'front', [
    bay('fill:2', 'absorber-100', 0.6, 0.9, 1.5, 2.1),
    bay('fill:1', 'bass-trap', 0, 0, 0.6, 3),
    bay('block:7', 'qrd-1200x600', 1.5, 0.9, 2.7, 1.5),
    bay('fill:9', 'absorber-100', 0, 0, 1, 1, ),
  ].map((p, i) => (i === 3 ? { ...p, layer: 'Elevation Back' } : p)));
  assert.deepEqual(regions.map((r) => r.tag), ['F1', 'F2', 'F3']);
  assert.deepEqual(regions.map((r) => r.how), ['finish', 'finish', 'block']);
  assert.ok(Math.abs(regions[1].area - 1.08) < 1e-9);
});

test('division lines: the verticals and horizontals inside the wall, not its own outline', () => {
  const d = wallDivisions(room, 'front', [line(0.6, 0, 0.6, 3), line(3.6, 0, 3.6, 3), line(0.6, 0.9, 3.6, 0.9), line(0, 0, 4.2, 0), line(4.2, 0, 4.2, 3), line(1, 0, 1, 3, 'Elevation Back')]);
  assert.deepEqual(d.xs, [0.6, 3.6]);
  assert.deepEqual(d.zs, [0.9]);
  assert.equal(d.lines.length, 3);
});

test('one detail per build, numbered as its regions come; plaster has none', () => {
  const regions = wallRegions(room, 'front', [bay('fill:1', 'absorber-100', 0.6, 0.9, 1.5, 2.1), bay('fill:2', 'diffuser', 1.5, 0.9, 2.7, 2.1), bay('fill:3', 'absorber-100', 2.7, 0.9, 3.6, 2.1), bay('fill:4', 'plaster', 0.6, 2.1, 3.6, 3)]);
  const details = wallDetails(regions);
  assert.deepEqual(details.map((d) => [d.n, d.regions.map((r) => r.tag).join(',')]), [[1, 'F2,F4'], [2, 'F3']]);
  assert.equal(details[0].build.depth, 0.1);
});

test('absorption: each region its area × α, the rest at the base finish, the total and its share of the room', () => {
  const regions = wallRegions(room, 'front', [bay('fill:1', 'absorber-100', 0.6, 0.9, 1.5, 2.1)]);
  const a = wallAbsorption(room, 'front', regions, 'gypsum');
  assert.ok(Math.abs(a.rest.area - (12.6 - 1.08)) < 1e-6);
  assert.ok(Math.abs(a.rows[0].A[2] - 1.08 * 0.99) < 1e-9, 'α500 of 100 mm porous, held under 1');
  assert.ok(Math.abs(a.total[0] - (1.08 * 0.45 + (12.6 - 1.08) * 0.29)) < 1e-6);
  assert.ok(a.share.every((v) => v > 0 && v < 1));
});

test('transmission: the build alone rates by its contour; glass pulls the composite down', () => {
  const iso = { ...DEFAULT_ISOLATION, walls: 'double-stud' };
  const alone = wallTransmission(room, 'front', iso);
  assert.deepEqual(alone.tl.map(Math.round), WALL_BUILDS['double-stud'].tl);
  assert.equal(alone.rating, alone.buildRating);
  assert.equal(alone.leak, null, 'detached: nothing on the other side');
  const windows = wallWindows(room, 'front', [{ id: 'win-1', face: 'front', at: 2.1, w: 1.8, h: 1.2, sill: 0.9, casing: 0.1, glass: 'glass-heavy' }]);
  assert.equal(windows.length, 1);
  const glazed = wallTransmission(room, 'front', iso, windows);
  assert.equal(glazed.parts.length, 2);
  assert.ok(glazed.tl.every((v, b) => v < alone.tl[b]), 'every octave weaker with glass in it');
  // area-weighted τ by hand at 500 Hz
  const S = 12.6;
  const g = 1.8 * 1.2;
  const tau = ((S - g) * 10 ** (-61 / 10) + g * 10 ** (-35 / 10)) / S;
  assert.ok(Math.abs(glazed.tl[2] - -10 * Math.log10(tau)) < 1e-9);
  assert.ok(glazed.rating < alone.rating);
});

test('the STC contour: a spectrum on the contour rates by its 500 Hz value (the deficiency allowed lifts it one), a dip caps it', () => {
  assert.equal(stcRating(contourTl(45)), 46);
  assert.deepEqual(contourTl(35), [19, 28, 35, 38, 39, 39]);
  assert.ok(stcRating([30, 40, 50, 55, 30, 60]) < 45, 'a 2 kHz coincidence dip pulls it down');
});

test('a wall shared with the house says how loud it is on the other side', () => {
  const iso = { ...DEFAULT_ISOLATION, setting: 'inside', walls: 'single-stud' };
  const t = wallTransmission(room, 'front', iso, [], 100);
  assert.equal(t.shared, true);
  assert.ok(Math.abs(t.leak[2] - (100 - 40 + 10 * Math.log10(12.6 / 10))) < 1e-9);
});
