// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { depthOf, paletteItems } from '../js/acoustics/materials.js';
import { SYMBOLS } from '../js/acoustics/symbols.js';

const by = Object.fromEntries(paletteItems().map((x) => [x.name, x]));

test('every palette item names a symbol in the catalogue, with its name and α per octave', () => {
  for (const it of paletteItems()) {
    assert.ok(SYMBOLS[it.symbol], `${it.name} → ${it.symbol}`);
    assert.equal(it.symbolName, SYMBOLS[it.symbol].name);
    assert.equal(it.alpha.length, 6);
  }
});

test('each is drawn as what it is made of, not as a word in its name', () => {
  const want = {
    'Porous absorber, 100 mm': 'batt',
    'QRD diffuser, wooden wells': 'qrd',
    'Slat resonator, wood slats over wool': 'slat',
    'Plate glass, window pane': 'glass',
    'Fiberglass, AF530, 2", Mounting 4': 'rigid',
    'Wood Parquet, on concrete': 'wood',
    'Linoleum, on concrete': 'carpet',
    'Carpet, woven wool loop, 1/4" pile height, 40 oz.': 'carpet',
    'Acoustic tile, 5/8", vinyl coating': 'acoustic',
    'Window casing, painted wood trim': 'wood',
    'Diffusorblox, painted': 'skyline',
    'Mixing console 2400×1000': 'furniture',
    'Concrete, bare or painted': 'concrete',
  };
  for (const [name, symbol] of Object.entries(want)) assert.equal(by[name]?.symbol, symbol, name);
});

test('depth from the name: W×H×D, mm, inches and fractions', () => {
  assert.equal(depthOf({ name: 'Absorber panel 1200×600×100' }), 0.1);
  assert.equal(depthOf({ name: 'Porous absorber, 50 mm' }), 0.05);
  assert.equal(depthOf({ name: 'AP, 1-1/2", FR701' }), 0.0381);
  assert.equal(depthOf({ name: 'Fiberboard, 1/2", solid backing' }), 0.0127);
  assert.equal(depthOf({ name: 'Drywall, gypsum board on studs' }), null);
});
