// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ACCENT, accentA } from '../js/brand.js';

// SDK/contracts audit WS-07: the brand accent comes from the vendored contract, never a literal here.

const repo = fileURLToPath(new URL('..', import.meta.url));

test('the accent is the contract\'s', () => {
  const css = readFileSync(join(repo, 'vendor/apk-contracts/apk-tokens.css'), 'utf8');
  assert.ok(css.includes(`--apk-accent: ${ACCENT};`));
  assert.match(accentA(0.5), /^rgba\(\d+, \d+, \d+, 0\.5\)$/);
});

test('no page source spells the accent out', () => {
  const hex = ACCENT.toLowerCase();
  const rgb = accentA(0).slice(5, -4); // "r, g, b"
  const triple = new RegExp(`rgba?\\(\\s*${rgb.replace(/, /g, '\\s*,\\s*')}\\b`, 'i');
  const files = [];
  const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).forEach((e) => walk(join(p, e))) : /\.(js|css|html)$/.test(p) && files.push(p));
  ['js', 'css', 'index.html'].forEach((p) => walk(join(repo, p)));
  const spelled = files.filter((f) => { const t = readFileSync(f, 'utf8'); return t.toLowerCase().includes(hex) || triple.test(t); });
  assert.deepEqual(spelled.map((f) => relative(repo, f)), []);
});
