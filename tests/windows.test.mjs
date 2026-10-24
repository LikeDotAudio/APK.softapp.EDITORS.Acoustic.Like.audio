// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { layPatches } from '../js/acoustics/patches.js';
import { roomById } from '../js/acoustics/roomLibrary.js';
import { buildMarks } from '../js/cad/marks.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';

const studio2 = roomById('tanda-b-studio-2');
const settings = { ...DEFAULT_SETTINGS, roomHeight: studio2.h, frontDeg: 90, cadMarks: { windows: true }, windows: { Room: studio2.windows } };
const room = buildRoom(studio2.poly.map(([x, y]) => ({ x, y })), settings);
const marks = () => buildMarks({ room, state: { settings, mics: [], speakers: [] }, planLayer: 'Room', sheetBounds: null, k: 1, layers: new Set(), rooms: [] }).windows;

test('Tanda B Studio 2 is symmetrical about its centre line', () => {
  const key = (x, y) => `${x.toFixed(3)},${y.toFixed(3)}`;
  const pts = new Set(studio2.poly.map(([x, y]) => key(x, y)));
  for (const [x, y] of studio2.poly) assert.ok(pts.has(key(-x, y)), `no mirror of ${key(x, y)}`);
  assert.equal(studio2.windows.length, 2);
});

test('its two windows are glass on the two folds of the front, true size though the folds are splayed, a casing round each', () => {
  const items = marks();
  const fills = items.filter((it) => it.kind === 'fill');
  assert.equal(fills.filter((f) => f.paletteId === 'glass-heavy').length, 2);
  assert.equal(fills.filter((f) => f.paletteId === 'casing-wood').length, 8);
  const { pieces, warnings } = layPatches(room, fills.map((f, i) => ({ id: `f${i}`, paletteId: f.paletteId, layer: f.layer, poly: f.points.map(([x, y]) => ({ x, y })) })));
  assert.deepEqual(warnings, []);
  const glass = pieces.filter((p) => p.paletteId === 'glass-heavy');
  assert.equal(new Set(glass.map((p) => p.wall)).size, 2, 'one pane on each fold');
  for (const p of glass) assert.ok(Math.abs(p.area - 1.8 * 1.4) < 0.01, `pane ${p.area} m²`);
  assert.equal(glass[0].material.category, 'Glass');
});

test('the casing and the sill follow the numbers', () => {
  const was = settings.windows.Room;
  settings.windows.Room = [{ ...was[0], sill: 1.0, casing: 0.15 }];
  const fills = marks().filter((it) => it.kind === 'fill');
  settings.windows.Room = was;
  const ys = (paletteId) => fills.filter((f) => f.paletteId === paletteId).flatMap((f) => f.points.map(([, y]) => y));
  const glassBottom = Math.min(...ys('glass-heavy'));
  assert.ok(Math.abs(glassBottom - Math.min(...ys('casing-wood')) - 0.15) < 1e-9, 'the casing 150 mm under the glass');
  const floor = glassBottom - 1.0;
  assert.ok(Math.abs(Math.max(...ys('casing-wood')) - floor - (1.0 + 1.4 + 0.15)) < 1e-9);
});
