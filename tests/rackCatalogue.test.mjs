// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ??= { baseURI: 'http://x/' };
const { asRackPart, rackItemOfPick } = await import('../js/ui/rackPanel.js');

test('a BIM part, whichever shape, gives the rack its U and its depth', () => {
  assert.deepEqual([asRackPart({ id: 'qsc/core-110f', physical: { rack_units: 1, depth_mm: 350 } })].map(p => [p.id, p.rack_units, p.depth_mm]), [['qsc/core-110f', 1, 350]]);
  assert.equal(asRackPart({ id: 'a/b', manufacturer: 'A', model: 'B', physical: { rack_units: 2 } }).name, 'A B');
});

test('a pick from the library is racked with its body read off its BIM reference, and keeps the reference (ROAD-3572)', async () => {
  const ref = { part: 'qsc/core-110f', url: 'http://bench:8160/api/bim/parts/qsc/core-110f', rev: 'r1' };
  const item = { bim: { id: 'qsc/core-110f', name: 'Q-SYS Core 110f DSP' }, ref };
  const live = async (u) => ({ ok: u === ref.url, json: async () => ({ id: 'qsc/core-110f', physical: { rack_units: 1, depth_mm: 350 } }) });
  const it = await rackItemOfPick(item, 3, live);
  assert.deepEqual([it.partId, it.at, it.units, it.depth, it.bimId], ['qsc/core-110f', 3, 1, 350, 'qsc/core-110f']);
  assert.deepEqual(it.bimRef, ref);
  // the snapshot: the file that holds it, '#' the part
  const snap = { ...item, ref: { ...ref, url: 'https://apk.audio/x/audio.json#qsc/core-110f' } };
  const file = async (u) => ({ ok: u === 'https://apk.audio/x/audio.json', json: async () => ({ items: [{ id: 'qsc/core-110f', physical: { rack_units: 2 } }] }) });
  assert.equal((await rackItemOfPick(snap, 1, file)).units, 2);
  // nothing answers: the row alone, 1 U, depth unknown
  const none = await rackItemOfPick(item, 1, async () => { throw new Error('down'); });
  assert.deepEqual([none.units, none.depth, none.bimRef.part], [1, null, 'qsc/core-110f']);
});
