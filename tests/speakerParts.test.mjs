// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * acoustics-3: a speaker is placed by BIM part id. Every preset box is a library part
 * (DATABASE.server.BIM importers/import_acoustic_speakers.py), js/acoustics/speakerParts.js maps
 * each preset key to it, makeSpeaker() gives the box its `part`, and the room's IFC types it by
 * the part's own GlobalId (ifcGuid('part', id)) with the part's identity — the same type
 * DATABASE.server.BIM writes. A file whose type names a part is placed from that part's preset.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

import { ALL_SPEAKER_PRESETS, makeSpeaker, presetForPart, speakerPart } from '../js/acoustics/devices.js';
import { SPEAKER_PARTS } from '../js/acoustics/speakerParts.js';
import { roomModel } from '../js/ifc/roomModel.js';
import { roomToIfc } from '../js/ifc/roomToIfc.js';
import { ifcToRoom } from '../js/ifc/ifcToRoom.js';
import { entitiesByType, getPsets, ifcGuid, parseStep } from '../vendor/apk-contracts/apk-ifc.js';
import { speakerPresets } from '../scripts/dump-speaker-presets.mjs';
import { sampleGeometry, sampleMirror, sampleOverlay, sampleResults } from './ifcFixture.mjs';

const LIBRARY = new URL('../../../../../POD.database/DATABASE.server.BIM/SRC/library/', import.meta.url);
const IMPORTER = new URL('../../../../../POD.database/DATABASE.server.BIM/SRC/importers/import_acoustic_speakers.py', import.meta.url);

test('every preset key maps to a part, and every box the dump hands the importer is one of them', () => {
  for (const key of Object.keys(ALL_SPEAKER_PRESETS)) assert.ok(SPEAKER_PARTS[key], `${key} has no part: regenerate speakerParts.js`);
  const { presets } = speakerPresets();
  for (const p of presets) {
    const parts = new Set(p.keys.map((k) => SPEAKER_PARTS[k]?.part));
    assert.equal(parts.size, 1, `the keys of one box name one part: ${p.keys}`);
  }
  assert.equal(new Set(Object.values(SPEAKER_PARTS).map((x) => x.part)).size, presets.length, 'one part per box');
  assert.equal(speakerPart('dmt12').part, 'tannoy/dmt-12');
  assert.equal(presetForPart('meyer-sound/hd-1') in ALL_SPEAKER_PRESETS, true);
  assert.equal(presetForPart('nobody/nothing'), null);
});

test('makeSpeaker places a box by its part id; a key that is no preset is placed as the studio monitor it falls back to', () => {
  assert.equal(makeSpeaker('dmt12', { x: 0, y: 0 }).part, 'tannoy/dmt-12');
  assert.equal(makeSpeaker('genelec-1032a', { x: 0, y: 0 }).part, 'genelec/1032a');
  assert.equal(makeSpeaker('sub', { x: 0, y: 0 }).part, 'generic/sub');
  assert.equal(makeSpeaker('no-such', { x: 0, y: 0 }).part, 'generic/monitor');
  assert.equal(makeSpeaker('dmt12', { x: 0, y: 0 }, { part: 'tannoy/gold-8' }).part, 'tannoy/gold-8', 'a part the caller names wins');
});

test("the room's speaker types are the parts': GlobalId part/<id>, ModelReference the model, APK_Part.PartId", () => {
  const text = roomToIfc(roomModel({ geometry: sampleGeometry(), mirror: sampleMirror(), overlay: sampleOverlay(), results: sampleResults() }));
  const f = parseStep(text);
  const types = entitiesByType(f, 'IFCAUDIOVISUALAPPLIANCETYPE').filter((t) => t.args[9].value === 'SPEAKER');
  const want = ['tannoy/dmt-12', 'generic/sub', 'genelec/1032a'];
  assert.deepEqual(types.map((t) => t.args[7]).sort(), [...want].sort(), 'one type per part, the part id its Tag');
  for (const t of types) {
    const id = t.args[7];
    const sets = getPsets(f, t);
    assert.equal(t.args[0], ifcGuid('part', id));
    assert.equal(sets.APK_Part.PartId, id);
    const p = Object.values(SPEAKER_PARTS).find((x) => x.part === id);
    assert.deepEqual([sets.Pset_ManufacturerTypeInformation.Manufacturer, sets.Pset_ManufacturerTypeInformation.ModelReference, t.args[2]],
      [p.manufacturer, p.model, p.name]);
  }
  // read back: every speaker keeps its part
  const { model } = ifcToRoom(text);
  assert.deepEqual(model.speakers.map((s) => s.part), ['tannoy/dmt-12', 'tannoy/dmt-12', 'generic/sub', 'genelec/1032a']);
});

test("a foreign file whose speaker type names a library part places that part's preset", () => {
  const text = roomToIfc(roomModel({ geometry: sampleGeometry(), mirror: sampleMirror(), overlay: sampleOverlay() }));
  // strip what makes the file ours: the overlay set and every APK_SpeakerOccurrence
  const foreign = text.replace(/'APK_AcousticSession'/g, "'X_Session'").replace(/'APK_SpeakerOccurrence'/g, "'X_Occurrence'");
  const { model, report } = ifcToRoom(foreign);
  assert.equal(report.own, false);
  const kinds = model.speakers.map((s) => [s.kind, s.part]);
  assert.ok(kinds.some(([k, p]) => k === 'dmt12' && p === 'tannoy/dmt-12'), JSON.stringify(kinds));
  assert.ok(kinds.some(([k, p]) => SPEAKER_PARTS[k]?.part === 'genelec/1032a' && p === 'genelec/1032a'), JSON.stringify(kinds));
});

test('the parts are in the BIM library beside this app, and the map is what its importer writes', (t) => {
  if (!fs.existsSync(LIBRARY) || !fs.existsSync(new URL('tannoy/', LIBRARY))) return t.skip('DATABASE.server.BIM SRC/library is not beside this app');
  for (const { part } of Object.values(SPEAKER_PARTS)) {
    assert.ok(fs.existsSync(new URL(`${part}.bim.json`, LIBRARY)), `${part}.bim.json`);
    assert.ok(fs.existsSync(new URL(`${part}.ifc`, LIBRARY)), `${part}.ifc (its twin)`);
  }
  let out;
  try {
    out = execFileSync('python3', ['-I', IMPORTER.pathname, '--check'], { encoding: 'utf8' });
  } catch (err) {
    assert.fail(`import_acoustic_speakers.py --check: ${err.stdout || err.message}`);
  }
  assert.match(out, /stale 0/);
});
