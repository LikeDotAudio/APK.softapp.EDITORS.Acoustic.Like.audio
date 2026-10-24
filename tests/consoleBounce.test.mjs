// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoom } from '../js/acoustics/room.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';
import { makeSpeaker } from '../js/acoustics/devices.js';
import { furnitureTops, imageReaches, roomImages, specular } from '../js/acoustics/images.js';
import { firstReflections } from '../js/acoustics/reflectionPanels.js';
import { prepare, waveDb } from '../js/acoustics/field.js';
import { advise } from '../js/acoustics/advisor.js';
import { material } from '../js/acoustics/materials.js';

const settings = { ...structuredClone(DEFAULT_SETTINGS), roomHeight: 3, frontDeg: 90 };
const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const shell = rect(0, 0, 5, 7);
// a 2.4 × 1.0 console between the boxes and the ears, its top at 0.85 m
const console24 = { id: 'block:1', paletteId: 'console-2400x1000', layer: 'Furniture', poly: rect(1.3, 4.1, 3.7, 5.1) };
const withConsole = buildRoom(shell, settings, [], [console24]);
const bare = buildRoom(shell, settings);
const L = { ...makeSpeaker('monitor', { x: 1.5, y: 5.6, z: 1.2 }), role: 'L', aim: -90 };
const mix = { id: 'mix', name: 'Mixer', kind: 'mixer', mix: true, x: 2.5, y: 3.5, z: 1.2, aim: 90 };

test('a console is a top at its height, not a floor finish', () => {
  const [top] = furnitureTops(withConsole);
  assert.equal(top.paletteId, 'console-2400x1000');
  assert.ok(Math.abs(top.z - 0.85) < 1e-9);
});

test('the console bounce lands on its top, and the floor under it hears nothing', () => {
  const rs = firstReflections(withConsole, [L], mix, 2);
  const bounce = rs.find((r) => r.surface === 'console');
  assert.ok(bounce, 'the mirror on the desk sees the box');
  assert.ok(Math.abs(bounce.hit.z - 0.85) < 1e-9);
  assert.ok(bounce.delayMs > 0 && bounce.delayMs < 2, 'a bounce this close is barely late');
  assert.ok(!rs.some((r) => r.surface === 'floor'), 'the floor bounce lands under the console');
  assert.ok(firstReflections(bare, [L], mix, 2).some((r) => r.surface === 'floor'));
});

test('a top image only reaches a point whose path crosses the top', () => {
  const img = roomImages(withConsole, L, 1).find((i) => i.top);
  assert.ok(img);
  assert.equal(imageReaches(img, mix), true);
  assert.equal(imageReaches(img, { x: 2.5, y: 1.0, z: 1.2 }), false, 'from the back of the room the bounce misses the desk');
  assert.equal(imageReaches(img, { x: 2.5, y: 4.5, z: 0.5 }), false, 'under the top');
});

test('the console combs the response at the seat', () => {
  const freqs = [300, 600, 1200, 2400];
  const diff = freqs.map((f) => waveDb(prepare(withConsole, [L], { maxOrder: 1 }), mix, f) - waveDb(prepare(bare, [L], { maxOrder: 1 }), mix, f));
  assert.ok(diff.some((d) => Math.abs(d) > 0.5), `the console changes the response: ${diff.map((d) => d.toFixed(2))}`);
});

test('a console is a mirror in the low mids and a scatterer in the highs', () => {
  const m = material('console-surface');
  assert.ok(specular(m, 0) > 0.8, 'low-mids come straight back');
  assert.ok(specular(m, 5) < specular(m, 0) / 1.5, 'its knobs and faders scatter the highs');
  assert.ok(m.alpha.every((a) => a < 0.1), 'it absorbs almost nothing');
});

test('the advisor runs the mirror test', () => {
  const found = advise(withConsole, [L], [mix], settings, null).find((f) => f.title === 'L: console bounce');
  assert.ok(found);
  assert.match(found.detail, /comb notches at \d+ Hz/);
  assert.ok(!advise(bare, [L], [mix], settings, null).some((f) => /console bounce/.test(f.title)));
});
