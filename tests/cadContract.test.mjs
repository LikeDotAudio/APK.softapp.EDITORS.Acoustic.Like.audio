// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { messageTypes, validateMessage } from '../vendor/cad.like.audio/contract/validate.mjs';

// The CONSUMER side of cad.like.audio/host@1: cadLink.js against the schema and
// samples the CAD publishes (EDITORS.CAD.Like.audio/contract/host@1), vendored here.

const here = dirname(fileURLToPath(import.meta.url));
const vendored = resolve(here, '../vendor/cad.like.audio/contract');
const schema = JSON.parse(readFileSync(join(vendored, 'host@1/host.schema.json'), 'utf8'));
const samples = JSON.parse(readFileSync(join(vendored, 'host@1/samples.json'), 'utf8'));

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

test('the vendored contract is the CAD\'s own, byte for byte (when the CAD is checked out beside us)', (t) => {
  // CI points CAD_CONTRACT_DIR at its checkout of the CAD; a monorepo checkout has it as a sibling.
  const source = [process.env.CAD_CONTRACT_DIR, resolve(here, '../../EDITORS.CAD.Like.audio/contract')].find((d) => d && existsSync(join(d, 'host@1/host.schema.json')));
  if (!source) return t.skip('no EDITORS.CAD.Like.audio/contract beside this checkout — not compared');
  for (const f of files(vendored)) {
    const rel = relative(vendored, f);
    assert.equal(readFileSync(f, 'utf8'), readFileSync(join(source, rel), 'utf8'), `${rel} differs — fix: cp -r '${source}/.' '${vendored}/' (only host@1/ and validate.mjs are vendored)`);
  }
});

/** A docked link over a fake window: what it posts to the CAD, and a way to make the CAD speak. */
async function fakeLink(callbacks = {}) {
  const listeners = [];
  const posted = [];
  const iframeWin = { postMessage: (m, origin) => posted.push({ m, origin }) };
  globalThis.window = { location: { origin: 'http://x' }, addEventListener: (type, fn) => type === 'message' && listeners.push(fn), open: () => null };
  globalThis.location = { href: 'http://x/app/' };
  globalThis.setTimeout = () => 0;
  const iframe = { getAttribute: () => 'cad/index.html#/drawing?host=acoustic', addEventListener() {}, contentWindow: iframeWin, hidden: false, src: '' };
  const { connectCad, HOST_PROTOCOL } = await import('../js/cad/cadLink.js');
  const link = connectCad(iframe, callbacks);
  const fire = (data, source = iframeWin) => listeners.forEach((fn) => fn({ origin: 'http://x', source, data }));
  return { link, posted, fire, HOST_PROTOCOL };
}

test('cadLink speaks the protocol the schema names', async () => {
  const { HOST_PROTOCOL } = await fakeLink();
  assert.equal(HOST_PROTOCOL, schema['x-protocol']);
});

test('every message cadLink sends is a valid toCad message', async () => {
  const f = await fakeLink();
  const s = (type) => samples.toCad.find((m) => m.type === type);
  f.link.hello();
  f.link.fit();
  f.link.setMirror(3000);
  f.link.sheet('Elevation Front', { color: '#7dd3fc', seed: s('sheet').seed });
  f.link.palette('Acoustic finishes', s('palette').items);
  f.link.marks('auto-panels', 'a1b2c3', s('marks').items);
  f.link.place('Furniture', s('place').items);
  f.link.move(s('move').items);
  f.link.remove(['block:12']);
  f.link.repaint(['fill:3'], 'carpet-heavy');
  f.link.spaces(s('spaces').items);
  f.link.walls({ op: 'vertex', edgeId: 2, end: 'b', to: [6200, 4500] });
  f.link.layers({ 'Blow-up': false });
  f.link.select({ edges: [1], blocks: ['block:7'] });
  f.link.arm('panel-1200x600');
  f.link.arm(null);
  void f.link.session();
  f.link.open(s('open').session);
  f.link.floorPlan({});
  const sent = new Set();
  for (const { m, origin } of f.posted) {
    assert.equal(origin, 'http://x', 'same origin only');
    assert.deepEqual(validateMessage(schema, 'toCad', m), [], `${m.type}: ${JSON.stringify(m)}`);
    sent.add(m.type);
  }
  // every type sent is one the CAD answers (validateMessage refuses an unknown type); `layer` is the one this host does not use
  const unused = messageTypes(schema, 'toCad').filter((t) => !sent.has(t));
  assert.deepEqual(unused, ['layer']);
});

test('every toHost sample reaches its callback', async () => {
  const got = {};
  const f = await fakeLink({
    onReady: () => (got.ready = true),
    onView: (m) => (got.view = m),
    onGeometry: (m) => (got.geometry = m),
    onMirror: (m) => (got.mirror = m),
    onSelection: (m) => (got.selection = m),
  });
  const pending = f.link.session();
  for (const m of samples.toHost) f.fire(m);
  assert.equal(got.ready, true);
  assert.equal(got.view.units, 'mm');
  assert.equal(got.geometry.patches.length, 2);
  assert.deepEqual(got.mirror.axes, [3000]);
  assert.deepEqual(got.selection.edges, [1, 2]);
  assert.equal((await pending).currentFileName, 'Studio A.cad');
  assert.deepEqual(messageTypes(schema, 'toHost'), samples.toHost.map((m) => m.type).sort());
});

test('a message under another protocol or from another origin is not heard', async () => {
  const got = [];
  const f = await fakeLink({ onGeometry: (m) => got.push(m) });
  const geometry = samples.toHost.find((m) => m.type === 'geometry');
  f.fire({ ...geometry, protocol: 'cad.like.audio/host@2' });
  assert.equal(got.length, 0);
  f.fire(geometry);
  assert.equal(got.length, 1);
});

test('the published site config names the CAD and the catalogue beside the page', async () => {
  const tree = (await import('../js/site.js')).SITE;
  const published = (await import('../js/site.published.js')).SITE;
  assert.deepEqual(Object.keys(published).sort(), Object.keys(tree).sort());
  assert.equal(published.cad, 'cad/index.html');
  assert.ok(!/\.\.\//.test(published.cad + published.catalogue), 'the published site never climbs out of itself');
});
