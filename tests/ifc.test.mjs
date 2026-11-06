// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { IFC_GUID_RE, parseStep } from '../vendor/apk-contracts/apk-ifc.js';
import { MATERIALS } from '../js/acoustics/materials.js';
import { buildRoom } from '../js/acoustics/room.js';
import { mirrorDevice } from '../js/acoustics/symmetry.js';
import { aimAxes, aimTilt } from '../js/ifc/placement.js';
import { materialFacts, modelHash, roomModel, sessionFromModel } from '../js/ifc/roomModel.js';
import { roomToIfc } from '../js/ifc/roomToIfc.js';
import { ifcToRoom } from '../js/ifc/ifcToRoom.js';
import { readProjectFile, sessionFiles } from '../js/model/session.js';
import { buildBundle, BUNDLE } from '../scripts/vendor-ifc.mjs';
import { sampleGeometry, sampleMirror, sampleOverlay, sampleResults } from './ifcFixture.mjs';

// The .ifc twin of a designed room (acoustics-1, -2, -3, -5, -6, -7): written with the
// contracts' STEP writer, read back equal, an architect's file read for its room.

const sample = (results = sampleResults()) => roomModel({ geometry: sampleGeometry(), mirror: sampleMirror(), overlay: sampleOverlay(), results });
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const byType = (text, type) => parseStep(text).entities.filter((e) => e.type === type);

test('the vendored STEP codec is what contracts/src/ifc builds to today', async () => {
  const now = await buildBundle();
  if (now == null) return; // this repo on its own: the committed bundle is what there is
  assert.equal(readFileSync(BUNDLE, 'utf8'), now, 'run node scripts/vendor-ifc.mjs');
});

test('aim and tilt survive the placement: (aim, tilt) → (RefDirection, Axis) → (aim, tilt) on a 1° grid', () => {
  let worst = 0;
  for (let aim = 0; aim < 360; aim += 1) {
    for (let tilt = -90; tilt <= 90; tilt += 5) {
      const { ref, axis } = aimAxes(aim, tilt);
      const dot = ref[0] * axis[0] + ref[1] * axis[1] + ref[2] * axis[2];
      assert.ok(Math.abs(dot) < 1e-10, 'the two vectors are perpendicular');
      const back = aimTilt(ref, axis);
      const dAim = Math.abs(((back.aim - aim + 540) % 360) - 180);
      worst = Math.max(worst, dAim, Math.abs(back.tilt - tilt));
    }
  }
  assert.ok(worst < 0.01, `worst ${worst}°`);
});

test('the room model is in mm: CAD units and overlay metres meet at the boundary', () => {
  const m = sample();
  assert.deepEqual(m.spaces[0].points, [[0, 0], [5000, 0], [5000, 7000], [0, 7000]]);
  assert.equal(m.spaces[0].height, 3000);
  assert.equal(m.spaces[1].height, 2400, "a library room's own height");
  assert.deepEqual(m.speakers.find((s) => s.id === 'sL').x, 1300);
  assert.deepEqual(m.mirror, { enabled: true, x: 2500, axes: [2500] });
  // the same drawing in metres is the same model
  const g = sampleGeometry();
  const inM = { ...g, units: 'm', rooms: g.rooms.map((r) => ({ ...r, points: r.points.map(([x, y]) => [x / 1000, y / 1000]) })), patches: g.patches.map((p) => ({ ...p, points: p.points.map(([x, y]) => [x / 1000, y / 1000]), ...(p.at ? { at: p.at.map((v) => v / 1000) } : {}) })) };
  const mirror = { ...sampleMirror(), x: 2.5, axes: [2.5] };
  assert.deepEqual(roomModel({ geometry: inM, mirror, overlay: sampleOverlay(), results: sampleResults() }), m);
});

test('a room exports, reads back equal, and writes the same bytes again', () => {
  const m = sample();
  const text = roomToIfc(m);
  assert.match(text, /^ISO-10303-21;\nHEADER;[\s\S]*FILE_SCHEMA\(\('IFC4X3_ADD2'\)\);/);
  const { model, report } = ifcToRoom(text);
  assert.equal(report.own, true);
  assert.equal(report.resultsStale, false);
  assert.deepEqual(model, m);
  assert.equal(roomToIfc(model), text, 'the round trip is byte-identical');
  assert.equal(roomToIfc(sample()), text, 'two exports are byte-identical');
});

