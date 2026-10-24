// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { elevationOrigin } from '../js/acoustics/patches.js';
import { buildMarks } from '../js/cad/marks.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';

// the callouts sheet's front wall: 4200 wide, 3000 high
const settings = { ...DEFAULT_SETTINGS, roomHeight: 3, frontDeg: 90, cadMarks: { finishes: true } };
const room = buildRoom([{ x: -2.1, y: 0 }, { x: 2.1, y: 0 }, { x: 2.1, y: 5 }, { x: -2.1, y: 5 }], settings);
const o = elevationOrigin(room, 'front');
const bay = (id, paletteId, x0, y0, x1, y1) => ({ id, paletteId, layer: 'Elevation Front', poly: [{ x: o.x + x0, y: o.y + y0 }, { x: o.x + x1, y: o.y + y0 }, { x: o.x + x1, y: o.y + y1 }, { x: o.x + x0, y: o.y + y1 }] });
const marks = (wallPatches) => buildMarks({ room, state: { settings, mics: [], speakers: [] }, planLayer: 'Room', sheetBounds: null, k: 1, layers: new Set(), rooms: [], wallPatches }).finishes;

test('every region on a wall is tagged, left to right, and scheduled in mm from the centre line', () => {
  assert.ok(o, 'the front elevation has an origin');
  const [d] = marks([
    bay('fill:2', 'absorber-100', 1.5, 0.9, 2.7, 2.1),
    bay('fill:1', 'panel-1200x600x100', 0.6, 0.9, 1.5, 2.1),
    bay('block:7', 'qrd-1200x600', 2.7, 0.9, 3.9, 1.5),
  ]);
  assert.equal(d.kind, 'drawing');
  assert.equal(d.layer, 'Elevation Front');
  const tags = d.texts.filter((t) => /^F\d$/.test(t.text)).map((t) => t.text);
  assert.deepEqual(tags, ['F1', 'F2', 'F3']);
  const rows = d.texts.map((t) => t.text);
  assert.ok(rows.some((t) => t.startsWith('FINISH SCHEDULE · FRONT WALL · 3 regions')));
  const f1 = rows.find((t) => t.startsWith('F1 · '));
  assert.match(f1, /Absorber panel 1200×600×100/);
  assert.match(f1, / fill · 900 × 1200 · x -1500 → -600 · z 900 → 2100 · 1\.08 m²/);
  assert.match(rows.find((t) => t.startsWith('F2 · ')), / finish · 1200 × 1200 · x -600 → \+600 /);
  assert.match(rows.find((t) => t.startsWith('F3 · ')), /QRD 1200×600 · block · /);
  const base = rows.find((t) => t.startsWith('BASE · '));
  assert.match(base, /(\d+\.\d\d) m²$/);
  assert.ok(Math.abs(Number(base.match(/(\d+\.\d\d) m²$/)[1]) - (4.2 * 3 - 1.08 - 1.44 - 0.72)) < 0.02, base);
  // one box of four lines round each tag
  assert.equal(d.lines.length, 12);
});

test('a wall with nothing painted on it draws nothing', () => {
  assert.deepEqual(marks([]), []);
  assert.deepEqual(marks([bay('fill:1', 'absorber-100', 10, 10, 11, 11)]), []);
});
