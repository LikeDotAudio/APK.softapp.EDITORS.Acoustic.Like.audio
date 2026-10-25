// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { furnitureHeight, PRODUCTS } from '../js/acoustics/materials.js';
import { pieceFootprint, piecesOf, pieceTop } from '../js/acoustics/pieces.js';
import { symbolOf } from '../js/acoustics/symbols.js';
import { lookup } from '../js/acoustics/materials.js';

const drawn = PRODUCTS.filter((p) => piecesOf(p.id));

test('the instruments are in the palette, each a thing that stands on the floor', () => {
  for (const id of ['amp-head-700x280', 'keyboard-88-1350x380', 'keyboard-61-1000x350', 'hammond-b3-1250x730', 'leslie-122-840x550', 'grand-piano-1480x2110', 'console-broadcast-2000x1100']) {
    const p = PRODUCTS.find((x) => x.id === id);
    assert.ok(p, id);
    assert.ok(furnitureHeight(id) > 0, `${id} stands up`);
    assert.equal(symbolOf(lookup(id), p), 'furniture');
  }
});

test('every piece lies inside its product’s footprint, and none rises far past its height', () => {
  assert.ok(drawn.length >= 12);
  for (const p of drawn) {
    const [w, d] = p.size;
    for (const pc of piecesOf(p.id)) {
      for (const [x, y] of pieceFootprint(pc)) assert.ok(Math.abs(x) <= w / 2 + 0.03 && Math.abs(y) <= d / 2 + 0.03, `${p.id} ${pc.shape} at ${x.toFixed(2)}, ${y.toFixed(2)}`);
      // a cymbal or a meter bridge may stand over the height the room hears; nothing floats off into the ceiling
      assert.ok(pieceTop(pc) <= Math.max(furnitureHeight(p.id), 1.0) + 0.45, `${p.id} ${pc.shape} up to ${pieceTop(pc)}`);
    }
  }
});

test('the kit is in pieces: a throne, a kick on its side, toms, a snare and three cymbals', () => {
  const kit = piecesOf('drum-kit-1800x1500');
  assert.ok(kit.some((pc) => pc.shape === 'extrude' && pc.axis === 'y'), 'the kick');
  assert.equal(kit.filter((pc) => pc.colour === '#ca8a04').length, 4, 'hi-hat pair, crash, ride');
  assert.ok(kit.filter((pc) => pc.colour === '#e7e5e4').length >= 5, 'heads on the drums');
});

test('a console has a strip of knobs and a meter for each of its channels', () => {
  const desk = piecesOf('console-broadcast-2000x1100');
  assert.equal(desk.filter((pc) => pc.colour === '#fef3c7').length, 20);
  assert.equal(desk.filter((pc) => pc.colour === '#dc2626').length, 20);
});