test('every GlobalId is a valid IFC id, unique, and the same on every export', () => {
  const text = roomToIfc(sample());
  const ids = parseStep(text).entities.map((e) => e.args[0]).filter((v) => typeof v === 'string' && IFC_GUID_RE.test(v));
  assert.ok(ids.length > 80);
  assert.equal(new Set(ids).size, ids.length);
  // a moved speaker keeps its GlobalId
  const moved = sampleOverlay();
  moved.speakers[0].x = 1.4;
  const again = roomToIfc(roomModel({ geometry: sampleGeometry(), mirror: sampleMirror(), overlay: moved }));
  const gid = (t) => byType(t, 'IFCAUDIOVISUALAPPLIANCE').find((e) => e.args[7] === 'sL').args[0];
  assert.equal(gid(again), gid(text));
});

test('the spatial spine: one IfcSpace per plan loop, the room bounded by its walls, slab and ceiling', () => {
  const text = roomToIfc(sample());
  const spaces = byType(text, 'IFCSPACE');
  assert.deepEqual(spaces.map((s) => s.args[2]), ['Control room', 'Room · Booth']);
  assert.equal(byType(text, 'IFCWALL').length, 4);
  assert.deepEqual(byType(text, 'IFCWALL').map((w) => w.args[7]), ['250,0', '500,350', '250,700', '0,350']);
  assert.equal(byType(text, 'IFCSLAB')[0].args[8].value, 'FLOOR');
  assert.equal(byType(text, 'IFCRELSPACEBOUNDARY').length, 6, '4 walls, the slab and the ceiling');
  const coverings = byType(text, 'IFCCOVERING').map((c) => c.args[8].value).sort();
  assert.deepEqual(coverings, ['CEILING', 'CLADDING', 'CLADDING', 'CLADDING', 'CLADDING', 'FLOORING', 'FLOORING']);
  assert.match(text, /IFCSIUNIT\(\*,\.LENGTHUNIT\.,\.MILLI\.,\.METRE\.\)/);
  assert.match(text, /'Qto_SpaceBaseQuantities'/);
  // the panel on the left elevation is treatment; the window on it glass; the desk a desk
  assert.equal(byType(text, 'IFCDISCRETEACCESSORY').map((e) => e.args[8].value).join(), 'SOUNDABSORPTION,SOUNDABSORPTION');
  assert.equal(byType(text, 'IFCWINDOW').length, 1);
  assert.ok(byType(text, 'IFCFURNITURE').some((e) => e.args[8].value === 'DESK'));
});

test('acoustics-1: every catalogue material goes through APK_AcousticMaterial and comes back as it was', () => {
  const m = sample(null);
  m.materials = Object.fromEntries(MATERIALS.map((x) => [x.id, materialFacts(x)]));
  const text = roomToIfc(m);
  assert.equal(byType(text, 'IFCMATERIAL').length, MATERIALS.length);
  const { model } = ifcToRoom(text);
  assert.deepEqual(model.materials, m.materials);
  // α per octave band as a table keyed by frequency
  const table = byType(text, 'IFCPROPERTYTABLEVALUE').find((p) => p.args[0] === 'SoundAbsorption');
  assert.deepEqual(table.args[2].map((v) => v.type), Array(6).fill('IFCFREQUENCYMEASURE'));
  assert.deepEqual(table.args[3].map((v) => v.type), Array(6).fill('IFCNORMALISEDRATIOMEASURE'));
});

