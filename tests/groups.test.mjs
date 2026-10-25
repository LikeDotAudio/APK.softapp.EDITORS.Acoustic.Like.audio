// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receiverOrder, sourceGroups } from '../js/acoustics/groups.js';

const settings = { speakerSet: 'B', layout: { preset: '5.1' }, layoutSets: { A: { preset: '7.1.4' } } };

test('sources: one branch per set that holds boxes, a box with no set is A’s', () => {
  const spk = [{ id: 1, role: 'L' }, { id: 2, set: 'B', role: 'C' }, { id: 3, set: 'A', name: 'Sub #1' }];
  const g = sourceGroups(spk, settings);
  assert.deepEqual(g.map((x) => x.key), ['A', 'B']);
  assert.deepEqual(g[0].items.map((s) => s.id), [1, 3]);
  assert.equal(g[0].preset, '7.1.4');
  assert.equal(g[1].live, true);
  assert.equal(g[0].live, false);
});

test('sources: a set with no arrangement names none', () => {
  const g = sourceGroups([{ id: 1, set: 'C' }], { speakerSet: 'C', layout: { preset: 'none' } });
  assert.equal(g[0].preset, null);
});

test('receivers: the mix seat first, then the tiers, then measurement mics in placing order', () => {
  const mics = [{ id: 'm1', kind: 'omni' }, { id: 'e', kind: 'entourage' }, { id: 'p', kind: 'producer' }, { id: 'x', kind: 'mixer', mix: true }, { id: 'm2', kind: 'omni' }];
  assert.deepEqual(receiverOrder(mics).map((m) => m.id), ['x', 'p', 'e', 'm1', 'm2']);
});
