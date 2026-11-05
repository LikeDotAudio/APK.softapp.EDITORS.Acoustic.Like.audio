// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// THE ONE TABLE (ROAD-3494): js/apkTable.js is how this app draws a table —
// markup() hosts for its own HTML strings, a drawn-and-serialised APKTable for
// the report window — and no file under js/ writes table markup itself.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const { loadApkTable } = createRequire(import.meta.url)('./apk-table-shim.cjs');
const APP = new URL('..', import.meta.url).pathname;
const { window, document } = loadApkTable(APP + 'vendor/apk-table/apk-table.js');
globalThis.APKTable = window.APKTable;
globalThis.document = document;
const { tableHtml, tableSnapshot } = await import('../js/apkTable.js');

test('tableHtml is a markup() host under its id', () => {
  const html = tableHtml('acoustic-wall-schedule', { className: 'wb-table', head: '<tr><th>Tag</th></tr>', body: '<tr><td>A</td></tr>' });
  assert.match(html, /data-apk-table-host="acoustic-wall-schedule"/);
  assert.match(html, /<template data-apk-part="body"><tr><td>A<\/td><\/tr><\/template>/);
});

test('tableSnapshot is a table APKTable drew, as text, and leaves the registry as it was', () => {
  // The shim keeps no markup, so read the drawn table instead of its outerHTML.
  let drawn = null;
  const create = window.APKTable.create;
  window.APKTable.create = (host, opts) => (drawn = create(host, opts));
  tableSnapshot('acoustx-report-1', ['Band', 'RT60'], [['125', '<b>0.4</b>'], ['250']]);
  window.APKTable.create = create;
  assert.equal(drawn.el.getAttribute('data-apk-table'), 'acoustx-report-1');
  assert.deepEqual(drawn.el.querySelector('tbody').children.map((tr) => tr.children.map((td) => td.textContent)), [['125', '<b>0.4</b>'], ['250', '']]);
  assert.equal(window.APKTable.get('acoustx-report-1'), null, 'forgotten once serialised');
});

test('no file under js/ writes a <table> itself; the wall builder names its four', () => {
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  for (const f of walk(APP + 'js').filter((f) => f.endsWith('.js'))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /<table|createElement\(['"]table/, f);
  }
  const wb = readFileSync(APP + 'js/views/wallBuilder.js', 'utf8');
  assert.deepEqual([...wb.matchAll(/tableHtml\('([^']+)'/g)].map((m) => m[1]).sort(),
    ['acoustic-wall-absorption', 'acoustic-wall-house-leak', 'acoustic-wall-schedule', 'acoustic-wall-transmission']);
  const html = readFileSync(APP + 'index.html', 'utf8');
  assert.ok(html.indexOf('vendor/apk-table/apk-table.js') < html.indexOf('js/main.js'));
});
