// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOSE_M, PERSON_M, consoleOf, consoleSettled, consoleSpot, isConsole } from '../js/acoustics/console.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('the console sits square in front of the nose, its near edge two people clear', () => {
  const mix = { x: 2, y: 3, aim: 90 };
  const spot = consoleSpot(mix, 'console-2400x1000');
  near(spot.x, 2);
  // ears → nose → two people → half the 1 m depth
  near(spot.y - 3, NOSE_M + 2 * PERSON_M + 0.5);
  assert.equal(spot.rotation, 0);
  // the mixer turns to face +x: the console swings round to stay at the nose, turned with them
  const turned = consoleSpot({ ...mix, aim: 0 }, 'console-2400x1000');
  near(turned.y, 3);
  near(turned.x - 2, NOSE_M + 2 * PERSON_M + 0.5);
  assert.equal(turned.rotation, -90);
  // more people, further off
  assert.ok(consoleSpot(mix, 'console-2400x1000', 3).y > spot.y);
});

test('the console followed is the nearest console or desk, and one already there is left alone', () => {
  assert.ok(isConsole('console-3200x1200') && isConsole('desk-1800x900') && !isConsole('couch-2000x900'));
  const mix = { x: 0, y: 0, aim: 90 };
  const patches = [
    { id: 'block:1', paletteId: 'couch-2000x900', at: { x: 0, y: 0.5 }, rotation: 0 },
    { id: 'block:2', paletteId: 'console-2400x1000', at: { x: 5, y: 5 }, rotation: 0 },
    { id: 'block:3', paletteId: 'desk-1800x900', at: { x: 1, y: 1 }, rotation: 0 },
    { id: 'fill:4', paletteId: 'console-2400x1000' },
  ];
  assert.equal(consoleOf(patches, mix).id, 'block:3');
  const spot = consoleSpot(mix, 'desk-1800x900');
  assert.ok(!consoleSettled(patches[2], spot));
  assert.ok(consoleSettled({ ...patches[2], at: { x: spot.x, y: spot.y }, rotation: 180 }, spot));
});