test('acoustics-3: speakers and mics are typed occurrences, aimed in their placement; a listener is a virtual element', () => {
  const text = roomToIfc(sample());
  const f = parseStep(text);
  const sL = byType(text, 'IFCAUDIOVISUALAPPLIANCE').find((e) => e.args[7] === 'sL');
  const ap = f.byId.get(f.byId.get(sL.args[5].id).args[1].id);
  const coords = (r) => f.byId.get(r.id).args[0].map((v) => v.value);
  assert.deepEqual(coords(ap.args[0]), [1300, 5600, 1250]);
  assert.deepEqual(aimTilt(coords(ap.args[2]), coords(ap.args[1])), { aim: 300, tilt: -7.5 });
  const types = byType(text, 'IFCAUDIOVISUALAPPLIANCETYPE').map((t) => t.args[9].value);
  assert.deepEqual(types.sort(), ['MICROPHONE', 'SPEAKER', 'SPEAKER', 'SPEAKER']);
  assert.equal(byType(text, 'IFCRELDEFINESBYTYPE').length, 4);
  const listener = byType(text, 'IFCVIRTUALELEMENT');
  assert.deepEqual(listener.map((e) => [e.args[2], e.args[4], e.args[8].value]), [['Mixer', 'Listener', 'USERDEFINED']]);
  assert.equal(byType(text, 'IFCDISTRIBUTIONSYSTEM').map((s) => `${s.args[2]}:${s.args[6].value}`).join(), 'Set A:ELECTROACOUSTIC,Set B:ELECTROACOUSTIC');
  assert.equal(byType(text, 'IFCRELCONNECTSELEMENTS').length, 1, 'the flush sub is on a wall');
});

test('acoustics-7: Virtual Mirror twins name each other and sit mirrored about the axis, in mm', () => {
  const text = roomToIfc(sample());
  const f = parseStep(text);
  const gidOf = new Map(byType(text, 'IFCAUDIOVISUALAPPLIANCE').map((e) => [e.args[7], e.args[0]]));
  const pairs = byType(text, 'IFCPROPERTYSINGLEVALUE').filter((p) => p.args[0] === 'MirrorPair').map((p) => p.args[2].value);
  assert.deepEqual(pairs.sort(), [gidOf.get('sL'), gidOf.get('sR')].sort());
  const { model } = ifcToRoom(text);
  const [l, r] = model.speakers;
  assert.equal(l.x + r.x, 2 * model.mirror.x);
  // mirroring in mm is mirroring in metres ×1000
  const m = mirrorDevice(sampleOverlay().speakers[0], 2.5);
  assert.equal(Math.round(m.x * 10000) / 10, mirrorDevice(model.speakers[0], model.mirror.x).x);
});

test('acoustics-6: results ride along with the hash of the model they were computed on; a changed room makes them stale', () => {
  const m = sample();
  assert.equal(m.results.modelHash, modelHash(m));
  assert.deepEqual(m.results.eyring.at(-1), null, 'a band the engine could not compute stays empty');
  assert.deepEqual(Object.keys(m.results.mics).sort(), ['mMix', 'mOmni'], "a mic no longer in the room drops its row");
  const text = roomToIfc(m);
  assert.ok(byType(text, 'IFCPROPERTYTABLEVALUE').some((p) => p.args[0] === 'ReverberationTimeSabine' && p.args[3].every((v) => v.type === 'IFCTIMEMEASURE')));
  const changed = { ...m, speakers: m.speakers.map((s, i) => (i === 0 ? { ...s, x: s.x + 100 } : s)) };
  assert.equal(ifcToRoom(roomToIfc(changed)).report.resultsStale, true);
  assert.equal(ifcToRoom(roomToIfc(sample(null))).model.results, null);
});

test('the way back: the overlay in metres, the CAD handed every loop in its own units — and the room it builds is the same', () => {
  const m = sample();
  const { overlay, cad } = sessionFromModel(ifcToRoom(roomToIfc(m)).model, 'mm');
  const before = sampleOverlay();
  assert.deepEqual(overlay.speakers.map((s) => [s.x, s.y, s.z]), before.speakers.map((s) => [s.x, s.y, s.z]));
  assert.equal(overlay.settings.roomHeight, 3);
  assert.deepEqual(overlay.settings.walls, { '250,0': { material: 'concrete-painted', note: "the old 'party' wall" }, '999,999': { note: 'gone' } });
  assert.deepEqual(overlay.settings.roomHeights, { L2: 2.4, Lgone: 2.2 });
  assert.equal(overlay.settings.freq, undefined, 'how the room was looked at is not in the twin');
  assert.deepEqual(cad.sheets.map((s) => s.layer), ['Control room', 'Room · Booth', 'Elevation Left']);
  assert.deepEqual(cad.sheets[0].seed, [[0, 0], [5000, 0], [5000, 7000], [0, 7000]]);
  assert.deepEqual(cad.mirror, { x: 2500, enabled: true });
  // a CAD in metres gets metres
  assert.deepEqual(sessionFromModel(m, 'm').cad.sheets[0].seed[2], [5, 7]);
  // the room built from what comes back has the same volume, surfaces and faces
  const poly = (pts) => pts.map(([x, y]) => ({ x: x / 1000, y: y / 1000 }));
  const a = buildRoom(poly(sampleGeometry().rooms[0].points), { ...sampleOverlay().settings, isolation: {} });
  const b = buildRoom(poly(cad.sheets[0].seed), { ...overlay.settings, isolation: {} });
  assert.equal(b.V, a.V);
  assert.deepEqual(b.surfaces.map((s) => [s.face, s.area, s.material.id]), a.surfaces.map((s) => [s.face, s.area, s.material.id]));
});

