// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookup } from '../js/acoustics/materials.js';
import { groupPatches, patchName, patternOf, rgba, shortName } from '../js/views/treatments.js';

// The plain parts of how a treatment is drawn and listed.

test('a patch split across two walls folds back into the one thing placed', () => {
  const mat = lookup('mineral-wool-50');
  const pieces = [
    { id: 'fill:1', paletteId: 'mineral-wool-50', material: mat, face: 'left', wall: 3, area: 1.5 },
    { id: 'block:2', paletteId: 'qrd-600', material: lookup('qrd-600'), face: 'back', wall: 2, area: 0.36 },
    { id: 'fill:1', paletteId: 'mineral-wool-50', material: mat, face: 'left', wall: 4, area: 0.5 },
  ];
  const g = groupPatches(pieces);
  assert.equal(g.length, 2);
  assert.equal(g[0].id, 'fill:1');
  assert.equal(g[0].area, 2);
  assert.deepEqual(g[0].faces, ['left']);
  assert.equal(g[0].pieces.length, 2);
  assert.equal(g[1].name, 'QRD 600×600');
  assert.deepEqual(groupPatches(), []);
});

test('names: a product by its own name, a finish by its material, labels cut at the comma', () => {
  assert.equal(patchName('cloud-1200', lookup('cloud-1200')), 'Ceiling cloud 1200×1200');
  assert.equal(patchName('carpet-pad', lookup('carpet-pad')), 'Heavy carpet on foam rubber');
  assert.equal(shortName('Acoustic mineral wool, 50 mm (2 in)'), 'Acoustic mineral wool');
  assert.equal(shortName('Abcdefghij', 5), 'Abcd…');
});

test('patterns follow the category; colours go see-through', () => {
  assert.equal(patternOf('Absorber'), 'grid');
  assert.equal(patternOf('Diffuser'), 'wells');
  assert.equal(patternOf('Glass'), 'sheen');
  assert.equal(patternOf('Masonry'), 'diagonal');
  assert.equal(patternOf('Wood'), 'plain');
  assert.equal(rgba('#ff8000', 0.5), 'rgba(255,128,0,0.5)');
});
