// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_SPEAKER_PRESETS, makeSpeaker } from '../js/acoustics/devices.js';
import { driversOf, polarOf } from '../js/views/transducer.js';

const ways = (k) => driversOf(makeSpeaker(k, { x: 0, y: 0 })).ways;

test('a coaxial is two-way in one, a sub one cone, a crossover under 1 kHz three-way', () => {
  assert.equal(ways('dmt12'), 2);
  assert.equal(ways('sub'), 1);
  assert.equal(ways('monitor'), 2);
  assert.equal(ways('genelec-1038a'), 3);
  assert.deepEqual(driversOf(makeSpeaker('horn-90x50', { x: 0, y: 0 })).drivers.map((d) => d.role), ['woofer', 'horn']);
});

test('a wide main monitor has its woofers either side of the mid and dome', () => {
  const w = driversOf(makeSpeaker('genelec-1034a', { x: 0, y: 0 })).drivers.find((d) => d.role === 'woofer');
  assert.equal(w.xs.length, 2);
});

test('every preset’s drivers fit inside its cabinet, none on top of another', () => {
  for (const k of Object.keys(ALL_SPEAKER_PRESETS)) {
    const { box, drivers } = driversOf(makeSpeaker(k, { x: 0, y: 0 }));
    for (const d of drivers) {
      const half = (d.h ?? d.d) / 2;
      assert.ok(d.y - half >= 0 && d.y + half <= box.h + 1e-9, `${k} ${d.role} in height`);
      assert.ok(Math.max(...(d.xs ?? [0]).map(Math.abs)) + (d.w ?? d.d) / 2 <= box.w / 2 + 1e-9, `${k} ${d.role} in width`);
    }
    const stack = drivers.filter((d) => !d.xs && d.role !== 'coax');
    for (let i = 1; i < stack.length; i++) assert.ok(stack[i - 1].y + stack[i - 1].d / 2 <= stack[i].y - (stack[i].h ?? stack[i].d) / 2 + 1e-9, `${k} ${stack[i - 1].role} under ${stack[i].role}`);
  }
});

test('a horn is −6 dB at its coverage edge; below omniBelow the pattern fades', () => {
  const horn = makeSpeaker('horn-90x50', { x: 0, y: 0 });
  const at = (pts, deg) => pts.find((p) => p.deg === deg).db;
  assert.ok(Math.abs(at(polarOf(horn, 'h', 4 * horn.omniBelow, 1), 45) + 6) < 0.01);
  assert.ok(Math.abs(at(polarOf(horn, 'v', 4 * horn.omniBelow, 1), 25) + 6) < 0.01);
  assert.ok(at(polarOf(horn, 'h', horn.omniBelow / 4), 90) > -0.5);
});
