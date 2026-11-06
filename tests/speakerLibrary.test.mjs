// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * acoustics-3, ROAD-3598 answer 8: the speaker IS its BIM library part. makeSpeaker() takes the
 * part's figures from GET /api/bim/parts/<id>, and offline from the same parts as speakerParts.js
 * holds them (written from the library) — never from a preset list; the saved room embeds the
 * part's own IFC type from /api/bim/parts/<id>.ifc —
 * its GlobalIds, sets, ports and units — instead of a type that only names it.
 * Fixtures: tests/fixtures/bim-parts/, the library's own files (DATABASE.server.BIM SRC/library
 * 28eb1fa) for tannoy/dmt-12, generic/sub, genelec/1032a and l-acoustics-inc/ks28.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { makeSpeaker, SPEAKER_PRESETS, speakerSpec } from '../js/acoustics/devices.js';
import { SPEAKER_LIBRARY, SPEAKER_LOOK } from '../js/acoustics/speakerParts.js';
import { clearSpeakerLibrary, loadPartTypes, loadSpeakerParts, partSpec, partUrl, specFromPart } from '../js/acoustics/speakerLibrary.js';
import { roomModel } from '../js/ifc/roomModel.js';
import { roomToIfc } from '../js/ifc/roomToIfc.js';
import { ifcToRoom } from '../js/ifc/ifcToRoom.js';
import { entitiesByType, getPsets, ifcGuid, parseStep } from '../vendor/apk-contracts/apk-ifc.js';
import { sampleGeometry, sampleMirror, sampleOverlay, sampleResults } from './ifcFixture.mjs';

const FIX = new URL('./fixtures/bim-parts/', import.meta.url);
const PARTS = ['tannoy/dmt-12', 'generic/sub', 'genelec/1032a', 'l-acoustics-inc/ks28'];
const file = (pid, ext) => readFileSync(new URL(`${pid.replace('/', '--')}${ext}`, FIX), 'utf8');

/** A fetch that answers as DATABASE.server.BIM does for the fixture parts, and counts what it was asked. */
function library({ down = false } = {}) {
  const asked = [];
  const fetchFn = async (url) => {
    asked.push(url);
    if (down) throw new TypeError('fetch failed');
    const m = /\/parts\/([^/]+)\/([^/.]+)(\.ifc)?$/.exec(url);
    const pid = m && `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}`;
    if (!m || !PARTS.includes(pid)) return { ok: false, status: 404, text: async () => '{"error":"no part"}' };
    return { ok: true, status: 200, text: async () => file(pid, m[3] ? '.ifc' : '.bim.json') };
  };
  return { fetchFn, asked };
}

const sample = () => roomModel({ geometry: sampleGeometry(), mirror: sampleMirror(), overlay: sampleOverlay(), results: sampleResults() });

test('specFromPart reads APK_LoudspeakerType, the maker and the cabinet (mm → m), and nothing the part does not say', () => {
  const dmt = specFromPart(JSON.parse(file('tannoy/dmt-12', '.bim.json')));
  assert.deepEqual(
    [dmt.sensitivity, dmt.maxSpl, dmt.fLow, dmt.fHigh, dmt.hCov, dmt.vCov, dmt.litres, dmt.pattern, dmt.driver, dmt.maker],
    [93, 116, 45, 20000, 90, 90, 44, 'horn', 'coaxial 12"', 'Tannoy'],
  );
  assert.equal('watts' in dmt, false, 'the part states no amplifier power: the preset keeps it');
  assert.equal('w' in dmt, false, 'no cabinet sides on the part');
  const gen = specFromPart(JSON.parse(file('genelec/1032a', '.bim.json')));
  assert.ok(gen.w > 0 && gen.h > 0 && gen.d > 0 && gen.w < 1, 'cabinet from physical width/height/depth_mm, in metres');
  assert.equal(specFromPart(null), null);
});

