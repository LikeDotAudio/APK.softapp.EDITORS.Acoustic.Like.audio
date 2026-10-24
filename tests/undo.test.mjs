// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeMic, makeSpeaker } from '../js/acoustics/devices.js';
import { createStore } from '../js/model/store.js';

/** A 2.0 pair and a mix seat, symmetric pairing off so each box moves alone. */
function stereo() {
  const store = createStore();
  store.setSettings({ symmetric: false, layout: { ...store.state.settings.layout, preset: '2.0' } });
  store.append('mic', [makeMic('omni', { x: 2.5, y: 3, z: 1.2 }, { mix: true })]);
  store.append('speaker', [makeSpeaker('nearfield', { x: 1.5, y: 5, z: 1.2 }, { role: 'L' }), makeSpeaker('nearfield', { x: 3.5, y: 5, z: 1.2 }, { role: 'R' })]);
  return store;
}

test('a drag is one undo step, and redo puts it back', () => {
  const store = stereo();
  const [l] = store.state.speakers;
  for (const x of [1.6, 1.7, 1.8]) store.update('speaker', l.id, { x }, true);
  store.commit();
  assert.equal(store.state.speakers[0].x, 1.8);
  assert.ok(store.undo());
  assert.equal(store.state.speakers[0].x, 1.5);
  assert.ok(store.redo());
  assert.equal(store.state.speakers[0].x, 1.8);
});

test('looking at another frequency is not a step, and an undo leaves it alone', () => {
  const store = stereo();
  const [l] = store.state.speakers;
  store.update('speaker', l.id, { x: 1.9 });
  store.setSettings({ freq: 250 });
  assert.ok(store.undo());
  assert.equal(store.state.speakers[0].x, 1.5);
  assert.equal(store.state.settings.freq, 250);
});

test('one speaker of the arrangement moved on its own warns, and the listener carrying them all does not', () => {
  const store = stereo();
  const [l] = store.state.speakers;
  store.update('speaker', l.id, { x: 1.2 });
  assert.match(store.state.notice, /^⚠ L moved on its own/);
  store.undo();
  assert.equal(store.state.notice, null);
  const seat = store.state.mics[0];
  store.update('mic', seat.id, { x: seat.x + 0.5 });
  assert.equal(store.state.notice, null);
  assert.equal(store.state.speakers[0].x, 2.0, 'the seat carried the pair');
});

test('an arrangement of one warns when its box is moved; None never does; the width carrying the array does not', async () => {
  const { LAYOUTS, NO_LAYOUT, carryArray } = await import('../js/acoustics/layouts.js');
  assert.equal(LAYOUTS['1.0'].speakers.length, 1);
  const store = createStore();
  store.setSettings({ symmetric: false, layout: { ...store.state.settings.layout, preset: '1.0' } });
  store.append('mic', [makeMic('omni', { x: 2.5, y: 3, z: 1.2 }, { mix: true })]);
  store.append('speaker', [makeSpeaker('nearfield', { x: 2.5, y: 5, z: 1.2 }, { role: 'C' })]);
  const [c] = store.state.speakers;
  store.update('speaker', c.id, { x: 2.7 });
  assert.match(store.state.notice, /^⚠ C moved on its own — no longer where the Mono 1\.0 arrangement/);
  // the width slider: the array's radius changes and carries the box
  const { settings } = store.state;
  const next = { ...settings.layout, radius: 3 };
  store.updateMany('speaker', carryArray(store.state.speakers, settings, store.state.mics[0], next), true);
  store.setSettings({ layout: next });
  assert.equal(store.state.notice, null);
  store.setSettings({ layout: { ...store.state.settings.layout, preset: NO_LAYOUT } });
  store.update('speaker', c.id, { x: 2.1 });
  assert.equal(store.state.notice, null);
  assert.deepEqual(carryArray(store.state.speakers, store.state.settings, store.state.mics[0], { ...store.state.settings.layout, radius: 4 }), [], 'None carries nothing');
});
