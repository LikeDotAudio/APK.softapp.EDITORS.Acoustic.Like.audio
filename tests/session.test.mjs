// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readSession, sessionDoc, SESSION_FORMAT } from '../js/model/session.js';

// Rule 1: the session file is the acoustics and the drawing's name — never a second copy of the drawing.

const overlay = { format: 'acoustic.like.audio@1', fileName: 'Studio A.cad', speakers: [{ id: 's1' }], mics: [], furniture: [], settings: {} };

test('a saved session names the drawing and carries none of its geometry', () => {
  const doc = sessionDoc(overlay, 'Studio A.cad', 'T');
  assert.equal(doc.format, SESSION_FORMAT);
  assert.deepEqual(doc.drawing, { fileName: 'Studio A.cad' });
  assert.deepEqual(Object.keys(doc).sort(), ['drawing', 'format', 'overlay', 'savedAt']);
  assert.equal(doc.cad, undefined);
  assert.ok(!/docSnapshot|edges|walls/.test(JSON.stringify(doc)));
  assert.equal(sessionDoc(overlay, null).drawing.fileName, 'Studio A.cad');
});

test('it reads back as the overlay under the drawing name, with nothing for the CAD', () => {
  const r = readSession(JSON.parse(JSON.stringify(sessionDoc(overlay, 'Studio A.cad'))));
  assert.equal(r.fileName, 'Studio A.cad');
  assert.deepEqual(r.overlay, overlay);
  assert.equal(r.handOver, null);
});

test('a bare overlay file opens too', () => {
  const r = readSession(overlay);
  assert.equal(r.fileName, 'Studio A.cad');
  assert.equal(r.handOver, null);
});

test('an old session@1 file hands its drawing to the CAD once; a broken one hands nothing', () => {
  const cad = { currentFileName: 'Old.cad', docSnapshot: { edges: [] } };
  const r = readSession({ format: 'acoustic.like.audio/session@1', overlay, cad });
  assert.equal(r.fileName, 'Old.cad');
  assert.equal(r.handOver, cad);
  assert.equal(readSession({ format: 'acoustic.like.audio/session@1', overlay, cad: { currentFileName: 'x' } }).handOver, null);
});

test('anything else is refused', () => {
  assert.throws(() => readSession({ format: 'something@1' }), /Not an acoustic.like.audio session/);
  assert.throws(() => readSession(null), /Not an acoustic.like.audio session/);
});

// The popped-out plan asks the CAD live: cadLink's `live`, with a fake window and clock.
// What the fake CAD says is the CAD's own published sample (vendor/cad.like.audio/contract/host@1/samples.json).

const SAMPLES = JSON.parse(readFileSync(new URL('../vendor/cad.like.audio/contract/host@1/samples.json', import.meta.url), 'utf8'));
const { protocol: _p, ...GEOMETRY } = SAMPLES.toHost.find((m) => m.type === 'geometry');

async function fakeLink() {
  const listeners = [];
  const sentTo = [];
  const popupWin = {
    closed: false,
    postMessage: (m) => sentTo.push(m.type),
    focus() {},
    close() {
      this.closed = true;
    },
  };
  const iframeWin = { postMessage: (m) => (m.type === 'session' ? queueMicrotask(() => fire(iframeWin, { type: 'session', session: { docSnapshot: { edges: [] } } })) : null) };
  const { HOST_PROTOCOL } = await import('../js/cad/cadLink.js');
  const fire = (source, body) => listeners.forEach((fn) => fn({ origin: 'http://x', source, data: { protocol: HOST_PROTOCOL, ...body } }));
  globalThis.window = {
    location: { origin: 'http://x' },
    addEventListener: (type, fn) => type === 'message' && listeners.push(fn),
    open: () => popupWin,
  };
  globalThis.location = { href: 'http://x/app/' };
  const timers = [];
  globalThis.setInterval = (fn) => timers.push(fn);
  globalThis.clearInterval = () => {};
  globalThis.setTimeout = () => 0; // session()'s give-up timer: the fake CAD answers at once
  const iframe = { getAttribute: () => 'cad/#/drawing?host=acoustic', addEventListener() {}, contentWindow: iframeWin, hidden: false, src: '' };
  const { connectCad, PING_MS, DEAD_MS } = await import('../js/cad/cadLink.js');
  let t = 1000;
  const lives = [];
  const link = connectCad(iframe, { onLive: (v) => lives.push(v) }, { now: () => t });
  return { link, popupWin, fire, sentTo, lives, tick: (ms) => (t += ms), PING_MS, DEAD_MS };
}

test('popped, the plan is live only while the CAD window answers', async () => {
  const f = await fakeLink();
  assert.equal(f.link.live, true, 'docked: the CAD draws under us');
  assert.equal(f.link.popOut(), true);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(f.link.popped, true);
  assert.equal(f.link.live, false, 'not heard since it took the drawing: no walls from memory');
  f.link.heartbeat();
  assert.ok(f.sentTo.includes('hello'), 'a quiet window is asked');
  f.fire(f.popupWin, GEOMETRY);
  assert.equal(f.link.live, true);
  f.tick(f.PING_MS);
  f.sentTo.length = 0;
  f.link.heartbeat();
  assert.deepEqual(f.sentTo, ['hello']);
  assert.equal(f.link.live, true);
  f.tick(f.DEAD_MS);
  f.link.heartbeat();
  assert.equal(f.link.live, false, 'quiet too long: no CAD');
  assert.deepEqual(f.lives, [false, true, false]);
  f.fire(f.popupWin, { type: 'view' });
  assert.equal(f.link.live, true, 'it answers again: the plan comes back');
});
