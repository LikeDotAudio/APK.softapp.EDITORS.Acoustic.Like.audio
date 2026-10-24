// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACOUSTX_ABSORBERS,
  ACOUSTX_FREQ_3RD,
  ACOUSTX_FREQ_OCTAVE,
  ACOUSTX_SPEAKERS,
  BANDS_9,
  findAbsorber,
  findSpeaker,
} from '../js/acoustx/database.js';

test('Acoustic X Speaker Database: 29 reference studio monitors parsed and converted', () => {
  assert.equal(ACOUSTX_SPEAKERS.length, 29);

  // Genelec 1029A (metric: mm -> m)
  const g1029 = findSpeaker('1');
  assert.ok(g1029);
  assert.equal(g1029.name, 'Genelec 1029A');
  assert.equal(g1029.maker, 'Genelec');
  assert.equal(g1029.metric, true);
  assert.equal(g1029.w, 0.151);
  assert.equal(g1029.d, 0.191);
  assert.equal(g1029.h, 0.247);
  assert.equal(g1029.wooferHeight, 0.07);
  assert.equal(g1029.centerHeight, 0.14);
  assert.equal(g1029.fLow, 70);
  assert.equal(g1029.fCross, 3300);

  // Meyer HD-1 (imperial: inches -> m)
  const hd1 = findSpeaker('32');
  assert.ok(hd1);
  assert.equal(hd1.name, 'Meyer HD-1');
  assert.equal(hd1.maker, 'Meyer');
  assert.equal(hd1.metric, false);
  assert.equal(hd1.w, 0.3048);
  assert.equal(hd1.d, 0.3556);
  assert.equal(hd1.h, 0.4064);
  assert.equal(hd1.wooferHeight, 0.1524);
  assert.equal(hd1.centerHeight, 0.254);
  assert.equal(hd1.fLow, 32);

  // Lookup by key and name (case insensitive)
  assert.equal(findSpeaker('acx-spk-18')?.name, 'Dynaudio BM15');
  assert.equal(findSpeaker('dynaudio bm15')?.id, '18');
});

test('Acoustic X Absorber Database: 148 materials and treatments with 6 and 9-band data', () => {
  assert.equal(ACOUSTX_ABSORBERS.length, 148);

  // First item: Brick, unglazed
  const brick = findAbsorber('1');
  assert.ok(brick);
  assert.equal(brick.name, 'Brick, unglazed');
  assert.equal(brick.source, 'Ceilings & Interior Systems Contractors Assoc.');
  assert.equal(brick.wall, true);
  assert.equal(brick.floor, false);
  assert.equal(brick.alpha.length, 6);
  assert.equal(brick.alpha9.length, 9);
  assert.deepEqual(brick.bands9, BANDS_9);

  // Pilchner Schoustal Inc. diaphragmatic absorber
  const diap = findAbsorber('96');
  assert.ok(diap);
  assert.equal(diap.name, 'Diaphragmatic, DIAP-001');
  assert.equal(diap.source, 'Pilchner Schoustal Inc.');
  assert.equal(diap.alpha[0], 0.29); // 125 Hz
  assert.equal(diap.alpha[1], 0.37); // 250 Hz

  // Every absorber has alpha in [0, 0.99]
  for (const a of ACOUSTX_ABSORBERS) {
    assert.ok(a.name.length > 0);
    assert.equal(a.alpha.length, 6);
    for (const v of a.alpha) {
      assert.ok(v >= 0 && v <= 0.99, `alpha out of bounds for ${a.name}: ${v}`);
    }
  }

  // Lookup by key and name
  assert.equal(findAbsorber('acx-abs-57')?.name, 'Abffusor');
  assert.equal(findAbsorber('abffusor')?.id1, '57');
});

test('Acoustic X Frequency Databases: 1/3-octave and 1/1-octave band limits and A-weighting', () => {
  // 1/3-octave: 16 bands from 16 to 500 Hz
  assert.equal(ACOUSTX_FREQ_3RD.length, 16);
  assert.equal(ACOUSTX_FREQ_3RD[0].center, 16);
  assert.equal(ACOUSTX_FREQ_3RD[0].lower, 14.1);
  assert.ok(Math.abs(ACOUSTX_FREQ_3RD[0].upper - 17.8) < 0.001);
  assert.equal(ACOUSTX_FREQ_3RD[0].bandwidth, 3.7);
  assert.equal(ACOUSTX_FREQ_3RD[15].center, 500);

  // 1/1-octave: 7 bands from 16 to 1000 Hz
  assert.equal(ACOUSTX_FREQ_OCTAVE.length, 7);
  assert.equal(ACOUSTX_FREQ_OCTAVE[0].center, 16);
  assert.equal(ACOUSTX_FREQ_OCTAVE[0].lower, 11);
  assert.equal(ACOUSTX_FREQ_OCTAVE[0].upper, 22);
  assert.equal(ACOUSTX_FREQ_OCTAVE[0].bandwidth, 11);
  assert.equal(ACOUSTX_FREQ_OCTAVE[6].center, 1000);
  assert.equal(ACOUSTX_FREQ_OCTAVE[6].dbA, 0); // 0 dB reference at 1 kHz
});

test('Room Datamodel: incorporates perBand9, freq3rd, freqOctave, and absorber materials', async () => {
  const { buildRoom } = await import('../js/acoustics/room.js');
  const { lookup, material } = await import('../js/acoustics/materials.js');
  const { makeSpeaker, boxSize } = await import('../js/acoustics/devices.js');

  // Materials lookup
  const diap = lookup('acx-abs-96');
  assert.ok(diap);
  assert.equal(diap.name, 'Diaphragmatic, DIAP-001');
  assert.equal(diap.source, 'Pilchner Schoustal Inc.');
  assert.equal(diap.wall, true);
  assert.equal(diap.alpha9.length, 9);
  assert.equal(material('acx-abs-96'), diap);

  // Speaker datamodel
  const spk = makeSpeaker('genelec-1031a', { x: 1.5, y: 1.0, z: 1.2 });
  assert.equal(spk.w, 0.25);
  assert.equal(spk.d, 0.29);
  assert.equal(spk.h, 0.393);
  assert.equal(spk.wooferHeight, 0.12);
  assert.equal(spk.centerHeight, 0.24);
  assert.equal(spk.fLow, 48);
  assert.equal(spk.fCross, 2200);
  const size = boxSize(spk);
  assert.deepEqual(size, { w: 0.25, d: 0.29, h: 0.393 });

  // Room datamodel
  const poly = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 7 }, { x: 0, y: 7 }];
  const room = buildRoom(poly, {
    roomHeight: 3.0,
    frontDeg: 90,
    faceMaterials: {
      floor: 'wood-floor',
      ceiling: 'acoustic-tile',
      front: 'acx-abs-96',
      back: 'acx-abs-57',
      left: 'gypsum',
      right: 'gypsum',
    },
  });

  // Verify room datamodel properties
  assert.equal(room.bands.length, 6);
  assert.equal(room.bands9.length, 9);
  assert.equal(room.perBand.length, 6);
  assert.equal(room.perBand9.length, 9);
  assert.equal(room.freq3rd.length, 16);
  assert.equal(room.freqOctave.length, 7);

  // Check 9-band room acoustics
  for (const b of room.perBand9) {
    assert.ok(Number.isFinite(b.sabine) && b.sabine > 0);
    assert.ok(Number.isFinite(b.eyring) && b.eyring > 0);
    assert.ok(b.abar >= 0 && b.abar <= 1);
  }
});