test('makeSpeaker takes the live library part\'s figures once it has answered, the library snapshot offline', async () => {
  clearSpeakerLibrary();
  const offline = makeSpeaker('dmt12', { x: 0, y: 0 });
  assert.equal(offline.sensitivity, SPEAKER_LIBRARY['tannoy/dmt-12'].ifc.psets.APK_LoudspeakerType.Sensitivity);
  assert.equal(offline.sensitivity, SPEAKER_PRESETS.dmt12.sensitivity);

  // a library whose part says something else than the preset: the part wins, field by field
  const part = { ...JSON.parse(file('tannoy/dmt-12', '.bim.json')) };
  part.ifc = { psets: { APK_LoudspeakerType: { ...part.ifc.psets.APK_LoudspeakerType, Sensitivity: 95, CoverageHorizontal: 75 } } };
  const asked = [];
  const fetchFn = async (url) => (asked.push(url), { ok: true, text: async () => JSON.stringify(part) });
  const { found, missing } = await loadSpeakerParts(['tannoy/dmt-12', 'tannoy/dmt-12'], { fetchFn, base: '/api/bim' });
  assert.deepEqual([found, missing, asked], [['tannoy/dmt-12'], [], ['/api/bim/parts/tannoy/dmt-12']]);
  const s = makeSpeaker('dmt12', { x: 0, y: 0 });
  assert.deepEqual([s.part, s.sensitivity, s.hCov, s.vCov, s.watts, s.color], ['tannoy/dmt-12', 95, 75, 90, SPEAKER_PRESETS.dmt12.watts, SPEAKER_PRESETS.dmt12.color]);
  assert.equal(s.level, 95 + 10 * Math.log10(SPEAKER_LOOK['tannoy/dmt-12'].watts), 'its level is the part\'s sensitivity driven by the page\'s starting watts');
  assert.equal(s.name, SPEAKER_LIBRARY['tannoy/dmt-12'].description, 'a box is labelled by its part\'s description');
  await loadSpeakerParts(['tannoy/dmt-12'], { fetchFn });
  assert.equal(asked.length, 1, 'a part is read once a page');
  clearSpeakerLibrary();
});

test('a part placed by id alone is named and sized by the library; a library that does not answer leaves the snapshot', async () => {
  clearSpeakerLibrary();
  const { fetchFn } = library({ down: true });
  const r = await loadSpeakerParts(['genelec/1032a'], { fetchFn });
  assert.deepEqual(r, { found: [], missing: ['genelec/1032a'] });
  assert.equal(partSpec('genelec/1032a'), null);
  clearSpeakerLibrary();
  await loadSpeakerParts(['genelec/1032a', 'nobody/nothing'], library());
  const box = makeSpeaker('no-such-preset', { x: 0, y: 0 }, { part: 'genelec/1032a' });
  assert.equal(box.part, 'genelec/1032a');
  assert.equal(box.name, 'Genelec 1032A');
  assert.equal(box.w, partSpec('genelec/1032a').w);
  assert.equal(speakerSpec('monitor').part, 'generic/monitor', 'a preset key names its own part');
  clearSpeakerLibrary();
});

test('loadPartTypes fetches each speaker part\'s .ifc once; partUrl encodes maker and model', async () => {
  clearSpeakerLibrary();
  assert.equal(partUrl('meyer-sound/hd-1', '.ifc', 'http://h/api/bim'), 'http://h/api/bim/parts/meyer-sound/hd-1.ifc');
  const lib = library();
  const model = { speakers: [{ part: 'tannoy/dmt-12' }, { part: 'tannoy/dmt-12' }, { part: 'nobody/nothing' }, {}] };
  const r = await loadPartTypes(model, lib);
  assert.deepEqual(Object.keys(r.types), ['tannoy/dmt-12']);
  assert.deepEqual(r.missing, ['nobody/nothing']);
  await loadPartTypes(model, lib);
  assert.equal(lib.asked.length, 2, 'asked once each');
  clearSpeakerLibrary();
});

