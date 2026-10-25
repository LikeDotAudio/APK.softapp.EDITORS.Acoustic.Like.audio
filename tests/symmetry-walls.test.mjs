// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { elevationOrigin, layPatches } from '../js/acoustics/patches.js';
import { symmetryMarks } from '../js/cad/marks.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';

const settings = { ...DEFAULT_SETTINGS, roomHeight: 3, frontDeg: 90 };
const room = buildRoom([{ x: -2.1, y: 0 }, { x: 2.1, y: 0 }, { x: 2.1, y: 5 }, { x: -2.1, y: 5 }], settings);
const at = (face) => elevationOrigin(room, face);
const bay = (face, id, paletteId, x0, y0, x1, y1) => {
  const o = at(face);
  const layer = `Elevation ${face[0].toUpperCase()}${face.slice(1)}`;
  return { id, paletteId, layer, poly: [{ x: o.x + x0, y: o.y + y0 }, { x: o.x + x1, y: o.y + y0 }, { x: o.x + x1, y: o.y + y1 }, { x: o.x + x0, y: o.y + y1 }] };
};
const sym = (symmetry, patches, lines) => symmetryMarks(room, { ...settings, symmetry }, patches, lines);
const box = (pts, o) => {
  const xs = pts.map(([x]) => x - o.x);
  const ys = pts.map(([, y]) => y - o.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 1000));
};

test('off draws nothing', () => {
  assert.deepEqual(sym({}, [bay('left', 'fill:1', 'absorber-100', 1, 1, 2, 2)]), []);
});

test('the left wall leads: its panel lands on the right wall the same distance from the front, the same height', () => {
  const panel = bay('left', 'fill:1', 'absorber-100', 1.0, 0.9, 2.2, 2.1);
  const [f] = sym({ sides: 'left' }, [panel]);
  assert.equal(f.kind, 'fill');
  assert.equal(f.layer, 'Elevation Right');
  assert.equal(f.paletteId, 'absorber-100');
  assert.deepEqual(box(f.points, at('right')), [5000 - 2200, 900, 5000 - 1000, 2100]);
  // heard on the right wall, at the same place along the room as the left one
  const { pieces } = layPatches(room, [panel, { id: 'm', paletteId: f.paletteId, layer: f.layer, poly: f.points.map(([x, y]) => ({ x, y })) }]);
  const [l, r] = pieces;
  assert.equal(l.face, 'left');
  assert.equal(r.face, 'right');
  assert.ok(Math.abs(l.area - r.area) < 1e-6);
  const along = (pc) => pc.points3d.map((p) => p.y).sort((a, b) => a - b);
  assert.deepEqual(along(l).map((v) => v.toFixed(3)), along(r).map((v) => v.toFixed(3)));
});

test('the back wall mirrors about its own centre line: the left half onto the right, the straddler left alone', () => {
  const o = at('back');
  const lines = [
    { layer: 'Elevation Back', a: { x: o.x + 0.6, y: o.y }, b: { x: o.x + 0.6, y: o.y + 3 } }, // a division line, left half
    { layer: 'Elevation Back', a: { x: o.x, y: o.y }, b: { x: o.x + 4.2, y: o.y } }, // the outline's floor, never copied
  ];
  const out = sym({ back: 'left' }, [bay('back', 'fill:1', 'bass-trap', 0, 0, 0.6, 3), bay('back', 'fill:2', 'diffuser', 1.5, 0.9, 2.7, 2.1)], lines);
  const fills = out.filter((it) => it.kind === 'fill');
  assert.equal(fills.length, 1);
  assert.equal(fills[0].layer, 'Elevation Back');
  assert.deepEqual(box(fills[0].points, o), [3600, 0, 4200, 3000]);
  const [d] = out.filter((it) => it.kind === 'drawing');
  assert.deepEqual(d.lines, [[3.6, 0, 3.6, 3]]);
});
