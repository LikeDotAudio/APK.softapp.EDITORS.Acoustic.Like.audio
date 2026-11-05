// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ??= { baseURI: 'http://x/' };
const { catalogueRows, asRackPart } = await import('../js/ui/rackPanel.js');

test('the BIM library reply and the old parts.json give the same rack rows', () => {
  const lib = { total: 2, items: [
    { id: 'qsc/core-110f', name: 'QSC Core 110f', physical: { rack_units: 1, depth_mm: 350 } },
    { id: 'shure/sm58', name: 'Shure SM58', physical: {} },
  ] };
  const old = { parts: [{ id: 'qsc/core-110f', name: 'QSC Core 110f', rack_units: 1, depth_mm: 350 }] };
  assert.deepEqual(catalogueRows(lib).map(p => [p.id, p.rack_units, p.depth_mm]), [['qsc/core-110f', 1, 350]]);
  assert.deepEqual(catalogueRows(old).map(p => [p.id, p.rack_units, p.depth_mm]), [['qsc/core-110f', 1, 350]]);
  assert.equal(asRackPart({ id: 'a/b', manufacturer: 'A', model: 'B', physical: { rack_units: 2 } }).name, 'A B');
  assert.deepEqual(catalogueRows({}), []);
});
