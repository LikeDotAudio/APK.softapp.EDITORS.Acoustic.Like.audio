// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoom } from '../js/acoustics/room.js';
import { elevationOrigin } from '../js/acoustics/patches.js';
import { buildMarks, spacesOf } from '../js/cad/marks.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';

const settings = { ...DEFAULT_SETTINGS, roomHeight: 3, frontDeg: 90 };
const room = buildRoom([{ x: -2.1, y: 0 }, { x: 2.1, y: 0 }, { x: 2.1, y: 5 }, { x: -2.1, y: 5 }], settings);
const state = { settings, mics: [], speakers: [] };

test('every drawing on the sheet is a space: the plan, each wall, the blow-up, cut-aways and sections', () => {
  const k = 0.001;
  const sets = buildMarks({ room, state, planLayer: 'Room', sheetBounds: null, k, layers: new Set(), rooms: [{ name: 'A', room }], wallPatches: [] });
  const spaces = spacesOf(room, sets, k);
  const ids = spaces.map((s) => s.id);
  for (const id of ['host:plan', 'host:elevation-front', 'host:elevation-back', 'host:elevation-left', 'host:elevation-right']) assert.ok(ids.includes(id), id);
  for (const s of spaces) {
    const [x1, y1, x2, y2] = s.bounds;
    assert.ok(x2 > x1 && y2 > y1, s.id);
  }
  // in drawing units (mm here): the plan holds the room's 4200 × 5000 outline, the front wall its origin
  const plan = spaces.find((s) => s.id === 'host:plan').bounds;
  assert.ok(plan[0] <= -2100 && plan[2] >= 2100 && plan[1] <= 0 && plan[3] >= 5000);
  const o = elevationOrigin(room, 'front');
  const front = spaces.find((s) => s.id === 'host:elevation-front').bounds;
  assert.ok(front[0] <= o.x / k && front[2] >= (o.x + 4.2) / k && front[1] <= o.y / k);
});
