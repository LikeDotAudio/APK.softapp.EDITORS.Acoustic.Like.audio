// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { furnitureHeight, lookup, MASSONBERG, STICK_DIFFUSER, stickBalance, stickMass } from '../js/acoustics/materials.js';
import { pieceFootprint, piecesOf } from '../js/acoustics/pieces.js';
import { furnish, roomById } from '../js/acoustics/roomLibrary.js';

test('a Massonberg is hundreds of 1 in sticks a square metre, and heavy', () => {
  const { count, kgPerM2 } = stickMass();
  assert.equal(count, 39 * 39);
  assert.ok(kgPerM2 > 70 && kgPerM2 < 90);
});

test('the steel behind the board brings its centre of mass back over the sled', () => {
  const b = stickBalance();
  const back = (MASSONBERG.base / 2 - MASSONBERG.board) / 2 + MASSONBERG.board;
  const moment = b.sticks * ((STICK_DIFFUSER.min + STICK_DIFFUSER.max) / 4) - b.board * (MASSONBERG.board / 2) - b.counterweight * back;
  assert.ok(Math.abs(moment) < 1e-9);
  assert.ok(b.counterweight > 0 && b.plate > 0 && b.plate < 0.1);
});

test('it stands 2.4 m on its sled, every bundle of sticks its own length, none past the sled', () => {
  assert.equal(furnitureHeight('massonberg-2400x600'), 2.4);
  assert.equal(lookup('massonberg-2400x600').id, 'stick-diffuser');
  const parts = piecesOf('massonberg-2400x600');
  const ys = parts.flatMap(pieceFootprint).map(([, y]) => y);
  assert.ok(Math.min(...ys) >= -MASSONBERG.base / 2 - 1e-9 && Math.max(...ys) <= MASSONBERG.base / 2 + 1e-9);
  const lengths = new Set(parts.filter((p) => p.y < 0).map((p) => p.d.toFixed(4)));
  assert.ok(lengths.size > 400);
});

test('the Massonberg room: five of them, a hardwood floor and a rug in the middle', () => {
  const room = roomById('massonberg-room');
  const { furniture } = furnish(room);
  assert.equal(furniture.filter((f) => f.paletteId === 'massonberg-2400x600').length, 5);
  assert.equal(room.faces.floor, 'wood-floor');
  const rug = furniture.find((f) => f.paletteId.startsWith('rug-'));
  assert.deepEqual([rug.x, rug.y], [0, 6]);
  assert.equal(furnitureHeight(rug.paletteId), 0, 'a rug is laid on the floor, not stood on it');
});
