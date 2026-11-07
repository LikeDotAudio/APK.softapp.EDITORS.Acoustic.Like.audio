// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flyFrame, puckFrame, puckTarget } from '../js/ui/puck.js';

// The SpaceMouse frames the OS shell posts in (ui/puck.js): which view flies, and how.

const move = (over = {}) => ({ apkos: 'puck', action: 'move', pan: { dx: 3, dy: -2 }, zoom: 1.02, orbit: { yaw: 0.01, pitch: -0.02 }, consumers: {}, ...over });

test('malformed frames and status frames are let go; missing numbers do nothing', () => {
  assert.equal(puckFrame(null), null);
  assert.equal(puckFrame('puck'), null);
  assert.equal(puckFrame({ apkos: 'other', action: 'move' }), null);
  assert.equal(puckFrame({ apkos: 'puck', action: 'status', state: 'up' }), null);
  const f = puckFrame({ apkos: 'puck', action: 'move', pan: { dx: 'x' }, zoom: -1, orbit: null });
  assert.deepEqual({ dx: f.dx, dy: f.dy, zoom: f.zoom, yaw: f.yaw, pitch: f.pitch }, { dx: 0, dy: 0, zoom: 1, yaw: 0, pitch: 0 });
});

test('which view flies: the tile in hand, else what the layout puts first', () => {
  assert.equal(puckTarget({ layout: 'three' }), 'room');
  assert.equal(puckTarget({ layout: 'three', tile: 'plan' }), 'cad');
  assert.equal(puckTarget({ layout: 'six', tile: 'left' }), 'left');
  assert.equal(puckTarget({ layout: 'six', editing: 'back' }), 'back');
  assert.equal(puckTarget({ layout: 'six' }), 'cad');
  assert.equal(puckTarget({ layout: 'six', cadDocked: false }), 'front');
  assert.equal(puckTarget({ layout: 'six', tile: 'plan', cadDocked: false }), 'front');
  assert.equal(puckTarget({ layout: 'wall' }), 'cad');
  assert.equal(puckTarget({ layout: 'wall', cadDocked: false }), null);
  assert.equal(puckTarget({ layout: 'six', tile: '3d' }), 'room');
});

test('the room orbits, dollies and pans; an elevation zooms and pans; the CAD gets the frame unchanged', () => {
  const got = [];
  const room = { fly: (f) => got.push(['room', f]) };
  const faces = { left: { fly: (f) => got.push(['left', f]) } };
  const sent = [];
  const cad = { postMessage: (d, o) => sent.push([d, o]) };
  assert.equal(flyFrame(move(), 'room', { room, faces, cad }), true);
  assert.equal(got[0][1].yaw, 0.01);
  assert.equal(got[0][1].zoom, 1.02);
  assert.equal(got[0][1].dx, 3);
  assert.equal(flyFrame(move(), 'left', { room, faces, cad }), true);
  assert.deepEqual(got[1], ['left', { zoom: 1.02, dx: 3, dy: -2 }]);
  const m = move();
  assert.equal(flyFrame(m, 'cad', { room, faces, cad }), true);
  assert.equal(sent[0][0], m);
});

test('a consumer switched off is left alone', () => {
  let n = 0;
  const room = { fly: () => n++ };
  const faces = { front: { fly: () => n++ } };
  assert.equal(flyFrame(move({ consumers: { acoustic_room: false } }), 'room', { room, faces }), false);
  assert.equal(flyFrame(move({ consumers: { acoustic_walls: false } }), 'front', { room, faces }), false);
  assert.equal(flyFrame(move(), 'back', { room, faces }), false);
  assert.equal(flyFrame({ apkos: 'puck', action: 'status' }, 'room', { room, faces }), false);
  assert.equal(n, 0);
});
