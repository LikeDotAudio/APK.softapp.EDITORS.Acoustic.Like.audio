// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampInside, CLEAR_M, intoRoom, middleOf, outside } from '../js/acoustics/inRoom.js';
import { layoutPositions } from '../js/acoustics/layouts.js';
import { buildRoom } from '../js/acoustics/room.js';
import { DEFAULT_SETTINGS } from '../js/model/store.js';

const P = (x, y) => ({ x, y });
const room = buildRoom([P(0, 0), P(5, 0), P(5, 7), P(0, 7)], { ...structuredClone(DEFAULT_SETTINGS), roomHeight: 3 });

test('a device past a wall or above the ceiling is outside', () => {
  assert.equal(outside(room, { x: 2, y: 3, z: 1.2 }), false);
  assert.equal(outside(room, { x: 9, y: 3, z: 1.2 }), true);
  assert.equal(outside(room, { x: 2, y: 3, z: 14 }), true);
  // sitting on the wall boundary line is flagged as outside
  assert.equal(outside(room, { x: 0, y: 2.5, z: 1.2 }), true);
  assert.equal(outside(room, { x: 5, y: 3.5, z: 1.2 }), true);
});

test('brought in, it lands in the middle, keeping a height that fits', () => {
  const c = middleOf(room);
  assert.ok(Math.abs(c.x - 2.5) < 1e-9 && Math.abs(c.y - 3.5) < 1e-9);
  assert.deepEqual(intoRoom(room, { x: 40, y: -3, z: 2 }, 'speaker'), { x: 2.5, y: 3.5, z: 2 });
  assert.equal(intoRoom(room, { x: 2, y: 3, z: 14 }, 'speaker').z, 1.2);
  assert.equal(intoRoom(room, { x: 40, y: 3, z: 9, kind: 'sub' }, 'speaker').z, 0.3);
});

test('an L-shaped room whose centroid falls outside sends it to the mix seat', () => {
  const L = buildRoom([P(0, 0), P(6, 0), P(6, 1), P(1, 1), P(1, 6), P(0, 6)], structuredClone(DEFAULT_SETTINGS));
  assert.deepEqual(middleOf(L, { x: 0.5, y: 3 }), { x: 0.5, y: 3 });
});

test('placement clamps and brings devices inside the room with wall clearance', () => {
  // A device sitting on the wall line (like a producer seat at x = 0) is brought inside
  const pOnWall = clampInside(room, { x: 0, y: 2.5, z: 1.2 }, CLEAR_M);
  assert.ok(pOnWall.x >= CLEAR_M, `expected x >= ${CLEAR_M}, got ${pOnWall.x}`);
  assert.equal(outside(room, pOnWall), false);

  // A device placed way outside is brought inside with clearance
  const pOutside = clampInside(room, { x: -2, y: 9, z: 1.2 }, CLEAR_M);
  assert.ok(pOutside.x >= CLEAR_M && pOutside.y <= 7 - CLEAR_M);
  assert.equal(outside(room, pOutside), false);

  // Heights are clamped to ceiling and floor
  const pCeiling = clampInside(room, { x: 2.5, y: 3.5, z: 12 }, CLEAR_M);
  assert.ok(pCeiling.z <= 3 - 0.15);
});

test('layout placement brings all speakers into the room', () => {
  // Mix near the left wall so a 2.1 m radius would place speakers through the left wall
  const mixNearWall = { x: 0.8, y: 3.5, z: 1.2 };
  const placed = layoutPositions('5.2.4', mixNearWall, 90, 2.1, 3.0, room);
  assert.ok(placed.length > 0);
  for (const s of placed) {
    assert.equal(outside(room, s), false, `speaker ${s.role} at (${s.x}, ${s.y}, ${s.z}) should be inside room`);
    assert.ok(s.x >= CLEAR_M - 0.01, `speaker ${s.role} x (${s.x}) should clear left wall`);
    assert.ok(s.x <= 5 - CLEAR_M + 0.01, `speaker ${s.role} x (${s.x}) should clear right wall`);
  }
});

