// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// The published site's parts catalogue is vendor/bim/parts.json, a copy of the OS's
// BIM catalogue (PODS/POD.THIN/OS/BIM/parts.json): the monorepo is private, so the
// deploy cannot check it out. Inside the monorepo this holds the copy equal to its
// source, so it cannot drift; outside it (this repo alone, CI) there is nothing to
// compare against and the test says so and passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const vendored = join(here, '..', 'vendor', 'bim', 'parts.json');
const source = join(here, '..', '..', '..', '..', 'OS', 'BIM', 'parts.json');

test('the vendored parts catalogue parses', () => {
  const parts = JSON.parse(readFileSync(vendored, 'utf8'));
  assert.ok(parts && typeof parts === 'object');
});

test('the vendored parts catalogue is the OS one, byte for byte', (t) => {
  if (!existsSync(source)) {
    t.skip('not inside the monorepo: no OS/BIM/parts.json to compare against');
    return;
  }
  assert.equal(readFileSync(vendored, 'utf8'), readFileSync(source, 'utf8'),
    'vendor/bim/parts.json drifted: cp PODS/POD.THIN/OS/BIM/parts.json vendor/bim/parts.json');
});