test('a room with no drawing yet exports its virtual box, and that reads back too', () => {
  const m = roomModel({ overlay: { format: 'acoustic.like.audio@1', fileName: null, settings: { virtualRoom: { w: 4, l: 6 } }, speakers: [], mics: [], furniture: [], locked: [] } });
  assert.deepEqual(m.spaces[0].points, [[0, 0], [4000, 0], [4000, 6000], [0, 6000]]);
  assert.equal(m.spaces[0].virtual, true);
  const text = roomToIfc(m);
  assert.deepEqual(ifcToRoom(text).model, m);
  assert.deepEqual(sessionFromModel(m).cad.sheets, [], 'nothing to draw into the CAD');
});

test('saving writes the session and its .ifc twin together, and opening takes either', () => {
  const files = sessionFiles({ overlay: sampleOverlay(), drawingName: 'Studio A.cad', geometry: sampleGeometry(), mirror: sampleMirror(), results: sampleResults(), savedAt: 'T' });
  assert.deepEqual(files.map((f) => f.name), ['Studio A.acoustic-session.json', 'Studio A.ifc']);
  assert.equal(files[1].text, roomToIfc(sample()));
  const s = readProjectFile(files[0].name, files[0].text);
  assert.equal(s.kind, 'session');
  assert.deepEqual(s.overlay, JSON.parse(JSON.stringify(sampleOverlay())));
  const i = readProjectFile(files[1].name, files[1].text);
  assert.equal(i.kind, 'ifc');
  assert.deepEqual(i.model, sample());
  // a twin that cannot be built stops the save: neither file
  assert.throws(() => sessionFiles({ overlay: { ...sampleOverlay(), speakers: [{ id: 'bad', x: 1, y: 1, z: 1, aim: 0, tilt: 0, delayMs: 1n }] }, drawingName: 'x', geometry: sampleGeometry() }));
});

test("acoustics-5: the CAD-spine prototype (IFC4): a space with no geometry, one wall line, a typed speaker", () => {
  const { model, report } = ifcToRoom(fixture('cad_spine.ifc'), { name: 'cad_spine.ifc' });
  assert.equal(report.own, false);
  assert.equal(report.schema, 'IFC4');
  assert.equal(model.spaces[0].name, 'Room · Control Room A');
  assert.deepEqual(model.spaces[0].points, [], 'no footprint, and one wall does not close a room');
  assert.equal(model.lines.length, 1, 'its wall line goes to the CAD to finish');
  assert.ok(report.warnings.some((w) => /no footprint/.test(w)));
  const [spk] = model.speakers;
  assert.deepEqual([spk.name, spk.x, spk.y, spk.z, spk.aim, spk.tilt, spk.part], ['CR-S01', 4000, 3000, 1200, 0, 0, 'genelec/8351']);
  const theirs = byType(fixture('cad_spine.ifc'), 'IFCAUDIOVISUALAPPLIANCE')[0].args[0];
  assert.equal(model.ifc[`speaker:${spk.id}`], theirs, "the architect's GlobalId is kept");
  // and it writes as a room of ours, keeping that id
  assert.ok(roomToIfc(model).includes(`'${theirs}'`));
});