test("the room embeds each part's own IFC type: its GlobalId, every set and its nested ports, typed occurrences", async () => {
  clearSpeakerLibrary();
  const model = sample();
  model.speakers.push({ ...makeSpeaker('monitor', { x: 4, y: 1, z: 0.3 }, { part: 'l-acoustics-inc/ks28' }), id: 'sKS' });
  const { types } = await loadPartTypes(model, library());
  assert.deepEqual(Object.keys(types).sort(), [...PARTS].sort());
  const text = roomToIfc(model, { types });
  const f = parseStep(text);
  const speakerTypes = entitiesByType(f, 'IFCAUDIOVISUALAPPLIANCETYPE').filter((t) => t.args[9].value === 'SPEAKER');
  assert.deepEqual(speakerTypes.map((t) => t.args[7]).sort(), [...PARTS].sort(), 'one type per part, Tag the part id');
  for (const t of speakerTypes) {
    const pid = t.args[7];
    const lib = parseStep(file(pid, '.ifc'));
    const theirs = entitiesByType(lib, 'IFCAUDIOVISUALAPPLIANCETYPE')[0];
    assert.equal(t.args[0], ifcGuid('part', pid));
    assert.deepEqual(Object.keys(getPsets(f, t)).sort(), Object.keys(getPsets(lib, theirs)).sort(), `${pid}: the part's own sets`);
    assert.deepEqual(getPsets(f, t), getPsets(lib, theirs), `${pid}: the same values`);
    // every set GlobalId the part file has is the room's too
    for (const ps of entitiesByType(lib, 'IFCPROPERTYSET')) assert.ok(text.includes(`'${ps.args[0]}'`), `${pid} ${ps.args[2]}`);
  }
  // the KS28's speakON port came with it, nested on the type, with its own sets
  const ks = speakerTypes.find((t) => t.args[7] === 'l-acoustics-inc/ks28');
  const nests = entitiesByType(f, 'IFCRELNESTS').filter((r) => r.args[4].id === ks.id);
  assert.equal(nests.length, 1);
  assert.equal(f.byId.get(nests[0].args[5][0].id).type, 'IFCDISTRIBUTIONPORT');
  // its weight is in kg: the room now assigns the part file's mass unit
  const ua = entitiesByType(f, 'IFCUNITASSIGNMENT')[0];
  const unitTypes = ua.args[0].map((r) => f.byId.get(r.id).args[1].value);
  assert.ok(unitTypes.includes('MASSUNIT'), unitTypes.join());
  assert.equal(new Set(unitTypes).size, unitTypes.length, 'one unit per UnitType');
  // coverage keeps its degree: the room's own plane-angle unit; the litre comes with the part
  // (the occurrences' own CoverageHorizontal is in the room's project unit, degree, and names none)
  const cov = entitiesByType(f, 'IFCPROPERTYSINGLEVALUE').filter((p) => p.args[0] === 'CoverageHorizontal' && p.args[3]);
  assert.ok(cov.length && cov.every((p) => f.byId.get(p.args[3].id).args[2] === 'DEGREE'));
  const vol = entitiesByType(f, 'IFCPROPERTYSINGLEVALUE').find((p) => p.args[0] === 'EnclosureVolume');
  assert.equal(f.byId.get(vol.args[3].id).args[2], 'litre');
  assert.deepEqual(entitiesByType(f, 'IFCCONVERSIONBASEDUNIT').map((u) => u.args[2]).sort(), ['DEGREE', 'litre'], 'each unit once, however many parts bring it');
  // every speaker occurrence is typed by its part's type
  const typedBy = new Map();
  for (const r of entitiesByType(f, 'IFCRELDEFINESBYTYPE')) for (const o of r.args[4]) typedBy.set(o.id, f.byId.get(r.args[5].id));
  for (const o of entitiesByType(f, 'IFCAUDIOVISUALAPPLIANCE').filter((e) => e.args[8].value === 'SPEAKER')) {
    assert.equal(typedBy.get(o.id)?.type, 'IFCAUDIOVISUALAPPLIANCETYPE', o.args[7]);
  }
  assert.equal(roomToIfc(model, { types }), text, 'byte-deterministic');
  // read back: every speaker keeps its part
  assert.deepEqual(ifcToRoom(text).model.speakers.map((s) => s.part), ['tannoy/dmt-12', 'tannoy/dmt-12', 'generic/sub', 'genelec/1032a', 'l-acoustics-inc/ks28']);
  clearSpeakerLibrary();
});

test('offline (no types) the room is exactly what it was: a type naming the part', () => {
  const model = sample();
  assert.equal(roomToIfc(model, { types: {} }), roomToIfc(model));
  const f = parseStep(roomToIfc(model));
  const t = entitiesByType(f, 'IFCAUDIOVISUALAPPLIANCETYPE').find((x) => x.args[7] === 'tannoy/dmt-12');
  assert.deepEqual(Object.keys(getPsets(f, t)).sort(), ['APK_Part', 'Pset_AudioVisualApplianceTypeSpeaker', 'Pset_ManufacturerTypeInformation']);
  // a .ifc that is not the part's (wrong GlobalId) is not embedded
  const wrong = { 'tannoy/dmt-12': file('generic/sub', '.ifc') };
  assert.equal(roomToIfc(model, { types: wrong }), roomToIfc(model));
});

test('IfcOpenShell: the room with embedded part types has 0 schema + EXPRESS errors and 0 pset problems', { skip: !process.env.APK_IFC_PYTHON && 'set APK_IFC_PYTHON to a python with ifcopenshell' }, async () => {
  clearSpeakerLibrary();
  const model = sample();
  model.speakers.push({ ...makeSpeaker('monitor', { x: 4, y: 1, z: 0.3 }, { part: 'l-acoustics-inc/ks28' }), id: 'sKS' });
  const { types } = await loadPartTypes(model, library());
  const dir = mkdtempSync(join(tmpdir(), 'acoustic-parts-'));
  const path = join(dir, 'room-with-parts.ifc');
  writeFileSync(path, roomToIfc(model, { types }));
  const script = new URL('../scripts/validate-ifc.py', import.meta.url).pathname;
  const run = spawnSync(process.env.APK_IFC_PYTHON, ['-I', script, path], { cwd: tmpdir(), encoding: 'utf8' });
  const [row] = run.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(row, run.stderr);
  assert.equal(row.statements, 0, (row.first ?? []).join(' | '));
  assert.deepEqual(row.pset_problems, []);
  assert.deepEqual(row.checks, []);
  assert.equal(run.status, 0);
  clearSpeakerLibrary();
});
