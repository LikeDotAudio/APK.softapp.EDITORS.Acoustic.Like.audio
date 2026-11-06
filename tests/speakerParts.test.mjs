// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * acoustics-3: a speaker is placed by BIM part id. Every preset box is a library part
 * (DATABASE.server.BIM importers/import_acoustic_speakers.py), js/acoustics/speakerParts.js maps
 * each preset key to it, makeSpeaker() gives the box its `part`, and the room's IFC types it by
 * the part's own GlobalId (ifcGuid('part', id)) with the part's identity — the same type
 * DATABASE.server.BIM writes. A file whose type names a part is placed from that part's box.
 * ROAD-3598 answer 8: the page reads speakers from the library only — speakerParts.js is written FROM
 * the library (SPEAKER_LIBRARY: the parts with their units), and speakerPresets.js is only the
 * importer's source, imported by nothing under js/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

import { ACOUSTX_BY_ID, ACOUSTX_MENU, ALL_SPEAKER_PRESETS, makeSpeaker, presetForPart, SPEAKER_PRESETS, speakerPart } from '../js/acoustics/devices.js';
import { SPEAKER_LIBRARY, SPEAKER_LOOK, SPEAKER_PARTS } from '../js/acoustics/speakerParts.js';
import { ALL_SPEAKER_PRESETS as SOURCE } from '../js/acoustics/speakerPresets.js';
import { specFromPart } from '../js/acoustics/speakerLibrary.js';
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

test('the page reads speakers from the library only: nothing under js/ imports the presets, the source', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : e.name.endsWith('.js') ? [new URL(e.name, dir)] : []));
  const js = walk(new URL('../js/', import.meta.url));
  const importers = js.filter((f) => /from\s+['"][^'"]*speakerPresets\.js['"]/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(importers.map((f) => f.pathname.split('/js/')[1]), []);
  // every box the source had is a box the page has, by the same key
  assert.deepEqual(Object.keys(ALL_SPEAKER_PRESETS).sort(), Object.keys(SOURCE).sort());
  for (const [k, p] of Object.entries(SPEAKER_PARTS)) assert.ok(SPEAKER_LIBRARY[p.part], `${k}: ${p.part} is in SPEAKER_LIBRARY`);
});

test("a box's figures are its library part's, with the part's units: degrees, litres, ohm, mm", () => {
  const dmt = SPEAKER_LIBRARY['tannoy/dmt-12'];
  assert.equal(dmt.stage, 'declared', 'the acoustic definition is a description: not a stub');
  const L = dmt.ifc.psets.APK_LoudspeakerType;
  assert.deepEqual([L.CoverageHorizontal, L.CoverageVertical, L.EnclosureVolume, L.NominalImpedance, L.FiguresTypical], [90, 90, 44, 8, true]);
  const box = SPEAKER_PRESETS.dmt12;
  assert.deepEqual([box.hCov, box.vCov, box.litres, box.typical, box.color, box.watts], [90, 90, 44, true, SPEAKER_LOOK['tannoy/dmt-12'].color, SPEAKER_LOOK['tannoy/dmt-12'].watts]);
  // an Acoustic X monitor: its cabinet in mm off the part, what it does not state from the generic studio monitor part
  const gen = SPEAKER_LIBRARY['genelec/1032a'];
  const acx = ALL_SPEAKER_PRESETS['genelec-1032a'];
  assert.equal(acx.w, gen.physical.width_mm / 1000);
  const monitor = specFromPart(SPEAKER_LIBRARY['generic/monitor']);
  assert.deepEqual([acx.maxSpl, acx.hCov, acx.vCov, acx.pattern], [monitor.maxSpl, monitor.hCov, monitor.vCov, monitor.pattern]);
  assert.equal(acx.litres, +(acx.w * acx.d * acx.h * 600).toFixed(1), 'litres from the cabinet: 60 % of its outside');
  // the menus list each Acoustic X part once
  assert.equal(new Set(ACOUSTX_MENU.map(([k]) => SPEAKER_PARTS[k].part)).size, ACOUSTX_MENU.length);
  assert.equal(ACOUSTX_MENU.length, ACOUSTX_BY_ID.length);
  assert.ok(ACOUSTX_BY_ID.every(([k]) => k.startsWith('acx-spk-')));
});
