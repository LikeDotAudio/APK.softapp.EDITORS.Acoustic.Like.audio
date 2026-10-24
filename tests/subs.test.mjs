// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';
import { scoreSub, subCrawl, subGrid } from '../js/acoustics/subDesigner.js';

const room = buildRoom([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 5 }, { x: 0, y: 5 }], DEFAULT_SETTINGS);
const seat = { x: 2, y: 1.9, z: 1.2, mix: true, pattern: 'omni', aim: 90, tilt: 0 };

test('the grid stays inside the plan and off the walls', () => {
  const g = subGrid(room, 0.5);
  assert.ok(g.length > 20);
  assert.ok(g.every((p) => p.x >= 0.2 - 1e-9 && p.x <= 3.8 + 1e-9 && p.y >= 0.2 - 1e-9 && p.y <= 4.8 + 1e-9));
});

test('one seat has nothing to disagree with; two seats add their spread', () => {
  const one = scoreSub(room, { x: 1, y: 4 }, [seat]);
  assert.equal(one.even, 0);
  assert.ok(one.flat > 0);
  const two = scoreSub(room, { x: 1, y: 4 }, [seat, { ...seat, x: 2.8, mix: false }]);
  assert.ok(two.even > 0);
});

test('the crawl ranks every cell and hands back the best first', async () => {
  const out = await subCrawl(room, [seat], { step: 0.75 });
  assert.equal(out.cells.length, subGrid(room, 0.75).length);
  for (let i = 1; i < out.best.length; i++) assert.ok(out.best[i].score >= out.best[i - 1].score);
});
