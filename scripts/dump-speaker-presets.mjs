// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * The speaker presets as data, for the BIM importer that makes them library parts
 * (acoustics-3, DATABASE.server.BIM SRC/importers/import_acoustic_speakers.py):
 *
 *   node scripts/dump-speaker-presets.mjs > presets.json
 *
 * One entry per box (an Acoustic X monitor is reachable under three keys; it is one box):
 *   keys      every preset key that places it ('dmt12'; 'acx-spk-4', 'genelec-1032a', '4')
 *   preset    the preset as js/acoustics/devices.js holds it (label, maker, spec …)
 *   acoustx   the Acoustic X database row it came from (js/acoustx/database.js), or null —
 *             what the datasheet table says, apart from the figures the preset fills by default
 * The importer writes the parts and js/acoustics/speakerParts.js (preset key → part id) back here.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SPEAKER_PRESETS, ACOUSTX_SPEAKER_PRESETS } from '../js/acoustics/devices.js';
import { ACOUSTX_SPEAKERS } from '../js/acoustx/database.js';

export function speakerPresets() {
  const out = [];
  for (const [key, preset] of Object.entries(SPEAKER_PRESETS)) out.push({ keys: [key], preset, acoustx: null });
  for (const s of ACOUSTX_SPEAKERS) {
    const keys = Object.keys(ACOUSTX_SPEAKER_PRESETS).filter((k) => ACOUSTX_SPEAKER_PRESETS[k].name === s.name && ACOUSTX_SPEAKER_PRESETS[k] === ACOUSTX_SPEAKER_PRESETS[s.key]);
    out.push({ keys, preset: ACOUSTX_SPEAKER_PRESETS[s.key], acoustx: s });
  }
  return { schema: 'acoustic.like.audio/speaker-presets@1', presets: out };
}

const main = process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (main) process.stdout.write(`${JSON.stringify(speakerPresets(), null, 1)}\n`);
