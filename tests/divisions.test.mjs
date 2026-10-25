// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom, fromFrame } from '../js/acoustics/room.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';
import { goodFractions, snapToDivisions } from '../js/views/guides.js';

test('the recommended divisions for n ≤ 3 are ⅕, ⅓, ⅔, ⅘ — none on a null', () => {
  assert.deepEqual(goodFractions(3), [0.2, 0.3333, 0.6667, 0.8]);
  for (const f of goodFractions(3)) for (const n of [1, 2, 3]) assert.ok(Math.abs(Math.cos(n * Math.PI * f)) > 0.3);
});

test('a drag lands on a crossing first, else on one line, else stays free', () => {
  const P = (x, y) => ({ x, y });
  const room = buildRoom([P(0, 0), P(5, 0), P(5, 4), P(0, 4)], structuredClone(DEFAULT_SETTINGS));
  const a = 0.2 * room.L;
  const c = 0.5 * room.W;
  const at = (f, l) => snapToDivisions(room, fromFrame(room, f, l), { reach: 0.2, lineReach: 0.08 });
  const cross = at(a + 0.1, c - 0.05);
  assert.equal(cross.along, a);
  assert.equal(cross.across, c);
  const line = at(a + 0.05, c - 0.4);
  assert.equal(line.along, a);
  assert.equal(line.across, null);
  const free = at(a + 0.3, c - 0.4);
  assert.equal(free.along, null);
  assert.equal(free.across, null);
});
