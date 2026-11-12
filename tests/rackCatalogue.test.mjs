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

test('ROAD-3727: a rack item keeps the bench unit it is — the only one of its part, or none guessed among several', async () => {
  const { benchUnits, rackedUnits } = await import('../js/ui/rackPanel.js');
  const bench = { instances: [
    { ref: 'U7', name: 'Basement TV', part: { id: 'google/cast-video-device' }, guid: 'G7', live: { key: 'serial:google:chromecast:db2e', state: 'online' } },
    { ref: 'U11', name: 'Garage TV', part: { id: 'google/cast-video-device' }, guid: 'G11', live: { key: 'serial:google:chromecast:c65c', state: 'graveyard' } },
    { ref: 'U24', name: '34401A · MY41001234', part: 'keysight/34401a', guid: 'G24' }] };
  const units = await benchUnits(async () => ({ ok: true, json: async () => bench }), '/api/bim/bench');
  assert.deepEqual(units.get('google/cast-video-device').map((u) => [u.ref, u.key, u.state]),
    [['U7', 'serial:google:chromecast:db2e', 'online'], ['U11', 'serial:google:chromecast:c65c', 'graveyard']]);
  assert.equal((await benchUnits(async () => ({ ok: true, json: async () => bench }), null)).size, 0, 'no bench: nothing to choose from');

  const nobody = async () => { throw new Error('down'); };
  const dmm = await rackItemOfPick({ bim: { id: 'keysight/34401a' }, ref: { part: 'keysight/34401a' } }, 1, nobody, units.get('keysight/34401a'));
  assert.deepEqual(dmm.device, { ref: 'U24', name: '34401A · MY41001234', guid: 'G24' }, 'the one box of its part: it is that one');
  const cast = await rackItemOfPick({ bim: { id: 'google/cast-video-device' }, ref: { part: 'google/cast-video-device' } }, 1, nobody, units.get('google/cast-video-device'));
  assert.equal(cast.device, undefined, 'two of the part: the row asks which, nothing guessed');

  const taken = rackedUnits({ r1: { items: [dmm, { ...cast, device: { ref: 'U7', guid: 'G7' } }] } });
  assert.deepEqual([...taken.keys()], ['G24', 'G7']);
});