test('store manages furniture placement, updates, drag clamping, and removal', async () => {
  const { createStore } = await import('../js/model/store.js');
  const store = createStore();

  // Add furniture (e.g. producer desk)
  const desk = store.addFurniture('desk-1800x900', { x: 2.5, y: 3.5 }, 0);
  assert.ok(desk.id);
  assert.equal(desk.paletteId, 'desk-1800x900');
  assert.equal(store.state.furniture.length, 1);
  assert.deepEqual(store.state.selected, { kind: 'furniture', id: desk.id });

  // Update furniture
  store.updateFurniture(desk.id, { x: 2.7, y: 3.8, rotation: 30 });
  const updated = store.state.furniture.find((f) => f.id === desk.id);
  assert.equal(updated.x, 2.7);
  assert.equal(updated.y, 3.8);
  assert.equal(updated.rotation, 30);

  // Bring in if outside wall boundary
  store.updateFurniture(desk.id, { x: 0, y: 3.8 });
  assert.equal(outside(room, store.state.furniture[0]), true);
  const brought = store.bringIn('furniture', desk.id, room);
  assert.equal(brought, true);
  assert.equal(outside(room, store.state.furniture[0]), false);

  // Remove furniture via store.remove
  store.remove('furniture', desk.id);
  assert.equal(store.state.furniture.length, 0);
  assert.equal(store.state.selected, null);
});

test('arrangementMarks includes room perimeter, physical speakers, seats, and placed furniture', async () => {
  const { arrangementMarks } = await import('../js/cad/marks.js');
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.layout.preset = '5.1';
  const mockState = {
    settings,
    speakers: [
      { id: 'spk-l', role: 'L', name: 'Left', x: 1.5, y: 5.0, z: 1.2, aim: 90, kind: 'speaker' },
      { id: 'spk-r', role: 'R', name: 'Right', x: 3.5, y: 5.0, z: 1.2, aim: 90, kind: 'speaker' },
      { id: 'spk-ls', role: 'Ls', name: 'Left Surround', x: 0.5, y: 2.0, z: 1.2, aim: 45, kind: 'speaker' },
      { id: 'spk-rs', role: 'Rs', name: 'Right Surround', x: 4.5, y: 2.0, z: 1.2, aim: 135, kind: 'speaker' },
      { id: 'spk-x', name: 'Placed by hand', x: 2.5, y: 1.0, z: 1.2, aim: 90, kind: 'speaker' },
    ],
    mics: [
      { id: 'mic-mix', mix: true, name: 'Mixer', kind: 'tier1', x: 2.5, y: 3.5, z: 1.2, aim: 90 },
      { id: 'mic-p', mix: false, name: 'Producer', kind: 'producer', x: 0.8, y: 2.5, z: 1.2, aim: 90 },
    ],
    furniture: [
      { id: 'f-1', paletteId: 'desk-1800x900', x: 2.5, y: 4.2, rotation: 0 },
    ],
  };

  const mix = mockState.mics[0];
  const marks = arrangementMarks(room, mockState.settings, mix, mockState);
  assert.ok(marks.length > 0);
  const mark = marks[0];
  assert.equal(mark.layer, 'Speaker layout');

  // Verify texts contains speaker tags, listener seats, and furniture labels
  const textStrings = mark.texts.map((t) => t.text);
  assert.ok(textStrings.includes('L'));
  assert.ok(textStrings.includes('R'));
  assert.ok(textStrings.includes('Ls'));
  assert.ok(textStrings.includes('Rs'));
  assert.ok(!textStrings.includes('Placed by hand'), 'a box outside the arrangement is muted, not drawn');
  assert.ok(textStrings.includes('MIX'));
  assert.ok(textStrings.includes('P'));
  assert.ok(textStrings.some((t) => t.includes('Producer desk') || t.includes('Desk')));
  assert.ok(mark.lines.length > 10, 'lines should contain room perimeter, speaker boxes, aim pointers, and furniture boxes');
});

test('nothing stays outside the rooms: keepInside brings in every stray at once, and leaves one standing in another room', async () => {
  const { createStore } = await import('../js/model/store.js');
  const store = createStore();
  const next = [P(6, 0), P(9, 0), P(9, 4), P(6, 4)];
  // the two subs a layout put past the walls (LFE1, LFE2), and a mic beside them
  store.addSpeaker('sub', { x: -1.2, y: 1 }, { role: 'LFE1', z: 0.3 });
  store.addSpeaker('sub', { x: 2, y: -0.8 }, { role: 'LFE2', z: 0.3 });
  store.addMic('omni', { x: 12, y: 3 });
  assert.ok([...store.state.speakers, ...store.state.mics].every((d) => outside(room, d)));
  const desk = store.addFurniture('desk-1800x900', { x: 7.5, y: 2 }, 0);
  assert.equal(store.keepInside(room, [room.poly, next]), true);
  for (const s of store.state.speakers) assert.equal(outside(room, s), false, `${s.role || s.name} is outside`);
  for (const m of store.state.mics) assert.equal(outside(room, m), false, `${m.name} is outside`);
  // the desk stands in the other room on the sheet: it is in a room, so it stays
  assert.equal(store.state.furniture.find((f) => f.id === desk.id).x, 7.5);
  assert.equal(store.keepInside(room, [room.poly, next]), false);
});
