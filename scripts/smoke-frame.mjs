#!/usr/bin/env node
// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * IS THE FRAMED CAD THERE, AND DOES IT SPEAK host@1?
 *
 * An HTTP 200 for index.html says nothing about the plan tile: the page is
 * useless if the CAD its iframe names is missing, or is a CAD that speaks
 * another protocol. This follows the page the way a browser does — js/site.js
 * names the CAD, the CAD's index.html names its bundle — and passes only when
 * that bundle exists and carries this host's HOST_PROTOCOL. It does not run
 * the bundle (no browser here); that the bridge then answers `ready` is
 * proved by both repos' contract tests against the same samples.
 *
 *   node scripts/smoke-frame.mjs                       this checkout, as APK.audio lays it out
 *   node scripts/smoke-frame.mjs _site                 a laid-out site folder (the deploy's)
 *   node scripts/smoke-frame.mjs https://acoustics.like.audio/
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HOST_PROTOCOL } from '../js/cad/cadLink.js';

const arg = process.argv[2];
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = arg && /^https?:\/\//.test(arg) ? new URL(arg.endsWith('/') ? arg : `${arg}/`) : pathToFileURL(`${resolve(arg ?? repo)}/`);

async function get(url) {
  if (url.protocol === 'file:') return readFile(fileURLToPath(url), 'utf8');
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} answered HTTP ${r.status}`);
  return r.text();
}

try {
  const site = await get(new URL('js/site.js', base));
  const cadPath = /\bcad:\s*'([^']+)'/.exec(site)?.[1];
  if (!cadPath) throw new Error('js/site.js names no cad');
  const cadPage = new URL(cadPath, base);
  const html = await get(cadPage);
  const bundles = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => new URL(m[1], cadPage));
  if (!bundles.length) throw new Error(`${cadPage} loads no script`);
  const speaks = (await Promise.all(bundles.map(get))).some((js) => js.includes(HOST_PROTOCOL));
  if (!speaks) throw new Error(`the CAD at ${cadPage} does not carry ${HOST_PROTOCOL}`);
  console.log(`smoke-frame: ✅ ${cadPage} is there and speaks ${HOST_PROTOCOL}`);
} catch (err) {
  console.error(`smoke-frame: ❌ ${err.message}`);
  process.exit(1);
}