test("acoustics-5: an architect's room in metres — footprint, height, walls, guessed materials, an aimed speaker", () => {
  const { model, report } = ifcToRoom(fixture('architect-room.ifc'));
  assert.equal(report.schema, 'IFC4X3_ADD2');
  const [room] = model.spaces;
  assert.equal(room.name, 'Room · Mix Room');
  assert.deepEqual(room.points, [[10000, 20000], [16000, 20000], [16000, 24500], [10000, 24500]], 'carried through the storey placement, metres to mm');
  assert.equal(room.height, 2800);
  assert.equal(model.faceMaterials.floor, 'carpet-felt', 'the carpet on the slab, not the slab');
  assert.equal(model.faceMaterials.ceiling, 'gypsum');
  assert.deepEqual(Object.values(model.settings.walls).map((w) => w.material), ['gypsum', 'gypsum', 'gypsum']);
  assert.deepEqual(report.guessed.find((g) => g.material === 'Product XYZ-9'), { material: 'Product XYZ-9', as: null, for: 'wall W2' }, 'an unknown material is listed, never quietly drywall');
  assert.ok(report.guessed.length >= 5);
  const [spk] = model.speakers;
  assert.deepEqual([spk.x, spk.y, spk.z, spk.aim, spk.tilt], [11500, 23400, 1250, 225, -10]);
  assert.equal(Object.keys(model.ifc).filter((k) => k.startsWith('wall:')).length, 4);
});

test("acoustics-5: re-saving an architect's room keeps the architect's GlobalIds for the space, the walls and the speaker", () => {
  const text = fixture('architect-room.ifc');
  const { model } = ifcToRoom(text);
  const { overlay, cad } = sessionFromModel(model, 'mm');
  // what the CAD sends back once it has drawn the seeded loop
  const geometry = { fileName: model.fileName, units: 'mm', walls: [], rooms: [{ id: 7, layerId: 'Lx', points: cad.sheets[0].seed, kind: 'loop' }], layers: [{ id: 'Lx', name: cad.sheets[0].layer, color: '#e5e7eb' }], patches: [] };
  const out = roomToIfc(roomModel({ geometry, overlay }));
  const theirs = (type) => byType(text, type).map((e) => e.args[0]);
  for (const gid of [...theirs('IFCSPACE'), ...theirs('IFCWALL'), ...theirs('IFCAUDIOVISUALAPPLIANCE'), ...theirs('IFCPROJECT')]) assert.ok(out.includes(`'${gid}'`), gid);
});

// IfcOpenShell (LGPL, test-only, never vendored) when the environment has it: APK_IFC_PYTHON=<python with ifcopenshell>
test('IfcOpenShell: exported rooms have 0 schema + EXPRESS errors and their Psets match the IFC4X3 templates', { skip: !process.env.APK_IFC_PYTHON && 'set APK_IFC_PYTHON to a python with ifcopenshell' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'acoustic-ifc-'));
  const files = {
    'room.ifc': roomToIfc(sample()),
    'materials.ifc': roomToIfc({ ...sample(null), materials: Object.fromEntries(MATERIALS.map((x) => [x.id, materialFacts(x)])) }),
    'virtual.ifc': roomToIfc(roomModel({ overlay: { format: 'acoustic.like.audio@1', settings: {}, speakers: [], mics: [], furniture: [], locked: [] } })),
    'architect-resaved.ifc': roomToIfc(ifcToRoom(fixture('architect-room.ifc')).model),
    'spine-resaved.ifc': roomToIfc(ifcToRoom(fixture('cad_spine.ifc')).model),
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const script = new URL('../scripts/validate-ifc.py', import.meta.url).pathname;
  const run = spawnSync(process.env.APK_IFC_PYTHON, ['-I', script, ...Object.keys(files).map((n) => join(dir, n))], { cwd: tmpdir(), encoding: 'utf8' });
  const rows = run.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(rows.length, Object.keys(files).length, run.stderr);
  for (const r of rows) {
    assert.equal(r.schema, 'IFC4X3_ADD2', r.file);
    assert.equal(r.statements, 0, `${r.file}: ${r.first.join(' | ')}`);
    assert.deepEqual(r.pset_problems, [], r.file);
    assert.deepEqual(r.checks, [], r.file);
  }
  assert.equal(run.status, 0);
});
